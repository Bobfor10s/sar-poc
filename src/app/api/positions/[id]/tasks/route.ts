import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

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

export async function POST(req: Request, ctx: any) {
  const position_id = await getIdFromCtx(ctx);
  if (!position_id || !isUuid(position_id)) {
    return NextResponse.json({ error: "bad position id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const task_code = String(body.task_code ?? "").trim();
  const task_name = String(body.task_name ?? "").trim();

  if (!task_code) return NextResponse.json({ error: "task_code required" }, { status: 400 });
  if (!task_name) return NextResponse.json({ error: "task_name required" }, { status: 400 });

  const payload: Record<string, any> = {
    position_id,
    task_code,
    task_name,
    description: body.description ? String(body.description).trim() : null,
    is_active: true,
  };

  const { data, error } = await supabaseDb
    .from("position_tasks")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: Request, ctx: any) {
  const position_id = await getIdFromCtx(ctx);
  if (!position_id || !isUuid(position_id)) {
    return NextResponse.json({ error: "bad position id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const task_id = (url.searchParams.get("task_id") ?? "").trim();
  if (!task_id || !isUuid(task_id)) {
    return NextResponse.json({ error: "task_id query param required" }, { status: 400 });
  }

  // Verify it belongs to this position before deleting
  const { data: existing, error: findErr } = await supabaseDb
    .from("position_tasks")
    .select("id")
    .eq("id", task_id)
    .eq("position_id", position_id)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await supabaseDb
    .from("position_tasks")
    .delete()
    .eq("id", task_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
