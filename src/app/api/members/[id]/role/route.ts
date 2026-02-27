import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

type Ctx = { params: Promise<{ id: string }> };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

const VALID_ROLES = ["member", "viewer", "admin"];

export async function PATCH(req: Request, ctx: Ctx) {
  const check = await requirePermission("manage_members");
  if (!check.ok) return check.response;

  const { id } = await ctx.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad member id: ${id || "(missing)"}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const role = String(body.role ?? "").trim();

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 }
    );
  }

  // Prevent admin from removing their own admin role
  if (id === check.auth.member.id && role !== "admin" && check.auth.role === "admin") {
    return NextResponse.json(
      { error: "You cannot remove your own admin role" },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseDb
    .from("members")
    .update({ role })
    .eq("id", id)
    .select("id, first_name, last_name, role")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
