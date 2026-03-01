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

const STATUS_ALLOWED = new Set(["scheduled", "completed", "cancelled", "archived"]);
const VIS_ALLOWED = new Set(["members", "public"]);

export async function GET(_req: Request, ctx: any) {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad meeting id: ${id || "(missing)"}` }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("meetings")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, ctx: any) {
  const check = await requirePermission("manage_meetings");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad meeting id: ${id || "(missing)"}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const payload: any = {};

  if (body.title !== undefined) payload.title = String(body.title).trim();
  if (body.start_dt !== undefined) payload.start_dt = body.start_dt ? String(body.start_dt) : null;
  if (body.end_dt !== undefined) payload.end_dt = body.end_dt ? String(body.end_dt) : null;
  if (body.location_text !== undefined) payload.location_text = body.location_text ? String(body.location_text).trim() : null;
  if (body.agenda !== undefined) payload.agenda = body.agenda ? String(body.agenda).trim() : null;
  if (body.notes !== undefined) payload.notes = body.notes ? String(body.notes).trim() : null;

  if (body.status !== undefined) {
    const st = String(body.status).toLowerCase().trim();
    if (!STATUS_ALLOWED.has(st)) {
      return NextResponse.json({ error: "status must be scheduled, completed, cancelled, archived" }, { status: 400 });
    }
    payload.status = st;
  }

  if (body.visibility !== undefined) {
    const v = String(body.visibility).toLowerCase().trim();
    if (!VIS_ALLOWED.has(v)) {
      return NextResponse.json({ error: "visibility must be members or public" }, { status: 400 });
    }
    payload.visibility = v;
  }

  if (body.is_test !== undefined) payload.is_test = !!body.is_test;

  if (body.incident_lat !== undefined) payload.incident_lat = body.incident_lat != null && body.incident_lat !== "" ? Number(body.incident_lat) : null;
  if (body.incident_lng !== undefined) payload.incident_lng = body.incident_lng != null && body.incident_lng !== "" ? Number(body.incident_lng) : null;
  if (body.incident_radius_m !== undefined) payload.incident_radius_m = body.incident_radius_m != null && body.incident_radius_m !== "" ? Number(body.incident_radius_m) : null;

  const { data, error } = await supabaseDb
    .from("meetings")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, ctx: any) {
  const check = await requirePermission("manage_meetings");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad meeting id: ${id || "(missing)"}` }, { status: 400 });
  }

  // Only allow hard delete if is_test = true
  const { data: existing, error: exErr } = await supabaseDb
    .from("meetings")
    .select("id,is_test")
    .eq("id", id)
    .single();

  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (!existing?.is_test) return NextResponse.json({ error: "hard delete allowed only for TEST meetings" }, { status: 400 });

  const { error } = await supabaseDb.from("meetings").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
