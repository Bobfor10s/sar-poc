import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const url = new URL(req.url);
  const training_session_id = (url.searchParams.get("training_session_id") || "").trim();

  if (!training_session_id || !isUuid(training_session_id)) {
    return NextResponse.json({ error: "bad training_session_id" }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("training_attendance")
    .select("id, training_session_id, member_id, status, hours, notes, created_at, members:member_id(first_name, last_name)")
    .eq("training_session_id", training_session_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const body = await req.json().catch(() => ({}));
  const training_session_id = String(body.training_session_id ?? "").trim();
  const member_id = String(body.member_id ?? "").trim();

  if (!training_session_id || !isUuid(training_session_id)) {
    return NextResponse.json({ error: "bad training_session_id" }, { status: 400 });
  }
  if (!member_id || !isUuid(member_id)) {
    return NextResponse.json({ error: "bad member_id" }, { status: 400 });
  }

  const status = body.status ? String(body.status).trim() : "attended";
  const allowed = new Set(["attended", "absent", "excused"]);
  if (!allowed.has(status)) {
    return NextResponse.json({ error: "status must be attended|absent|excused" }, { status: 400 });
  }

  const payload: any = {
    training_session_id,
    member_id,
    status,
    hours: body.hours != null ? Number(body.hours) : null,
    notes: body.notes ? String(body.notes).trim() : null,
  };

  // Upsert on unique (training_session_id, member_id)
  const { data, error } = await supabaseDb
    .from("training_attendance")
    .upsert(payload, { onConflict: "training_session_id,member_id" })
    .select("id, training_session_id, member_id, status, hours, notes, created_at, members:member_id(first_name, last_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const { error } = await supabaseDb.from("training_attendance").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
