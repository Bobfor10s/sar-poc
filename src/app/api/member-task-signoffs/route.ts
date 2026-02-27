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

async function checkPositionRequirements(member_id: string, position_id: string) {
  // Requirements for the position
  const { data: reqs, error: reqErr } = await supabaseDb
    .from("position_requirements")
    .select(
      `
      req_kind,
      course_id,
      required_position_id,
      task_id,
      courses:course_id ( id, code, name ),
      positions:required_position_id ( id, code, name ),
      tasks:task_id ( id, task_code, task_name )
    `
    )
    .eq("position_id", position_id);

  if (reqErr) throw new Error(reqErr.message);

  // Certs that are either non-expired or from a never_expires course
  const today = new Date().toISOString().slice(0, 10);
  const { data: certs, error: certErr } = await supabaseDb
    .from("member_certifications")
    .select("course_id, expires_at, courses:course_id(never_expires)")
    .eq("member_id", member_id);

  if (certErr) throw new Error(certErr.message);
  const haveCourse = new Set(
    (certs ?? [])
      .filter((c: any) => {
        const neverExpires = c.courses?.never_expires ?? false;
        return neverExpires || !c.expires_at || c.expires_at >= today;
      })
      .map((c: any) => c.course_id)
  );

  const missing_courses: string[] = [];

  for (const r of reqs ?? []) {
    const kind = String((r as any).req_kind ?? "").toLowerCase();

    if (kind === "course") {
      const cid = (r as any).course_id;
      if (cid && !haveCourse.has(cid)) {
        const c = (r as any).courses;
        missing_courses.push(c?.code ? String(c.code) : String(cid));
      }
    }

    if (kind === "position") {
      // Check courses required by the prerequisite position instead of checking approval status
      const prereq_position_id = (r as any).required_position_id;
      if (prereq_position_id) {
        const { data: prereqReqs, error: prereqErr } = await supabaseDb
          .from("position_requirements")
          .select("req_kind, course_id, courses:course_id ( id, code, name )")
          .eq("position_id", prereq_position_id)
          .eq("req_kind", "course");

        if (prereqErr) throw new Error(prereqErr.message);

        for (const pr of prereqReqs ?? []) {
          const cid = (pr as any).course_id;
          if (cid && !haveCourse.has(cid)) {
            const c = (pr as any).courses;
            missing_courses.push(c?.code ? String(c.code) : String(cid));
          }
        }
      }
    }

    if (kind === "task") {
      const req_task_id = (r as any).task_id;
      if (req_task_id) {
        const { data: signoff } = await supabaseDb
          .from("member_task_signoffs")
          .select("id")
          .eq("member_id", member_id)
          .eq("position_id", position_id)
          .eq("task_id", req_task_id)
          .maybeSingle();
        if (!signoff) {
          const taskCode = (r as any).tasks?.task_code ?? req_task_id;
          missing_courses.push(`TASK:${taskCode}`);
        }
      }
    }
  }

  return {
    ok: missing_courses.length === 0,
    missing_courses,
    missing_positions: [],
  };
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

  // Mode 3: by member_id + position_id (original behaviour)
  if (!member_id || !isUuid(member_id)) return NextResponse.json({ error: "bad member_id" }, { status: 400 });
  if (!position_id || !isUuid(position_id)) return NextResponse.json({ error: "bad position_id" }, { status: 400 });

  const { data, error } = await supabaseDb
    .from("member_task_signoffs")
    .select("id, member_id, position_id, task_id, evaluator_name, evaluator_position, signed_at, notes, call_id, training_session_id")
    .eq("member_id", member_id)
    .eq("position_id", position_id)
    .order("signed_at", { ascending: false });

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
  if (!position_id || !isUuid(position_id)) return NextResponse.json({ error: "bad position_id" }, { status: 400 });
  if (!task_id || !isUuid(task_id)) return NextResponse.json({ error: "bad task_id" }, { status: 400 });

  // If this is PTB Complete, enforce requirements first
  const { data: taskRow, error: taskErr } = await supabaseDb
    .from("position_tasks")
    .select("id, task_code, position_id")
    .eq("id", task_id)
    .single();

  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });

  const task_code = String((taskRow as any)?.task_code ?? "");
  if (isPtbCompleteTaskCode(task_code)) {
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
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
    }
  }

  const call_id = body.call_id ? String(body.call_id).trim() : null;
  const training_session_id = body.training_session_id ? String(body.training_session_id).trim() : null;

  if (call_id && !isUuid(call_id)) return NextResponse.json({ error: "bad call_id" }, { status: 400 });
  if (training_session_id && !isUuid(training_session_id)) return NextResponse.json({ error: "bad training_session_id" }, { status: 400 });

  const payload = {
    member_id,
    position_id,
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