"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function PageViewLogger() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login") return;
    fetch("/api/activity/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
