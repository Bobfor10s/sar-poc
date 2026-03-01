import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const now = new Date();
  const todayDate = now.toISOString().slice(0, 10);

  function isActiveToday(row: { start_dt?: string | null; end_dt?: string | null }) {
    const startDate = row.start_dt?.slice(0, 10);
    if (!startDate) return false;
    if (row.end_dt) return startDate <= todayDate && row.end_dt.slice(0, 10) >= todayDate;
    return startDate === todayDate;
  }

  // Fetch all active activities
  const [{ data: calls }, { data: trainingSessions }, { data: meetings }, { data: events }] =
    await Promise.all([
      supabaseDb.from("calls").select("id, title").eq("status", "open").lte("start_dt", now.toISOString()),
      supabaseDb.from("training_sessions").select("id, title, start_dt, end_dt").eq("status", "scheduled").lte("start_dt", `${todayDate}T23:59:59.999Z`),
      supabaseDb.from("meetings").select("id, title, start_dt, end_dt").eq("status", "scheduled").lte("start_dt", `${todayDate}T23:59:59.999Z`),
      supabaseDb.from("events").select("id, title, start_dt, end_dt").eq("status", "scheduled").lte("start_dt", `${todayDate}T23:59:59.999Z`),
    ]);

  const activeCalls = (calls ?? []);
  const activeTraining = (trainingSessions ?? []).filter(isActiveToday);
  const activeMeetings = (meetings ?? []).filter(isActiveToday);
  const activeEvents = (events ?? []).filter(isActiveToday);

  // Fetch attendance for each active activity (time_in set, time_out null = currently on site)
  type AttResult = { type: string; title: string; data: { member_id: string }[] };

  async function fetchAtt(table: string, idCol: string, id: string, type: string, title: string): Promise<AttResult> {
    const { data } = await (supabaseDb.from(table as any).select("member_id") as any)
      .eq(idCol, id)
      .not("time_in", "is", null)
      .is("time_out", null);
    return { type, title, data: data ?? [] };
  }

  const attendancePromises: Promise<AttResult>[] = [
    ...activeCalls.map((c) => fetchAtt("call_attendance", "call_id", c.id, "call", c.title ?? "Call")),
    ...activeTraining.map((t) => fetchAtt("training_attendance", "training_session_id", t.id, "training", t.title ?? "Training")),
    ...activeMeetings.map((m) => fetchAtt("meeting_attendance", "meeting_id", m.id, "meeting", m.title ?? "Meeting")),
    ...activeEvents.map((e) => fetchAtt("event_attendance", "event_id", e.id, "event", e.title ?? "Event")),
  ];

  const results = await Promise.all(attendancePromises);

  // Build map: member_id → { type, title } (last wins if in multiple)
  const locationMap: Record<string, { type: string; title: string }> = {};
  for (const { type, title, data } of results) {
    for (const row of data) {
      locationMap[row.member_id] = { type, title };
    }
  }

  return NextResponse.json(locationMap);
}
