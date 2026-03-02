import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requireAuth();
  if (!check.ok) return check.response;
  const { auth } = check;

  // Exclude anything whose end_dt has passed; fall back to start_dt for items with no end_dt
  const nowIso = new Date().toISOString();
  const todayDate = nowIso.slice(0, 10); // YYYY-MM-DD
  const endFilter = `end_dt.gte.${nowIso},and(end_dt.is.null,start_dt.gte.${todayDate})`;

  const [{ data: training }, { data: meetings }, { data: events }] = await Promise.all([
    supabaseDb
      .from("training_sessions")
      .select("id, title, start_dt, location_text, allow_rsvp, allow_early_checkin, early_checkin_minutes")
      .eq("status", "scheduled")
      .or(endFilter)
      .order("start_dt", { ascending: true })
      .limit(20),
    supabaseDb
      .from("meetings")
      .select("id, title, start_dt, location_text, allow_rsvp, allow_early_checkin, early_checkin_minutes")
      .neq("status", "cancelled")
      .neq("status", "archived")
      .or(endFilter)
      .order("start_dt", { ascending: true })
      .limit(20),
    supabaseDb
      .from("events")
      .select("id, title, start_dt, location_text, allow_rsvp, allow_early_checkin, early_checkin_minutes")
      .eq("status", "scheduled")
      .or(endFilter)
      .order("start_dt", { ascending: true })
      .limit(20),
  ]);

  type Item = {
    type: string;
    id: string;
    title: string | null;
    start_dt: string | null;
    location_text: string | null;
    allow_rsvp: boolean;
    allow_early_checkin: boolean;
    early_checkin_minutes: number | null;
    my_rsvp_at: string | null;
    my_arrived_at: string | null;
  };

  const combined: Item[] = [
    ...(training ?? []).map((r) => ({ type: "training", ...r, allow_rsvp: r.allow_rsvp ?? false, allow_early_checkin: r.allow_early_checkin ?? false, early_checkin_minutes: r.early_checkin_minutes ?? null, my_rsvp_at: null as string | null, my_arrived_at: null as string | null })),
    ...(meetings ?? []).map((r) => ({ type: "meeting", ...r, allow_rsvp: r.allow_rsvp ?? false, allow_early_checkin: r.allow_early_checkin ?? false, early_checkin_minutes: r.early_checkin_minutes ?? null, my_rsvp_at: null as string | null, my_arrived_at: null as string | null })),
    ...(events ?? []).map((r) => ({ type: "event", ...r, allow_rsvp: r.allow_rsvp ?? false, allow_early_checkin: r.allow_early_checkin ?? false, early_checkin_minutes: r.early_checkin_minutes ?? null, my_rsvp_at: null as string | null, my_arrived_at: null as string | null })),
  ].sort((a, b) => {
    if (!a.start_dt) return 1;
    if (!b.start_dt) return -1;
    return a.start_dt < b.start_dt ? -1 : a.start_dt > b.start_dt ? 1 : 0;
  });

  // Fetch member's RSVP/arrived status for each type
  const memberId = auth.member.id;
  const trainingIds = combined.filter((i) => i.type === "training").map((i) => i.id);
  const meetingIds = combined.filter((i) => i.type === "meeting").map((i) => i.id);
  const eventIds = combined.filter((i) => i.type === "event").map((i) => i.id);

  const [tAtt, mAtt, eAtt] = await Promise.all([
    trainingIds.length
      ? supabaseDb.from("training_attendance").select("training_session_id, rsvp_at, arrived_at").eq("member_id", memberId).in("training_session_id", trainingIds)
      : Promise.resolve({ data: [] }),
    meetingIds.length
      ? supabaseDb.from("meeting_attendance").select("meeting_id, rsvp_at, arrived_at").eq("member_id", memberId).in("meeting_id", meetingIds)
      : Promise.resolve({ data: [] }),
    eventIds.length
      ? supabaseDb.from("event_attendance").select("event_id, rsvp_at, arrived_at").eq("member_id", memberId).in("event_id", eventIds)
      : Promise.resolve({ data: [] }),
  ]);

  const tMap = new Map((tAtt.data ?? []).map((r: any) => [r.training_session_id, r]));
  const mMap = new Map((mAtt.data ?? []).map((r: any) => [r.meeting_id, r]));
  const eMap = new Map((eAtt.data ?? []).map((r: any) => [r.event_id, r]));

  for (const item of combined) {
    let attRow: any = null;
    if (item.type === "training") attRow = tMap.get(item.id);
    else if (item.type === "meeting") attRow = mMap.get(item.id);
    else if (item.type === "event") attRow = eMap.get(item.id);
    if (attRow) {
      item.my_rsvp_at = attRow.rsvp_at ?? null;
      item.my_arrived_at = attRow.arrived_at ?? null;
    }
  }

  return NextResponse.json(combined);
}
