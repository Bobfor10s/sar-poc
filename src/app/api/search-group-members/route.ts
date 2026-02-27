import { NextRequest, NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth, requirePermission } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

const SELECT_ROW = `
  id, search_group_id, member_id, position_id, is_trainee, notes, created_at,
  members:member_id (first_name, last_name),
  positions:position_id (id, code, name)
`.trim();

/** Returns 400 response if member is not qualified for the position on a live call, null otherwise. */
async function assertQualified(
  memberId: string,
  positionId: string | null,
  isTrainee: boolean,
  searchGroupId: string
): Promise<NextResponse | null> {
  // Trainees skip the qualification gate
  if (isTrainee) return null;
  // No position selected — nothing to check
  if (!positionId || !isUuid(positionId)) return null;

  // Look up the parent group to determine if this is a call (not training)
  const { data: group, error: gErr } = await supabaseDb
    .from("search_groups")
    .select("call_id, training_session_id")
    .eq("id", searchGroupId)
    .single();

  if (gErr || !group) return NextResponse.json({ error: "Search group not found" }, { status: 404 });

  // Only enforce on call groups
  if (!group.call_id) return null;

  const { data: mp, error: mpErr } = await supabaseDb
    .from("member_positions")
    .select("id")
    .eq("member_id", memberId)
    .eq("position_id", positionId)
    .eq("status", "qualified")
    .not("approved_at", "is", null)
    .maybeSingle();

  if (mpErr) return NextResponse.json({ error: mpErr.message }, { status: 500 });

  if (!mp) {
    return NextResponse.json(
      {
        error: "Member does not have an approved qualification for this position on this call. Set is_trainee=true to assign as trainee.",
        code: "NOT_QUALIFIED",
      },
      { status: 400 }
    );
  }

  return null;
}

export async function GET(req: NextRequest) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const sgId = req.nextUrl.searchParams.get("search_group_id") ?? "";
  if (!isUuid(sgId)) {
    return NextResponse.json({ error: "search_group_id must be a valid UUID" }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("search_group_members")
    .select(SELECT_ROW)
    .eq("search_group_id", sgId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const check = await requirePermission("manage_calls");
  if (!check.ok) return check.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const searchGroupId = typeof body.search_group_id === "string" ? body.search_group_id.trim() : "";
  const memberId = typeof body.member_id === "string" ? body.member_id.trim() : "";
  const positionId = typeof body.position_id === "string" && isUuid(body.position_id.trim())
    ? body.position_id.trim()
    : null;
  const isTrainee = typeof body.is_trainee === "boolean" ? body.is_trainee : true;
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

  if (!isUuid(searchGroupId)) return NextResponse.json({ error: "search_group_id must be a valid UUID" }, { status: 400 });
  if (!isUuid(memberId)) return NextResponse.json({ error: "member_id must be a valid UUID" }, { status: 400 });

  const qualErr = await assertQualified(memberId, positionId, isTrainee, searchGroupId);
  if (qualErr) return qualErr;

  const { data: row, error } = await supabaseDb
    .from("search_group_members")
    .insert({ search_group_id: searchGroupId, member_id: memberId, position_id: positionId, is_trainee: isTrainee, notes })
    .select(SELECT_ROW)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Member is already in this group" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: row }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const check = await requirePermission("manage_calls");
  if (!check.ok) return check.response;

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isUuid(id)) return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Fetch the current row to get search_group_id + current values
  const { data: current, error: fetchErr } = await supabaseDb
    .from("search_group_members")
    .select("search_group_id, member_id, position_id, is_trainee")
    .eq("id", id)
    .single();

  if (fetchErr || !current) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if ("is_trainee" in body && typeof body.is_trainee === "boolean") updates.is_trainee = body.is_trainee;
  if ("position_id" in body) {
    updates.position_id = typeof body.position_id === "string" && isUuid(body.position_id)
      ? body.position_id
      : null;
  }
  if ("notes" in body) {
    updates.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }

  // Re-run qualification check if is_trainee or position_id changed
  const newIsTrainee = "is_trainee" in updates ? (updates.is_trainee as boolean) : current.is_trainee;
  const newPositionId = "position_id" in updates ? (updates.position_id as string | null) : current.position_id;

  const qualErr = await assertQualified(current.member_id, newPositionId, newIsTrainee, current.search_group_id);
  if (qualErr) return qualErr;

  const { data: row, error } = await supabaseDb
    .from("search_group_members")
    .update(updates)
    .eq("id", id)
    .select(SELECT_ROW)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: row });
}

export async function DELETE(req: NextRequest) {
  const check = await requirePermission("manage_calls");
  if (!check.ok) return check.response;

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isUuid(id)) return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });

  const { error } = await supabaseDb.from("search_group_members").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
