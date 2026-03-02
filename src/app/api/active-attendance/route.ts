import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const now = new Date();
  const nowIso = now.toISOString();

  function isActive(row: { start_dt?: string | null; end_dt?: string | null }) {
    if (!row.start_dt || new Date(row.start_dt) > now) return false;
    if (row.end_dt && new Date(row.end_dt) <= now) return false;
    return true;
  }

  // Fetch all active activities
  const [{ data: calls }, { data: trainingSessions }, { data: meetings }, { data: events }] =
    await Promise.all([
      supabaseDb.from("calls").select("id, title").eq("status", "open").lte("start_dt", nowIso),
      supabaseDb.from("training_sessions").select("id, title, start_dt, end_dt").eq("status", "scheduled").lte("start_dt", nowIso),
      supabaseDb.from("meetings").select("id, title, start_dt, end_dt").neq("status", "cancelled").neq("status", "archived").lte("start_dt", nowIso),
      supabaseDb.from("events").select("id, title, start_dt, end_dt").eq("status", "scheduled").lte("start_dt", nowIso),
    ]);

  const activeCalls = (calls ?? []);
  const activeTraining = (trainingSessions ?? []).filter(isActive);
  const activeMeetings = (meetings ?? []).filter(isActive);
  const activeEvents = (events ?? []).filter(isActive);

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

  // Also surface en-route members for active calls.
  // Covers two cases:
  //   1. First-time en-route: on_my_way_at set, time_in null
  //   2. Re-engage after checkout: on_my_way_at set, time_out set, on_my_way_at > time_out
  const enRoutePromises = activeCalls.map(async (c) => {
    const { data } = await supabaseDb
      .from("call_attendance")
      .select("member_id, time_in, time_out, on_my_way_at")
      .eq("call_id", c.id)
      .not("on_my_way_at", "is", null);
    const enRoute = (data ?? []).filter((r: any) => {
      if (r.time_in && !r.time_out) return false; // currently on-site
      if (r.time_out) return r.on_my_way_at > r.time_out; // re-engaging after checkout
      return true; // no time_in yet
    });
    return { title: c.title ?? "Call", data: enRoute };
  });

  const enRouteResults = await Promise.all(enRoutePromises);
  for (const { title, data } of enRouteResults) {
    for (const row of data) {
      // Only add if not already on-site
      if (!locationMap[row.member_id]) {
        locationMap[row.member_id] = { type: "en_route", title };
      }
    }
  }

  return NextResponse.json(locationMap);
}
