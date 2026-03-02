"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type AuthUser = {
  name: string;
  role: string;
};

const ROLE_BADGE_COLORS: Record<string, { bg: string; border: string; color: string }> = {
  admin:  { bg: "#dbeafe", border: "#93c5fd", color: "#1e40af" },
  viewer: { bg: "#d1fae5", border: "#6ee7b7", color: "#065f46" },
  member: { bg: "#f3f4f6", border: "#d1d5db", color: "#374151" },
};

export default function UserBar() {
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

  if (pathname === "/login" || !user) return null;

  const badge = ROLE_BADGE_COLORS[user.role] ?? ROLE_BADGE_COLORS.member;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 20px",
      borderBottom: "1px solid #e2e8f0",
      background: "#f8fafc",
      justifyContent: "flex-end",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{user.name}</span>
      <span style={{
        fontSize: 11,
        padding: "2px 8px",
        border: `1px solid ${badge.border}`,
        borderRadius: 999,
        background: badge.bg,
        color: badge.color,
        fontWeight: 700,
        textTransform: "capitalize",
      }}>
        {user.role}
      </span>
      <button
        onClick={handleLogout}
        style={{
          padding: "4px 12px",
          borderRadius: 6,
          border: "1px solid #94a3b8",
          background: "white",
          color: "#374151",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </div>
  );
}
