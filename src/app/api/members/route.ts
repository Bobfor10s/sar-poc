import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

export async function GET() {
  const { data, error } = await supabaseDb
    .from("members_with_sar")
    .select("*")
    .order("last_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const first_name = String(body.first_name ?? "").trim();
  const last_name = String(body.last_name ?? "").trim();

  if (!first_name || !last_name) {
    return NextResponse.json(
      { error: "first_name and last_name are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseDb
    .from("members")
    .insert({
      first_name,
      last_name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      street_address: body.street_address ?? null,
      street_address_2: body.street_address_2 ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      postal_code: body.postal_code ?? null,
      town: body.town ?? null,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}