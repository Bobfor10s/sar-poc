import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);

  // Fetch everything in parallel
  const [membersRes, positionsRes, certsRes, reqsRes] = await Promise.all([
    supabaseDb.from("members").select("*").order("last_name", { ascending: true }),
    supabaseDb
      .from("member_positions")
      .select("member_id, position_id, status, approved_at, awarded_at, positions:position_id(code, name, level)")
      .or("status.eq.qualified,approved_at.not.is.null,awarded_at.not.is.null"),
    supabaseDb
      .from("member_certifications")
      .select("member_id, course_id, expires_at, courses:course_id(never_expires)"),
    supabaseDb
      .from("position_requirements")
      .select("position_id, req_kind, course_id")
      .eq("req_kind", "course"),
  ]);

  if (membersRes.error) return NextResponse.json({ error: membersRes.error.message }, { status: 500 });

  // Build: set of valid course_ids per member (non-expired or never_expires)
  const validCertsByMember = new Map<string, Set<string>>();
  for (const cert of certsRes.data ?? []) {
    const neverExpires = (cert as any).courses?.never_expires ?? false;
    const valid = neverExpires || !cert.expires_at || cert.expires_at >= today;
    if (!valid) continue;
    if (!validCertsByMember.has(cert.member_id)) validCertsByMember.set(cert.member_id, new Set());
    validCertsByMember.get(cert.member_id)!.add(cert.course_id);
  }

  // Build: required course_ids per position
  const requiredCoursesByPosition = new Map<string, string[]>();
  for (const req of reqsRes.data ?? []) {
    if (!requiredCoursesByPosition.has(req.position_id)) requiredCoursesByPosition.set(req.position_id, []);
    requiredCoursesByPosition.get(req.position_id)!.push(req.course_id);
  }

  // For each member, find positions where all required certs are valid
  const validPositionsByMember = new Map<string, any[]>();
  for (const mp of positionsRes.data ?? []) {
    const requiredCourses = requiredCoursesByPosition.get(mp.position_id) ?? [];
    const memberCerts = validCertsByMember.get(mp.member_id) ?? new Set();
    const allMet = requiredCourses.every((cid) => memberCerts.has(cid));
    if (!allMet) continue;
    if (!validPositionsByMember.has(mp.member_id)) validPositionsByMember.set(mp.member_id, []);
    validPositionsByMember.get(mp.member_id)!.push((mp as any).positions);
  }

  // Attach SAR typing fields to each member
  const data = (membersRes.data ?? []).map((m: any) => {
    const positions = (validPositionsByMember.get(m.id) ?? [])
      .filter(Boolean)
      .sort((a: any, b: any) => (b.level ?? 0) - (a.level ?? 0));

    const primary = positions[0] ?? null;
    return {
      ...m,
      sar_codes: positions.map((p: any) => p.code).join(", ") || null,
      sar_positions: positions.map((p: any) => `${p.code} — ${p.name}`).join(", ") || null,
      sar_primary_code: primary?.code ?? null,
      sar_primary_name: primary?.name ?? null,
      sar_primary_rank: primary?.level ?? null,
    };
  });

  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const first_name = String(body.first_name ?? "").trim();
  const last_name = String(body.last_name ?? "").trim();

  if (!first_name || !last_name) {
    return NextResponse.json(
      { error: "first_name and last_name are required" },
      { status: 400 }
    );
  }

  const joined_at = typeof body.joined_at === "string" && body.joined_at.trim()
    ? body.joined_at.trim()
    : null;

  const { data, error } = await supabaseDb
    .from("members")
    .insert({
      first_name,
      last_name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      street_address: body.street_address ?? null,
      street_address_2: body.street_address_2 ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      postal_code: body.postal_code ?? null,
      town: body.town ?? null,
      status: "active",
      joined_at,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-assign SEARCHER position as qualified, dated to town approval
  const { data: searcherPos } = await supabaseDb
    .from("positions")
    .select("id")
    .eq("code", "SEARCHER")
    .single();

  if (searcherPos) {
    await supabaseDb.from("member_positions").insert({
      member_id: data.id,
      position_id: searcherPos.id,
      status: "qualified",
      approved_at: joined_at ?? new Date().toISOString(),
    });
  }

  return NextResponse.json({ data }, { status: 201 });
}