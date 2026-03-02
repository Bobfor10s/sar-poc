import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";
import { logActivity } from "@/lib/supabase/log-activity";

type Ctx = { params: Promise<{ id: string }> };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const check = await requirePermission("approve_positions");
  if (!check.ok) return check.response;

  const { id } = await ctx.params;
  if (!id || !isUuid(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (!body.approve) return NextResponse.json({ error: "missing approve flag" }, { status: 400 });

  const { data, error } = await supabaseDb
    .from("member_task_signoffs")
    .update({ status: "approved" })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(req, "skill_approval", { status: "approved" });
  return NextResponse.json({ data });
}
