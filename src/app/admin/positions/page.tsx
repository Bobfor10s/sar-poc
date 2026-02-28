"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPositionsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/positions"); }, [router]);
  return null;
}
