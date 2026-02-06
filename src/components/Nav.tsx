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
        borderBottom: "1px solid #ddd",
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
              padding: "6px 10px",
              borderRadius: 8,
              textDecoration: "none",
              border: "1px solid #ddd",
              background: active ? "#f2f2f2" : "transparent",
              color: "inherit",
            }}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
