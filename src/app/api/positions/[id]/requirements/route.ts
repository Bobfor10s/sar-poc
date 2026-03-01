import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getIdFromCtx(ctx: any): Promise<string> {
  const p = ctx?.params;
  const resolved = p && typeof p.then === "function" ? await p : p;
  const id = resolved?.id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(_req: Request, ctx: any) {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const position_id = await getIdFromCtx(ctx);
  if (!position_id || !isUuid(position_id)) {
    return NextResponse.json({ error: "bad position id" }, { status: 400 });
  }

  // Requirements (course + prerequisite position + task)
  const req = await supabaseDb
    .from("position_requirements")
    .select(`
      id,
      req_kind,
      notes,
      within_months,
      min_count,
      activity_type,
      task_id,
      req_group_id,
      courses:course_id ( id, code, name ),
      required_position:required_position_id ( id, code, name ),
      tasks:task_id ( id, task_code, task_name )
    `)
    .eq("position_id", position_id)
    .order("created_at", { ascending: true });

  if (req.error) return NextResponse.json({ error: req.error.message }, { status: 500 });

  // Requirement groups
  const groups = await supabaseDb
    .from("position_req_groups")
    .select("id, label, min_met, created_at")
    .eq("position_id", position_id)
    .order("created_at", { ascending: true });

  if (groups.error) return NextResponse.json({ error: groups.error.message }, { status: 500 });

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
      groups: groups.data ?? [],
      tasks: tasks.data ?? [],
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(req: Request, ctx: any) {
  const check = await requirePermission("manage_positions");
  if (!check.ok) return check.response;

  const position_id = await getIdFromCtx(ctx);
  if (!position_id || !isUuid(position_id)) {
    return NextResponse.json({ error: "bad position id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const req_kind = String(body.req_kind ?? "").trim().toLowerCase();

  if (!["course", "position", "task", "time"].includes(req_kind)) {
    return NextResponse.json({ error: "req_kind must be course, position, task, or time" }, { status: 400 });
  }

  const payload: Record<string, string | number | null> = {
    position_id,
    req_kind,
    notes: body.notes ? String(body.notes).trim() : null,
  };

  if (req_kind === "course") {
    const course_id = String(body.course_id ?? "").trim();
    if (!course_id || !isUuid(course_id)) {
      return NextResponse.json({ error: "course_id required for req_kind=course" }, { status: 400 });
    }
    payload.course_id = course_id;
  } else if (req_kind === "position") {
    const required_position_id = String(body.required_position_id ?? "").trim();
    if (!required_position_id || !isUuid(required_position_id)) {
      return NextResponse.json({ error: "required_position_id required for req_kind=position" }, { status: 400 });
    }
    payload.required_position_id = required_position_id;
  } else if (req_kind === "task") {
    const task_id = String(body.task_id ?? "").trim();
    if (!task_id || !isUuid(task_id)) {
      return NextResponse.json({ error: "task_id required for req_kind=task" }, { status: 400 });
    }
    payload.task_id = task_id;
  } else if (req_kind === "time") {
    const min_count = Number(body.min_count);
    if (!Number.isFinite(min_count) || min_count < 1) {
      return NextResponse.json({ error: "min_count must be a positive integer for req_kind=time" }, { status: 400 });
    }
    payload.min_count = Math.round(min_count);
    const activity_type = String(body.activity_type ?? "any").trim();
    if (!["training", "call", "any"].includes(activity_type)) {
      return NextResponse.json({ error: "activity_type must be training, call, or any" }, { status: 400 });
    }
    payload.activity_type = activity_type;
    if (body.within_months !== undefined && body.within_months !== null && body.within_months !== "") {
      const within_months = Number(body.within_months);
      if (Number.isFinite(within_months) && within_months > 0) payload.within_months = Math.round(within_months);
    }
  }

  // Optionally assign to a requirement group
  if (body.req_group_id && isUuid(String(body.req_group_id))) {
    payload.req_group_id = String(body.req_group_id);
  }

  const { data, error } = await supabaseDb
    .from("position_requirements")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function DELETE(req: Request, ctx: any) {
  const check = await requirePermission("manage_positions");
  if (!check.ok) return check.response;

  const position_id = await getIdFromCtx(ctx);
  if (!position_id || !isUuid(position_id)) {
    return NextResponse.json({ error: "bad position id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const req_id = (url.searchParams.get("req_id") ?? "").trim();
  if (!req_id || !isUuid(req_id)) {
    return NextResponse.json({ error: "req_id query param required" }, { status: 400 });
  }

  // Verify it belongs to this position before deleting
  const { data: existing, error: findErr } = await supabaseDb
    .from("position_requirements")
    .select("id")
    .eq("id", req_id)
    .eq("position_id", position_id)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await supabaseDb
    .from("position_requirements")
    .delete()
    .eq("id", req_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
