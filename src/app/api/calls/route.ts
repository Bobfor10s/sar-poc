import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const { data, error } = await supabaseDb
    .from("calls")
    .select("*")
    .order("start_dt", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const check = await requirePermission("manage_calls");
  if (!check.ok) return check.response;

  const body = await req.json().catch(() => ({}));

  const title = body.title ? String(body.title).trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    title,
    status: "open",
    visibility: "members",
  };

  if (body.summary) payload.summary = String(body.summary).trim();
  if (body.incident_lat != null && body.incident_lat !== "") {
    payload.incident_lat = Number(body.incident_lat);
  }
  if (body.incident_lng != null && body.incident_lng !== "") {
    payload.incident_lng = Number(body.incident_lng);
  }
  if (body.incident_radius_m != null && body.incident_radius_m !== "") {
    payload.incident_radius_m = Number(body.incident_radius_m);
  }

  const { data, error } = await supabaseDb
    .from("calls")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
