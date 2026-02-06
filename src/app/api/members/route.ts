import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

export async function GET() {
  const { data, error } = await supabaseDb
    .from("members")
    .select("*")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();

  const first_name = String(body.first_name ?? "").trim();
  const last_name = String(body.last_name ?? "").trim();

  if (!first_name || !last_name) {
    return NextResponse.json({ error: "first_name and last_name required" }, { status: 400 });
  }

  const payload: any = {
    first_name,
    last_name,
    email: body.email ? String(body.email).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,

    street_address: body.street_address ? String(body.street_address).trim() : null,
    street_address_2: body.street_address_2 ? String(body.street_address_2).trim() : null,
    city: body.city ? String(body.city).trim() : null,
    state: body.state ? String(body.state).trim().toUpperCase() : null,
    postal_code: body.postal_code ? String(body.postal_code).trim() : null,

    status: body.status ? String(body.status).trim() : undefined,
  };

  // Backward compat: map town -> city if sent
  if (!payload.city && body.town) payload.city = String(body.town).trim();

  const { data, error } = await supabaseDb.from("members").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
