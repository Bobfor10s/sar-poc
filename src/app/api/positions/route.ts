import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;
  const { data, error } = await supabaseDb
    .from("positions")
    .select("*")
    .eq("is_active", true)
    .order("position_type", { ascending: false })
    .order("code", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const check = await requirePermission("manage_positions");
  if (!check.ok) return check.response;

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();

  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const payload: Record<string, string | number | boolean | undefined> = {
    code,
    name,
    is_active: true,
  };

  if (body.level !== undefined && body.level !== null && body.level !== "") {
    const level = Number(body.level);
    if (!isNaN(level)) payload.level = level;
  }
  if (body.position_type) {
    payload.position_type = String(body.position_type).trim();
  }

  const { data, error } = await supabaseDb
    .from("positions")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
