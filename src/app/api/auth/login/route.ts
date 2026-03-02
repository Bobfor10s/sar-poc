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

  // Fetch member row to get role and display name
  const { data: member } = await supabaseDb
    .from("members")
    .select("id, role, first_name, last_name")
    .eq("user_id", data.user.id)
    .maybeSingle();

  const role = member?.role ?? "member";
  const name = member ? `${member.first_name} ${member.last_name}`.trim() : null;

  // Write login log entry (awaited so it completes before the serverless fn exits)
  const ip =
    (req as any).headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    (req as any).headers.get("x-real-ip") ??
    null;
  const ua = (req as any).headers.get("user-agent") ?? null;
  await supabaseDb.from("login_log").insert({
    member_id: member?.id ?? null,
    email,
    ip_address: ip,
    user_agent: ua,
  });

  const response = NextResponse.json({ ok: true, role, name, user: data.user });
  response.cookies.set("sar-role", role, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}
