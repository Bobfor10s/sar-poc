import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth, requirePermission } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const url = new URL(req.url);
  const member_id = (url.searchParams.get("member_id") || "").trim();

  if (!member_id || !isUuid(member_id)) {
    return NextResponse.json({ error: "bad member_id" }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("member_positions")
    .select(`
      id,
      member_id,
      position_id,
      status,
      awarded_at,
      expires_at,
      approved_by,
      approved_at,
      notes,
      created_at,
      positions:position_id ( id, code, name )
    `)
    .eq("member_id", member_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const check = await requirePermission("approve_positions");
  if (!check.ok) return check.response;

  const body = await req.json().catch(() => ({}));
  const member_id = String(body.member_id ?? "").trim();
  const position_id = String(body.position_id ?? "").trim();
  const status = String(body.status ?? "trainee").trim() || "trainee";

  if (!member_id || !isUuid(member_id)) return NextResponse.json({ error: "bad member_id" }, { status: 400 });
  if (!position_id || !isUuid(position_id)) return NextResponse.json({ error: "bad position_id" }, { status: 400 });

  const payload: any = {
    member_id,
    position_id,
    status,
    notes: body.notes ? String(body.notes) : null,
  };

  const { data, error } = await supabaseDb
    .from("member_positions")
    .insert(payload)
    .select(`
      id,
      member_id,
      position_id,
      status,
      awarded_at,
      expires_at,
      approved_by,
      approved_at,
      notes,
      created_at,
      positions:position_id ( id, code, name )
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(req: Request) {
  const check = await requirePermission("approve_positions");
  if (!check.ok) return check.response;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  const member_id = String(body.member_id ?? "").trim();
  const position_id = String(body.position_id ?? "").trim();

  const now = new Date().toISOString();

  // If no existing row id — upsert (auto-detected member reaching qualification)
  if (!id) {
    if (!member_id || !isUuid(member_id)) return NextResponse.json({ error: "bad member_id" }, { status: 400 });
    if (!position_id || !isUuid(position_id)) return NextResponse.json({ error: "bad position_id" }, { status: 400 });

    const { data, error } = await supabaseDb
      .from("member_positions")
      .upsert(
        { member_id, position_id, status: "qualified", approved_at: now, awarded_at: now },
        { onConflict: "member_id,position_id" }
      )
      .select(`id, member_id, position_id, status, awarded_at, approved_at, notes, created_at, positions:position_id(id, code, name)`)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (!isUuid(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const payload: Record<string, string | null> = {};
  if (body.status !== undefined) payload.status = String(body.status);
  if (body.notes !== undefined) payload.notes = body.notes ? String(body.notes) : null;

  if (body.approve === true) {
    payload.approved_at = now;
    payload.awarded_at = now;
    payload.status = "qualified";
  }

  const { data, error } = await supabaseDb
    .from("member_positions")
    .update(payload)
    .eq("id", id)
    .select(`id, member_id, position_id, status, awarded_at, expires_at, approved_by, approved_at, notes, created_at, positions:position_id(id, code, name)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ✅ UNASSIGN (delete the assignment row)
export async function DELETE(req: Request) {
  const check = await requirePermission("approve_positions");
  if (!check.ok) return check.response;

  const body = await req.json().catch(() => ({}));

  // Preferred: delete by member_positions.id
  const id = String(body.id ?? "").trim();

  // Alternate: delete by member_id + position_id (optional)
  const member_id = String(body.member_id ?? "").trim();
  const position_id = String(body.position_id ?? "").trim();

  let q = supabaseDb.from("member_positions").delete().select("*");

  if (id) {
    if (!isUuid(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
    q = q.eq("id", id);
  } else {
    if (!member_id || !isUuid(member_id)) return NextResponse.json({ error: "bad member_id" }, { status: 400 });
    if (!position_id || !isUuid(position_id)) return NextResponse.json({ error: "bad position_id" }, { status: 400 });
    q = q.eq("member_id", member_id).eq("position_id", position_id);
  }

  const { data, error } = await q;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Supabase delete returns an array
  const deleted = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ data: deleted ?? null });
}