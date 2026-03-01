"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewTrainingPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);

  const [form, setForm] = useState({
    title: "",
    start_dt: "",
    end_dt: "",
    location_text: "",
    instructor: "",
    notes: "",
    visibility: "members",
    incident_lat: "",
    incident_lng: "",
    incident_radius_m: "500",
  });

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, incident_lat: pos.coords.latitude.toFixed(6), incident_lng: pos.coords.longitude.toFixed(6) }));
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { timeout: 10000 }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const res = await fetch("/api/training-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        start_dt: form.start_dt ? new Date(form.start_dt).toISOString() : undefined,
        end_dt: form.end_dt ? new Date(form.end_dt).toISOString() : null,
        location_text: form.location_text ? form.location_text.trim() : null,
        instructor: form.instructor ? form.instructor.trim() : null,
        notes: form.notes ? form.notes.trim() : null,
        visibility: form.visibility,
        incident_lat: form.incident_lat.trim() ? Number(form.incident_lat) : null,
        incident_lng: form.incident_lng.trim() ? Number(form.incident_lng) : null,
        incident_radius_m: form.incident_radius_m.trim() ? Number(form.incident_radius_m) : null,
      }),
    });

    const json = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(json?.error ?? "Create failed");
      return;
    }

    router.push(`/training/${json.id}`);
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
      <a href="/training" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}>← Back to Training</a>
      <h1 style={{ margin: "12px 0 24px" }}>Add Training Session</h1>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Title *</label>
          <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Navigation Night / Rope Systems" required />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Start Date/Time</label>
          <input style={inputStyle} type="datetime-local" value={form.start_dt} onChange={(e) => setForm({ ...form, start_dt: e.target.value })} />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>End Date/Time (optional)</label>
          <input style={inputStyle} type="datetime-local" value={form.end_dt} onChange={(e) => setForm({ ...form, end_dt: e.target.value })} />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Location</label>
          <input style={inputStyle} value={form.location_text} onChange={(e) => setForm({ ...form, location_text: e.target.value })} placeholder="Station / Training Field / Park" />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Instructor</label>
          <input style={inputStyle} value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} placeholder="Optional" />
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

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Geofence</label>
          <div>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={gpsLoading}
              style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13, cursor: "pointer", marginBottom: 8 }}
            >
              {gpsLoading ? "Getting location…" : "📍 Use my location"}
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 3 }}>Lat</div>
                <input style={inputStyle} value={form.incident_lat} onChange={(e) => setForm({ ...form, incident_lat: e.target.value })} placeholder="41.12345" />
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 3 }}>Lng</div>
                <input style={inputStyle} value={form.incident_lng} onChange={(e) => setForm({ ...form, incident_lng: e.target.value })} placeholder="-74.12345" />
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 3 }}>Radius (m)</div>
                <input style={inputStyle} type="number" min={50} value={form.incident_radius_m} onChange={(e) => setForm({ ...form, incident_radius_m: e.target.value })} placeholder="500" />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 13, color: "#b91c1c" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            disabled={busy || !form.title.trim()}
            style={{ padding: "10px 24px", background: busy ? "#94a3b8" : "#1e40af", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer" }}
          >
            {busy ? "Creating…" : "Create Training"}
          </button>
          <button type="button" onClick={() => router.push("/training")} style={{ padding: "10px 24px", background: "#f1f5f9", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
