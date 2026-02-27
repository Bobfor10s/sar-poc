import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requirePermission("approve_positions");
  if (!check.ok) return check.response;
  const today = new Date().toISOString().slice(0, 10);

  // 1. All non-qualified member positions
  const { data: pending, error: pendingErr } = await supabaseDb
    .from("member_positions")
    .select(`
      id, member_id, position_id, status, created_at,
      members:member_id ( id, first_name, last_name ),
      positions:position_id ( id, code, name )
    `)
    .neq("status", "qualified")
    .order("created_at", { ascending: true });

  if (pendingErr) return NextResponse.json({ error: pendingErr.message }, { status: 500 });
  if (!pending?.length) return NextResponse.json({ data: [] });

  const memberIds = [...new Set(pending.map((p) => p.member_id))];
  const positionIds = [...new Set(pending.map((p) => p.position_id))];

  // 2. Bulk fetch certs, requirements, and signoffs in parallel
  const [certsRes, reqsRes, signoffsRes] = await Promise.all([
    supabaseDb
      .from("member_certifications")
      .select("member_id, course_id, expires_at, courses:course_id(never_expires)")
      .in("member_id", memberIds),
    supabaseDb
      .from("position_requirements")
      .select("position_id, req_kind, course_id, required_position_id, task_id, courses:course_id(id, code)")
      .in("position_id", positionIds),
    supabaseDb
      .from("member_task_signoffs")
      .select("member_id, position_id, task_id")
      .in("member_id", memberIds)
      .in("position_id", positionIds),
  ]);

  // 3. Fetch prereq position requirements (for req_kind=position)
  const prereqPositionIds = [
    ...new Set(
      (reqsRes.data ?? [])
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

  // Build lookup maps
  const certsByMember = new Map<string, Set<string>>();
  for (const cert of certsRes.data ?? []) {
    const neverExpires = (cert as any).courses?.never_expires ?? false;
    if (!neverExpires && cert.expires_at && cert.expires_at < today) continue;
    if (!certsByMember.has(cert.member_id)) certsByMember.set(cert.member_id, new Set());
    certsByMember.get(cert.member_id)!.add(cert.course_id);
  }

  const reqsByPosition = new Map<string, any[]>();
  for (const r of reqsRes.data ?? []) {
    if (!reqsByPosition.has(r.position_id)) reqsByPosition.set(r.position_id, []);
    reqsByPosition.get(r.position_id)!.push(r);
  }

  const prereqCoursesByPosition = new Map<string, string[]>();
  for (const r of prereqReqsRes.data ?? []) {
    if (!r.course_id) continue;
    if (!prereqCoursesByPosition.has(r.position_id)) prereqCoursesByPosition.set(r.position_id, []);
    prereqCoursesByPosition.get(r.position_id)!.push(r.course_id);
  }

  const signoffSet = new Set(
    (signoffsRes.data ?? []).map((s) => `${s.member_id}:${s.position_id}:${s.task_id}`)
  );

  // Check each pending position
  const ready: typeof pending = [];
  for (const mp of pending) {
    const reqs = reqsByPosition.get(mp.position_id) ?? [];
    const memberCerts = certsByMember.get(mp.member_id) ?? new Set();
    let ok = true;

    for (const r of reqs) {
      if (r.req_kind === "course") {
        if (r.course_id && !memberCerts.has(r.course_id)) { ok = false; break; }
      }
      if (r.req_kind === "position" && r.required_position_id) {
        const prereqCourses = prereqCoursesByPosition.get(r.required_position_id) ?? [];
        if (prereqCourses.some((cid) => !memberCerts.has(cid))) { ok = false; break; }
      }
      if (r.req_kind === "task") {
        if (!signoffSet.has(`${mp.member_id}:${mp.position_id}:${r.task_id}`)) { ok = false; break; }
      }
    }

    if (ok) ready.push(mp);
  }

  return NextResponse.json({ data: ready });
}
