"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/members", label: "Members" },
  { href: "/calls", label: "Calls" },
  { href: "/training", label: "Training" },
  { href: "/meetings", label: "Meetings" },
  { href: "/events", label: "Events" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/positions", label: "Positions" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        padding: "12px 16px",
        borderBottom: "1px solid #94a3b8",
        background: "#e2e8f0",
        fontFamily: "system-ui",
      }}
    >
      {links.map((l) => {
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
            }}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
