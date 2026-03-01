"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCallPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    incident_lat: "",
    incident_lng: "",
    incident_radius_m: "500",
    summary: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsErr, setGpsErr] = useState("");

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGpsErr("GPS not available on this device.");
      return;
    }
    setGpsLoading(true);
    setGpsErr("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          incident_lat: pos.coords.latitude.toFixed(6),
          incident_lng: pos.coords.longitude.toFixed(6),
        }));
        setGpsLoading(false);
      },
      () => {
        setGpsErr("Could not get location. Check browser permissions.");
        setGpsLoading(false);
      },
      { timeout: 10000 }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setErr("Title is required.");
      return;
    }

    setBusy(true);
    setErr("");

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      status: "open",
      visibility: "members",
    };
    if (form.summary.trim()) payload.summary = form.summary.trim();
    if (form.incident_lat.trim()) payload.incident_lat = Number(form.incident_lat);
    if (form.incident_lng.trim()) payload.incident_lng = Number(form.incident_lng);
    if (form.incident_radius_m.trim()) payload.incident_radius_m = Number(form.incident_radius_m);

    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Create failed");
      router.push(`/calls/${json.id ?? json.data?.id}`);
    } catch (e: any) {
      setErr(e?.message ?? "Error");
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 600 }}>
      <p style={{ marginTop: 0 }}>
        <a href="/calls">← Back to Calls</a>
      </p>
      <h1 style={{ marginTop: 0 }}>New Call</h1>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Title <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder='e.g., "Missing hiker – Macopin Trail"'
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Notes / Summary
          </label>
          <textarea
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="Brief incident summary…"
            rows={3}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, resize: "vertical" }}
          />
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Geofence (optional)
          </div>
          <p style={{ fontSize: 12, opacity: 0.65, margin: "0 0 8px" }}>
            If set, members must be within the radius to self check-in.
          </p>
          <div style={{ marginBottom: 10 }}>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={gpsLoading}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, cursor: "pointer" }}
            >
              {gpsLoading ? "Getting location…" : "📍 Use my location"}
            </button>
            {gpsErr && <span style={{ marginLeft: 10, fontSize: 12, color: "#dc2626" }}>{gpsErr}</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, marginBottom: 3 }}>Incident Lat</label>
              <input
                value={form.incident_lat}
                onChange={(e) => setForm({ ...form, incident_lat: e.target.value })}
                placeholder="e.g. 41.12345"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, marginBottom: 3 }}>Incident Lng</label>
              <input
                value={form.incident_lng}
                onChange={(e) => setForm({ ...form, incident_lng: e.target.value })}
                placeholder="e.g. -74.12345"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}
              />
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <label style={{ display: "block", fontSize: 12, marginBottom: 3 }}>Geofence radius (meters)</label>
            <input
              type="number"
              min={50}
              value={form.incident_radius_m}
              onChange={(e) => setForm({ ...form, incident_radius_m: e.target.value })}
              style={{ width: 140, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}
            />
          </div>
        </div>

        {err && (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", fontSize: 13 }}>
            {err}
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={busy || !form.title.trim()}
            style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {busy ? "Creating…" : "Create Call"}
          </button>
        </div>
      </form>
    </main>
  );
}
