import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requireAuth();
  if (!check.ok) return check.response;
  const { auth } = check;

  const now = new Date();
  const nowIso = now.toISOString();

  // Active = started (start_dt <= now) and not yet ended (end_dt > now or no end_dt)
  function isActive(row: { start_dt?: string | null; end_dt?: string | null }) {
    if (!row.start_dt) return false;
    if (new Date(row.start_dt) > now) return false; // not started yet
    if (row.end_dt && new Date(row.end_dt) <= now) return false; // already ended
    return true;
  }

  // Fetch active calls: status = 'open' AND start_dt <= now
  const { data: calls } = await supabaseDb
    .from("calls")
    .select("id, title, incident_lat, incident_lng, incident_radius_m, start_dt")
    .eq("status", "open")
    .lte("start_dt", nowIso);

  // Fetch training sessions that may be active (filter precisely with isActive)
  const { data: trainingSessions } = await supabaseDb
    .from("training_sessions")
    .select("id, title, incident_lat, incident_lng, incident_radius_m, start_dt, end_dt, allow_rsvp, allow_early_checkin, early_checkin_minutes")
    .eq("status", "scheduled")
    .lte("start_dt", nowIso);

  // Fetch meetings that may be active
  const { data: meetings } = await supabaseDb
    .from("meetings")
    .select("id, title, incident_lat, incident_lng, incident_radius_m, start_dt, end_dt, allow_rsvp, allow_early_checkin, early_checkin_minutes")
    .neq("status", "cancelled")
    .neq("status", "archived")
    .lte("start_dt", nowIso);

  // Fetch events that may be active
  const { data: events } = await supabaseDb
    .from("events")
    .select("id, title, incident_lat, incident_lng, incident_radius_m, start_dt, end_dt, allow_rsvp, allow_early_checkin, early_checkin_minutes")
    .eq("status", "scheduled")
    .lte("start_dt", nowIso);

  const activeCalls = (calls ?? []).map((c) => ({ type: "call" as const, ...c }));
  const activeTraining = (trainingSessions ?? []).filter(isActive).map((t) => ({ type: "training" as const, ...t }));
  const activeMeetings = (meetings ?? []).filter(isActive).map((m) => ({ type: "meeting" as const, ...m }));
  const activeEvents = (events ?? []).filter(isActive).map((e) => ({ type: "event" as const, ...e }));

  const allActive = [...activeCalls, ...activeTraining, ...activeMeetings, ...activeEvents];

  // Fetch member's own attendance from each table
  const memberId = auth.member.id;

  const callIds = activeCalls.map((c) => c.id);
  const trainingIds = activeTraining.map((t) => t.id);
  const meetingIds = activeMeetings.map((m) => m.id);
  const eventIds = activeEvents.map((e) => e.id);

  const [callAtt, trainingAtt, meetingAtt, eventAtt] = await Promise.all([
    callIds.length
      ? supabaseDb.from("call_attendance").select("call_id, time_in, time_out, on_my_way_at").eq("member_id", memberId).in("call_id", callIds)
      : Promise.resolve({ data: [] }),
    trainingIds.length
      ? supabaseDb.from("training_attendance").select("training_session_id, time_in, time_out, rsvp_at, arrived_at").eq("member_id", memberId).in("training_session_id", trainingIds)
      : Promise.resolve({ data: [] }),
    meetingIds.length
      ? supabaseDb.from("meeting_attendance").select("meeting_id, time_in, time_out, rsvp_at, arrived_at").eq("member_id", memberId).in("meeting_id", meetingIds)
      : Promise.resolve({ data: [] }),
    eventIds.length
      ? supabaseDb.from("event_attendance").select("event_id, time_in, time_out, rsvp_at, arrived_at").eq("member_id", memberId).in("event_id", eventIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Auto-convert arrived members whose activity has now started (lazy conversion)
  const autoConvertPromises: any[] = [];

  for (const t of activeTraining) {
    const arrivedNotIn = (trainingAtt.data ?? []).filter(
      (r: any) => r.training_session_id === t.id && r.arrived_at && !r.time_in
    );
    if (arrivedNotIn.length > 0) {
      autoConvertPromises.push(
        supabaseDb
          .from("training_attendance")
          .update({ time_in: t.start_dt ?? nowIso, status: "attended" })
          .eq("training_session_id", t.id)
          .not("arrived_at", "is", null)
          .is("time_in", null)
      );
    }
  }
  for (const m of activeMeetings) {
    const arrivedNotIn = (meetingAtt.data ?? []).filter(
      (r: any) => r.meeting_id === m.id && r.arrived_at && !r.time_in
    );
    if (arrivedNotIn.length > 0) {
      autoConvertPromises.push(
        supabaseDb
          .from("meeting_attendance")
          .update({ time_in: m.start_dt ?? nowIso })
          .eq("meeting_id", m.id)
          .not("arrived_at", "is", null)
          .is("time_in", null)
      );
    }
  }
  for (const e of activeEvents) {
    const arrivedNotIn = (eventAtt.data ?? []).filter(
      (r: any) => r.event_id === e.id && r.arrived_at && !r.time_in
    );
    if (arrivedNotIn.length > 0) {
      autoConvertPromises.push(
        supabaseDb
          .from("event_attendance")
          .update({ time_in: e.start_dt ?? nowIso })
          .eq("event_id", e.id)
          .not("arrived_at", "is", null)
          .is("time_in", null)
      );
    }
  }

  if (autoConvertPromises.length > 0) {
    await Promise.all(autoConvertPromises);
    // Re-fetch attendance after conversion so response reflects updated state
    const [tAtt2, mAtt2, eAtt2] = await Promise.all([
      trainingIds.length
        ? supabaseDb.from("training_attendance").select("training_session_id, time_in, time_out, rsvp_at, arrived_at").eq("member_id", memberId).in("training_session_id", trainingIds)
        : Promise.resolve({ data: [] }),
      meetingIds.length
        ? supabaseDb.from("meeting_attendance").select("meeting_id, time_in, time_out, rsvp_at, arrived_at").eq("member_id", memberId).in("meeting_id", meetingIds)
        : Promise.resolve({ data: [] }),
      eventIds.length
        ? supabaseDb.from("event_attendance").select("event_id, time_in, time_out, rsvp_at, arrived_at").eq("member_id", memberId).in("event_id", eventIds)
        : Promise.resolve({ data: [] }),
    ]);
    (trainingAtt as any).data = tAtt2.data;
    (meetingAtt as any).data = mAtt2.data;
    (eventAtt as any).data = eAtt2.data;
  }

  // Build lookup maps
  const callAttMap = new Map((callAtt.data ?? []).map((r: any) => [r.call_id, r]));
  const trainingAttMap = new Map((trainingAtt.data ?? []).map((r: any) => [r.training_session_id, r]));
  const meetingAttMap = new Map((meetingAtt.data ?? []).map((r: any) => [r.meeting_id, r]));
  const eventAttMap = new Map((eventAtt.data ?? []).map((r: any) => [r.event_id, r]));

  const result = allActive.map((item) => {
    let att: { time_in: string | null; time_out: string | null; rsvp_at?: string | null; arrived_at?: string | null; on_my_way_at?: string | null } | null = null;

    if (item.type === "call") {
      const r = callAttMap.get(item.id) as any;
      if (r) att = { time_in: r.time_in, time_out: r.time_out, on_my_way_at: r.on_my_way_at };
    } else if (item.type === "training") {
      const r = trainingAttMap.get(item.id) as any;
      if (r) att = { time_in: r.time_in, time_out: r.time_out, rsvp_at: r.rsvp_at, arrived_at: r.arrived_at };
    } else if (item.type === "meeting") {
      const r = meetingAttMap.get(item.id) as any;
      if (r) att = { time_in: r.time_in, time_out: r.time_out, rsvp_at: r.rsvp_at, arrived_at: r.arrived_at };
    } else if (item.type === "event") {
      const r = eventAttMap.get(item.id) as any;
      if (r) att = { time_in: r.time_in, time_out: r.time_out, rsvp_at: r.rsvp_at, arrived_at: r.arrived_at };
    }

    return {
      type: item.type,
      id: item.id,
      title: item.title,
      incident_lat: (item as any).incident_lat ?? null,
      incident_lng: (item as any).incident_lng ?? null,
      incident_radius_m: (item as any).incident_radius_m ?? null,
      allow_rsvp: (item as any).allow_rsvp ?? false,
      allow_early_checkin: (item as any).allow_early_checkin ?? false,
      early_checkin_minutes: (item as any).early_checkin_minutes ?? null,
      start_dt: (item as any).start_dt ?? null,
      my_attendance: att,
    };
  });

  return NextResponse.json(result);
}
