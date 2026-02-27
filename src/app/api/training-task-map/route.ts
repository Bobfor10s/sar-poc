import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const url = new URL(req.url);
  const training_session_id = (url.searchParams.get("training_session_id") || "").trim();
  const course_id = (url.searchParams.get("course_id") || "").trim();

  if (!training_session_id && !course_id) {
    return NextResponse.json({ error: "training_session_id or course_id required" }, { status: 400 });
  }

  let query = supabaseDb
    .from("training_task_map")
    .select(
      "id, training_session_id, course_id, position_id, task_id, evaluation_method, created_at, positions:position_id(id, code, name), tasks:task_id(id, task_code, task_name)"
    )
    .order("created_at", { ascending: true });

  if (training_session_id && isUuid(training_session_id)) {
    query = query.eq("training_session_id", training_session_id);
  } else if (course_id && isUuid(course_id)) {
    query = query.eq("course_id", course_id);
  } else {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const position_id = String(body.position_id ?? "").trim();
  const task_id = String(body.task_id ?? "").trim();

  if (!position_id || !isUuid(position_id)) {
    return NextResponse.json({ error: "bad position_id" }, { status: 400 });
  }
  if (!task_id || !isUuid(task_id)) {
    return NextResponse.json({ error: "bad task_id" }, { status: 400 });
  }

  const training_session_id = body.training_session_id ? String(body.training_session_id).trim() : null;
  const course_id = body.course_id ? String(body.course_id).trim() : null;

  if (!training_session_id && !course_id) {
    return NextResponse.json({ error: "training_session_id or course_id required" }, { status: 400 });
  }
  if (training_session_id && !isUuid(training_session_id)) {
    return NextResponse.json({ error: "bad training_session_id" }, { status: 400 });
  }
  if (course_id && !isUuid(course_id)) {
    return NextResponse.json({ error: "bad course_id" }, { status: 400 });
  }

  const payload = {
    training_session_id,
    course_id,
    position_id,
    task_id,
    evaluation_method: body.evaluation_method ? String(body.evaluation_method).trim() : null,
  };

  const { data, error } = await supabaseDb
    .from("training_task_map")
    .insert(payload)
    .select("id, training_session_id, course_id, position_id, task_id, evaluation_method, created_at, positions:position_id(id, code, name), tasks:task_id(id, task_code, task_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const { error } = await supabaseDb.from("training_task_map").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
