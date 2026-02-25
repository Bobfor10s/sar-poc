import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

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
      courses:course_id ( id, code, name ),
      positions:required_position_id ( id, code, name )
    `
    )
    .eq("position_id", position_id);

  if (reqErr) throw new Error(reqErr.message);

  // Member valid certs (expires_at >= today)
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data: certs, error: certErr } = await supabaseDb
    .from("member_certifications")
    .select("course_id, expires_at")
    .eq("member_id", member_id)
    .gte("expires_at", today);

  if (certErr) throw new Error(certErr.message);
  const haveCourse = new Set((certs ?? []).map((c: any) => c.course_id));

  // Member awarded/approved positions
  const { data: mpos, error: posErr } = await supabaseDb
    .from("member_positions")
    .select("position_id, status, approved_at, awarded_at")
    .eq("member_id", member_id);

  if (posErr) throw new Error(posErr.message);

  const havePos = new Set(
    (mpos ?? [])
      .filter((p: any) => {
        const st = String(p.status ?? "").toLowerCase();
        return !!p.approved_at || !!p.awarded_at || (st && st !== "trainee");
      })
      .map((p: any) => p.position_id)
  );

  const missing_courses: string[] = [];
  const missing_positions: string[] = [];

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
      const pid = (r as any).required_position_id;
      if (pid && !havePos.has(pid)) {
        const p = (r as any).positions;
        missing_positions.push(p?.code ? String(p.code) : String(pid));
      }
    }
  }

  return {
    ok: missing_courses.length === 0 && missing_positions.length === 0,
    missing_courses,
    missing_positions,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const member_id = (url.searchParams.get("member_id") || "").trim();
  const position_id = (url.searchParams.get("position_id") || "").trim();

  if (!member_id || !isUuid(member_id)) return NextResponse.json({ error: "bad member_id" }, { status: 400 });
  if (!position_id || !isUuid(position_id)) return NextResponse.json({ error: "bad position_id" }, { status: 400 });

  const { data, error } = await supabaseDb
    .from("member_task_signoffs")
    .select("id, member_id, position_id, task_id, evaluator_name, evaluator_position, signed_at, notes")
    .eq("member_id", member_id)
    .eq("position_id", position_id)
    .order("signed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
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

  const payload = {
    member_id,
    position_id,
    task_id,
    evaluator_name: body.evaluator_name ? String(body.evaluator_name) : null,
    evaluator_position: body.evaluator_position ? String(body.evaluator_position) : null,
    notes: body.notes ? String(body.notes) : null,
  };

  const { data: inserted, error: insErr } = await supabaseDb
    .from("member_task_signoffs")
    .insert(payload)
    .select("*")
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json({ data: inserted }, { status: 201 });
}