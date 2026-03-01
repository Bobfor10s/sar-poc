import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

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
  const check = await requireAuth();
  if (!check.ok) return check.response;
  const { auth } = check;

  const event_id = await getIdFromCtx(ctx);
  if (!event_id || !isUuid(event_id)) {
    return NextResponse.json({ error: `bad event id: ${event_id || "(missing)"}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const member_id = String(body.member_id ?? "").trim();
  if (!member_id || !isUuid(member_id)) {
    return NextResponse.json({ error: `bad member id: ${member_id || "(missing)"}` }, { status: 400 });
  }

  // If acting on behalf of another member, require manage_training
  if (member_id !== auth.member.id && !auth.permissions.includes("manage_training")) {
    return NextResponse.json({ error: "Permission denied: requires 'manage_training'" }, { status: 403 });
  }

  const action = String(body.action ?? "").toLowerCase();
  if (action !== "arrive" && action !== "clear") {
    return NextResponse.json({ error: "action must be 'arrive' or 'clear'" }, { status: 400 });
  }

  const checkin_override_note = body.checkin_override_note ? String(body.checkin_override_note) : undefined;
  const nowIso = new Date().toISOString();

  const { data: existing } = await supabaseDb
    .from("event_attendance")
    .select("id, time_in, time_out")
    .eq("event_id", event_id)
    .eq("member_id", member_id)
    .maybeSingle();

  const payload: Record<string, unknown> = {};
  if (checkin_override_note) payload.checkin_override_note = checkin_override_note;

  if (action === "arrive") {
    if (!existing?.time_in) payload.time_in = nowIso;
  } else if (action === "clear") {
    if (!existing?.time_out) payload.time_out = nowIso;
  }

  if (existing?.id) {
    if (Object.keys(payload).length > 0) {
      const { error } = await supabaseDb
        .from("event_attendance")
        .update(payload)
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const insertPayload: Record<string, unknown> = { event_id, member_id, ...payload };
    if (action === "arrive" && !insertPayload.time_in) insertPayload.time_in = nowIso;
    const { error } = await supabaseDb.from("event_attendance").insert(insertPayload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data, error } = await supabaseDb
    .from("event_attendance")
    .select("*")
    .eq("event_id", event_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
