import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseDb } from "@/lib/supabase/db";

export async function POST(req: Request) {
  const cookieHeader = (req as any).headers.get("cookie") ?? "";
  const match = cookieHeader.match(/sar-log-id=([^;]+)/);
  const logId = match?.[1]?.trim() ?? null;

  if (logId) {
    await supabaseDb
      .from("login_log")
      .update({ logged_out_at: new Date().toISOString() })
      .eq("id", logId);
  }

  const supabase = await supabaseServer();
  await supabase.auth.signOut();

  const response = NextResponse.json({ ok: true });
  response.cookies.set("sar-log-id", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
