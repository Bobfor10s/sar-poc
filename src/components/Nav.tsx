"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AuthUser = {
  id: string;
  name: string;
  role: string;
  permissions: string[];
};

const ROLE_BADGE_COLORS: Record<string, { bg: string; border: string; color: string }> = {
  admin: { bg: "#dbeafe", border: "#93c5fd", color: "#1e40af" },
  viewer: { bg: "#d1fae5", border: "#6ee7b7", color: "#065f46" },
  member: { bg: "#f3f4f6", border: "#d1d5db", color: "#374151" },
};

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (pathname === "/login") return;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => setUser(json?.user ?? null))
      .catch(() => setUser(null));
  }, [pathname]);

  // Hide nav entirely on login page
  if (pathname === "/login") return null;

  const perms = new Set(user?.permissions ?? []);

  // General links — requires read_all (Members always visible as self-access)
  const generalLinks = [
    { href: "/members", label: "Members", always: true },
    { href: "/calls", label: "Calls", perm: "read_all" },
    { href: "/training", label: "Training", perm: "read_all" },
    { href: "/meetings", label: "Meetings", perm: "read_all" },
    { href: "/events", label: "Events", perm: "read_all" },
  ];

  // Admin links — require specific permissions
  const adminLinks = [
    { href: "/admin/courses", label: "Courses", perm: "manage_courses" },
    { href: "/admin/positions", label: "Positions", perm: "manage_positions" },
    { href: "/admin/approvals", label: "Approvals", perm: "approve_positions" },
  ];

  const visibleGeneral = generalLinks.filter((l) => l.always || !l.perm || perms.has(l.perm));
  const visibleAdmin = adminLinks.filter((l) => !l.perm || perms.has(l.perm));

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const roleBadge = user ? (ROLE_BADGE_COLORS[user.role] ?? ROLE_BADGE_COLORS.member) : null;

  return (
    <nav
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        padding: "10px 16px",
        borderBottom: "1px solid #94a3b8",
        background: "#e2e8f0",
        fontFamily: "system-ui",
        alignItems: "center",
      }}
    >
      {visibleGeneral.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              textDecoration: "none",
              border: "1px solid #94a3b8",
              background: active ? "#cbd5e1" : "#f8fafc",
              color: "#1f2937",
              fontWeight: active ? 600 : 400,
              fontSize: 14,
            }}
          >
            {l.label}
          </Link>
        );
      })}

      {visibleAdmin.length > 0 && (
        <>
          <span style={{ opacity: 0.35, fontSize: 14 }}>|</span>
          {visibleAdmin.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  textDecoration: "none",
                  border: "1px solid #94a3b8",
                  background: active ? "#cbd5e1" : "#f8fafc",
                  color: "#1f2937",
                  fontWeight: active ? 600 : 400,
                  fontSize: 14,
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {user && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#374151" }}>{user.name}</span>
          {roleBadge && (
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                border: `1px solid ${roleBadge.border}`,
                borderRadius: 999,
                background: roleBadge.bg,
                color: roleBadge.color,
                fontWeight: 700,
                textTransform: "capitalize",
              }}
            >
              {user.role}
            </span>
          )}
          <button
            onClick={handleLogout}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              border: "1px solid #94a3b8",
              background: "#f8fafc",
              color: "#374151",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
