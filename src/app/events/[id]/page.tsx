"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type AttendanceRow = {
  id: string;
  member_id: string;
  time_in: string | null;
  time_out: string | null;
  rsvp_at: string | null;
  arrived_at: string | null;
  members: { first_name: string; last_name: string } | null;
};

type EventDetail = {
  id: string;
  title: string;
  start_dt?: string | null;
  end_dt?: string | null;
  location_text?: string | null;
  description?: string | null;
  status?: string | null;
  created_at?: string | null;
  allow_rsvp?: boolean;
  allow_early_checkin?: boolean;
  early_checkin_minutes?: number | null;
};

function computeStatus(e: EventDetail): "scheduled" | "open" | "closed" {
  const now = new Date();
  const start = e.start_dt ? new Date(e.start_dt) : null;
  const end = e.end_dt ? new Date(e.end_dt) : null;
  if (!start || now < start) return "scheduled";
  if (!end || now < end) return "open";
  return "closed";
}

const statusChip: Record<string, React.CSSProperties> = {
  scheduled: { background: "#eff6ff", borderColor: "#3b82f6", color: "#1e40af" },
  open:      { background: "#f0fdf4", borderColor: "#22c55e", color: "#15803d", fontWeight: 700 },
  closed:    { background: "#f4f4f4", borderColor: "#d1d5db", color: "#6b7280" },
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function toLocalInputValue(dt?: string | null) {
  if (!dt) return "";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(v: string) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();

  const eventId =
    typeof (params as any)?.id === "string"
      ? (params as any).id
      : Array.isArray((params as any)?.id)
      ? (params as any).id[0]
      : "";

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);

  async function load() {
    if (!eventId || !isUuid(eventId)) { setMsg(`Bad event id: ${eventId || "(missing)"}`); setLoading(false); return; }
    setLoading(true);
    setMsg("");
    const res = await fetch(`/api/events/${eventId}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(json?.error ?? "Failed to load event"); setLoading(false); return; }
    const ev = json?.data ?? null;
    setEvent(ev);
    setStartLocal(toLocalInputValue(ev?.start_dt));
    setEndLocal(toLocalInputValue(ev?.end_dt));

    const attRes = await fetch(`/api/events/${eventId}/attendance`);
    if (attRes.ok) setAttendance(await attRes.json().catch(() => []));

    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => setCanEdit(json?.user?.role !== "viewer"))
      .catch(() => {});
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!event) return;
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: event.title,
        start_dt: localInputToIso(startLocal),
        end_dt: endLocal ? localInputToIso(endLocal) : null,
        location_text: event.location_text ?? null,
        description: event.description ?? null,
        allow_rsvp: !!event.allow_rsvp,
        allow_early_checkin: !!event.allow_early_checkin,
        early_checkin_minutes: event.allow_early_checkin ? (event.early_checkin_minutes ?? null) : null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(json?.error ?? "Save failed"); setBusy(false); return; }
    const ev = json.data ?? null;
    setEvent(ev);
    setStartLocal(toLocalInputValue(ev?.start_dt));
    setEndLocal(toLocalInputValue(ev?.end_dt));
    setMsg("Saved.");
    setBusy(false);
  }

  async function patchNow(field: "start_dt" | "end_dt") {
    if (!event) return;
    setBusy(true);
    setMsg("");
    const now = new Date().toISOString();
    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: now }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(json?.error ?? "Failed"); setBusy(false); return; }
    const ev = json.data ?? null;
    setEvent(ev);
    setStartLocal(toLocalInputValue(ev?.start_dt));
    setEndLocal(toLocalInputValue(ev?.end_dt));
    const attRes = await fetch(`/api/events/${event.id}/attendance`);
    if (attRes.ok) setAttendance(await attRes.json().catch(() => []));
    setBusy(false);
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</main>;
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <p style={{ margin: "0 0 4px" }}><a href="/events" style={{ color: "#2563eb", textDecoration: "none", fontSize: 13 }}>← Back to Events</a></p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>{event?.title ?? "Event"}</h1>
        {event && (() => {
          const st = computeStatus(event);
          return (
            <span style={{ fontSize: 13, padding: "3px 10px", border: "1px solid #ddd", borderRadius: 999, ...statusChip[st] }}>
              {st.charAt(0).toUpperCase() + st.slice(1)}
            </span>
          );
        })()}
        <button type="button" onClick={load} disabled={busy} style={{ marginLeft: "auto" }}>
          Refresh
        </button>
      </div>

      {/* Quick-action buttons */}
      {canEdit && event && (() => {
        const st = computeStatus(event);
        return (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {st === "scheduled" && (
              <button
                type="button"
                onClick={() => patchNow("start_dt")}
                disabled={busy}
                style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #22c55e", background: "#f0fdf4", color: "#15803d", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                Open Event
              </button>
            )}
            {st === "open" && (
              <button
                type="button"
                onClick={() => patchNow("end_dt")}
                disabled={busy}
                style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f4f4f4", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                Close Event
              </button>
            )}
          </div>
        );
      })()}

      {msg && (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>{msg}</div>
      )}

      {!event ? (
        <p style={{ opacity: 0.7, marginTop: 12 }}>Event not found.</p>
      ) : (
        <>
          <section style={sectionStyle}>
            <h2 style={h2}>Event Info</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Title">
                <input style={inputStyle} value={event.title ?? ""} onChange={(e) => setEvent({ ...event, title: e.target.value })} placeholder="Event title" readOnly={!canEdit} />
              </Field>

              <Field label="Start">
                <input style={inputStyle} type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} readOnly={!canEdit} />
              </Field>

              <Field label="End">
                <input style={inputStyle} type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} readOnly={!canEdit} />
              </Field>

              <Field label="Location">
                <input style={inputStyle} value={event.location_text ?? ""} onChange={(e) => setEvent({ ...event, location_text: e.target.value })} placeholder="Park / Venue / Town" readOnly={!canEdit} />
              </Field>

              <div style={{ gridColumn: "1 / -1" }}>
                <Field label="Description">
                  <input style={inputStyle} value={event.description ?? ""} onChange={(e) => setEvent({ ...event, description: e.target.value })} placeholder="Short description" readOnly={!canEdit} />
                </Field>
              </div>

              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", border: "1px solid #e5e5e5", borderRadius: 8, background: "#fafafa" }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Attendance Options</div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: canEdit ? "pointer" : "default" }}>
                  <input type="checkbox" checked={!!event.allow_rsvp} onChange={(e) => canEdit && setEvent({ ...event, allow_rsvp: e.target.checked })} disabled={!canEdit} />
                  Allow RSVP
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: canEdit ? "pointer" : "default" }}>
                  <input type="checkbox" checked={!!event.allow_early_checkin} onChange={(e) => canEdit && setEvent({ ...event, allow_early_checkin: e.target.checked, early_checkin_minutes: e.target.checked ? (event.early_checkin_minutes ?? 30) : null })} disabled={!canEdit} />
                  Allow Early Check-In
                </label>
                {event.allow_early_checkin && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginLeft: 24 }}>
                    <input
                      type="number"
                      min={5}
                      style={{ ...inputStyle, width: 80 }}
                      value={event.early_checkin_minutes ?? ""}
                      onChange={(e) => canEdit && setEvent({ ...event, early_checkin_minutes: e.target.value ? Number(e.target.value) : null })}
                      readOnly={!canEdit}
                    />
                    <span style={{ opacity: 0.7 }}>minutes before start</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              {canEdit && (
                <button
                  type="button"
                  onClick={save}
                  disabled={busy || !String(event.title ?? "").trim()}
                  style={{ padding: "8px 20px", background: busy ? "#94a3b8" : "#1e40af", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer" }}
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              )}
              <button type="button" onClick={() => router.push("/events")} disabled={busy} style={{ padding: "8px 20px", background: "#f1f5f9", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                Done
              </button>
            </div>
          </section>

          {/* Attendance list */}
          <section style={{ ...sectionStyle, marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <h2 style={{ ...h2, margin: 0 }}>Attendance ({attendance.length})</h2>
              {canEdit && attendance.some((a) => a.arrived_at && !a.time_in) && (
                <button
                  type="button"
                  onClick={async () => {
                    setBusy(true);
                    const meRes = await fetch("/api/auth/me");
                    const me = await meRes.json().catch(() => ({}));
                    const member_id = me?.user?.id ?? "";
                    const res = await fetch(`/api/events/${event!.id}/attendance`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "official", member_id }),
                    });
                    if (res.ok) {
                      const updated = await res.json().catch(() => []);
                      setAttendance(updated);
                    }
                    setBusy(false);
                  }}
                  disabled={busy}
                  style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid #f59e0b", background: "#fffbeb", color: "#92400e", fontWeight: 600, cursor: "pointer" }}
                >
                  Officially Check In All Arrived
                </button>
              )}
            </div>
            {attendance.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, opacity: 0.65 }}>No check-ins yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Member</th>
                    <th style={thStyle}>Phase</th>
                    <th style={thStyle}>Time In</th>
                    <th style={thStyle}>Time Out</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((a) => {
                    const name = a.members
                      ? `${a.members.last_name}, ${a.members.first_name}`
                      : a.member_id;
                    let phase = "—";
                    if (a.time_out) phase = "Checked Out";
                    else if (a.time_in) phase = "Checked In";
                    else if (a.arrived_at) phase = "Arrived";
                    else if (a.rsvp_at) phase = "RSVP'd";
                    return (
                      <tr key={a.id}>
                        <td style={tdStyle}>{name}</td>
                        <td style={tdStyle}>{phase}</td>
                        <td style={tdStyle}>{a.time_in ? new Date(a.time_in).toLocaleTimeString() : "—"}</td>
                        <td style={tdStyle}>{a.time_out ? new Date(a.time_out).toLocaleTimeString() : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 12 }}>
            <div><strong>ID:</strong> {event.id}</div>
            {event.created_at ? <div><strong>Created:</strong> {new Date(event.created_at).toLocaleString()}</div> : null}
          </div>
        </>
      )}
    </main>
  );
}

const sectionStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 16,
  border: "1px solid #e5e5e5",
  borderRadius: 10,
};

const h2: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  fontSize: 16,
  fontWeight: 700,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  opacity: 0.8,
};

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 13,
  width: "100%",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 10px",
  borderBottom: "1px solid #ddd",
  fontSize: 12,
  opacity: 0.8,
  background: "#fafafa",
};

const tdStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderBottom: "1px solid #eee",
  verticalAlign: "middle",
};
