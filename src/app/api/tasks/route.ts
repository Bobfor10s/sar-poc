import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const url = new URL(req.url);
  const position_id = url.searchParams.get("position_id") ?? "";

  let query = supabaseDb
    .from("position_tasks")
    .select("id, task_code, task_name, description, is_active, is_global, position_id, positions:position_id(id, code, name)")
    .order("task_code", { ascending: true });

  if (position_id && isUuid(position_id)) {
    query = query.eq("position_id", position_id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const check = await requirePermission("manage_positions");
  if (!check.ok) return check.response;

  const body = await req.json().catch(() => ({}));
  const task_code = String(body.task_code ?? "").trim();
  const task_name = String(body.task_name ?? "").trim();

  if (!task_code) return NextResponse.json({ error: "task_code required" }, { status: 400 });
  if (!task_name) return NextResponse.json({ error: "task_name required" }, { status: 400 });

  const is_global = body.is_global === true;
  const position_id = body.position_id ? String(body.position_id).trim() : null;

  if (!is_global && (!position_id || !isUuid(position_id))) {
    return NextResponse.json({ error: "position_id required when is_global=false" }, { status: 400 });
  }

  const payload: Record<string, string | boolean | null> = {
    task_code,
    task_name,
    description: body.description ? String(body.description).trim() : null,
    is_active: true,
    is_global,
    position_id: is_global ? null : position_id,
  };

  const { data, error } = await supabaseDb
    .from("position_tasks")
    .insert(payload)
    .select("id, task_code, task_name, description, is_active, is_global, position_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
