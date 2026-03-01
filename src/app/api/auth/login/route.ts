import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseDb } from "@/lib/supabase/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  // Fetch member row to get role for routing cookie
  const { data: member } = await supabaseDb
    .from("members")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  const role = member?.role ?? "member";

  const response = NextResponse.json({ ok: true, role, user: data.user });
  response.cookies.set("sar-role", role, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}
