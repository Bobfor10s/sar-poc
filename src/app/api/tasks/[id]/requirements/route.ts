import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

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
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const task_id = await getIdFromCtx(ctx);
  if (!task_id || !isUuid(task_id)) {
    return NextResponse.json({ error: "bad task id" }, { status: 400 });
  }

  const { data, error } = await supabaseDb
    .from("task_requirements")
    .select("*")
    .eq("task_id", task_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request, ctx: any) {
  const check = await requirePermission("manage_positions");
  if (!check.ok) return check.response;

  const task_id = await getIdFromCtx(ctx);
  if (!task_id || !isUuid(task_id)) {
    return NextResponse.json({ error: "bad task id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const req_kind = String(body.req_kind ?? "").trim().toLowerCase();

  if (!["time", "proficiency"].includes(req_kind)) {
    return NextResponse.json({ error: "req_kind must be 'time' or 'proficiency'" }, { status: 400 });
  }

  const payload: Record<string, string | number | null> = {
    task_id,
    req_kind,
    notes: body.notes ? String(body.notes).trim() : null,
  };

  if (req_kind === "time") {
    const min_hours = Number(body.min_hours);
    if (!Number.isFinite(min_hours) || min_hours <= 0) {
      return NextResponse.json({ error: "min_hours must be a positive number for req_kind=time" }, { status: 400 });
    }
    payload.min_hours = min_hours;

    const activity_type = String(body.activity_type ?? "any").trim();
    if (!["training", "call", "any"].includes(activity_type)) {
      return NextResponse.json({ error: "activity_type must be training, call, or any" }, { status: 400 });
    }
    payload.activity_type = activity_type;

    if (body.within_months !== undefined && body.within_months !== null && body.within_months !== "") {
      const within_months = Number(body.within_months);
      if (Number.isFinite(within_months) && within_months > 0) {
        payload.within_months = within_months;
      }
    }
  }

  const { data, error } = await supabaseDb
    .from("task_requirements")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: Request, ctx: any) {
  const check = await requirePermission("manage_positions");
  if (!check.ok) return check.response;

  const task_id = await getIdFromCtx(ctx);
  if (!task_id || !isUuid(task_id)) {
    return NextResponse.json({ error: "bad task id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const req_id = (url.searchParams.get("req_id") ?? "").trim();
  if (!req_id || !isUuid(req_id)) {
    return NextResponse.json({ error: "req_id query param required" }, { status: 400 });
  }

  // Verify it belongs to this task
  const { data: existing, error: findErr } = await supabaseDb
    .from("task_requirements")
    .select("id")
    .eq("id", req_id)
    .eq("task_id", task_id)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await supabaseDb
    .from("task_requirements")
    .delete()
    .eq("id", req_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
