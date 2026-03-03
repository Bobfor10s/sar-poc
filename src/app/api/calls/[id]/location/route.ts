import { NextResponse } from "next/server";
import { supabaseDb } from "@/lib/supabase/db";
import { requireAuth } from "@/lib/supabase/require-permission";

async function getIdFromCtx(ctx: any): Promise<string> {
  const p = ctx?.params;
  const resolved = p && typeof p.then === "function" ? await p : p;
  const id = resolved?.id;
  if (typeof id === "string") return id;
  if (Array.isArray(id) && typeof id[0] === "string") return id[0];
  return "";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(req: Request, ctx: any) {
  const check = await requireAuth();
  if (!check.ok) return check.response;

  const call_id = await getIdFromCtx(ctx);
  if (!call_id || !isUuid(call_id)) {
    return NextResponse.json({ error: `bad call id: ${call_id || "(missing)"}` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const member_id = String(body.member_id ?? "").trim();
  if (!member_id || !isUuid(member_id)) {
    return NextResponse.json({ error: `bad member id: ${member_id || "(missing)"}` }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng must be finite numbers" }, { status: 400 });
  }

  // Members can only update their own row; manage_calls can update others
  const canManage = check.auth.permissions.includes("manage_calls");
  if (!canManage && check.auth.member?.id !== member_id) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();

  // Update GPS position
  const { error } = await supabaseDb
    .from("call_attendance")
    .update({ current_lat: lat, current_lng: lng, location_updated_at: nowIso })
    .eq("call_id", call_id)
    .eq("member_id", member_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Server-side geofence check — auto-arrive if within radius
  const [{ data: call }, { data: att }] = await Promise.all([
    supabaseDb.from("calls").select("incident_lat, incident_lng, incident_radius_m").eq("id", call_id).single(),
    supabaseDb.from("call_attendance")
      .select("id, time_in, time_out, on_my_way_at")
      .eq("call_id", call_id)
      .eq("member_id", member_id)
      .maybeSingle(),
  ]);

  if (call?.incident_lat && call?.incident_lng && att?.on_my_way_at) {
    // Only auto-arrive if en-route: no time_in yet, or re-engaging after checkout
    const onMyWayMs = new Date(att.on_my_way_at).getTime();
    const timeOutMs = att.time_out ? new Date(att.time_out).getTime() : 0;
    const isEnRoute = !att.time_in || (!!att.time_out && onMyWayMs > timeOutMs);

    if (isEnRoute) {
      const dist = haversineMeters(lat, lng, call.incident_lat, call.incident_lng);
      const radius = call.incident_radius_m ?? 500;

      if (dist <= radius) {
        // Auto check-in: set time_in (first arrival only), clear time_out on re-arrive
        const arriveUpdate: Record<string, string | null> = {};
        if (!att.time_in) arriveUpdate.time_in = nowIso;
        if (att.time_out) arriveUpdate.time_out = null;

        await Promise.all([
          supabaseDb.from("call_attendance").update(arriveUpdate).eq("id", att.id),
          supabaseDb.from("call_attendance_periods").insert({ call_id, member_id, time_in: nowIso }),
        ]);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
