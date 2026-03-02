import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

async function getIdFromCtx(ctx: any): Promise<string> {
  const p = ctx?.params;
  const resolved = p && typeof p.then === "function" ? await p : p;
  const id = resolved?.id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request, ctx: any) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const call_id = await getIdFromCtx(ctx);
  if (!call_id || !isUuid(call_id)) {
    return NextResponse.json({ error: `bad call id: ${call_id || "(missing)"}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const member_id = String(body.member_id ?? "").trim();
  if (!member_id || !isUuid(member_id)) {
    return NextResponse.json({ error: `bad member id: ${member_id || "(missing)"}` }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng must be finite numbers" }, { status: 400 });
  }

  // Members can only update their own row; manage_calls can update others
  const canManage = check.auth.permissions.includes("manage_calls");
  if (!canManage && check.auth.member?.id !== member_id) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const { error } = await supabaseDb
    .from("call_attendance")
    .update({
      current_lat: lat,
      current_lng: lng,
      location_updated_at: new Date().toISOString(),
    })
    .eq("call_id", call_id)
    .eq("member_id", member_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
