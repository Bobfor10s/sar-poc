import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function getIdFromCtx(ctx: any): Promise<string> {
  const p = ctx?.params;
  const resolved = p && typeof p.then === "function" ? await p : p;
  const id = resolved?.id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

export async function GET(_req: Request, ctx: any) {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);
  if (!id || !isUuid(id)) return NextResponse.json({ error: "bad task id" }, { status: 400 });

  const { data, error } = await supabaseDb
    .from("position_tasks")
    .select("id, task_code, task_name, description, is_active, is_global, position_id, positions:position_id(id, code, name)")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, ctx: any) {
  const check = await requirePermission("manage_positions");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);
  if (!id || !isUuid(id)) return NextResponse.json({ error: "bad task id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const payload: Record<string, string | boolean | null | undefined> = {};

  if (body.task_code !== undefined) payload.task_code = String(body.task_code).trim();
  if (body.task_name !== undefined) payload.task_name = String(body.task_name).trim();
  if (body.description !== undefined) payload.description = body.description ? String(body.description).trim() : null;
  if (body.is_active !== undefined) payload.is_active = !!body.is_active;
  if (body.is_global !== undefined) payload.is_global = !!body.is_global;
  if (body.position_id !== undefined) payload.position_id = body.position_id ? String(body.position_id).trim() : null;

  if ("task_code" in payload && !payload.task_code) {
    return NextResponse.json({ error: "task_code cannot be empty" }, { status: 400 });
  }
  if ("task_name" in payload && !payload.task_name) {
    return NextResponse.json({ error: "task_name cannot be empty" }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("position_tasks")
    .update(payload)
    .eq("id", id)
    .select("id, task_code, task_name, description, is_active, is_global, position_id, positions:position_id(id, code, name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
