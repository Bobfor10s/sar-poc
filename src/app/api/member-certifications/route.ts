import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const member_id = url.searchParams.get("member_id") ?? "";
  const mode = (url.searchParams.get("mode") ?? "history").toLowerCase(); // history | current

  if (!member_id) {
    return NextResponse.json({ error: "member_id is required" }, { status: 400 });
  }

  if (mode === "current") {
  const { data, error } = await supabaseDb
    .from("v_member_course_current")
    .select("*, courses(code, name)")
    .eq("member_id", member_id)
    .order("expires_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}



  // history mode
  const { data, error } = await supabaseDb
    .from("member_certifications")
    .select("*, courses(code, name)")
    .eq("member_id", member_id)
    .order("expires_at", { ascending: false })
    .order("completed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const member_id = String(body.member_id ?? "").trim();
  const course_id = String(body.course_id ?? "").trim();
  const completed_at = String(body.completed_at ?? "").trim(); // yyyy-mm-dd
  const expires_at = String(body.expires_at ?? "").trim();     // yyyy-mm-dd

  if (!member_id || !course_id || !completed_at || !expires_at) {
    return NextResponse.json(
      { error: "member_id, course_id, completed_at, expires_at are required" },
      { status: 400 }
    );
  }

  const payload: any = {
    member_id,
    course_id,
    completed_at,
    expires_at,
    issuer: body.issuer ? String(body.issuer) : null,
    certificate_number: body.certificate_number ? String(body.certificate_number) : null,
    notes: body.notes ? String(body.notes) : null,
    do_not_email: !!body.do_not_email,
  };

  const { data, error } = await supabaseDb
    .from("member_certifications")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
