import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/auth";

export async function GET() {
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: auth.member.id,
      name: `${auth.member.first_name} ${auth.member.last_name}`,
      email: auth.member.email,
      role: auth.role,
      status: auth.member.status,
      is_applicant: !auth.member.joined_at,
      permissions: auth.permissions,
    },
  });
}
