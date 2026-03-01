import { NextResponse } from "next/server";
import { getAuthContext, AuthContext } from "./auth";

type OkResult = { ok: true; auth: AuthContext };
type FailResult = { ok: false; response: NextResponse };

/**
 * Checks that a valid session exists AND the user has the given permission.
 * Returns { ok: true, auth } on success, or { ok: false, response } with a 401/403.
 */
export async function requirePermission(
  key: string
): Promise<OkResult | FailResult> {
  const auth = await getAuthContext();

  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  if (!auth.permissions.includes(key)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Permission denied: requires '${key}'` },
        { status: 403 }
      ),
    };
  }

  return { ok: true, auth };
}

/**
 * Checks that a valid session exists (no specific permission required).
 * Returns { ok: true, auth } on success, or { ok: false, response } with 401.
 */
export async function requireAuth(): Promise<OkResult | FailResult> {
  const auth = await getAuthContext();

  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  return { ok: true, auth };
}
