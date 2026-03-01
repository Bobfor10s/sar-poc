import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

function subtractMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const check = await requirePermission("approve_positions");
  if (!check.ok) return check.response;

  const today = new Date().toISOString().slice(0, 10);

  // Fetch all the data we need in parallel
  const [positionsRes, membersRes, reqsRes, reqGroupsRes, certsRes, signoffsRes, existingMpRes] = await Promise.all([
    supabaseDb.from("positions").select("id, code, name").eq("is_active", true),
    supabaseDb.from("members").select("id, first_name, last_name").eq("status", "active"),
    supabaseDb
      .from("position_requirements")
      .select("position_id, req_kind, course_id, task_id, required_position_id, min_count, activity_type, within_months, req_group_id"),
    supabaseDb.from("position_req_groups").select("id, position_id, label, min_met"),
    supabaseDb
      .from("member_certifications")
      .select("member_id, course_id, expires_at, courses:course_id(never_expires)"),
    supabaseDb.from("member_task_signoffs").select("member_id, task_id"),
    supabaseDb.from("member_positions").select("id, member_id, position_id, status, created_at"),
  ]);

  if (positionsRes.error) return NextResponse.json({ error: positionsRes.error.message }, { status: 500 });
  if (membersRes.error) return NextResponse.json({ error: membersRes.error.message }, { status: 500 });
  if (reqsRes.error) return NextResponse.json({ error: reqsRes.error.message }, { status: 500 });

  const positions = positionsRes.data ?? [];
  const members = membersRes.data ?? [];
  const allReqs = reqsRes.data ?? [];
  const allGroups = reqGroupsRes.data ?? [];
  const allCerts = certsRes.data ?? [];
  const allSignoffs = signoffsRes.data ?? [];
  const existingMps = existingMpRes.data ?? [];

  // Index requirements by position
  const reqsByPosition = new Map<string, typeof allReqs>();
  for (const r of allReqs) {
    if (!reqsByPosition.has(r.position_id)) reqsByPosition.set(r.position_id, []);
    reqsByPosition.get(r.position_id)!.push(r);
  }

  // Index groups by position then by group id
  const groupsByPosition = new Map<string, typeof allGroups>();
  for (const g of allGroups) {
    if (!groupsByPosition.has(g.position_id)) groupsByPosition.set(g.position_id, []);
    groupsByPosition.get(g.position_id)!.push(g);
  }
  const groupById = new Map(allGroups.map((g) => [g.id, g]));

  // Load prereq-position course requirements
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

  // Build valid cert set per member
  const certsByMember = new Map<string, Set<string>>();
  for (const cert of allCerts) {
    const neverExpires = (cert as { courses?: { never_expires?: boolean } }).courses?.never_expires ?? false;
    if (!neverExpires && cert.expires_at && cert.expires_at < today) continue;
    if (!certsByMember.has(cert.member_id)) certsByMember.set(cert.member_id, new Set());
    certsByMember.get(cert.member_id)!.add(cert.course_id);
  }

  // Build signoff set: "member_id:task_id"
  const signoffSet = new Set(allSignoffs.map((s) => `${s.member_id}:${s.task_id}`));

  // Conditionally fetch activity dates for time-based reqs
  const trainingDatesByMember = new Map<string, string[]>();
  const callDatesByMember = new Map<string, string[]>();
  const hasTimeReqs = allReqs.some((r) => r.req_kind === "time");

  if (hasTimeReqs) {
    const [taRes, caRes] = await Promise.all([
      supabaseDb
        .from("training_attendance")
        .select("member_id, training_sessions:training_session_id(start_dt)")
        .eq("status", "attended"),
      supabaseDb.from("call_attendance").select("member_id, time_in").not("time_in", "is", null),
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

  // Build member_positions lookup
  const mpByKey = new Map<string, (typeof existingMps)[number]>();
  for (const mp of existingMps) {
    mpByKey.set(`${mp.member_id}:${mp.position_id}`, mp);
  }

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const positionMap = new Map(positions.map((p) => [p.id, p]));

  // ── Per-requirement check helper ──────────────────────────────────────────
  function meetsReq(r: (typeof allReqs)[number], memberId: string): boolean {
    const memberCerts = certsByMember.get(memberId) ?? new Set<string>();

    if (r.req_kind === "course") {
      return !r.course_id || memberCerts.has(r.course_id);
    }
    if (r.req_kind === "position" && r.required_position_id) {
      const prereqCourses = prereqCoursesByPosition.get(r.required_position_id) ?? [];
      return prereqCourses.every((cid) => memberCerts.has(cid));
    }
    if (r.req_kind === "task") {
      return !r.task_id || signoffSet.has(`${memberId}:${r.task_id}`);
    }
    if (r.req_kind === "time") {
      const minCount = r.min_count ?? 1;
      const actType = r.activity_type ?? "any";
      const withinMonths = r.within_months ?? null;
      const cutoff = withinMonths ? subtractMonths(today, withinMonths) : null;
      let count = 0;
      if (actType !== "call") {
        const dates = trainingDatesByMember.get(memberId) ?? [];
        count += cutoff ? dates.filter((d) => d >= cutoff).length : dates.length;
      }
      if (actType !== "training") {
        const dates = callDatesByMember.get(memberId) ?? [];
        count += cutoff ? dates.filter((d) => d >= cutoff).length : dates.length;
      }
      return count >= minCount;
    }
    // course/task/time cover all automatic checks; other kinds (test, physical) require manual admin review
    return true;
  }

  // ── Main qualification loop ───────────────────────────────────────────────
  type ReadyRow = {
    id: string | null;
    member_id: string;
    position_id: string;
    status: string | null;
    created_at: string | null;
    members: { id: string; first_name: string; last_name: string } | null;
    positions: { id: string; code: string; name: string } | null;
  };

  const ready: ReadyRow[] = [];

  for (const position of positions) {
    const reqs = reqsByPosition.get(position.id);
    if (!reqs || reqs.length === 0) continue;

    // Separate standalone (no group) from grouped requirements
    const standaloneReqs = reqs.filter((r) => !r.req_group_id);
    const groupedReqs = reqs.filter((r) => !!r.req_group_id);

    // Build per-group requirement lists for this position
    const reqsByGroup = new Map<string, typeof reqs>();
    for (const r of groupedReqs) {
      const gid = String(r.req_group_id);
      if (!reqsByGroup.has(gid)) reqsByGroup.set(gid, []);
      reqsByGroup.get(gid)!.push(r);
    }

    for (const member of members) {
      const existingMp = mpByKey.get(`${member.id}:${position.id}`);
      if (existingMp?.status === "qualified") continue;

      let qualifies = true;

      // 1. All standalone requirements must be met
      for (const r of standaloneReqs) {
        if (!meetsReq(r, member.id)) { qualifies = false; break; }
      }

      // 2. Each group: member must meet min_met out of the group's requirements
      if (qualifies) {
        for (const [groupId, groupReqs] of reqsByGroup) {
          const group = groupById.get(groupId);
          const minMet = group?.min_met ?? 1;
          const metCount = groupReqs.filter((r) => meetsReq(r, member.id)).length;
          if (metCount < minMet) { qualifies = false; break; }
        }
      }

      if (!qualifies) continue;

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

  ready.sort((a, b) => {
    if (!!a.id !== !!b.id) return a.id ? -1 : 1;
    const aName = a.members ? `${a.members.last_name} ${a.members.first_name}` : "";
    const bName = b.members ? `${b.members.last_name} ${b.members.first_name}` : "";
    return aName.localeCompare(bName);
  });

  return NextResponse.json({ data: ready });
}
