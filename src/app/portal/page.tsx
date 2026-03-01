"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ActiveEvent = {
  type: "call" | "training" | "meeting" | "event";
  id: string;
  title: string | null;
  incident_lat: number | null;
  incident_lng: number | null;
  incident_radius_m: number | null;
  my_attendance: { time_in: string | null; time_out: string | null } | null;
};

type UpcomingItem = {
  type: string;
  id: string;
  title: string | null;
  start_dt: string | null;
  location_text: string | null;
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
  if (type === "event") return "Event";
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
  return `/api/events/${ev.id}/attendance`;
}

export default function PortalPage() {
  const router = useRouter();
  const [events, setEvents] = useState<ActiveEvent[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [memberName, setMemberName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // Per-card state: geo error messages, override note state
  const [cardMsg, setCardMsg] = useState<Record<string, string>>({});
  const [overrideNote, setOverrideNote] = useState<Record<string, string>>({});
  const [showOverride, setShowOverride] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Show stored name immediately while the API call resolves
    const stored = sessionStorage.getItem("sar-display-name");
    if (stored) setMemberName(stored);

    loadAll();
    pollRef.current = setInterval(loadAll, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        res = await fetch(endpoint, {
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
          setMsg(ev.id, `You are ${Math.round(dist)} m from the activity site (max ${radius} m). Check-in blocked.`);
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

  if (loading) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</main>;
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 860 }}>
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

      {/* Active Events */}
      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Active Events</h2>
        {events.length === 0 ? (
          <p style={{ opacity: 0.65, fontSize: 14 }}>No active events right now.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {events.map((ev) => {
              const att = ev.my_attendance;
              const checkedIn = att && att.time_in && !att.time_out;
              const clearedOut = att && att.time_in && att.time_out;
              const notIn = !att || !att.time_in;
              const msg = cardMsg[ev.id] ?? "";
              const isShowOverride = showOverride[ev.id] ?? false;
              const isBusy = busy[ev.id] ?? false;

              return (
                <div
                  key={ev.id}
                  style={{
                    padding: "14px 16px",
                    border: `1px solid ${checkedIn ? "#86efac" : "#e5e5e5"}`,
                    borderRadius: 12,
                    background: checkedIn ? "#f0fdf4" : "#fff",
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={typeBadgeStyle(ev.type)}>{typeLabel(ev.type)}</span>
                    <strong style={{ fontSize: 15 }}>{ev.title ?? "(Untitled)"}</strong>
                    {ev.incident_lat && ev.incident_lng && (
                      <span style={{ fontSize: 11, opacity: 0.6 }}>
                        Geofenced ({ev.incident_radius_m ?? 500} m)
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

                  <div style={{ display: "flex", gap: 8 }}>
                    {notIn && !isShowOverride && (
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
                    {clearedOut && (
                      <span style={{ fontSize: 13, opacity: 0.6 }}>Checked out</span>
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
            {upcoming.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                style={{
                  padding: "10px 14px",
                  border: "1px solid #e5e5e5",
                  borderRadius: 10,
                  background: "#fff",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={typeBadgeStyle(item.type)}>{typeLabel(item.type)}</span>
                <strong style={{ fontSize: 14 }}>{item.title ?? "(Untitled)"}</strong>
                {item.start_dt && (
                  <span style={{ fontSize: 12, opacity: 0.65 }}>{fmtDt(item.start_dt)}</span>
                )}
                {item.location_text && (
                  <span style={{ fontSize: 12, opacity: 0.65 }}>• {item.location_text}</span>
                )}
              </div>
            ))}
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
            {(["calls", "training", "meetings", "events", "overall"] as const).map((cat) => {
              const s = stats[cat];
              const label = cat === "overall" ? "Overall" : cat.charAt(0).toUpperCase() + cat.slice(1);
              return (
                <div
                  key={cat}
                  style={{
                    padding: "12px 14px",
                    border: `1px solid ${cat === "overall" ? "#94a3b8" : "#e5e5e5"}`,
                    borderRadius: 10,
                    background: cat === "overall" ? "#f8fafc" : "#fff",
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

      {/* Activity History */}
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
    </main>
  );
}

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
