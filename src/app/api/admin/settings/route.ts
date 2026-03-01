import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requirePermission("manage_members");
  if (!check.ok) return check.response;

  const { data, error } = await supabaseDb
    .from("app_settings")
    .select("*")
    .order("key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: Request) {
  const check = await requirePermission("manage_members");
  if (!check.ok) return check.response;

  const body = await req.json().catch(() => ({}));
  const key = String(body.key ?? "").trim();
  const value = String(body.value ?? "").trim();

  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 });

  const { data, error } = await supabaseDb
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
