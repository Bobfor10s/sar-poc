import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const url = new URL(req.url);
  const training_session_id = (url.searchParams.get("training_session_id") || "").trim();

  if (!training_session_id || !isUuid(training_session_id)) {
    return NextResponse.json({ error: "bad training_session_id" }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("training_attendance")
    .select("id, training_session_id, member_id, status, hours, notes, rsvp_at, arrived_at, time_in, time_out, created_at, members:member_id(first_name, last_name)")
    .eq("training_session_id", training_session_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const check = await requireAuth();
  if (!check.ok) return check.response;
  const { auth } = check;

  const body = await req.json().catch(() => ({}));
  const training_session_id = String(body.training_session_id ?? "").trim();
  const member_id = String(body.member_id ?? "").trim();

  if (!training_session_id || !isUuid(training_session_id)) {
    return NextResponse.json({ error: "bad training_session_id" }, { status: 400 });
  }
  if (!member_id || !isUuid(member_id)) {
    return NextResponse.json({ error: "bad member_id" }, { status: 400 });
  }

  const action = body.action ? String(body.action).trim() : null;
  const status = body.status ? String(body.status).trim() : "attended";
  const allowed = new Set(["attended", "absent", "excused"]);
  if (!allowed.has(status)) {
    return NextResponse.json({ error: "status must be attended|absent|excused" }, { status: 400 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // For phase actions (rsvp, early_arrive, official), fetch training session config
  if (action === "rsvp" || action === "early_arrive" || action === "official") {
    const { data: ts } = await supabaseDb
      .from("training_sessions")
      .select("start_dt, end_dt, allow_rsvp, allow_early_checkin, early_checkin_minutes")
      .eq("id", training_session_id)
      .single();

    if (action === "rsvp") {
      if (!ts?.allow_rsvp) {
        return NextResponse.json({ error: "RSVP is not enabled for this training session" }, { status: 400 });
      }
      const { data: existing } = await supabaseDb
        .from("training_attendance")
        .select("id, rsvp_at")
        .eq("training_session_id", training_session_id)
        .eq("member_id", member_id)
        .maybeSingle();

      if (existing?.id) {
        if (!existing.rsvp_at) {
          await supabaseDb.from("training_attendance").update({ rsvp_at: nowIso }).eq("id", existing.id);
        }
      } else {
        await supabaseDb.from("training_attendance").insert({ training_session_id, member_id, status, rsvp_at: nowIso });
      }

      const { data, error } = await supabaseDb
        .from("training_attendance")
        .select("id, training_session_id, member_id, status, hours, notes, rsvp_at, arrived_at, time_in, time_out, created_at, members:member_id(first_name, last_name)")
        .eq("training_session_id", training_session_id)
        .order("created_at", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data }, { status: 201 });
    }

    if (action === "early_arrive") {
      if (!ts?.allow_early_checkin) {
        return NextResponse.json({ error: "Early check-in is not enabled for this training session" }, { status: 400 });
      }
      if (!ts?.early_checkin_minutes || !ts?.start_dt) {
        return NextResponse.json({ error: "Early check-in window not configured" }, { status: 400 });
      }
      const startTime = new Date(ts.start_dt);
      const windowMs = ts.early_checkin_minutes * 60 * 1000;
      const windowOpenAt = new Date(startTime.getTime() - windowMs);
      if (now < windowOpenAt) {
        return NextResponse.json({ error: `Early check-in window opens ${ts.early_checkin_minutes} minutes before start` }, { status: 400 });
      }
      if (now >= startTime) {
        return NextResponse.json({ error: "Training has already started; use regular check-in" }, { status: 400 });
      }

      const { data: existing } = await supabaseDb
        .from("training_attendance")
        .select("id, arrived_at")
        .eq("training_session_id", training_session_id)
        .eq("member_id", member_id)
        .maybeSingle();

      if (existing?.id) {
        if (!existing.arrived_at) {
          await supabaseDb.from("training_attendance").update({ arrived_at: nowIso, status }).eq("id", existing.id);
        }
      } else {
        await supabaseDb.from("training_attendance").insert({ training_session_id, member_id, status, arrived_at: nowIso });
      }

      const { data, error } = await supabaseDb
        .from("training_attendance")
        .select("id, training_session_id, member_id, status, hours, notes, rsvp_at, arrived_at, time_in, time_out, created_at, members:member_id(first_name, last_name)")
        .eq("training_session_id", training_session_id)
        .order("created_at", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data }, { status: 201 });
    }

    if (action === "official") {
      if (!auth.permissions.includes("manage_training")) {
        return NextResponse.json({ error: "Permission denied: requires 'manage_training'" }, { status: 403 });
      }
      const timeIn = ts?.start_dt ? ts.start_dt : nowIso;
      await supabaseDb
        .from("training_attendance")
        .update({ time_in: timeIn, status: "attended" })
        .eq("training_session_id", training_session_id)
        .not("arrived_at", "is", null)
        .is("time_in", null);

      const { data, error } = await supabaseDb
        .from("training_attendance")
        .select("id, training_session_id, member_id, status, hours, notes, rsvp_at, arrived_at, time_in, time_out, created_at, members:member_id(first_name, last_name)")
        .eq("training_session_id", training_session_id)
        .order("created_at", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data }, { status: 201 });
    }
  }

  const payload: any = {
    training_session_id,
    member_id,
    status,
    hours: body.hours != null ? Number(body.hours) : null,
    notes: body.notes ? String(body.notes).trim() : null,
  };

  if (action === "arrive") {
    payload.time_in = nowIso;
    payload.time_out = null;
  } else if (action === "clear") {
    payload.time_out = nowIso;
  } else if (!action) {
    // Legacy: no action field — just set time_in if not clearing
    payload.time_in = nowIso;
  }

  // Upsert on unique (training_session_id, member_id)
  const { data, error } = await supabaseDb
    .from("training_attendance")
    .upsert(payload, { onConflict: "training_session_id,member_id" })
    .select("id, training_session_id, member_id, status, hours, notes, rsvp_at, arrived_at, time_in, time_out, created_at, members:member_id(first_name, last_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const { error } = await supabaseDb.from("training_attendance").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
