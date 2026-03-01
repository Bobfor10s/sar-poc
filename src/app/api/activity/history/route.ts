import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

export async function GET(req: Request) {
  const check = await requireAuth();
  if (!check.ok) return check.response;
  const { auth } = check;

  const url = new URL(req.url);
  const queryMemberId = url.searchParams.get("member_id");

  // Only admins with read_all can query other members
  let memberId = auth.member.id;
  if (queryMemberId && queryMemberId !== memberId) {
    if (!auth.permissions.includes("read_all")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }
    memberId = queryMemberId;
  }

  // Get rolling window from app_settings
  const { data: settingRow } = await supabaseDb
    .from("app_settings")
    .select("value")
    .eq("key", "activity_window_days")
    .maybeSingle();
  const windowDays = Number(settingRow?.value ?? 365);
  const windowStart = new Date(Date.now() - windowDays * 86400 * 1000).toISOString();

  // Fetch all four attendance types in parallel
  const [callRes, trainingRes, meetingRes, eventRes] = await Promise.all([
    supabaseDb
      .from("call_attendance")
      .select("call_id, time_in, time_out, calls!inner(title, start_dt)")
      .eq("member_id", memberId)
      .gte("calls.start_dt", windowStart),
    supabaseDb
      .from("training_attendance")
      .select("training_session_id, created_at, training_sessions!inner(title, start_dt)")
      .eq("member_id", memberId)
      .gte("training_sessions.start_dt", windowStart),
    supabaseDb
      .from("meeting_attendance")
      .select("meeting_id, time_in, time_out, meetings!inner(title, start_dt)")
      .eq("member_id", memberId)
      .gte("meetings.start_dt", windowStart),
    supabaseDb
      .from("event_attendance")
      .select("event_id, time_in, time_out, events!inner(title, start_dt)")
      .eq("member_id", memberId)
      .gte("events.start_dt", windowStart),
  ]);

  type HistoryItem = {
    type: string;
    activity_id: string;
    title: string | null;
    start_dt: string | null;
    time_in: string | null;
    time_out: string | null;
  };

  const items: HistoryItem[] = [];

  for (const r of (callRes.data ?? [])) {
    const parent = (r as any).calls;
    items.push({
      type: "call",
      activity_id: r.call_id,
      title: parent?.title ?? null,
      start_dt: parent?.start_dt ?? null,
      time_in: (r as any).time_in ?? null,
      time_out: (r as any).time_out ?? null,
    });
  }

  for (const r of (trainingRes.data ?? [])) {
    const parent = (r as any).training_sessions;
    items.push({
      type: "training",
      activity_id: r.training_session_id,
      title: parent?.title ?? null,
      start_dt: parent?.start_dt ?? null,
      time_in: (r as any).created_at ?? null,
      time_out: null,
    });
  }

  for (const r of (meetingRes.data ?? [])) {
    const parent = (r as any).meetings;
    items.push({
      type: "meeting",
      activity_id: r.meeting_id,
      title: parent?.title ?? null,
      start_dt: parent?.start_dt ?? null,
      time_in: (r as any).time_in ?? null,
      time_out: (r as any).time_out ?? null,
    });
  }

  for (const r of (eventRes.data ?? [])) {
    const parent = (r as any).events;
    items.push({
      type: "event",
      activity_id: r.event_id,
      title: parent?.title ?? null,
      start_dt: parent?.start_dt ?? null,
      time_in: (r as any).time_in ?? null,
      time_out: (r as any).time_out ?? null,
    });
  }

  // Sort by start_dt descending
  items.sort((a, b) => {
    const ad = a.start_dt ?? "";
    const bd = b.start_dt ?? "";
    return bd.localeCompare(ad);
  });

  return NextResponse.json(items);
}
