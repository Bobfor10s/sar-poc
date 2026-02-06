import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

async function getIdFromCtx(ctx: any): Promise<string> {
  const p = ctx?.params;

  // Next 16 can hand you params as a Promise in some setups
  const resolved = p && typeof p.then === "function" ? await p : p;

  const id = resolved?.id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function fetchAttendanceList(call_id: string) {
  return await supabaseDb
    .from("call_attendance")
    .select("*")
    .eq("call_id", call_id)
    .order("created_at", { ascending: true });
}

export async function GET(_req: Request, ctx: any) {
  const call_id = await getIdFromCtx(ctx);

  if (!call_id || !isUuid(call_id)) {
    return NextResponse.json({ error: `bad call id: ${call_id || "(missing)"}` }, { status: 400 });
  }

  const { data, error } = await fetchAttendanceList(call_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * POST supports:
 * - { member_id, action: "arrive" }  -> sets time_in (only if not set)
 * - { member_id, action: "clear" }   -> sets time_out (only if not set)
 * Optional: role_on_call, notes
 *
 * Backward compatible with manual time_in/time_out passed in body.
 */
export async function POST(req: Request, ctx: any) {
  const call_id = await getIdFromCtx(ctx);

  if (!call_id || !isUuid(call_id)) {
    return NextResponse.json({ error: `bad call id: ${call_id || "(missing)"}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const member_id = String(body.member_id ?? "").trim();

  if (!member_id || !isUuid(member_id)) {
    return NextResponse.json({ error: `bad member id: ${member_id || "(missing)"}` }, { status: 400 });
  }

  const action = body.action ? String(body.action).toLowerCase() : "";

  // Optional fields supported by your schema
  const role_on_call = body.role_on_call ? String(body.role_on_call) : undefined;
  const notes = body.notes ? String(body.notes) : undefined;

  // Timestamps: allow explicit, otherwise set based on action
  const nowIso = new Date().toISOString();
  const requested_time_in = body.time_in ? String(body.time_in) : undefined;
  const requested_time_out = body.time_out ? String(body.time_out) : undefined;

  // 1) Check if row already exists (because unique call_id+member_id)
  const { data: existing, error: existingErr } = await supabaseDb
    .from("call_attendance")
    .select("id, time_in, time_out")
    .eq("call_id", call_id)
    .eq("member_id", member_id)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  // 2) Build payload respecting "only set if missing" behavior
  const payload: Record<string, any> = {};
  if (role_on_call) payload.role_on_call = role_on_call;
  if (notes) payload.notes = notes;

  // Decide time_in/time_out based on action (or explicit values)
  if (requested_time_in) {
    payload.time_in = requested_time_in;
  } else if (action === "arrive") {
    // only set if not already set
    if (!existing?.time_in) payload.time_in = nowIso;
  }

  if (requested_time_out) {
    payload.time_out = requested_time_out;
  } else if (action === "clear") {
    // only set if not already set
    if (!existing?.time_out) payload.time_out = nowIso;
  }

  // 3) Insert or update
  if (existing?.id) {
    // Update existing row
    if (Object.keys(payload).length > 0) {
      const { error: updErr } = await supabaseDb
        .from("call_attendance")
        .update(payload)
        .eq("id", existing.id);

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  } else {
    // Insert new row
    const insertPayload: Record<string, any> = { call_id, member_id, ...payload };

    // If arriving and we didn't set time_in above, set it on insert
    if (action === "arrive" && !insertPayload.time_in) insertPayload.time_in = nowIso;

    const { error: insErr } = await supabaseDb
      .from("call_attendance")
      .insert(insertPayload);

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Return updated list (what your UI already expects)
  const { data, error } = await fetchAttendanceList(call_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
