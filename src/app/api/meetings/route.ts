import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";
import { logActivity } from "@/lib/supabase/log-activity";

export async function GET() {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;
  const { data, error } = await supabaseDb
    .from("meetings")
    .select("*")
    .order("start_dt", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const check = await requirePermission("manage_meetings");
  if (!check.ok) return check.response;

  const body = await req.json().catch(() => ({}));

  const title = String(body?.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const payload: any = {
    title,
    start_dt: body.start_dt ? String(body.start_dt) : undefined,
    end_dt: body.end_dt ? String(body.end_dt) : null,
    location_text: body.location_text ? String(body.location_text).trim() : null,
    agenda: body.agenda ? String(body.agenda).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    visibility: body.visibility ? String(body.visibility).trim() : "members",
    status: body.status ? String(body.status).trim() : "scheduled",
    is_test: !!body.is_test,
    incident_lat: body.incident_lat != null && body.incident_lat !== "" ? Number(body.incident_lat) : null,
    incident_lng: body.incident_lng != null && body.incident_lng !== "" ? Number(body.incident_lng) : null,
    incident_radius_m: body.incident_radius_m != null && body.incident_radius_m !== "" ? Number(body.incident_radius_m) : null,
    allow_rsvp: !!body.allow_rsvp,
    allow_early_checkin: !!body.allow_early_checkin,
    early_checkin_minutes: body.allow_early_checkin && body.early_checkin_minutes != null ? Number(body.early_checkin_minutes) : null,
  };

  const { data, error } = await supabaseDb
    .from("meetings")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(req, "create_meeting", { title: data.title });
  return NextResponse.json(data, { status: 201 });
}
