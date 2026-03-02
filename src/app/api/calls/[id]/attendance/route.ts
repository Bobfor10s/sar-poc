import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth, requirePermission } from "@/lib/supabase/require-permission";
import { logActivity } from "@/lib/supabase/log-activity";

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
  const [attRes, periodsRes] = await Promise.all([
    supabaseDb
      .from("call_attendance")
      .select("id, call_id, member_id, time_in, time_out, role_on_call, notes, checkin_override_note, on_my_way_at, current_lat, current_lng, location_updated_at, created_at")
      .eq("call_id", call_id)
      .order("created_at", { ascending: true }),
    supabaseDb
      .from("call_attendance_periods")
      .select("id, member_id, time_in, time_out")
      .eq("call_id", call_id)
      .order("time_in", { ascending: true }),
  ]);

  if (attRes.error) return { data: null, error: attRes.error };

  const periods = periodsRes.data ?? [];
  const data = (attRes.data ?? []).map((a) => ({
    ...a,
    periods: periods.filter((p) => p.member_id === a.member_id),
  }));

  return { data, error: null };
}

export async function GET(_req: Request, ctx: any) {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

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

  // Members can only check themselves in; manage_calls required to check in others
  const canManage = check.auth.permissions.includes("manage_calls");
  if (!canManage && check.auth.member?.id !== member_id) {
    return NextResponse.json({ error: "Permission denied: can only check in yourself" }, { status: 403 });
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
    .select("id, time_in, time_out, on_my_way_at")
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
    // Keep first arrival as the summary time_in; clear time_out on re-arrive
    if (!existing?.time_in) payload.time_in = nowIso;
    if (existing?.time_out) payload.time_out = null;
  }

  if (requested_time_out) {
    payload.time_out = requested_time_out;
  } else if (action === "clear") {
    if (!existing?.time_out) payload.time_out = nowIso;
  }

  if (action === "on_my_way") {
    // Always reset — member may be going en-route again after a prior checkout
    payload.on_my_way_at = nowIso;
  }

  // 3) Insert or update main call_attendance row
  if (existing?.id) {
    if (Object.keys(payload).length > 0) {
      const { error: updErr } = await supabaseDb
        .from("call_attendance")
        .update(payload)
        .eq("id", existing.id);

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  } else {
    const insertPayload: Record<string, any> = { call_id, member_id, ...payload };
    if (action === "arrive" && !insertPayload.time_in) insertPayload.time_in = nowIso;

    const { error: insErr } = await supabaseDb
      .from("call_attendance")
      .insert(insertPayload);

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 4) Period logging
  if (action === "arrive") {
    // Open a new period
    await supabaseDb
      .from("call_attendance_periods")
      .insert({ call_id, member_id, time_in: nowIso });
  } else if (action === "clear") {
    // Close the latest open period for this member
    const { data: openPeriod } = await supabaseDb
      .from("call_attendance_periods")
      .select("id")
      .eq("call_id", call_id)
      .eq("member_id", member_id)
      .is("time_out", null)
      .order("time_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openPeriod?.id) {
      await supabaseDb
        .from("call_attendance_periods")
        .update({ time_out: nowIso })
        .eq("id", openPeriod.id);
    }
  }

  // Log activity
  const logAction = action === "clear" ? "check_out" : action === "on_my_way" ? "on_my_way" : "check_in";
  const { data: callRow } = await supabaseDb.from("calls").select("title").eq("id", call_id).single();
  await logActivity(req, logAction, { call: callRow?.title ?? call_id });

  // Return updated list (what your UI already expects)
  const { data, error } = await fetchAttendanceList(call_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * PATCH — edit time_in / time_out on an existing attendance record.
 * Body: { attendance_id, time_in?, time_out? }
 */
export async function PATCH(req: Request, ctx: any) {
  const check = await requirePermission("manage_calls");
  if (!check.ok) return check.response;

  const call_id = await getIdFromCtx(ctx);
  if (!call_id || !isUuid(call_id)) {
    return NextResponse.json({ error: `bad call id: ${call_id || "(missing)"}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const attendance_id = String(body.attendance_id ?? "").trim();
  if (!attendance_id || !isUuid(attendance_id)) {
    return NextResponse.json({ error: "bad attendance_id" }, { status: 400 });
  }

  const payload: Record<string, string | null> = {};
  if (body.time_in !== undefined) payload.time_in = body.time_in ? String(body.time_in) : null;
  if (body.time_out !== undefined) payload.time_out = body.time_out ? String(body.time_out) : null;

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { error } = await supabaseDb
    .from("call_attendance")
    .update(payload)
    .eq("id", attendance_id)
    .eq("call_id", call_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data, error: listErr } = await fetchAttendanceList(call_id);
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
