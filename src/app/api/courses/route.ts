import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

export async function GET() {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const { data, error } = await supabaseDb
    .from("courses")
    .select("*")
    .order("code", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const check = await requirePermission("manage_courses");
  if (!check.ok) return check.response;

  const body = await req.json().catch(() => ({}));

  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const never_expires = !!body.never_expires;
  const show_on_roster = !!body.show_on_roster;

  if (!code || !name) {
    return NextResponse.json({ error: "code and name are required" }, { status: 400 });
  }

  // If never expires is false, valid_months must be > 0
  let valid_months = Number(body.valid_months);
  let warning_days = Number(body.warning_days);

  if (never_expires) {
    // Keep sane values; will be ignored by logic/constraint anyway
    if (!Number.isFinite(valid_months) || valid_months <= 0) valid_months = 24;
    if (!Number.isFinite(warning_days) || warning_days < 0) warning_days = 0;
    warning_days = 0; // warning doesn't make sense if never expires
  } else {
    if (!Number.isFinite(valid_months) || valid_months <= 0) {
      return NextResponse.json({ error: "valid_months must be a positive number (or set never_expires=true)" }, { status: 400 });
    }
    if (!Number.isFinite(warning_days) || warning_days < 0) {
      return NextResponse.json({ error: "warning_days must be 0 or more" }, { status: 400 });
    }
  }

  const payload = {
    code,
    name,
    description: body.description ? String(body.description) : null,
    valid_months,
    warning_days,
    never_expires,
    show_on_roster,
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