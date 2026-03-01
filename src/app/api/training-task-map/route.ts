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

  if (!training_session_id || !isUuid(training_session_id)) {
    return NextResponse.json({ error: "training_session_id required" }, { status: 400 });
  }

  const query = supabaseDb
    .from("training_task_map")
    .select(
      "id, training_session_id, position_id, task_id, evaluation_method, created_at, positions:position_id(id, code, name), tasks:task_id(id, task_code, task_name)"
    )
    .eq("training_session_id", training_session_id)
    .order("created_at", { ascending: true });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // position_id is optional — tasks are global skills
  const position_id = body.position_id ? String(body.position_id).trim() : null;
  const task_id = String(body.task_id ?? "").trim();
  const training_session_id = String(body.training_session_id ?? "").trim();

  if (position_id && !isUuid(position_id)) {
    return NextResponse.json({ error: "bad position_id" }, { status: 400 });
  }
  if (!task_id || !isUuid(task_id)) {
    return NextResponse.json({ error: "bad task_id" }, { status: 400 });
  }
  if (!training_session_id || !isUuid(training_session_id)) {
    return NextResponse.json({ error: "training_session_id required" }, { status: 400 });
  }

  const payload: Record<string, string | null> = {
    task_id,
    position_id,
    training_session_id,
    evaluation_method: body.evaluation_method ? String(body.evaluation_method).trim() : null,
  };

  const { data, error } = await supabaseDb
    .from("training_task_map")
    .insert(payload)
    .select("id, training_session_id, position_id, task_id, evaluation_method, created_at, positions:position_id(id, code, name), tasks:task_id(id, task_code, task_name)")
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
