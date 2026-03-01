"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type EventRow = {
  id: string;
  title: string;
  start_dt?: string | null;
  location_text?: string | null;
  status?: string | null;
  is_test?: boolean | null;
};

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function chipStyle(status: string): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 12,
    padding: "2px 8px",
    border: "1px solid #ddd",
    borderRadius: 999,
    display: "inline-block",
  };
  if (status === "scheduled") return { ...base, background: "#166534", borderColor: "#14532d", color: "#fff" };
  if (status === "completed") return { ...base, background: "#cffafe", borderColor: "#22d3ee" };
  if (status === "cancelled") return { ...base, background: "#fff6f2", borderColor: "#fb923c" };
  if (status === "archived") return { ...base, background: "#f4f4f4", opacity: 0.8 };
  return base;
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/events");
    const json = await res.json().catch(() => []);
    setEvents(Array.isArray(json) ? json : (json?.data ?? []));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    return events.filter((e) => {
      const st = (e.status ?? "scheduled").toLowerCase();
      if (!showArchived && st === "archived") return false;
      return true;
    });
  }, [events, showArchived]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Events</h1>
        <Link
          href="/events/new"
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            border: "1px solid #ddd",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 14,
            display: "inline-block",
          }}
        >
          + Add Event
        </Link>
      </div>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <button type="button" onClick={load} style={{ marginLeft: "auto", fontSize: 13 }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ opacity: 0.7, marginTop: 16 }}>Loading…</p>
      ) : visible.length === 0 ? (
        <p style={{ opacity: 0.7, marginTop: 16 }}>No events yet.</p>
      ) : (
        <ul style={{ marginTop: 16, listStyle: "none", padding: 0 }}>
          {visible.map((ev) => {
            const status = (ev.status ?? "scheduled").toLowerCase();
            return (
              <li
                key={ev.id}
                style={{
                  marginBottom: 8,
                  padding: "10px 14px",
                  border: "1px solid #e5e5e5",
                  borderRadius: 10,
                  background: "#ffffff",
                }}
              >
                <Link href={`/events/${ev.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, opacity: 0.75, minWidth: 140 }}>
                      {ev.start_dt ? fmtDate(ev.start_dt) : "—"}
                    </div>
                    <div style={{ fontWeight: 600, flex: 1 }}>{ev.title}</div>
                    {ev.location_text ? <div style={{ fontSize: 13, opacity: 0.7 }}>{ev.location_text}</div> : null}
                    <div>
                      <span style={chipStyle(status)}>{status}</span>
                      {ev.is_test ? (
                        <span style={{ marginLeft: 6, fontSize: 12, padding: "2px 8px", border: "1px solid #f472b6", borderRadius: 999, background: "#fce7f3" }}>
                          TEST
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
