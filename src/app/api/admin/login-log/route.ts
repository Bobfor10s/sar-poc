import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

export async function GET(req: Request) {
  const check = await requirePermission("manage_members");
  if (!check.ok) return check.response;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const { data, error } = await supabaseDb
    .from("login_log")
    .select("id, email, ip_address, user_agent, logged_in_at, member_id, members(first_name, last_name)")
    .order("logged_in_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
