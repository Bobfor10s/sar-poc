import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requireAuth();
  if (!check.ok) return check.response;
  const { auth } = check;

  const now = new Date();
  const todayDate = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // Fetch active calls: status = 'open' AND start_dt <= now
  const { data: calls } = await supabaseDb
    .from("calls")
    .select("id, title, incident_lat, incident_lng, incident_radius_m, start_dt")
    .eq("status", "open")
    .lte("start_dt", now.toISOString());

  // Fetch active training sessions: status = 'scheduled' AND date(start_dt) <= today AND (end_dt IS NULL OR date(end_dt) >= today)
  const { data: trainingSessions } = await supabaseDb
    .from("training_sessions")
    .select("id, title, incident_lat, incident_lng, incident_radius_m, start_dt, end_dt")
    .eq("status", "scheduled")
    .lte("start_dt", `${todayDate}T23:59:59.999Z`);

  // Fetch active meetings
  const { data: meetings } = await supabaseDb
    .from("meetings")
    .select("id, title, incident_lat, incident_lng, incident_radius_m, start_dt, end_dt")
    .eq("status", "scheduled")
    .lte("start_dt", `${todayDate}T23:59:59.999Z`);

  // Fetch active events
  const { data: events } = await supabaseDb
    .from("events")
    .select("id, title, incident_lat, incident_lng, incident_radius_m, start_dt, end_dt")
    .eq("status", "scheduled")
    .lte("start_dt", `${todayDate}T23:59:59.999Z`);

  // Active today: if end_dt set, today must be within start→end range.
  // If no end_dt, only active on its start date (prevents old unfinished sessions showing forever).
  function isActiveToday(row: { start_dt?: string | null; end_dt?: string | null }) {
    const startDate = row.start_dt?.slice(0, 10);
    if (!startDate) return false;
    if (row.end_dt) {
      return startDate <= todayDate && row.end_dt.slice(0, 10) >= todayDate;
    }
    return startDate === todayDate;
  }

  const activeCalls = (calls ?? []).map((c) => ({ type: "call" as const, ...c }));
  const activeTraining = (trainingSessions ?? []).filter(isActiveToday).map((t) => ({ type: "training" as const, ...t }));
  const activeMeetings = (meetings ?? []).filter(isActiveToday).map((m) => ({ type: "meeting" as const, ...m }));
  const activeEvents = (events ?? []).filter(isActiveToday).map((e) => ({ type: "event" as const, ...e }));

  const allActive = [...activeCalls, ...activeTraining, ...activeMeetings, ...activeEvents];

  // Fetch member's own attendance from each table
  const memberId = auth.member.id;

  const callIds = activeCalls.map((c) => c.id);
  const trainingIds = activeTraining.map((t) => t.id);
  const meetingIds = activeMeetings.map((m) => m.id);
  const eventIds = activeEvents.map((e) => e.id);

  const [callAtt, trainingAtt, meetingAtt, eventAtt] = await Promise.all([
    callIds.length
      ? supabaseDb.from("call_attendance").select("call_id, time_in, time_out").eq("member_id", memberId).in("call_id", callIds)
      : Promise.resolve({ data: [] }),
    trainingIds.length
      ? supabaseDb.from("training_attendance").select("training_session_id, time_in, time_out").eq("member_id", memberId).in("training_session_id", trainingIds)
      : Promise.resolve({ data: [] }),
    meetingIds.length
      ? supabaseDb.from("meeting_attendance").select("meeting_id, time_in, time_out").eq("member_id", memberId).in("meeting_id", meetingIds)
      : Promise.resolve({ data: [] }),
    eventIds.length
      ? supabaseDb.from("event_attendance").select("event_id, time_in, time_out").eq("member_id", memberId).in("event_id", eventIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Build lookup maps
  const callAttMap = new Map((callAtt.data ?? []).map((r: any) => [r.call_id, r]));
  const trainingAttMap = new Map((trainingAtt.data ?? []).map((r: any) => [r.training_session_id, r]));
  const meetingAttMap = new Map((meetingAtt.data ?? []).map((r: any) => [r.meeting_id, r]));
  const eventAttMap = new Map((eventAtt.data ?? []).map((r: any) => [r.event_id, r]));

  const result = allActive.map((item) => {
    let att: { time_in: string | null; time_out: string | null } | null = null;

    if (item.type === "call") {
      const r = callAttMap.get(item.id) as any;
      if (r) att = { time_in: r.time_in, time_out: r.time_out };
    } else if (item.type === "training") {
      const r = trainingAttMap.get(item.id) as any;
      if (r) att = { time_in: r.time_in, time_out: r.time_out };
    } else if (item.type === "meeting") {
      const r = meetingAttMap.get(item.id) as any;
      if (r) att = { time_in: r.time_in, time_out: r.time_out };
    } else if (item.type === "event") {
      const r = eventAttMap.get(item.id) as any;
      if (r) att = { time_in: r.time_in, time_out: r.time_out };
    }

    return {
      type: item.type,
      id: item.id,
      title: item.title,
      incident_lat: (item as any).incident_lat ?? null,
      incident_lng: (item as any).incident_lng ?? null,
      incident_radius_m: (item as any).incident_radius_m ?? null,
      my_attendance: att,
    };
  });

  return NextResponse.json(result);
}
