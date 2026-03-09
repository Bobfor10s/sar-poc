"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const CallNavMap = dynamic(() => import("@/components/CallNavMap"), { ssr: false });

type ActiveEvent = {
  type: "call" | "training" | "meeting" | "event";
  id: string;
  title: string | null;
  incident_lat: number | null;
  incident_lng: number | null;
  incident_radius_m: number | null;
  allow_rsvp: boolean;
  allow_early_checkin: boolean;
  early_checkin_minutes: number | null;
  start_dt: string | null;
  my_attendance: { time_in: string | null; time_out: string | null; rsvp_at?: string | null; arrived_at?: string | null; on_my_way_at?: string | null; anticipated_arrival_at?: string | null; prep_time_minutes?: number | null } | null;
};

type UpcomingItem = {
  type: string;
  id: string;
  title: string | null;
  start_dt: string | null;
  location_text: string | null;
  allow_rsvp: boolean;
  allow_early_checkin: boolean;
  early_checkin_minutes: number | null;
  my_rsvp_at: string | null;
  my_arrived_at: string | null;
};

type HistoryItem = {
  type: string;
  activity_id: string;
  title: string | null;
  start_dt: string | null;
  time_in: string | null;
  time_out: string | null;
};

type Stats = {
  window_days: number;
  calls: { attended: number; total: number; pct: number };
  training: { attended: number; total: number; pct: number };
  meetings: { attended: number; total: number; pct: number };
  events: { attended: number; total: number; pct: number };
  required: { attended: number; total: number; pct: number };
  overall: { attended: number; total: number; pct: number };
};

// Haversine distance in meters
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function typeLabel(type: string) {
  if (type === "call") return "Call";
  if (type === "training") return "Training";
  if (type === "meeting") return "Meeting";
  if (type === "event") return "Other";
  return type;
}

function typeBadgeStyle(type: string): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    fontWeight: 700,
    display: "inline-block",
  };
  if (type === "call") return { ...base, background: "#fef9c3", border: "1px solid #ca8a04", color: "#713f12" };
  if (type === "training") return { ...base, background: "#eff6ff", border: "1px solid #3b82f6", color: "#1e3a8a" };
  if (type === "meeting") return { ...base, background: "#f0fdf4", border: "1px solid #22c55e", color: "#14532d" };
  return { ...base, background: "#faf5ff", border: "1px solid #a855f7", color: "#581c87" };
}

