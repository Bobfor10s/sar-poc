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

const ALLOWED_STATUS = new Set(["scheduled", "completed", "cancelled", "archived"]);
const ALLOWED_VIS = new Set(["members", "public"]);

export async function GET(_req: Request, ctx: any) {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad id: ${id || "(missing)"}` }, { status: 400 });
  }

  const { data, error } = await supabaseDb.from("events").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, ctx: any) {
  const check = await requirePermission("manage_training");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad id: ${id || "(missing)"}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const patch: any = {};

  if (body.title != null) patch.title = String(body.title).trim();
  if (body.start_dt != null) patch.start_dt = String(body.start_dt);
  if (body.end_dt != null) patch.end_dt = body.end_dt ? String(body.end_dt) : null;
  if (body.location_text != null) patch.location_text = body.location_text ? String(body.location_text).trim() : null;
  if (body.description != null) patch.description = body.description ? String(body.description).trim() : null;

  if (body.visibility != null) {
    const v = String(body.visibility).toLowerCase().trim();
    if (!ALLOWED_VIS.has(v)) return NextResponse.json({ error: "visibility must be members|public" }, { status: 400 });
    patch.visibility = v;
  }

  if (body.status != null) {
    const s = String(body.status).toLowerCase().trim();
    if (!ALLOWED_STATUS.has(s)) return NextResponse.json({ error: "bad status" }, { status: 400 });
    patch.status = s;
  }

  if (body.is_test != null) patch.is_test = !!body.is_test;

  const { data, error } = await supabaseDb.from("events").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/** TEST-only hard delete (temporary cleanup tool) */
export async function DELETE(_req: Request, ctx: any) {
  const check = await requirePermission("manage_training");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad id: ${id || "(missing)"}` }, { status: 400 });
  }

  const { data: row, error: getErr } = await supabaseDb
    .from("events")
    .select("id,is_test")
    .eq("id", id)
    .single();

  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!row?.is_test) return NextResponse.json({ error: "Only TEST events can be hard-deleted." }, { status: 403 });

  const { error } = await supabaseDb.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
