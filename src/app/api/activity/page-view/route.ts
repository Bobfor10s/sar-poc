import { NextResponse } from "next/server";
import { logActivity } from "@/lib/supabase/log-activity";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const path = body.path ? String(body.path) : null;
  if (!path) return NextResponse.json({ ok: false });
  await logActivity(req, "page_view", { path });
  return NextResponse.json({ ok: true });
}
