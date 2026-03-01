"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type EventDetail = {
  id: string;
  title: string;
  start_dt?: string | null;
  end_dt?: string | null;
  location_text?: string | null;
  description?: string | null;
  status?: string | null;
  created_at?: string | null;
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
    setLoading(false);
  }

  useEffect(() => { load(); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

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
        status: event.status ?? "scheduled",
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(json?.error ?? "Save failed"); setBusy(false); return; }
    setEvent(json.data ?? null);
    setMsg("Saved.");
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
        <button type="button" onClick={load} disabled={busy} style={{ marginLeft: "auto" }}>
          Refresh
        </button>
      </div>

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
                <input style={inputStyle} value={event.title ?? ""} onChange={(e) => setEvent({ ...event, title: e.target.value })} placeholder="Event title" />
              </Field>

              <Field label="Status">
                <select style={inputStyle} value={(event.status ?? "scheduled").toLowerCase()} onChange={(e) => setEvent({ ...event, status: e.target.value })}>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>

              <Field label="Start">
                <input style={inputStyle} type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
              </Field>

              <Field label="End">
                <input style={inputStyle} type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} />
              </Field>

              <Field label="Location">
                <input style={inputStyle} value={event.location_text ?? ""} onChange={(e) => setEvent({ ...event, location_text: e.target.value })} placeholder="Park / Venue / Town" />
              </Field>

              <div style={{ gridColumn: "1 / -1" }}>
                <Field label="Description">
                  <input style={inputStyle} value={event.description ?? ""} onChange={(e) => setEvent({ ...event, description: e.target.value })} placeholder="Short description" />
                </Field>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                type="button"
                onClick={save}
                disabled={busy || !String(event.title ?? "").trim()}
                style={{ padding: "8px 20px", background: busy ? "#94a3b8" : "#1e40af", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer" }}
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => router.push("/events")} disabled={busy} style={{ padding: "8px 20px", background: "#f1f5f9", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                Done
              </button>
            </div>
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
