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

  const meeting_id = await getIdFromCtx(ctx);
  if (!meeting_id || !isUuid(meeting_id)) {
    return NextResponse.json({ error: `bad meeting id: ${meeting_id || "(missing)"}` }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("meeting_attendance")
    .select("id, member_id, time_in, time_out, rsvp_at, arrived_at, members:member_id(first_name, last_name)")
    .eq("meeting_id", meeting_id)
    .order("time_in", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request, ctx: any) {
  const check = await requireAuth();
  if (!check.ok) return check.response;
  const { auth } = check;

  const meeting_id = await getIdFromCtx(ctx);
  if (!meeting_id || !isUuid(meeting_id)) {
    return NextResponse.json({ error: `bad meeting id: ${meeting_id || "(missing)"}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const member_id = String(body.member_id ?? "").trim();
  if (!member_id || !isUuid(member_id)) {
    return NextResponse.json({ error: `bad member id: ${member_id || "(missing)"}` }, { status: 400 });
  }

  // If acting on behalf of another member, require manage_meetings
  if (member_id !== auth.member.id && !auth.permissions.includes("manage_meetings")) {
    return NextResponse.json({ error: "Permission denied: requires 'manage_meetings'" }, { status: 403 });
  }

  const action = String(body.action ?? "").toLowerCase();
  const validActions = ["arrive", "clear", "rsvp", "early_arrive", "official"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: "action must be arrive, clear, rsvp, early_arrive, or official" }, { status: 400 });
  }

  // Fetch meeting config
  const { data: mtg } = await supabaseDb
    .from("meetings")
    .select("start_dt, end_dt, allow_rsvp, allow_early_checkin, early_checkin_minutes")
    .eq("id", meeting_id)
    .single();

  const now = new Date();
  const nowIso = now.toISOString();

  if (action === "rsvp") {
    if (!mtg?.allow_rsvp) {
      return NextResponse.json({ error: "RSVP is not enabled for this meeting" }, { status: 400 });
    }
  }

  if (action === "early_arrive") {
    if (!mtg?.allow_early_checkin) {
      return NextResponse.json({ error: "Early check-in is not enabled for this meeting" }, { status: 400 });
    }
    if (!mtg?.early_checkin_minutes || !mtg?.start_dt) {
      return NextResponse.json({ error: "Early check-in window not configured" }, { status: 400 });
    }
    const startTime = new Date(mtg.start_dt);
    const windowMs = mtg.early_checkin_minutes * 60 * 1000;
    const windowOpenAt = new Date(startTime.getTime() - windowMs);
    if (now < windowOpenAt) {
      return NextResponse.json({ error: `Early check-in window opens ${mtg.early_checkin_minutes} minutes before start` }, { status: 400 });
    }
    if (now >= startTime) {
      return NextResponse.json({ error: "Meeting has already started; use regular check-in" }, { status: 400 });
    }
    if (mtg.end_dt && now >= new Date(mtg.end_dt)) {
      return NextResponse.json({ error: "Meeting is already closed" }, { status: 400 });
    }
  }

  if (action === "arrive") {
    if (mtg?.start_dt && new Date(mtg.start_dt) > now) {
      return NextResponse.json({ error: "Meeting hasn't started yet" }, { status: 400 });
    }
    if (mtg?.end_dt && new Date(mtg.end_dt) <= now) {
      return NextResponse.json({ error: "Meeting is already closed" }, { status: 400 });
    }
  }

  if (action === "official") {
    if (!auth.permissions.includes("manage_meetings")) {
      return NextResponse.json({ error: "Permission denied: requires 'manage_meetings'" }, { status: 403 });
    }
    // Bulk set time_in = start_dt for all arrived members with no time_in
    const timeIn = mtg?.start_dt ? mtg.start_dt : nowIso;
    const { error } = await supabaseDb
      .from("meeting_attendance")
      .update({ time_in: timeIn })
      .eq("meeting_id", meeting_id)
      .not("arrived_at", "is", null)
      .is("time_in", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data, error: fetchErr } = await supabaseDb
      .from("meeting_attendance")
      .select("*")
      .eq("meeting_id", meeting_id)
      .order("created_at", { ascending: true });
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  const checkin_override_note = body.checkin_override_note ? String(body.checkin_override_note) : undefined;

  const { data: existing } = await supabaseDb
    .from("meeting_attendance")
    .select("id, time_in, time_out, rsvp_at, arrived_at")
    .eq("meeting_id", meeting_id)
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
        .from("meeting_attendance")
        .update(payload)
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const insertPayload: Record<string, unknown> = { meeting_id, member_id, ...payload };
    if (action === "arrive" && !insertPayload.time_in) insertPayload.time_in = nowIso;
    const { error } = await supabaseDb.from("meeting_attendance").insert(insertPayload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data, error } = await supabaseDb
    .from("meeting_attendance")
    .select("*")
    .eq("meeting_id", meeting_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
