import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
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
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();

  if (!id || !isUuid(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const payload: any = {};
  if (body.status !== undefined) payload.status = String(body.status);
  if (body.notes !== undefined) payload.notes = body.notes ? String(body.notes) : null;

  // Approve toggle (simple)
  if (body.approve === true) {
    payload.approved_at = new Date().toISOString();
    // approved_by can be added later when you have auth/users wired
  }

  const { data, error } = await supabaseDb
    .from("member_positions")
    .update(payload)
    .eq("id", id)
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
  return NextResponse.json({ data });
}

// ✅ UNASSIGN (delete the assignment row)
export async function DELETE(req: Request) {
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