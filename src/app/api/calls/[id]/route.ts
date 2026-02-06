import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

async function getIdFromCtx(ctx: any): Promise<string> {
  const p = ctx?.params;
  // Next 16 can hand params as a Promise in some setups
  const resolved = p && typeof p.then === "function" ? await p : p;

  const id = resolved?.id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

export async function GET(_req: Request, ctx: any) {
  const id = await getIdFromCtx(ctx);

  if (!id || !isUuid(id)) {
    return NextResponse.json(
      { error: `bad call id: ${id || "(missing)"}` },
      { status: 400 },
    );
  }

  const { data: callRow, error: getError } = await supabaseDb
    .from("calls")
    .select("*")
    .eq("id", id)
    .single();

  if (getError) {
    return NextResponse.json({ error: getError.message }, { status: 500 });
  }

  return NextResponse.json({ data: callRow });
}

const ALLOWED_STATUS = new Set(["open", "closed", "cancelled", "archived"]);

export async function PATCH(req: Request, ctx: any) {
  const id = await getIdFromCtx(ctx);

  if (!id || !isUuid(id)) {
    return NextResponse.json(
      { error: `bad call id: ${id || "(missing)"}` },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));

  const status = body?.status ? String(body.status).toLowerCase().trim() : "";
  if (!ALLOWED_STATUS.has(status)) {
    return NextResponse.json(
      { error: "status must be one of: open, closed, cancelled, archived" },
      { status: 400 },
    );
  }

  // IMPORTANT: rename destructured vars to avoid "data defined multiple times"
  const { data: updatedCall, error: updateError } = await supabaseDb
    .from("calls")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ data: updatedCall });
}