function fmtDt(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function attendanceEndpoint(ev: ActiveEvent) {
  if (ev.type === "call") return `/api/calls/${ev.id}/attendance`;
  if (ev.type === "meeting") return `/api/meetings/${ev.id}/attendance`;
  if (ev.type === "event") return `/api/events/${ev.id}/attendance`;
  return null; // training handled separately
}

function upcomingAttendanceEndpoint(item: UpcomingItem) {
  if (item.type === "meeting") return `/api/meetings/${item.id}/attendance`;
  if (item.type === "event") return `/api/events/${item.id}/attendance`;
  return null; // training
}

export default function PortalPage() {
  const router = useRouter();
  const [events, setEvents] = useState<ActiveEvent[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [memberName, setMemberName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [memberStatus, setMemberStatus] = useState<string | null>(null);
  const [isApplicant, setIsApplicant] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // Per-card state: geo error messages, override note state, prep time
  const [cardMsg, setCardMsg] = useState<Record<string, string>>({});
  const [overrideNote, setOverrideNote] = useState<Record<string, string>>({});
  const [showOverride, setShowOverride] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [prepTime, setPrepTime] = useState<Record<string, string>>({});
  const [liveDistM, setLiveDistM] = useState<Record<string, number>>({});
  const [navCall, setNavCall] = useState<ActiveEvent | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchIdRef = useRef<Record<string, number>>({});
  const memberIdRef = useRef<string | null>(null);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    sessionStorage.removeItem("sar-display-name");
    router.push("/login");
  }

  async function loadAll() {
    try {
      const [evRes, upcomingRes, histRes, statsRes, meRes] = await Promise.all([
        fetch("/api/active-events"),
        fetch("/api/upcoming-activities"),
        fetch("/api/activity/history"),
        fetch("/api/activity/stats"),
        fetch("/api/auth/me"),
      ]);
      if (evRes.ok) setEvents(await evRes.json().catch(() => []));
      if (upcomingRes.ok) setUpcoming(await upcomingRes.json().catch(() => []));
      if (histRes.ok) setHistory(await histRes.json().catch(() => []));
      if (statsRes.ok) setStats(await statsRes.json().catch(() => null));
      if (meRes.ok) {
        const me = await meRes.json().catch(() => ({}));
        if (me?.user?.name) setMemberName(me.user.name);
        if (me?.user?.role) setUserRole(me.user.role);
        if (me?.user?.status) setMemberStatus(me.user.status);
        if (me?.user?.is_applicant) setIsApplicant(true);
        if (me?.user?.id) memberIdRef.current = me.user.id;
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("sar-display-name");
      if (stored) setMemberName(stored);
    } catch { /* sessionStorage unavailable in some privacy modes */ }

    loadAll();
    pollRef.current = setInterval(loadAll, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const watches = { ...watchIdRef.current };
      for (const watchId of Object.values(watches)) {
        navigator.geolocation?.clearWatch(watchId);
      }
    };
  }, []);

  function setMsg(id: string, msg: string) {
    setCardMsg((prev) => ({ ...prev, [id]: msg }));
  }

  async function doCheckin(ev: ActiveEvent, action: "arrive" | "clear", overrideNoteText?: string) {
    setBusy((prev) => ({ ...prev, [ev.id]: true }));
    setMsg(ev.id, "");
    try {
      // Fetch auth/me to get current member id (me.user.id IS the member id)
      const meRes = await fetch("/api/auth/me");
      const me = await meRes.json().catch(() => ({}));
      const member_id = me?.user?.id;

      let res: Response;
      if (ev.type === "training") {
        res = await fetch("/api/training-attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ training_session_id: ev.id, member_id, action, status: "attended" }),
        });
      } else {
        const endpoint = attendanceEndpoint(ev);
        const body: Record<string, unknown> = { action, member_id };
        if (overrideNoteText) body.checkin_override_note = overrideNoteText;
        res = await fetch(endpoint!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Check-in failed");

      // Refresh active events to update attendance state
      const evRes = await fetch("/api/active-events");
      if (evRes.ok) setEvents(await evRes.json().catch(() => []));
    } catch (e: any) {
      setMsg(ev.id, e?.message ?? "Error");
    } finally {
      setBusy((prev) => ({ ...prev, [ev.id]: false }));
    }
  }

  async function doPhaseAction(item: UpcomingItem, action: "rsvp" | "early_arrive") {
    const key = `upcoming-${item.id}`;
    setBusy((prev) => ({ ...prev, [key]: true }));
    setMsg(key, "");
    try {
      const meRes = await fetch("/api/auth/me");
      const me = await meRes.json().catch(() => ({}));
      const member_id = me?.user?.id;

      let res: Response;
      if (item.type === "training") {
        res = await fetch("/api/training-attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ training_session_id: item.id, member_id, action, status: "attended" }),
        });
      } else {
        const endpoint = upcomingAttendanceEndpoint(item);
        res = await fetch(endpoint!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, member_id }),
        });
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `${action} failed`);

      // Refresh upcoming activities
      const upcomingRes = await fetch("/api/upcoming-activities");
      if (upcomingRes.ok) setUpcoming(await upcomingRes.json().catch(() => []));
    } catch (e: any) {
      setMsg(key, e?.message ?? "Error");
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleCheckin(ev: ActiveEvent, action: "arrive" | "clear") {
    if (action === "clear") {
      doCheckin(ev, action);
      return;
    }

    // No geofence → check in directly
    if (!ev.incident_lat || !ev.incident_lng) {
      doCheckin(ev, action);
      return;
    }

    // Geofence check
    const radius = ev.incident_radius_m ?? 500;

    if (!navigator.geolocation) {
      // GPS not available → show override
      setShowOverride((prev) => ({ ...prev, [ev.id]: true }));
      setMsg(ev.id, "GPS not available on this device. Enter a note to check in.");
      return;
    }

    setBusy((prev) => ({ ...prev, [ev.id]: true }));
    setMsg(ev.id, "Getting your location…");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineMeters(
          pos.coords.latitude,
          pos.coords.longitude,
          ev.incident_lat!,
          ev.incident_lng!
        );
        setBusy((prev) => ({ ...prev, [ev.id]: false }));
        if (dist <= radius) {
          setMsg(ev.id, "");
          doCheckin(ev, action);
        } else {
          setMsg(ev.id, `You are ${Math.round(dist * 3.281)} ft from the activity site (max ${Math.round(radius * 3.281)} ft). Check-in blocked.`);
        }
      },
      (err) => {
        setBusy((prev) => ({ ...prev, [ev.id]: false }));
        if (err.code === err.PERMISSION_DENIED) {
          setShowOverride((prev) => ({ ...prev, [ev.id]: true }));
          setMsg(ev.id, "GPS access denied. Enter a note to explain your location and check in.");
        } else {
          setShowOverride((prev) => ({ ...prev, [ev.id]: true }));
          setMsg(ev.id, "Could not get your location. Enter a note to check in.");
        }
      },
      { timeout: 10000 }
    );
  }

  async function handleOverrideCheckin(ev: ActiveEvent) {
    const note = overrideNote[ev.id] ?? "";
    if (!note.trim()) {
      setMsg(ev.id, "Please enter a note before checking in.");
      return;
    }
    setShowOverride((prev) => ({ ...prev, [ev.id]: false }));
    setOverrideNote((prev) => ({ ...prev, [ev.id]: "" }));
    doCheckin(ev, "arrive", note.trim());
  }

  function startGpsWatch(ev: ActiveEvent) {
    if (!navigator.geolocation) return;
    if (watchIdRef.current[ev.id] != null) return; // already watching

    const hasGeofence = !!(ev.incident_lat && ev.incident_lng);
    const radius = ev.incident_radius_m ?? 500;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const mid = memberIdRef.current;

        // Send location update (fire-and-forget)
        if (mid) {
          fetch(`/api/calls/${ev.id}/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ member_id: mid, lat, lng }),
          }).catch(() => {});
        }

        // Update live distance display
        if (hasGeofence) {
          const dist = haversineMeters(lat, lng, ev.incident_lat!, ev.incident_lng!);
          setLiveDistM((prev) => ({ ...prev, [ev.id]: dist }));
          if (dist <= radius) {
            navigator.geolocation.clearWatch(watchIdRef.current[ev.id]);
            delete watchIdRef.current[ev.id];
            await doCheckin(ev, "arrive");
          }
        }
      },
      () => {
        setMsg(ev.id, "Could not track location. Use \u2018I\u2019m Here\u2019 when you arrive.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );

    watchIdRef.current[ev.id] = watchId;
  }

  // Auto-restart GPS watch whenever events update and we detect an en-route call
  // without an active watch (e.g. after page reload or browser killed the watch).
  // Also close the nav map if the member has now arrived.
  useEffect(() => {
    for (const ev of events) {
      if (ev.type !== "call") continue;
      const att = ev.my_attendance;

      // Close nav map if this call's member has arrived
      if (navCall && ev.id === navCall.id && att?.time_in) {
        setNavCall(null);
      }

      if (!att?.on_my_way_at) continue;
      const onMyWayMs = new Date(att.on_my_way_at).getTime();
      const timeOutMs = att.time_out ? new Date(att.time_out).getTime() : 0;
      const isEnRoute = !att.time_in || (!!att.time_out && onMyWayMs > timeOutMs);
      if (!isEnRoute) continue;
      startGpsWatch(ev);
    }
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleOnMyWay(ev: ActiveEvent) {
    setBusy((prev) => ({ ...prev, [ev.id]: true }));
    setMsg(ev.id, "");
    try {
      const meRes = await fetch("/api/auth/me");
      const me = await meRes.json().catch(() => ({}));
      const member_id = me?.user?.id;
      if (member_id) memberIdRef.current = member_id;

      const prep_time_minutes = parseInt(prepTime[ev.id] ?? "0", 10) || 0;

      // Try to get current GPS position for ETA calculation (best effort)
      let lat: number | undefined;
      let lng: number | undefined;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch { /* GPS unavailable — proceed without */ }
      }

      const res = await fetch(`/api/calls/${ev.id}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "on_my_way",
          member_id,
          ...(prep_time_minutes > 0 ? { prep_time_minutes } : {}),
          ...(lat !== undefined ? { lat, lng } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed");

      // Refresh active events (the useEffect on events will auto-start the watch)
      const evRes = await fetch("/api/active-events");
      if (evRes.ok) setEvents(await evRes.json().catch(() => []));

      // Open map if call has an incident location
      if (ev.incident_lat && ev.incident_lng) {
        setNavCall(ev);
      } else if (!navigator.geolocation) {
        setMsg(ev.id, "GPS not available \u2014 tracking disabled. Use \u2018I\u2019m Here\u2019 when you arrive.");
      }
    } catch (e: any) {
      setMsg(ev.id, e?.message ?? "Error");
    } finally {
      setBusy((prev) => ({ ...prev, [ev.id]: false }));
    }
  }

  async function handleCancelEnRoute(ev: ActiveEvent) {
    // Stop GPS watch and close map
    if (watchIdRef.current[ev.id] != null) {
      navigator.geolocation?.clearWatch(watchIdRef.current[ev.id]);
      delete watchIdRef.current[ev.id];
    }
    setNavCall(null);
    setLiveDistM((prev) => { const n = { ...prev }; delete n[ev.id]; return n; });
    setBusy((prev) => ({ ...prev, [ev.id]: true }));
    setMsg(ev.id, "");
    try {
      const meRes = await fetch("/api/auth/me");
      const me = await meRes.json().catch(() => ({}));
      const member_id = me?.user?.id;
      const res = await fetch(`/api/calls/${ev.id}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_en_route", member_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      const evRes = await fetch("/api/active-events");
      if (evRes.ok) setEvents(await evRes.json().catch(() => []));
    } catch (e: any) {
      setMsg(ev.id, e?.message ?? "Error");
    } finally {
      setBusy((prev) => ({ ...prev, [ev.id]: false }));
    }
  }

  async function handleImHere(ev: ActiveEvent) {
    // Stop GPS watch
    if (watchIdRef.current[ev.id] != null) {
      navigator.geolocation?.clearWatch(watchIdRef.current[ev.id]);
      delete watchIdRef.current[ev.id];
    }

    // If no geofence, check in directly
    if (!ev.incident_lat || !ev.incident_lng) {
      doCheckin(ev, "arrive");
      return;
    }

    // Enforce geofence — same as handleCheckin
    const radius = ev.incident_radius_m ?? 500;

    if (!navigator.geolocation) {
      setShowOverride((prev) => ({ ...prev, [ev.id]: true }));
      setMsg(ev.id, "GPS not available on this device. Enter a note to check in.");
      return;
    }

    setBusy((prev) => ({ ...prev, [ev.id]: true }));
    setMsg(ev.id, "Getting your location…");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineMeters(
          pos.coords.latitude,
          pos.coords.longitude,
          ev.incident_lat!,
          ev.incident_lng!
        );
        setBusy((prev) => ({ ...prev, [ev.id]: false }));
        if (dist <= radius) {
          setMsg(ev.id, "");
          doCheckin(ev, "arrive");
        } else {
          setMsg(ev.id, `You are ${Math.round(dist * 3.281)} ft from the scene (max ${Math.round(radius * 3.281)} ft). Check-in blocked.`);
        }
      },
      (err) => {
        setBusy((prev) => ({ ...prev, [ev.id]: false }));
        if (err.code === err.PERMISSION_DENIED) {
          setShowOverride((prev) => ({ ...prev, [ev.id]: true }));
          setMsg(ev.id, "GPS access denied. Enter a note to explain your location and check in.");
        } else {
          setShowOverride((prev) => ({ ...prev, [ev.id]: true }));
          setMsg(ev.id, "Could not get your location. Enter a note to check in.");
        }
      },
      { timeout: 10000 }
    );
  }

  return (
    <>
    {navCall && (
      <CallNavMap
        ev={navCall}
        onClose={() => setNavCall(null)}
        onImHere={() => { handleImHere(navCall); setNavCall(null); }}
      />
    )}
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 860 }}>
      {/* Members: full portal header with logout. Admins/viewers: simple heading (Nav handles name + logout) */}
      {userRole === "member" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h1 style={{ margin: 0 }}>{memberName ? `${memberName}'s Portal` : "My Portal"}</h1>
          <button
            onClick={logout}
            disabled={loggingOut}
            style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", cursor: "pointer" }}
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
      {userRole && userRole !== "member" && (
        <h1 style={{ margin: "0 0 16px" }}>My Attendance Status</h1>
      )}

      {loading && <p style={{ opacity: 0.6, fontSize: 14 }}>Loading…</p>}

      {/* Inactive/applicant members: show notice only — no events, stats, history */}
      {!loading && (memberStatus === "inactive" || isApplicant) && (
        <div style={{ padding: "14px 18px", background: "#fef9c3", border: "1px solid #fcd34d", borderRadius: 10, marginBottom: 20, fontSize: 14 }}>
          {isApplicant
            ? <><strong>Your membership application is pending.</strong> You can update your contact information below. Full access will be granted once your membership is approved.</>
            : <><strong>Your membership is currently inactive.</strong> You can still update your contact information below. Full access will be restored when your membership is reactivated.</>
          }
        </div>
      )}

      {!loading && memberStatus !== "inactive" && !isApplicant && <>

      {/* Active Events */}
      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Active Events</h2>
        {events.length === 0 ? (
          <p style={{ opacity: 0.65, fontSize: 14 }}>No active events right now.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {events.map((ev) => {
              const att = ev.my_attendance;
              const onMyWayMs = att?.on_my_way_at ? new Date(att.on_my_way_at).getTime() : 0;
              const timeOutMs  = att?.time_out     ? new Date(att.time_out).getTime()     : 0;

              const preArrived = att && att.arrived_at && !att.time_in;
              const checkedIn  = att && att.time_in && !att.time_out;
              // en-route: on_my_way_at set, AND (no time_in yet OR re-engaging after checkout)
              const enRoute    = ev.type === "call" && att && att.on_my_way_at &&
                                 (!att.time_in || (att.time_out && onMyWayMs > timeOutMs));
              // cleared and not re-engaging
              const clearedOut = att && att.time_in && att.time_out && !enRoute;
              const notIn      = !att || (!att.time_in && !att.arrived_at && !att.on_my_way_at);
              // for calls, also show engage buttons when cleared (multi-day re-engage)
              const showEngage = notIn || (ev.type === "call" && !!clearedOut);
              const msg = cardMsg[ev.id] ?? "";
              const isShowOverride = showOverride[ev.id] ?? false;
              const isBusy = busy[ev.id] ?? false;

              const borderColor = checkedIn ? "#86efac" : enRoute ? "#fcd34d" : "#e5e5e5";
              const bgColor = checkedIn ? "#f0fdf4" : enRoute ? "#fef9c3" : "#fff";

              return (
                <div
                  key={ev.id}
                  style={{
                    padding: "14px 16px",
                    border: `1px solid ${borderColor}`,
                    borderRadius: 12,
                    background: bgColor,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={typeBadgeStyle(ev.type)}>{typeLabel(ev.type)}</span>
                    <strong style={{ fontSize: 15 }}>{ev.title ?? "(Untitled)"}</strong>
                    {ev.incident_lat && ev.incident_lng && (
                      <span style={{ fontSize: 11, opacity: 0.6 }}>
                        Geofenced ({Math.round((ev.incident_radius_m ?? 500) * 3.281)} ft)
                      </span>
                    )}
                  </div>

                  {att?.time_in && (
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                      Checked in: {fmtDt(att.time_in)}
                      {att.time_out ? ` → Out: ${fmtDt(att.time_out)}` : ""}
                    </div>
                  )}

                  {msg && (
                    <div
                      style={{
                        marginBottom: 8,
                        padding: "6px 10px",
                        borderRadius: 8,
                        fontSize: 13,
                        background: msg.includes("blocked") || msg.includes("denied") ? "#fef2f2" : "#fffbeb",
                        border: `1px solid ${msg.includes("blocked") || msg.includes("denied") ? "#fca5a5" : "#fcd34d"}`,
                        color: msg.includes("blocked") || msg.includes("denied") ? "#991b1b" : "#78350f",
                      }}
                    >
                      {msg}
                    </div>
                  )}

                  {isShowOverride && (
                    <div style={{ marginBottom: 8 }}>
                      <textarea
                        value={overrideNote[ev.id] ?? ""}
                        onChange={(e) => setOverrideNote((prev) => ({ ...prev, [ev.id]: e.target.value }))}
                        placeholder="Explain why GPS is unavailable (required)…"
                        rows={2}
                        style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, resize: "vertical" }}
                      />
                      <button
                        onClick={() => handleOverrideCheckin(ev)}
                        disabled={isBusy || !(overrideNote[ev.id] ?? "").trim()}
                        style={{ marginTop: 6, padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, cursor: "pointer" }}
                      >
                        Check In with Note
                      </button>
                    </div>
                  )}

                  {/* Prep time input — shown for calls before member goes en route */}
                  {ev.type === "call" && showEngage && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <label style={{ fontSize: 12, opacity: 0.7, whiteSpace: "nowrap" }}>Prep time (min):</label>
                      <input
                        type="number"
                        min="0"
                        max="120"
                        value={prepTime[ev.id] ?? ""}
                        onChange={(e) => setPrepTime((prev) => ({ ...prev, [ev.id]: e.target.value }))}
                        placeholder="0"
                        style={{ width: 64, padding: "4px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
                      />
                      <span style={{ fontSize: 11, opacity: 0.55 }}>added to travel ETA</span>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {preArrived && (
                      <span style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #fbbf24", background: "#fef9c3", color: "#92400e", fontWeight: 600, fontSize: 13 }}>
                        Pre-Arrived — awaiting official check-in
                      </span>
                    )}
                    {enRoute && !checkedIn && (
                      <>
                        <span style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #f59e0b", background: "#fef3c7", color: "#92400e", fontWeight: 600, fontSize: 13 }}>
                          En Route
                          {liveDistM[ev.id] != null ? ` · ${liveDistM[ev.id] < 161 ? `${Math.round(liveDistM[ev.id] * 3.281)} ft` : `${(liveDistM[ev.id] / 1609.34).toFixed(1)} mi`}` : ""}
                          {att?.anticipated_arrival_at ? ` · ETA ${new Date(att.anticipated_arrival_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                        </span>
                        <button
                          onClick={() => handleImHere(ev)}
                          disabled={isBusy}
                          style={{
                            padding: "7px 16px",
                            borderRadius: 8,
                            border: "1px solid #16a34a",
                            background: "#dcfce7",
                            color: "#15803d",
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          {isBusy ? "…" : "I\u2019m Here"}
                        </button>
                        {ev.incident_lat && ev.incident_lng && (
                          <button
                            onClick={() => setNavCall(ev)}
                            style={{
                              padding: "7px 16px",
                              borderRadius: 8,
                              border: "1px solid #3b82f6",
                              background: "#eff6ff",
                              color: "#1e40af",
                              fontWeight: 600,
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            View Map
                          </button>
                        )}
                        <button
                          onClick={() => handleCancelEnRoute(ev)}
                          disabled={isBusy}
                          style={{
                            padding: "7px 16px",
                            borderRadius: 8,
                            border: "1px solid #cbd5e1",
                            background: "#f8fafc",
                            color: "#64748b",
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          Cancel En Route
                        </button>
                      </>
                    )}
                    {showEngage && !isShowOverride && (
                      <>
                        {ev.type === "call" && (
                          <button
                            onClick={() => handleOnMyWay(ev)}
                            disabled={isBusy}
                            style={{
                              padding: "7px 16px",
                              borderRadius: 8,
                              border: "1px solid #d97706",
                              background: "#fef3c7",
                              color: "#92400e",
                              fontWeight: 600,
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            {isBusy ? "…" : "On My Way"}
                          </button>
                        )}
                        <button
                          onClick={() => handleCheckin(ev, "arrive")}
                          disabled={isBusy}
                          style={{
                            padding: "7px 16px",
                            borderRadius: 8,
                            border: "1px solid #16a34a",
                            background: "#dcfce7",
                            color: "#15803d",
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          {isBusy ? "…" : "Check In"}
                        </button>
                      </>
                    )}
                    {checkedIn && (
                      <>
                        <span
                          style={{
                            padding: "7px 14px",
                            borderRadius: 8,
                            border: "1px solid #86efac",
                            background: "#dcfce7",
                            color: "#15803d",
                            fontWeight: 600,
                            fontSize: 13,
                          }}
                        >
                          Checked In ✓
                        </span>
                        <button
                          onClick={() => handleCheckin(ev, "clear")}
                          disabled={isBusy}
                          style={{
                            padding: "7px 14px",
                            borderRadius: 8,
                            border: "1px solid #ddd",
                            background: "#f9fafb",
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          {isBusy ? "…" : "Check Out"}
                        </button>
                      </>
                    )}
                    {clearedOut && ev.type !== "call" && (
                      <span style={{ fontSize: 13, opacity: 0.6 }}>Checked out</span>
                    )}
                    {clearedOut && ev.type === "call" && (
                      <span style={{ fontSize: 12, opacity: 0.6 }}>
                        Last: {fmtDt(att!.time_in)} → {fmtDt(att!.time_out)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Scheduled */}
      {upcoming.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Scheduled</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map((item) => {
              const key = `upcoming-${item.id}`;
              const isBusy = busy[key] ?? false;
              const errMsg = cardMsg[key] ?? "";
              const now = new Date();
              const startDt = item.start_dt ? new Date(item.start_dt) : null;
              const withinEarlyWindow =
                item.allow_early_checkin &&
                item.early_checkin_minutes != null &&
                startDt != null &&
                now >= new Date(startDt.getTime() - item.early_checkin_minutes * 60 * 1000) &&
                now < startDt;

              return (
                <div
                  key={key}
                  style={{
                    padding: "10px 14px",
                    border: `1px solid ${item.my_rsvp_at ? "#86efac" : "#e5e5e5"}`,
                    borderRadius: 10,
                    background: item.my_rsvp_at ? "#f0fdf4" : "#fff",
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={typeBadgeStyle(item.type)}>{typeLabel(item.type)}</span>
                    <strong style={{ fontSize: 14 }}>{item.title ?? "(Untitled)"}</strong>
                    {item.start_dt && (
                      <span style={{ fontSize: 12, opacity: 0.65 }}>{fmtDt(item.start_dt)}</span>
                    )}
                    {item.location_text && (
                      <span style={{ fontSize: 12, opacity: 0.65 }}>• {item.location_text}</span>
                    )}
                  </div>

                  {errMsg && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>{errMsg}</div>
                  )}

                  {(item.allow_rsvp || withinEarlyWindow) && (
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      {item.allow_rsvp && (
                        item.my_rsvp_at ? (
                          <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "#dcfce7", border: "1px solid #86efac", color: "#15803d", fontWeight: 600 }}>
                            RSVP'd ✓
                          </span>
                        ) : (
                          <button
                            onClick={() => doPhaseAction(item, "rsvp")}
                            disabled={isBusy}
                            style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid #22c55e", background: "#f0fdf4", color: "#15803d", fontWeight: 600, cursor: "pointer" }}
                          >
                            {isBusy ? "…" : "RSVP"}
                          </button>
                        )
                      )}
                      {withinEarlyWindow && (
                        item.my_arrived_at ? (
                          <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "#fef9c3", border: "1px solid #fbbf24", color: "#92400e", fontWeight: 600 }}>
                            Arrived ✓ — awaiting official check-in
                          </span>
                        ) : (
                          <button
                            onClick={() => doPhaseAction(item, "early_arrive")}
                            disabled={isBusy}
                            style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid #f59e0b", background: "#fffbeb", color: "#92400e", fontWeight: 600, cursor: "pointer" }}
                          >
                            {isBusy ? "…" : "I've Arrived"}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Stats */}
      {stats && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>
            Attendance Stats
            <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.65, marginLeft: 8 }}>
              (last {stats.window_days} days)
            </span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {(["calls", "training", "meetings", "events", "required", "overall"] as const).map((cat) => {
              const s = stats[cat];
              const label = cat === "overall" ? "Overall (w/ Other)" : cat === "required" ? "Overall" : cat === "events" ? "Other" : cat.charAt(0).toUpperCase() + cat.slice(1);
              return (
                <div
                  key={cat}
                  style={{
                    padding: "12px 14px",
                    border: `1px solid ${cat === "required" || cat === "overall" ? "#94a3b8" : "#e5e5e5"}`,
                    borderRadius: 10,
                    background: cat === "required" || cat === "overall" ? "#f8fafc" : "#fff",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{s.pct}%</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    {s.attended}/{s.total}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      height: 4,
                      borderRadius: 2,
                      background: "#e5e7eb",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${s.pct}%`,
                        background: s.pct >= 75 ? "#22c55e" : s.pct >= 50 ? "#f59e0b" : "#ef4444",
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      </>}

      {/* My Profile — always visible regardless of status */}
      {!loading && <ProfileSection />}

      {/* Activity History — active approved members only */}
      {!loading && memberStatus !== "inactive" && !isApplicant && (
      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Activity History</h2>
        {history.length === 0 ? (
          <p style={{ opacity: 0.65, fontSize: 14 }}>No activity records found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Title</th>
                  <th style={thStyle}>Time In</th>
                  <th style={thStyle}>Time Out</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, i) => (
                  <tr key={`${item.type}-${item.activity_id}-${i}`}>
                    <td style={tdStyle}>{item.start_dt ? new Date(item.start_dt).toLocaleDateString() : "—"}</td>
                    <td style={tdStyle}>
                      <span style={typeBadgeStyle(item.type)}>{typeLabel(item.type)}</span>
                    </td>
                    <td style={tdStyle}>{item.title ?? "—"}</td>
                    <td style={tdStyle}>{item.time_in ? new Date(item.time_in).toLocaleTimeString() : "—"}</td>
                    <td style={tdStyle}>{item.time_out ? new Date(item.time_out).toLocaleTimeString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </main>
    </>
  );
}

function ProfileSection() {
  const [member, setMember] = useState<Record<string, string> | null>(null);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(async (me) => {
        const id = me?.user?.id;
        if (!id) return;
        const res = await fetch(`/api/members/${id}`);
        if (!res.ok) return;
        const json = await res.json();
        const m = json?.data ?? {};
        setMember(m);
        setForm({
          phone: m.phone ?? "",
          street_address: m.street_address ?? "",
          street_address_2: m.street_address_2 ?? "",
          city: m.city ?? "",
          state: m.state ?? "",
          postal_code: m.postal_code ?? "",
          emergency_contact_name: m.emergency_contact_name ?? "",
          emergency_contact_phone: m.emergency_contact_phone ?? "",
          emergency_contact_relationship: m.emergency_contact_relationship ?? "",
        });
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!member || !form) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Save failed"); return; }
      setMember(json?.data ?? member);
      setMsg("Saved.");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!member || !form) return null;

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: open ? 16 : 0 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>My Profile</h2>
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setMsg(""); }}
          style={{ fontSize: 13, padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd", background: "#f8fafc", cursor: "pointer" }}
        >
          {open ? "Cancel" : "Edit"}
        </button>
      </div>

      {!open && (
        <div style={{ fontSize: 13, color: "#374151", display: "grid", gap: 4, marginTop: 8 }}>
          <div><strong>Email:</strong> {member.email ?? "—"}</div>
          <div><strong>Phone:</strong> {member.phone ?? "—"}</div>
          <div><strong>Address:</strong> {[member.street_address, member.street_address_2, member.city, member.state, member.postal_code].filter(Boolean).join(", ") || "—"}</div>
          <div><strong>Emergency contact:</strong> {member.emergency_contact_name ?? "—"}{member.emergency_contact_phone ? ` · ${member.emergency_contact_phone}` : ""}{member.emergency_contact_relationship ? ` (${member.emergency_contact_relationship})` : ""}</div>
        </div>
      )}

      {open && (
        <form onSubmit={save} style={{ display: "grid", gap: 10, maxWidth: 480 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#64748b" }}>Email (contact admin to change)</div>
            <input value={member.email ?? ""} disabled style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#f1f5f9", color: "#94a3b8", fontSize: 13 }} />
          </div>
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
          <div style={{ fontWeight: 600, fontSize: 13 }}>Address</div>
          <input placeholder="Street address" value={form.street_address} onChange={(e) => setForm({ ...form, street_address: e.target.value })} style={inputStyle} />
          <input placeholder="Apt / Unit (optional)" value={form.street_address_2} onChange={(e) => setForm({ ...form, street_address_2: e.target.value })} style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 0.5fr 0.7fr", gap: 8 }}>
            <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inputStyle} />
            <input placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} style={inputStyle} />
            <input placeholder="ZIP" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>Emergency Contact</div>
          <input placeholder="Name" value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="Phone" value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} style={inputStyle} />
            <input placeholder="Relationship" value={form.emergency_contact_relationship} onChange={(e) => setForm({ ...form, emergency_contact_relationship: e.target.value })} style={inputStyle} />
          </div>
          {msg && <div style={{ fontSize: 13, color: msg === "Saved." ? "#15803d" : "#b91c1c" }}>{msg}</div>}
          <button type="submit" disabled={saving} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #3b82f6", background: "#eff6ff", color: "#1e40af", fontWeight: 600, fontSize: 13, cursor: "pointer", alignSelf: "flex-start" }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #ddd",
  fontSize: 12,
  opacity: 0.85,
  background: "#fafafa",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #eee",
  verticalAlign: "middle",
};
