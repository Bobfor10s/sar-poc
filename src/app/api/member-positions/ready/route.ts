import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requirePermission("approve_positions");
  if (!check.ok) return check.response;

  const today = new Date().toISOString().slice(0, 10);

  // Fetch all the data we need in parallel
  const [positionsRes, membersRes, reqsRes, certsRes, signoffsRes, existingMpRes] = await Promise.all([
    // All active positions
    supabaseDb.from("positions").select("id, code, name").eq("is_active", true),
    // All active members
    supabaseDb.from("members").select("id, first_name, last_name").eq("status", "active"),
    // All position requirements
    supabaseDb
      .from("position_requirements")
      .select("position_id, req_kind, course_id, task_id, required_position_id, min_count, activity_type, within_months"),
    // All member certifications
    supabaseDb
      .from("member_certifications")
      .select("member_id, course_id, expires_at, courses:course_id(never_expires)"),
    // All task sign-offs (task sign-off is global — counts for any position requiring that task)
    supabaseDb.from("member_task_signoffs").select("member_id, task_id"),
    // Existing member_positions (to detect who is enrolled and at what status)
    supabaseDb
      .from("member_positions")
      .select("id, member_id, position_id, status, created_at"),
  ]);

  if (positionsRes.error) return NextResponse.json({ error: positionsRes.error.message }, { status: 500 });
  if (membersRes.error) return NextResponse.json({ error: membersRes.error.message }, { status: 500 });
  if (reqsRes.error) return NextResponse.json({ error: reqsRes.error.message }, { status: 500 });

  const positions = positionsRes.data ?? [];
  const members = membersRes.data ?? [];
  const allReqs = reqsRes.data ?? [];
  const allCerts = certsRes.data ?? [];
  const allSignoffs = signoffsRes.data ?? [];
  const existingMps = existingMpRes.data ?? [];

  // Group requirements by position_id — skip positions with no requirements
  const reqsByPosition = new Map<string, typeof allReqs>();
  for (const r of allReqs) {
    if (!reqsByPosition.has(r.position_id)) reqsByPosition.set(r.position_id, []);
    reqsByPosition.get(r.position_id)!.push(r);
  }

  // For req_kind=position (prereq positions), load their course requirements
  const prereqPositionIds = [
    ...new Set(
      allReqs
        .filter((r) => r.req_kind === "position" && r.required_position_id)
        .map((r) => r.required_position_id as string)
    ),
  ];
  const prereqReqsRes = prereqPositionIds.length
    ? await supabaseDb
        .from("position_requirements")
        .select("position_id, course_id")
        .in("position_id", prereqPositionIds)
        .eq("req_kind", "course")
    : { data: [] };
  const prereqCoursesByPosition = new Map<string, string[]>();
  for (const r of prereqReqsRes.data ?? []) {
    if (!r.course_id) continue;
    if (!prereqCoursesByPosition.has(r.position_id)) prereqCoursesByPosition.set(r.position_id, []);
    prereqCoursesByPosition.get(r.position_id)!.push(r.course_id);
  }

  // Build per-member cert set (valid certs only)
  const certsByMember = new Map<string, Set<string>>();
  for (const cert of allCerts) {
    const neverExpires = (cert as { courses?: { never_expires?: boolean } }).courses?.never_expires ?? false;
    if (!neverExpires && cert.expires_at && cert.expires_at < today) continue;
    if (!certsByMember.has(cert.member_id)) certsByMember.set(cert.member_id, new Set());
    certsByMember.get(cert.member_id)!.add(cert.course_id);
  }

  // Build signoff set: "member_id:task_id"
  const signoffSet = new Set(allSignoffs.map((s) => `${s.member_id}:${s.task_id}`));

  // If any time-based requirements exist, fetch activity dates per member
  function subtractMonths(dateStr: string, months: number): string {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - months);
    return d.toISOString().slice(0, 10);
  }

  const trainingDatesByMember = new Map<string, string[]>();
  const callDatesByMember = new Map<string, string[]>();
  const hasTimeReqs = allReqs.some((r) => r.req_kind === "time");

  if (hasTimeReqs) {
    const [taRes, caRes] = await Promise.all([
      supabaseDb
        .from("training_attendance")
        .select("member_id, training_sessions:training_session_id(start_dt)")
        .eq("status", "attended"),
      supabaseDb
        .from("call_attendance")
        .select("member_id, time_in")
        .not("time_in", "is", null),
    ]);
    for (const row of (taRes.data ?? []) as unknown as Array<{ member_id: string; training_sessions: { start_dt: string } | null }>) {
      const date = row.training_sessions?.start_dt?.slice(0, 10);
      if (!date) continue;
      if (!trainingDatesByMember.has(row.member_id)) trainingDatesByMember.set(row.member_id, []);
      trainingDatesByMember.get(row.member_id)!.push(date);
    }
    for (const row of (caRes.data ?? []) as unknown as Array<{ member_id: string; time_in: string | null }>) {
      const date = row.time_in?.slice(0, 10);
      if (!date) continue;
      if (!callDatesByMember.has(row.member_id)) callDatesByMember.set(row.member_id, []);
      callDatesByMember.get(row.member_id)!.push(date);
    }
  }

  // Build existing member_positions lookup: "member_id:position_id" → row
  const mpByKey = new Map<string, (typeof existingMps)[number]>();
  for (const mp of existingMps) {
    mpByKey.set(`${mp.member_id}:${mp.position_id}`, mp);
  }

  // Build member + position lookup maps for the response
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const positionMap = new Map(positions.map((p) => [p.id, p]));

  type ReadyRow = {
    id: string | null;         // member_positions.id if enrolled, null if auto-detected
    member_id: string;
    position_id: string;
    status: string | null;     // existing status if enrolled, null if auto-detected
    created_at: string | null;
    members: { id: string; first_name: string; last_name: string } | null;
    positions: { id: string; code: string; name: string } | null;
  };

  const ready: ReadyRow[] = [];

  for (const position of positions) {
    const reqs = reqsByPosition.get(position.id);
    // Skip positions with no requirements — they don't auto-qualify
    if (!reqs || reqs.length === 0) continue;

    for (const member of members) {
      const existingMp = mpByKey.get(`${member.id}:${position.id}`);

      // Skip if already qualified
      if (existingMp?.status === "qualified") continue;

      // Check all requirements
      const memberCerts = certsByMember.get(member.id) ?? new Set<string>();
      let meetsAll = true;

      for (const r of reqs) {
        if (r.req_kind === "course") {
          if (r.course_id && !memberCerts.has(r.course_id)) { meetsAll = false; break; }
        }
        if (r.req_kind === "position" && r.required_position_id) {
          const prereqCourses = prereqCoursesByPosition.get(r.required_position_id) ?? [];
          if (prereqCourses.some((cid) => !memberCerts.has(cid))) { meetsAll = false; break; }
        }
        if (r.req_kind === "task") {
          if (r.task_id && !signoffSet.has(`${member.id}:${r.task_id}`)) { meetsAll = false; break; }
        }
        if (r.req_kind === "time") {
          const minCount = (r as any).min_count ?? 1;
          const actType = (r as any).activity_type ?? "any";
          const withinMonths = (r as any).within_months ?? null;
          const cutoff = withinMonths ? subtractMonths(today, withinMonths) : null;
          let count = 0;
          if (actType !== "call") {
            const dates = trainingDatesByMember.get(member.id) ?? [];
            count += cutoff ? dates.filter((d) => d >= cutoff).length : dates.length;
          }
          if (actType !== "training") {
            const dates = callDatesByMember.get(member.id) ?? [];
            count += cutoff ? dates.filter((d) => d >= cutoff).length : dates.length;
          }
          if (count < minCount) { meetsAll = false; break; }
        }
      }

      if (!meetsAll) continue;

      ready.push({
        id: existingMp?.id ?? null,
        member_id: member.id,
        position_id: position.id,
        status: existingMp?.status ?? null,
        created_at: existingMp?.created_at ?? null,
        members: memberMap.get(member.id) ?? null,
        positions: positionMap.get(position.id) ?? null,
      });
    }
  }

  // Sort: enrolled first (have an id), then auto-detected; then alphabetically by name
  ready.sort((a, b) => {
    if (!!a.id !== !!b.id) return a.id ? -1 : 1;
    const aName = a.members ? `${a.members.last_name} ${a.members.first_name}` : "";
    const bName = b.members ? `${b.members.last_name} ${b.members.first_name}` : "";
    return aName.localeCompare(bName);
  });

  return NextResponse.json({ data: ready });
}
