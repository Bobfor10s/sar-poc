import { supabaseServer } from "./server";
import { supabaseDb } from "./db";

export type AuthContext = {
  member: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    role: string;
    user_id: string;
  };
  role: string;
  permissions: string[];
};

/**
 * Reads the session from cookies, fetches the linked member row,
 * and returns role + permissions. Returns null if unauthenticated
 * or if no member row is linked to the auth user.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Fetch member linked to this auth user
  const { data: member, error: memberErr } = await supabaseDb
    .from("members")
    .select("id, first_name, last_name, email, role, user_id")
    .eq("user_id", user.id)
    .single();

  if (memberErr || !member) return null;

  // Fetch permissions for this role via role_permissions join
  const { data: roleRows, error: roleErr } = await supabaseDb
    .from("roles")
    .select("id, role_permissions(permission_key)")
    .eq("name", member.role)
    .single();

  if (roleErr || !roleRows) return null;

  type RpRow = { permission_key: string };
  const rolePerms = (roleRows as { id: string; role_permissions: RpRow[] }).role_permissions ?? [];
  const permissions: string[] = rolePerms.map((rp) => rp.permission_key);

  return {
    member: {
      id: member.id,
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email ?? null,
      role: member.role,
      user_id: member.user_id,
    },
    role: member.role,
    permissions,
  };
}
