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
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad course id: ${id || "(missing)"}` }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, ctx: any) {
  const check = await requirePermission("manage_courses");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad course id: ${id || "(missing)"}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  // Allow only these fields to be edited
  const payload: any = {};
  if (body.code !== undefined) payload.code = String(body.code).trim();
  if (body.name !== undefined) payload.name = String(body.name).trim();
  if (body.description !== undefined) payload.description = body.description ? String(body.description) : null;

  if (body.valid_months !== undefined) payload.valid_months = Number(body.valid_months);
  if (body.warning_days !== undefined) payload.warning_days = Number(body.warning_days);

  if (body.never_expires !== undefined) payload.never_expires = !!body.never_expires;
  if (body.is_active !== undefined) payload.is_active = !!body.is_active;
  if (body.show_on_roster !== undefined) payload.show_on_roster = !!body.show_on_roster;

  // Basic validation
  if ("code" in payload && !payload.code) {
    return NextResponse.json({ error: "code cannot be empty" }, { status: 400 });
  }
  if ("name" in payload && !payload.name) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }

  // If never_expires is being set true, force warning_days=0 (safe default)
  if (payload.never_expires === true) {
    payload.warning_days = 0;
    // keep valid_months sane (but constraint allows any value when never_expires=true)
    if (!Number.isFinite(payload.valid_months) || payload.valid_months <= 0) payload.valid_months = 24;
  }

  // If never_expires is false (or omitted), validate valid_months if present
  // (We allow partial PATCH updates; DB constraint is ultimate guard.)
  const never = payload.never_expires;

  if (never === false) {
    if ("valid_months" in payload && (!Number.isFinite(payload.valid_months) || payload.valid_months <= 0)) {
      return NextResponse.json({ error: "valid_months must be a positive number (or set never_expires=true)" }, { status: 400 });
    }
    if ("warning_days" in payload && (!Number.isFinite(payload.warning_days) || payload.warning_days < 0)) {
      return NextResponse.json({ error: "warning_days must be 0 or more" }, { status: 400 });
    }
  }

  // If never_expires not provided but they try to set valid_months <=0, block it
  if (!("never_expires" in payload) && "valid_months" in payload) {
    if (!Number.isFinite(payload.valid_months) || payload.valid_months <= 0) {
      return NextResponse.json({ error: "valid_months must be a positive number (or set never_expires=true)" }, { status: 400 });
    }
  }

  const { data, error } = await supabaseDb
    .from("courses")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, ctx: any) {
  const check = await requirePermission("manage_courses");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad course id: ${id || "(missing)"}` }, { status: 400 });
  }

  const { error } = await supabaseDb.from("courses").delete().eq("id", id);

  if (error) {
    // FK constraint = course is referenced by certifications, requirements, etc.
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "Cannot delete: course is referenced by member certifications or position requirements. Deactivate it instead." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: null });
}