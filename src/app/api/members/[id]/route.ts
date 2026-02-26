import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

type Ctx = { params: Promise<{ id: string }> };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad member id: ${id || "(missing)"}` }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("members")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad member id: ${id || "(missing)"}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  const fields = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "street_address",
    "street_address_2",
    "city",
    "state",
    "postal_code",
    "status",
    "joined_at",
  ];

  const patch: Record<string, any> = {};
  for (const f of fields) {
    if (body[f] !== undefined) patch[f] = body[f] === "" ? null : body[f];
  }

  // Detect first-time town approval (joined_at transitioning from null to a date)
  const approvingNow = patch.joined_at != null;
  let wasApplicant = false;
  if (approvingNow) {
    const { data: current } = await supabaseDb
      .from("members")
      .select("joined_at")
      .eq("id", id)
      .single();
    wasApplicant = current?.joined_at == null;
  }

  const { data, error } = await supabaseDb
    .from("members")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-assign SEARCHER when approving an applicant for the first time
  if (wasApplicant && patch.joined_at) {
    const { data: searcherPos } = await supabaseDb
      .from("positions")
      .select("id")
      .eq("code", "SEARCHER")
      .single();

    if (searcherPos) {
      // Only insert if not already assigned
      const { data: existing } = await supabaseDb
        .from("member_positions")
        .select("id")
        .eq("member_id", id)
        .eq("position_id", searcherPos.id)
        .maybeSingle();

      if (!existing) {
        await supabaseDb.from("member_positions").insert({
          member_id: id,
          position_id: searcherPos.id,
          status: "qualified",
          approved_at: patch.joined_at,
        });
      }
    }
  }

  return NextResponse.json({ data });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `bad member id: ${id || "(missing)"}` }, { status: 400 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  // Load member (for force-delete guardrails)
  const { data: member, error: memErr } = await supabaseDb
    .from("members")
    .select("id, first_name, last_name, email")
    .eq("id", id)
    .single();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

  const email = String(member?.email ?? "").toLowerCase();
  const fn = String(member?.first_name ?? "").toLowerCase();
  const ln = String(member?.last_name ?? "").toLowerCase();

  const looksTest =
    !email || email.includes("test") || fn.includes("test") || ln.includes("test");

  // Count dependencies (audit tables)
  const [{ count: certCount, error: certErr }, { count: attCount, error: attErr }] =
    await Promise.all([
      supabaseDb
        .from("member_certifications")
        .select("*", { count: "exact", head: true })
        .eq("member_id", id),
      supabaseDb
        .from("call_attendance")
        .select("*", { count: "exact", head: true })
        .eq("member_id", id),
    ]);

  if (certErr) return NextResponse.json({ error: certErr.message }, { status: 500 });
  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });

  const hasDeps = (certCount ?? 0) > 0 || (attCount ?? 0) > 0;

  // Safe delete: block if history exists
  if (hasDeps && !force) {
    return NextResponse.json(
      {
        error:
          "Cannot delete: member has history (certifications and/or attendance). Deactivate instead, or use force delete for test data.",
        can_delete: false,
        can_force: looksTest,
        cert_count: certCount ?? 0,
        attendance_count: attCount ?? 0,
      },
      { status: 409 }
    );
  }

  // Force delete: allow only for test-looking accounts
  if (force) {
    if (!looksTest) {
      return NextResponse.json(
        { error: "Force delete is only allowed for test accounts." },
        { status: 403 }
      );
    }

    // Delete dependent rows first (order matters)
    if (hasDeps) {
      const [delCerts, delAtt] = await Promise.all([
        supabaseDb.from("member_certifications").delete().eq("member_id", id),
        supabaseDb.from("call_attendance").delete().eq("member_id", id),
      ]);

      if (delCerts.error) return NextResponse.json({ error: delCerts.error.message }, { status: 500 });
      if (delAtt.error) return NextResponse.json({ error: delAtt.error.message }, { status: 500 });
    }
  }

  // Delete member row
  const { error: delMemberErr } = await supabaseDb.from("members").delete().eq("id", id);
  if (delMemberErr) return NextResponse.json({ error: delMemberErr.message }, { status: 409 });

  return NextResponse.json({
    ok: true,
    forced: force,
    deleted: { member: 1, certifications: certCount ?? 0, attendance: attCount ?? 0 },
  });
}
