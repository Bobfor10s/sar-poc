import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

export async function GET() {
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
  const body = await req.json();

  // Backward-compat: if UI sends { title }, map it into summary
  const title = body.title ? String(body.title).trim() : "";
  const type = body.type ? String(body.type).trim() : undefined;

  const payload = {
    // allow overrides, otherwise DB defaults handle start_dt/type/visibility
    start_dt: body.start_dt ? String(body.start_dt) : undefined,
    end_dt: body.end_dt ? String(body.end_dt) : null,
    title: body.title ? String(body.title).trim() : null,

    type: type || undefined,
    location_text: body.location_text ? String(body.location_text).trim() : null,

    // If your current UI uses "title", store it in summary
    summary: body.summary
      ? String(body.summary).trim()
      : title
      ? title
      : null,

    outcome: body.outcome ? String(body.outcome).trim() : null,
    visibility: body.visibility ? String(body.visibility).trim() : undefined,
  };

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
