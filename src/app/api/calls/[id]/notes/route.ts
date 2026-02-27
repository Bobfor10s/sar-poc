import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
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

  const call_id = await getIdFromCtx(ctx);

  if (!call_id || !isUuid(call_id)) {
    return NextResponse.json(
      { error: `bad call id: ${call_id || "(missing)"}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseDb
    .from("call_notes")
    .select("*")
    .eq("call_id", call_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request, ctx: any) {
  const check = await requirePermission("manage_calls");
  if (!check.ok) return check.response;

  const call_id = await getIdFromCtx(ctx);

  if (!call_id || !isUuid(call_id)) {
    return NextResponse.json(
      { error: `bad call id: ${call_id || "(missing)"}` },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const note_text = body?.note_text ? String(body.note_text).trim() : "";

  if (!note_text) {
    return NextResponse.json({ error: "note_text required" }, { status: 400 });
  }

  const { error: insErr } = await supabaseDb
    .from("call_notes")
    .insert({ call_id, note_text });

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Return updated list
  const { data, error } = await supabaseDb
    .from("call_notes")
    .select("*")
    .eq("call_id", call_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
