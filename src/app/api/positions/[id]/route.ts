import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function getIdFromCtx(ctx: any): Promise<string> {
  const p = ctx?.params;
  const resolved = p && typeof p.then === "function" ? await p : p;
  const id = resolved?.id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

export async function GET(_req: Request, ctx: any) {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);
  if (!id || !isUuid(id)) return NextResponse.json({ error: "bad position id" }, { status: 400 });

  const { data, error } = await supabaseDb
    .from("positions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, ctx: any) {
  const check = await requirePermission("manage_positions");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);
  if (!id || !isUuid(id)) return NextResponse.json({ error: "bad position id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const payload: Record<string, string | number | boolean | null> = {};

  if (body.code !== undefined) payload.code = String(body.code).trim();
  if (body.name !== undefined) payload.name = String(body.name).trim();
  if (body.position_type !== undefined) payload.position_type = body.position_type ? String(body.position_type).trim() : null;
  if (body.is_active !== undefined) payload.is_active = !!body.is_active;
  if (body.level !== undefined) {
    if (body.level === null || body.level === "") {
      payload.level = null;
    } else {
      const level = Number(body.level);
      if (!isNaN(level)) payload.level = level;
    }
  }

  if ("code" in payload && !payload.code) {
    return NextResponse.json({ error: "code cannot be empty" }, { status: 400 });
  }
  if ("name" in payload && !payload.name) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("positions")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
