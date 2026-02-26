import { NextRequest, NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

const MEMBER_JOIN = `
  id, member_id, position_id, is_trainee, notes, created_at,
  members:member_id (first_name, last_name),
  positions:position_id (id, code, name)
`.trim();

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const trainingId = searchParams.get("training_session_id") ?? "";
  const callId = searchParams.get("call_id") ?? "";

  const hasTraining = isUuid(trainingId);
  const hasCall = isUuid(callId);

  if ((hasTraining ? 1 : 0) + (hasCall ? 1 : 0) !== 1) {
    return NextResponse.json(
      { error: "Provide exactly one of training_session_id or call_id (valid UUIDs)" },
      { status: 400 }
    );
  }

  const filter = hasTraining
    ? { training_session_id: trainingId }
    : { call_id: callId };

  const { data, error } = await supabaseDb
    .from("search_groups")
    .select(`id, name, notes, created_at, training_session_id, call_id, search_group_members (${MEMBER_JOIN})`)
    .match(filter)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trainingId = typeof body.training_session_id === "string" ? body.training_session_id.trim() : "";
  const callId = typeof body.call_id === "string" ? body.call_id.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

  const hasTraining = isUuid(trainingId);
  const hasCall = isUuid(callId);

  if ((hasTraining ? 1 : 0) + (hasCall ? 1 : 0) !== 1) {
    return NextResponse.json(
      { error: "Provide exactly one of training_session_id or call_id (valid UUIDs)" },
      { status: 400 }
    );
  }
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const insert: Record<string, unknown> = { name, notes };
  if (hasTraining) insert.training_session_id = trainingId;
  else insert.call_id = callId;

  const { data: row, error: insertErr } = await supabaseDb
    .from("search_groups")
    .insert(insert)
    .select(`id, name, notes, created_at, training_session_id, call_id, search_group_members (${MEMBER_JOIN})`)
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ data: row }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isUuid(id)) return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });

  const { error } = await supabaseDb.from("search_groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
