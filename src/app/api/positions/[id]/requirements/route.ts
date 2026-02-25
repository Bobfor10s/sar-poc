import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function getIdFromCtx(ctx: any): Promise<string> {
  const p = ctx?.params;
  const resolved = p && typeof p.then === "function" ? await p : p;
  const id = resolved?.id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

export async function GET(_req: Request, ctx: any) {
  const position_id = await getIdFromCtx(ctx);
  if (!position_id || !isUuid(position_id)) {
    return NextResponse.json({ error: "bad position id" }, { status: 400 });
  }

  // Requirements (course + prerequisite position)
  const req = await supabaseDb
    .from("position_requirements")
    .select(`
      id,
      req_kind,
      notes,
      within_months,
      min_count,
      courses:course_id ( id, code, name ),
      required_position:required_position_id ( id, code, name )
    `)
    .eq("position_id", position_id)
    .order("created_at", { ascending: true });

  if (req.error) return NextResponse.json({ error: req.error.message }, { status: 500 });

  // Tasks (for taskbook style signoffs)
  const tasks = await supabaseDb
    .from("position_tasks")
    .select("id, task_code, task_name, description, is_active")
    .eq("position_id", position_id)
    .order("task_code", { ascending: true });

  if (tasks.error) return NextResponse.json({ error: tasks.error.message }, { status: 500 });

  return NextResponse.json({
    data: {
      requirements: req.data ?? [],
      tasks: tasks.data ?? [],
    },
  });
}
