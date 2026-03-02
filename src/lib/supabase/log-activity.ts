import { supabaseDb } from "@/lib/supabase/db";

export async function logActivity(
  req: Request,
  action: string,
  details?: Record<string, unknown>
) {
  const cookieHeader = (req as any).headers.get("cookie") ?? "";
  const match = cookieHeader.match(/sar-log-id=([^;]+)/);
  const loginLogId = match?.[1]?.trim() ?? null;
  if (!loginLogId) return;
  await supabaseDb
    .from("session_activity")
    .insert({ login_log_id: loginLogId, action, details: details ?? null });
}
