import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

export async function GET() {
  const { data, error } = await supabaseDb
    .from("courses")
    .select("*")
    .order("code", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();

  if (!code || !name) {
    return NextResponse.json({ error: "code and name are required" }, { status: 400 });
  }

  const valid_months = Number.isFinite(Number(body.valid_months)) ? Number(body.valid_months) : 24;
  const warning_days = Number.isFinite(Number(body.warning_days)) ? Number(body.warning_days) : 30;

  const payload = {
    code,
    name,
    description: body.description ? String(body.description) : null,
    valid_months,
    warning_days,
    is_active: body.is_active === false ? false : true,
  };

  const { data, error } = await supabaseDb
    .from("courses")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
