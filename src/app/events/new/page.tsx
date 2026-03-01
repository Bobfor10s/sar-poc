"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewEventPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);

  const [form, setForm] = useState({
    title: "",
    location_text: "",
    description: "",
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

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        location_text: form.location_text ? form.location_text.trim() : null,
        description: form.description ? form.description.trim() : null,
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

    router.push(`/events/${json.id}`);
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
      <a href="/events" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}>← Back to Events</a>
      <h1 style={{ margin: "12px 0 24px" }}>Add Event</h1>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Title *</label>
          <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Fundraiser, Demo, Standby" required />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Location</label>
          <input style={inputStyle} value={form.location_text} onChange={(e) => setForm({ ...form, location_text: e.target.value })} placeholder="Park / Venue / Town" />
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Description</label>
          <input style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description" />
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
            {busy ? "Creating…" : "Create Event"}
          </button>
          <button type="button" onClick={() => router.push("/events")} style={{ padding: "10px 24px", background: "#f1f5f9", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
