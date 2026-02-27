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
      role: auth.role,
      permissions: auth.permissions,
    },
  });
}
