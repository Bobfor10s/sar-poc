import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth, requirePermission } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isPtbCompleteTaskCode(code: string) {
  const c = (code || "").toUpperCase().replace(/\s+/g, "-");
  return c === "PTB-COMPLETE" || c === "PTB_COMPLETE" || c === "PTB-COMPLETED";
}

type PosReqRow = {
  id: string;
  req_kind: string;
  req_group_id: string | null;
  course_id: string | null;
  required_position_id: string | null;
  task_id: string | null;
  min_count: number | null;
  activity_type: string | null;
  within_months: number | null;
  courses: { code: string } | null;
  positions: { code: string } | null;
  tasks: { task_code: string } | null;
};
type ReqGroupRow = { id: string; label: string; min_met: number };
type CertRow = { course_id: string; expires_at: string | null; courses: { never_expires: boolean } | null };

async function checkPositionRequirements(member_id: string, position_id: string) {
  const today = new Date().toISOString().slice(0, 10);

  // Fetch reqs, groups, and certs in parallel
  const [reqsRes, groupsRes, certsRes] = await Promise.all([
    supabaseDb
      .from("position_requirements")
      .select(
        `id, req_kind, req_group_id, course_id, required_position_id, task_id,
         min_count, activity_type, within_months,
         courses:course_id ( id, code, name ),
         positions:required_position_id ( id, code, name ),
         tasks:task_id ( id, task_code, task_name )`
      )
      .eq("position_id", position_id),
    supabaseDb.from("position_req_groups").select("id, label, min_met").eq("position_id", position_id),
    supabaseDb
      .from("member_certifications")
      .select("course_id, expires_at, courses:course_id(never_expires)")
      .eq("member_id", member_id),
  ]);

  if (reqsRes.error) throw new Error(reqsRes.error.message);

  const reqs = (reqsRes.data ?? []) as unknown as PosReqRow[];
  const groups = (groupsRes.data ?? []) as unknown as ReqGroupRow[];
  const groupById = new Map(groups.map((g) => [g.id, g]));

  // Build valid cert set
  const haveCourse = new Set(
    ((certsRes.data ?? []) as unknown as CertRow[])
      .filter((c) => {
        const neverExpires = c.courses?.never_expires ?? false;
        return neverExpires || !c.expires_at || c.expires_at >= today;
      })
      .map((c) => c.course_id)
  );

  // Pre-fetch training + call attendance if any time reqs exist
  const trainingDates: string[] = [];
  const callDates: string[] = [];
  if (reqs.some((r) => r.req_kind === "time")) {
    const [taRes, caRes] = await Promise.all([
      supabaseDb
        .from("training_attendance")
        .select("training_sessions:training_session_id(start_dt)")
        .eq("member_id", member_id)
        .eq("status", "attended"),
      supabaseDb.from("call_attendance").select("time_in").eq("member_id", member_id).not("time_in", "is", null),
    ]);
    for (const row of (taRes.data ?? []) as unknown as Array<{ training_sessions: { start_dt: string } | null }>) {
      const d = row.training_sessions?.start_dt?.slice(0, 10);
      if (d) trainingDates.push(d);
    }
    for (const row of (caRes.data ?? []) as Array<{ time_in: string | null }>) {
      const d = row.time_in?.slice(0, 10);
      if (d) callDates.push(d);
    }
  }

  // Pre-fetch task signoffs for this member+position
  let signoffTaskIds = new Set<string>();
  if (reqs.some((r) => r.req_kind === "task")) {
    const { data: signoffs } = await supabaseDb
      .from("member_task_signoffs")
      .select("task_id")
      .eq("member_id", member_id)
      .eq("position_id", position_id);
    signoffTaskIds = new Set((signoffs ?? []).map((s) => String(s.task_id)));
  }

  // Pre-fetch prereq position course requirements
  const prereqPositionIds = [
    ...new Set(
      reqs
        .filter((r) => r.req_kind === "position" && r.required_position_id)
        .map((r) => r.required_position_id as string)
    ),
  ];
  const prereqCoursesByPosition = new Map<string, string[]>();
  if (prereqPositionIds.length) {
    const { data: prereqReqs } = await supabaseDb
      .from("position_requirements")
      .select("position_id, course_id")
      .in("position_id", prereqPositionIds)
      .eq("req_kind", "course");
    for (const pr of (prereqReqs ?? []) as unknown as Array<{ position_id: string; course_id: string | null }>) {
      if (!pr.course_id) continue;
      if (!prereqCoursesByPosition.has(pr.position_id)) prereqCoursesByPosition.set(pr.position_id, []);
      prereqCoursesByPosition.get(pr.position_id)!.push(pr.course_id);
    }
  }

  // Synchronous check for a single requirement
  function meetsReq(r: PosReqRow): boolean {
    if (r.req_kind === "course") return !r.course_id || haveCourse.has(r.course_id);
    if (r.req_kind === "position" && r.required_position_id) {
      const prereqCourses = prereqCoursesByPosition.get(r.required_position_id) ?? [];
      return prereqCourses.every((cid) => haveCourse.has(cid));
    }
    if (r.req_kind === "task") return !r.task_id || signoffTaskIds.has(r.task_id);
    if (r.req_kind === "time") {
      const minCount = Number(r.min_count ?? 1);
      const actType = r.activity_type ?? "any";
      const withinMonths = r.within_months ?? null;
      let cutoff: string | null = null;
      if (withinMonths) {
        const d = new Date();
        d.setMonth(d.getMonth() - withinMonths);
        cutoff = d.toISOString().slice(0, 10);
      }
      let count = 0;
      if (actType !== "call") count += cutoff ? trainingDates.filter((d) => d >= cutoff!).length : trainingDates.length;
      if (actType !== "training") count += cutoff ? callDates.filter((d) => d >= cutoff!).length : callDates.length;
      return count >= minCount;
    }
    return true; // test/physical require manual admin review
  }

  function failureLabel(r: PosReqRow): string {
    if (r.req_kind === "course") return r.courses?.code ?? String(r.course_id);
    if (r.req_kind === "position") {
      const prereqCourses = prereqCoursesByPosition.get(r.required_position_id ?? "") ?? [];
      const missing = prereqCourses.filter((cid) => !haveCourse.has(cid));
      return missing.length ? `prereq position: missing ${missing.length} course(s)` : `prereq: ${r.positions?.code ?? r.required_position_id}`;
    }
    if (r.req_kind === "task") return `TASK:${r.tasks?.task_code ?? r.task_id}`;
    if (r.req_kind === "time") {
      const minCount = Number(r.min_count ?? 1);
      const actType = r.activity_type ?? "any";
      const withinMonths = r.within_months ?? null;
      const typeLabel = actType === "training" ? "training sessions" : actType === "call" ? "calls" : "activities";
      const winLabel = withinMonths ? ` within ${withinMonths} months` : "";
      let cutoff: string | null = null;
      if (withinMonths) {
        const d = new Date();
        d.setMonth(d.getMonth() - withinMonths);
        cutoff = d.toISOString().slice(0, 10);
      }
      let count = 0;
      if (actType !== "call") count += cutoff ? trainingDates.filter((d) => d >= cutoff!).length : trainingDates.length;
      if (actType !== "training") count += cutoff ? callDates.filter((d) => d >= cutoff!).length : callDates.length;
      return `${count}/${minCount} ${typeLabel}${winLabel}`;
    }
    return r.req_kind;
  }

  const missing_courses: string[] = [];

  // 1. Standalone reqs (no group): all must be met
  for (const r of reqs.filter((r) => !r.req_group_id)) {
    if (!meetsReq(r)) missing_courses.push(failureLabel(r));
  }

  // 2. Grouped reqs: each group needs min_met satisfied
  const reqsByGroup = new Map<string, PosReqRow[]>();
  for (const r of reqs.filter((r) => !!r.req_group_id)) {
    const gid = String(r.req_group_id);
    if (!reqsByGroup.has(gid)) reqsByGroup.set(gid, []);
    reqsByGroup.get(gid)!.push(r);
  }
  for (const [groupId, groupReqs] of reqsByGroup) {
    const group = groupById.get(groupId);
    const minMet = group?.min_met ?? 1;
    const metCount = groupReqs.filter((r) => meetsReq(r)).length;
    if (metCount < minMet) {
      const label = group?.label ?? "requirement group";
      missing_courses.push(`${metCount}/${minMet} met in "${label}"`);
    }
  }

  return { ok: missing_courses.length === 0, missing_courses, missing_positions: [] };
}

