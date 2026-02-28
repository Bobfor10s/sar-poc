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

  // Hide nav on login and portal pages
  if (pathname === "/login" || pathname.startsWith("/portal")) return null;

  const perms = new Set(user?.permissions ?? []);

  const generalLinks = [
    { href: "/members", label: "Members", always: true },
    { href: "/calls", label: "Calls", perm: "read_all" },
    { href: "/training", label: "Training", perm: "read_all" },
    { href: "/meetings", label: "Meetings", perm: "read_all" },
    { href: "/events", label: "Events", perm: "read_all" },
  ];

  const positionsLinks = [
    { href: "/positions", label: "Positions", perm: "read_all" },
    { href: "/courses", label: "Courses", perm: "read_all" },
    { href: "/tasks", label: "Tasks", perm: "read_all" },
  ];

  const adminLinks = [
    { href: "/admin/approvals", label: "Approvals", perm: "approve_positions" },
    { href: "/admin/settings", label: "Settings", perm: "manage_members" },
  ];

  const visibleGeneral = generalLinks.filter((l) => l.always || !l.perm || perms.has(l.perm));
  const visiblePositions = positionsLinks.filter((l) => !l.perm || perms.has(l.perm));
  const visibleAdmin = adminLinks.filter((l) => !l.perm || perms.has(l.perm));

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const roleBadge = user ? (ROLE_BADGE_COLORS[user.role] ?? ROLE_BADGE_COLORS.member) : null;

  function navLink(href: string, label: string, indent = false) {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        key={href}
        href={href}
        style={{
          display: "block",
          padding: indent ? "5px 10px 5px 20px" : "6px 10px",
          borderRadius: 6,
          textDecoration: "none",
          background: active ? "#cbd5e1" : "transparent",
          color: active ? "#1e3a5f" : "#374151",
          fontWeight: active ? 600 : 400,
          fontSize: 14,
        }}
      >
        {label}
      </Link>
    );
  }

  return (
    <nav
      style={{
        width: 220,
        minHeight: "100vh",
        background: "#e2e8f0",
        borderRight: "1px solid #94a3b8",
        fontFamily: "system-ui",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        padding: "0 8px",
        boxSizing: "border-box",
      }}
    >
      {/* App name */}
      <div style={{ padding: "16px 10px 12px", borderBottom: "1px solid #94a3b8", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: "#1e3a5f" }}>SAR POC</span>
      </div>

      {/* General links */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {visibleGeneral.map((l) => navLink(l.href, l.label))}
      </div>

      {/* Positions section */}
      {visiblePositions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 10px 6px" }}>
            Positions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {visiblePositions.map((l) => navLink(l.href, l.label, true))}
          </div>
        </div>
      )}

      {/* Admin section */}
      {visibleAdmin.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 10px 6px" }}>
            Admin
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {visibleAdmin.map((l) => navLink(l.href, l.label, true))}
          </div>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* User info */}
      {user && (
        <div style={{ borderTop: "1px solid #94a3b8", padding: "12px 10px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{user.name}</span>
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
                alignSelf: "flex-start",
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
              textAlign: "left",
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
