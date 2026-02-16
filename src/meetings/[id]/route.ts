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

const ALLOWED = new Set(["scheduled", "completed", "cancelled", "archived"]);

export async function GET(_req: Request, ctx: any) {
  const id = await getIdFromCtx(ctx);
  if (!id || !isUuid(id)) return NextResponse.json({ error: `bad id: ${id || "(missing)"}` }, { status: 400 });

  const { data, error } = await supabaseDb.from("meetings").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, ctx: any) {
  const id = await getIdFromCtx(ctx);
  if (!id || !isUuid(id)) return NextResponse.json({ error: `bad id: ${id || "(missing)"}` }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const patch: any = {};

  if (body.title != null) patch.title = String(body.title).trim();
  if (body.start_dt != null) patch.start_dt = String(body.start_dt);
  if (body.end_dt != null) patch.end_dt = body.end_dt ? String(body.end_dt) : null;
  if (body.location_text != null) patch.location_text = body.location_text ? String(body.location_text).trim() : null;
  if (body.agenda != null) patch.agenda = body.agenda ? String(body.agenda).trim() : null;
  if (body.notes != null) patch.notes = body.notes ? String(body.notes).trim() : null;

  if (body.visibility != null) patch.visibility = String(body.visibility).trim();
  if (body.status != null) {
    const st = String(body.status).toLowerCase().trim();
    if (!ALLOWED.has(st)) return NextResponse.json({ error: "bad status" }, { status: 400 });
    patch.status = st;
  }
  if (body.is_test != null) patch.is_test = !!body.is_test;

  const { data, error } = await supabaseDb.from("meetings").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/** Force delete for TEST only (for cleanup while building) */
export async function DELETE(_req: Request, ctx: any) {
  const id = await getIdFromCtx(ctx);
  if (!id || !isUuid(id)) return NextResponse.json({ error: `bad id: ${id || "(missing)"}` }, { status: 400 });

  const { data: row, error: getErr } = await supabaseDb.from("meetings").select("id,is_test").eq("id", id).single();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });

  if (!row?.is_test) {
    return NextResponse.json({ error: "Only TEST meetings can be hard-deleted." }, { status: 403 });
  }

  const { error } = await supabaseDb.from("meetings").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
