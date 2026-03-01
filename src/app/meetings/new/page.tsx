"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function combineDateTimeToIso(dateStr: string, timeStr: string) {
  if (!dateStr || !timeStr) return null;
  const dt = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export default function NewMeetingPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    start_date: "",
    start_hour: "19",
    start_minute: "00",
    end_hour: "",
    end_minute: "",
    location_text: "",
    agenda: "",
    notes: "",
    visibility: "members",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const start_dt = combineDateTimeToIso(form.start_date, `${form.start_hour}:${form.start_minute}`);
    const end_dt = form.end_hour
      ? combineDateTimeToIso(form.start_date, `${form.end_hour}:${form.end_minute || "00"}`)
      : null;

    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        start_dt: start_dt ?? undefined,
        end_dt,
        location_text: form.location_text ? form.location_text.trim() : null,
        agenda: form.agenda ? form.agenda.trim() : null,
        notes: form.notes ? form.notes.trim() : null,
        visibility: form.visibility,
      }),
    });

    const json = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(json?.error ?? "Create failed");
      return;
    }

    router.push(`/meetings/${json.id}`);
  }

  const inputStyle = {
    padding: "8px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box" as const,
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 600 }}>
      <a href="/meetings" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}>← Back to Meetings</a>
      <h1 style={{ margin: "12px 0 24px" }}>Add Meeting</h1>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Title *</label>
          <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Monthly Team Meeting" required />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Date *</label>
          <input style={inputStyle} type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Start Time</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select style={{ ...inputStyle, width: "auto" }} value={form.start_hour} onChange={(e) => setForm({ ...form, start_hour: e.target.value })}>
              {Array.from({ length: 24 }, (_, i) => pad2(i)).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span>:</span>
            <select style={{ ...inputStyle, width: "auto" }} value={form.start_minute} onChange={(e) => setForm({ ...form, start_minute: e.target.value })}>
              {Array.from({ length: 60 }, (_, i) => pad2(i)).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>End Time (optional)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select style={{ ...inputStyle, width: "auto" }} value={form.end_hour} onChange={(e) => setForm({ ...form, end_hour: e.target.value })}>
              <option value="">(none)</option>
              {Array.from({ length: 24 }, (_, i) => pad2(i)).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span>:</span>
            <select style={{ ...inputStyle, width: "auto" }} value={form.end_minute} onChange={(e) => setForm({ ...form, end_minute: e.target.value })} disabled={!form.end_hour}>
              <option value="">(none)</option>
              {Array.from({ length: 60 }, (_, i) => pad2(i)).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Location</label>
          <input style={inputStyle} value={form.location_text} onChange={(e) => setForm({ ...form, location_text: e.target.value })} placeholder="Station / Firehouse / Zoom" />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Agenda</label>
          <input style={inputStyle} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} placeholder="Short agenda" />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Notes</label>
          <input style={inputStyle} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Short notes" />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Visibility</label>
          <select style={{ ...inputStyle, width: "auto" }} value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
            <option value="members">Members</option>
            <option value="public">Public</option>
          </select>
        </div>

        {error && (
          <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 13, color: "#b91c1c" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            disabled={busy || !form.title.trim() || !form.start_date}
            style={{ padding: "10px 24px", background: busy ? "#94a3b8" : "#1e40af", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer" }}
          >
            {busy ? "Creating…" : "Create Meeting"}
          </button>
          <button type="button" onClick={() => router.push("/meetings")} style={{ padding: "10px 24px", background: "#f1f5f9", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