export async function GET(req: Request) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const url = new URL(req.url);
  const member_id = (url.searchParams.get("member_id") || "").trim();
  const position_id = (url.searchParams.get("position_id") || "").trim();
  const training_session_id = (url.searchParams.get("training_session_id") || "").trim();
  const call_id = (url.searchParams.get("call_id") || "").trim();

  // Mode 1: by training_session_id — return all signoffs for a session
  if (training_session_id) {
    if (!isUuid(training_session_id)) return NextResponse.json({ error: "bad training_session_id" }, { status: 400 });
    const { data, error } = await supabaseDb
      .from("member_task_signoffs")
      .select("id, member_id, position_id, task_id, evaluator_name, evaluator_position, signed_at, notes, call_id, training_session_id")
      .eq("training_session_id", training_session_id)
      .order("signed_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  // Mode 2: by call_id — return all signoffs for a call
  if (call_id) {
    if (!isUuid(call_id)) return NextResponse.json({ error: "bad call_id" }, { status: 400 });
    const { data, error } = await supabaseDb
      .from("member_task_signoffs")
      .select("id, member_id, position_id, task_id, evaluator_name, evaluator_position, signed_at, notes, call_id, training_session_id")
      .eq("call_id", call_id)
      .order("signed_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  // Mode 2b: by task_id — return all signoffs for a task (for task detail page)
  const task_id_filter = (url.searchParams.get("task_id") || "").trim();
  if (task_id_filter) {
    if (!isUuid(task_id_filter)) return NextResponse.json({ error: "bad task_id" }, { status: 400 });
    const { data, error } = await supabaseDb
      .from("member_task_signoffs")
      .select("id, member_id, position_id, task_id, evaluator_name, evaluator_position, signed_at, notes, members:member_id(first_name, last_name)")
      .eq("task_id", task_id_filter)
      .order("signed_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  // Mode 3: by member_id (+ optional position_id filter)
  if (!member_id || !isUuid(member_id)) return NextResponse.json({ error: "bad member_id" }, { status: 400 });
  if (position_id && !isUuid(position_id)) return NextResponse.json({ error: "bad position_id" }, { status: 400 });

  let query = supabaseDb
    .from("member_task_signoffs")
    .select("id, member_id, position_id, task_id, evaluator_name, evaluator_position, signed_at, notes, call_id, training_session_id")
    .eq("member_id", member_id)
    .order("signed_at", { ascending: false });

  // Include both position-specific signoffs AND global (call/training-level) signoffs where position_id is null
  if (position_id) {
    query = query.or(`position_id.eq.${position_id},position_id.is.null`);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const check = await requirePermission("approve_positions");
  if (!check.ok) return check.response;

  const body = await req.json().catch(() => ({}));
  const member_id = String(body.member_id ?? "").trim();
  const position_id = String(body.position_id ?? "").trim();
  const task_id = String(body.task_id ?? "").trim();

  if (!member_id || !isUuid(member_id)) return NextResponse.json({ error: "bad member_id" }, { status: 400 });
  if (position_id && !isUuid(position_id)) return NextResponse.json({ error: "bad position_id" }, { status: 400 });
  if (!task_id || !isUuid(task_id)) return NextResponse.json({ error: "bad task_id" }, { status: 400 });

  // If this is PTB Complete, enforce requirements first
  const { data: taskRow, error: taskErr } = await supabaseDb
    .from("position_tasks")
    .select("id, task_code, position_id")
    .eq("id", task_id)
    .single();

  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });

  const task_code = String((taskRow as { task_code?: string })?.task_code ?? "");
  if (isPtbCompleteTaskCode(task_code) && position_id) {
    try {
      const reqCheck = await checkPositionRequirements(member_id, position_id);

      if (!reqCheck.ok) {
        return NextResponse.json(
          {
            error: "PTB cannot be marked complete until requirements are met.",
            missing_courses: reqCheck.missing_courses,
            missing_positions: reqCheck.missing_positions,
          },
          { status: 400 }
        );
      }
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  const call_id = body.call_id ? String(body.call_id).trim() : null;
  const training_session_id = body.training_session_id ? String(body.training_session_id).trim() : null;

  if (call_id && !isUuid(call_id)) return NextResponse.json({ error: "bad call_id" }, { status: 400 });
  if (training_session_id && !isUuid(training_session_id)) return NextResponse.json({ error: "bad training_session_id" }, { status: 400 });

  const payload = {
    member_id,
    position_id: position_id || null,
    task_id,
    evaluator_name: body.evaluator_name ? String(body.evaluator_name) : null,
    evaluator_position: body.evaluator_position ? String(body.evaluator_position) : null,
    notes: body.notes ? String(body.notes) : null,
    call_id,
    training_session_id,
  };

  const { data: inserted, error: insErr } = await supabaseDb
    .from("member_task_signoffs")
    .insert(payload)
    .select("*")
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json({ data: inserted }, { status: 201 });
}