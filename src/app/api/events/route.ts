import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

export async function GET() {
  const { data, error } = await supabaseDb
    .from("events")
    .select("*")
    .order("start_dt", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const payload = {
    title,
    start_dt: body.start_dt ? String(body.start_dt) : undefined,
    end_dt: body.end_dt ? String(body.end_dt) : null,
    location_text: body.location_text ? String(body.location_text).trim() : null,
    description: body.description ? String(body.description).trim() : null,
    visibility: body.visibility ? String(body.visibility).trim() : "members",
    is_test: body.is_test != null ? !!body.is_test : undefined,
  };

  const { data, error } = await supabaseDb
    .from("events")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
