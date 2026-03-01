import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

export async function GET(req: Request) {
  const check = await requireAuth();
  if (!check.ok) return check.response;
  const { auth } = check;

  const url = new URL(req.url);
  const queryMemberId = url.searchParams.get("member_id");

  let memberId = auth.member.id;
  if (queryMemberId && queryMemberId !== memberId) {
    if (!auth.permissions.includes("read_all")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }
    memberId = queryMemberId;
  }

  const { data: settingRow } = await supabaseDb
    .from("app_settings")
    .select("value")
    .eq("key", "activity_window_days")
    .maybeSingle();
  const windowDays = Number(settingRow?.value ?? 365);
  const windowStart = new Date(Date.now() - windowDays * 86400 * 1000).toISOString();

  // Fetch totals (all activities of each type in window) and attended in parallel
  const [
    totalCallsRes, attendedCallsRes,
    totalTrainingRes, attendedTrainingRes,
    totalMeetingsRes, attendedMeetingsRes,
    totalEventsRes, attendedEventsRes,
  ] = await Promise.all([
    supabaseDb.from("calls").select("id", { count: "exact", head: true }).gte("start_dt", windowStart),
    supabaseDb.from("call_attendance").select("call_id, time_in, calls!inner(start_dt)", { count: "exact", head: false }).eq("member_id", memberId).not("time_in", "is", null).gte("calls.start_dt", windowStart),
    supabaseDb.from("training_sessions").select("id", { count: "exact", head: true }).gte("start_dt", windowStart),
    supabaseDb.from("training_attendance").select("training_session_id, training_sessions!inner(start_dt)", { count: "exact", head: false }).eq("member_id", memberId).gte("training_sessions.start_dt", windowStart),
    supabaseDb.from("meetings").select("id", { count: "exact", head: true }).gte("start_dt", windowStart),
    supabaseDb.from("meeting_attendance").select("meeting_id, time_in, meetings!inner(start_dt)", { count: "exact", head: false }).eq("member_id", memberId).not("time_in", "is", null).gte("meetings.start_dt", windowStart),
    supabaseDb.from("events").select("id", { count: "exact", head: true }).gte("start_dt", windowStart),
    supabaseDb.from("event_attendance").select("event_id, time_in, events!inner(start_dt)", { count: "exact", head: false }).eq("member_id", memberId).not("time_in", "is", null).gte("events.start_dt", windowStart),
  ]);

  function pct(attended: number, total: number) {
    if (total === 0) return 0;
    return Math.round((attended / total) * 100);
  }

  const callsTotal = totalCallsRes.count ?? 0;
  const callsAttended = (attendedCallsRes.data ?? []).length;
  const trainingTotal = totalTrainingRes.count ?? 0;
  const trainingAttended = (attendedTrainingRes.data ?? []).length;
  const meetingsTotal = totalMeetingsRes.count ?? 0;
  const meetingsAttended = (attendedMeetingsRes.data ?? []).length;
  const eventsTotal = totalEventsRes.count ?? 0;
  const eventsAttended = (attendedEventsRes.data ?? []).length;

  const overallTotal = callsTotal + trainingTotal + meetingsTotal + eventsTotal;
  const overallAttended = callsAttended + trainingAttended + meetingsAttended + eventsAttended;

  return NextResponse.json({
    window_days: windowDays,
    calls: { attended: callsAttended, total: callsTotal, pct: pct(callsAttended, callsTotal) },
    training: { attended: trainingAttended, total: trainingTotal, pct: pct(trainingAttended, trainingTotal) },
    meetings: { attended: meetingsAttended, total: meetingsTotal, pct: pct(meetingsAttended, meetingsTotal) },
    events: { attended: eventsAttended, total: eventsTotal, pct: pct(eventsAttended, eventsTotal) },
    overall: { attended: overallAttended, total: overallTotal, pct: pct(overallAttended, overallTotal) },
  });
}
