import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getIdFromCtx(ctx: any): Promise<string> {
  const p = ctx?.params;
  const resolved = p && typeof p.then === "function" ? await p : p;
  const id = resolved?.id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(req: Request, ctx: any) {
  const check = await requirePermission("manage_positions");
  if (!check.ok) return check.response;

  const position_id = await getIdFromCtx(ctx);
  if (!position_id || !isUuid(position_id)) {
    return NextResponse.json({ error: "bad position id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const label = String(body.label ?? "").trim() || "Alternative Paths";
  const min_met = Math.max(1, Math.round(Number(body.min_met ?? 1)));

  const { data, error } = await supabaseDb
    .from("position_req_groups")
    .insert({ position_id, label, min_met })
    .select("id, position_id, label, min_met, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function PATCH(req: Request, ctx: any) {
  const check = await requirePermission("manage_positions");
  if (!check.ok) return check.response;

  const position_id = await getIdFromCtx(ctx);
  if (!position_id || !isUuid(position_id)) {
    return NextResponse.json({ error: "bad position id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const group_id = (url.searchParams.get("group_id") ?? "").trim();
  if (!group_id || !isUuid(group_id)) {
    return NextResponse.json({ error: "group_id query param required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const payload: Record<string, string | number> = {};
  if (body.label !== undefined) payload.label = String(body.label).trim() || "Alternative Paths";
  if (body.min_met !== undefined) payload.min_met = Math.max(1, Math.round(Number(body.min_met)));

  const { data, error } = await supabaseDb
    .from("position_req_groups")
    .update(payload)
    .eq("id", group_id)
    .eq("position_id", position_id)
    .select("id, position_id, label, min_met, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function DELETE(req: Request, ctx: any) {
  const check = await requirePermission("manage_positions");
  if (!check.ok) return check.response;

  const position_id = await getIdFromCtx(ctx);
  if (!position_id || !isUuid(position_id)) {
    return NextResponse.json({ error: "bad position id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const group_id = (url.searchParams.get("group_id") ?? "").trim();
  if (!group_id || !isUuid(group_id)) {
    return NextResponse.json({ error: "group_id query param required" }, { status: 400 });
  }

  // Verify ownership before deleting
  const { data: existing } = await supabaseDb
    .from("position_req_groups")
    .select("id")
    .eq("id", group_id)
    .eq("position_id", position_id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await supabaseDb.from("position_req_groups").delete().eq("id", group_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
