import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { getAuthContext } from "@/lib/supabase/auth";

const ALLOWED_EMAIL = "bob@wilsonclan.net";

export async function GET(req: Request) {
  const auth = await getAuthContext();
  if (!auth || auth.member.email !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id")?.trim() ?? "";

  // Return session activity for a specific login session
  if (sessionId) {
    const { data, error } = await supabaseDb
      .from("session_activity")
      .select("id, action, details, occurred_at")
      .eq("login_log_id", sessionId)
      .order("occurred_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const { data, error } = await supabaseDb
    .from("login_log")
    .select("id, email, ip_address, user_agent, logged_in_at, logged_out_at, member_id, members(first_name, last_name)")
    .order("logged_in_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
