import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

export async function GET() {
  const { data, error } = await supabaseDb
    .from("positions")
    .select("*")
    .eq("is_active", true)
    .order("code", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
