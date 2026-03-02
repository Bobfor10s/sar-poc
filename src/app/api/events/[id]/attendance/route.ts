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

export async function GET(_req: Request, ctx: any) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const event_id = await getIdFromCtx(ctx);
  if (!event_id || !isUuid(event_id)) {
    return NextResponse.json({ error: `bad event id: ${event_id || "(missing)"}` }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("event_attendance")
    .select("id, member_id, time_in, time_out, rsvp_at, arrived_at, members:member_id(first_name, last_name)")
    .eq("event_id", event_id)
    .order("time_in", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
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
  const validActions = ["arrive", "clear", "rsvp", "early_arrive", "official"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: "action must be arrive, clear, rsvp, early_arrive, or official" }, { status: 400 });
  }

  // Fetch event config
  const { data: ev } = await supabaseDb
    .from("events")
    .select("start_dt, end_dt, allow_rsvp, allow_early_checkin, early_checkin_minutes")
    .eq("id", event_id)
    .single();

  const now = new Date();
  const nowIso = now.toISOString();

  if (action === "rsvp") {
    if (!ev?.allow_rsvp) {
      return NextResponse.json({ error: "RSVP is not enabled for this event" }, { status: 400 });
    }
  }

  if (action === "early_arrive") {
    if (!ev?.allow_early_checkin) {
      return NextResponse.json({ error: "Early check-in is not enabled for this event" }, { status: 400 });
    }
    if (!ev?.early_checkin_minutes || !ev?.start_dt) {
      return NextResponse.json({ error: "Early check-in window not configured" }, { status: 400 });
    }
    const startTime = new Date(ev.start_dt);
    const windowMs = ev.early_checkin_minutes * 60 * 1000;
    const windowOpenAt = new Date(startTime.getTime() - windowMs);
    if (now < windowOpenAt) {
      return NextResponse.json({ error: `Early check-in window opens ${ev.early_checkin_minutes} minutes before start` }, { status: 400 });
    }
    if (now >= startTime) {
      return NextResponse.json({ error: "Event has already started; use regular check-in" }, { status: 400 });
    }
    if (ev.end_dt && now >= new Date(ev.end_dt)) {
      return NextResponse.json({ error: "Event is already closed" }, { status: 400 });
    }
  }

  if (action === "arrive") {
    if (ev?.start_dt && new Date(ev.start_dt) > now) {
      return NextResponse.json({ error: "Event hasn't started yet" }, { status: 400 });
    }
    if (ev?.end_dt && new Date(ev.end_dt) <= now) {
      return NextResponse.json({ error: "Event is already closed" }, { status: 400 });
    }
  }

  if (action === "official") {
    if (!auth.permissions.includes("manage_training")) {
      return NextResponse.json({ error: "Permission denied: requires 'manage_training'" }, { status: 403 });
    }
    const timeIn = ev?.start_dt ? ev.start_dt : nowIso;
    const { error } = await supabaseDb
      .from("event_attendance")
      .update({ time_in: timeIn })
      .eq("event_id", event_id)
      .not("arrived_at", "is", null)
      .is("time_in", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data, error: fetchErr } = await supabaseDb
      .from("event_attendance")
      .select("*")
      .eq("event_id", event_id)
      .order("created_at", { ascending: true });
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  const checkin_override_note = body.checkin_override_note ? String(body.checkin_override_note) : undefined;

  const { data: existing } = await supabaseDb
    .from("event_attendance")
    .select("id, time_in, time_out, rsvp_at, arrived_at")
    .eq("event_id", event_id)
    .eq("member_id", member_id)
    .maybeSingle();

  const payload: Record<string, unknown> = {};
  if (checkin_override_note) payload.checkin_override_note = checkin_override_note;

  if (action === "rsvp") {
    if (!existing?.rsvp_at) payload.rsvp_at = nowIso;
  } else if (action === "early_arrive") {
    if (!existing?.arrived_at) payload.arrived_at = nowIso;
  } else if (action === "arrive") {
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
