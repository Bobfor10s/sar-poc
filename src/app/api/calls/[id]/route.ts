import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requirePermission } from "@/lib/supabase/require-permission";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

async function getIdFromCtx(ctx: any): Promise<string> {
  const p = ctx?.params;
  const resolved = p && typeof p.then === "function" ? await p : p;
  const id = resolved?.id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

const ALLOWED_STATUS = new Set(["open", "closed", "cancelled", "archived"]);
const ALLOWED_VIS = new Set(["members", "public"]);
const ALLOWED_TYPE = new Set([
  "Search",
  "Rescue",
  "Assist",
  "Mutual Aid",
  "Recovery",
  "Standby",
  "Other",
]);

export async function GET(_req: Request, ctx: any) {
  const check = await requirePermission("read_all");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);

  if (!id || !isUuid(id)) {
    return NextResponse.json(
      { error: `bad call id: ${id || "(missing)"}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseDb
    .from("calls")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, ctx: any) {
  const check = await requirePermission("manage_calls");
  if (!check.ok) return check.response;

  const id = await getIdFromCtx(ctx);

  if (!id || !isUuid(id)) {
    return NextResponse.json(
      { error: `bad call id: ${id || "(missing)"}` },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));

  // Build a safe update payload (only allow known fields)
  const update: Record<string, any> = {};

  if (body.title !== undefined)
    update.title = body.title ? String(body.title).trim() : null;

  if (body.type !== undefined) {
    const t = body.type ? String(body.type).trim() : "";
    if (!t || !ALLOWED_TYPE.has(t)) {
      return NextResponse.json(
        {
          error:
            "type must be one of: Search, Rescue, Assist, Mutual Aid, Recovery, Standby, Other",
        },
        { status: 400 }
      );
    }
    update.type = t;
  }

  if (body.type_other !== undefined)
    update.type_other = body.type_other ? String(body.type_other).trim() : null;

  if (body.location_text !== undefined)
    update.location_text = body.location_text
      ? String(body.location_text).trim()
      : null;

  if (body.summary !== undefined)
    update.summary = body.summary ? String(body.summary).trim() : null;

  if (body.visibility !== undefined) {
    const v = body.visibility ? String(body.visibility).toLowerCase().trim() : "";
    if (!ALLOWED_VIS.has(v)) {
      return NextResponse.json(
        { error: "visibility must be one of: members, public" },
        { status: 400 }
      );
    }
    update.visibility = v;
  }

  if (body.status !== undefined) {
    const s = body.status ? String(body.status).toLowerCase().trim() : "";
    if (!ALLOWED_STATUS.has(s)) {
      return NextResponse.json(
        { error: "status must be one of: open, closed, cancelled, archived" },
        { status: 400 }
      );
    }
    update.status = s;
  }

  // Optional staging/incident location fields (for future geolocation check-in)
  if (body.incident_lat !== undefined) {
    update.incident_lat =
      body.incident_lat === null || body.incident_lat === ""
        ? null
        : Number(body.incident_lat);
  }
  if (body.incident_lng !== undefined) {
    update.incident_lng =
      body.incident_lng === null || body.incident_lng === ""
        ? null
        : Number(body.incident_lng);
  }
  if (body.incident_radius_m !== undefined) {
    update.incident_radius_m =
      body.incident_radius_m === null || body.incident_radius_m === ""
        ? null
        : Number(body.incident_radius_m);
  }

  // If type is not Other, force type_other to null (keeps data clean)
  if (update.type && update.type !== "Other") {
    update.type_other = null;
  }
  if (update.type === "Other" && update.type_other !== undefined) {
    if (!update.type_other) {
      return NextResponse.json(
        { error: "type_other is required when type = Other" },
        { status: 400 }
      );
    }
  }

  const { data: updated, error: updErr } = await supabaseDb
    .from("calls")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ data: updated });
}
