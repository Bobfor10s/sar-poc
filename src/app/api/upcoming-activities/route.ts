import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  // Use today's date (UTC) so anything starting today or later is included,
  // regardless of whether the exact start time has just passed.
  const todayDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const [{ data: training }, { data: meetings }, { data: events }] = await Promise.all([
    supabaseDb
      .from("training_sessions")
      .select("id, title, start_dt, location_text")
      .eq("status", "scheduled")
      .gte("start_dt", todayDate)
      .order("start_dt", { ascending: true })
      .limit(20),
    supabaseDb
      .from("meetings")
      .select("id, title, start_dt, location_text")
      .eq("status", "scheduled")
      .gte("start_dt", todayDate)
      .order("start_dt", { ascending: true })
      .limit(20),
    supabaseDb
      .from("events")
      .select("id, title, start_dt, location_text")
      .eq("status", "scheduled")
      .gte("start_dt", todayDate)
      .order("start_dt", { ascending: true })
      .limit(20),
  ]);

  type Item = { type: string; id: string; title: string | null; start_dt: string | null; location_text: string | null };

  const combined: Item[] = [
    ...(training ?? []).map((r) => ({ type: "training", ...r })),
    ...(meetings ?? []).map((r) => ({ type: "meeting", ...r })),
    ...(events ?? []).map((r) => ({ type: "event", ...r })),
  ].sort((a, b) => {
    if (!a.start_dt) return 1;
    if (!b.start_dt) return -1;
    return a.start_dt < b.start_dt ? -1 : a.start_dt > b.start_dt ? 1 : 0;
  });

  return NextResponse.json(combined);
}
