import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const { data, error } = await supabaseDb
    .from("position_tasks")
    .select("id, task_code, task_name, description, is_active")
    .order("task_code", { ascending: true });

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

  const { data, error } = await supabaseDb
    .from("position_tasks")
    .insert({
      task_code,
      task_name,
      description: body.description ? String(body.description).trim() : null,
      is_active: true,
      is_global: true,
      position_id: null,
    })
    .select("id, task_code, task_name, description, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
