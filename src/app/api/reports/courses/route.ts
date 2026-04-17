import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

type CertRow = { member_id: string; course_id: string; completed_at: string | null; expires_at: string | null };
type CourseRow = { id: string; code: string; name: string; is_mandatory: boolean; never_expires: boolean; warning_days: number };
type MemberRow = { id: string; first_name: string; last_name: string };

function calcStatus(
  never_expires: boolean,
  completed_at: string | null,
  expires_at: string | null,
  warning_days: number
): "Current" | "Expiring Soon" | "Expired" | "Never Completed" {
  if (!completed_at) return "Never Completed";
  if (never_expires) return "Current";
  if (!expires_at) return "Current";
  const now = new Date();
  const exp = new Date(expires_at);
  if (exp < now) return "Expired";
  const warnDate = new Date(now);
  warnDate.setDate(warnDate.getDate() + warning_days);
  if (exp <= warnDate) return "Expiring Soon";
  return "Current";
}

const STATUS_KEY: Record<string, string> = {
  "Current": "current",
  "Expiring Soon": "expiring",
  "Expired": "expired",
  "Never Completed": "never",
};

export async function GET(req: Request) {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const url = new URL(req.url);
  const memberId = url.searchParams.get("member_id") ?? "all";
  const coursesParam = url.searchParams.get("courses") ?? "all";
  const statusParam = url.searchParams.get("status") ?? "current,expiring,expired,never";

  const wantedStatuses = new Set(statusParam.split(",").map((s) => s.trim()).filter(Boolean));

  // 1. Fetch courses
  let courseQuery = supabaseDb
    .from("courses")
    .select("id,code,name,is_mandatory,never_expires,warning_days")
    .eq("is_active", true);
  if (coursesParam === "mandatory") {
    courseQuery = courseQuery.eq("is_mandatory", true);
  } else if (coursesParam !== "all") {
    const ids = coursesParam.split(",").filter(Boolean);
    courseQuery = courseQuery.in("id", ids);
  }
  const { data: courses, error: cErr } = await courseQuery.order("code");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!courses?.length) return NextResponse.json({ data: [] });

  // 2. Fetch members
  let memberQuery = supabaseDb
    .from("members")
    .select("id,first_name,last_name")
    .eq("status", "active");
  if (memberId !== "all") {
    memberQuery = memberQuery.eq("id", memberId);
  }
  const { data: members, error: mErr } = await memberQuery.order("name");
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!members?.length) return NextResponse.json({ data: [] });

  // 3. Fetch certifications for these members + courses
  const courseIds = (courses as CourseRow[]).map((c) => c.id);
  const memberIds = (members as MemberRow[]).map((m) => m.id);
  const { data: certs, error: certErr } = await supabaseDb
    .from("member_certifications")
    .select("member_id,course_id,completed_at,expires_at")
    .in("member_id", memberIds)
    .in("course_id", courseIds);
  if (certErr) return NextResponse.json({ error: certErr.message }, { status: 500 });

  // Index by member_id:course_id
  const certMap = new Map<string, CertRow>();
  for (const cert of (certs ?? []) as CertRow[]) {
    certMap.set(`${cert.member_id}:${cert.course_id}`, cert);
  }

  // 4. Cross-product, compute status, apply filters
  const rows = [];
  for (const member of members as MemberRow[]) {
    for (const course of courses as CourseRow[]) {
      const cert = certMap.get(`${member.id}:${course.id}`);
      const completed_at = cert?.completed_at ?? null;
      const expires_at = cert?.expires_at ?? null;
      const status = calcStatus(course.never_expires, completed_at, expires_at, course.warning_days);

      if (!wantedStatuses.has(STATUS_KEY[status])) continue;

      rows.push({
        member_id: member.id,
        member_name: `${member.first_name} ${member.last_name}`.trim(),
        course_id: course.id,
        course_code: course.code,
        course_name: course.name,
        is_mandatory: course.is_mandatory,
        never_expires: course.never_expires,
        completed_at,
        expires_at,
        status,
      });
    }
  }

  return NextResponse.json({ data: rows });
}
