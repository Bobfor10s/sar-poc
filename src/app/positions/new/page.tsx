"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewPositionPage() {
  const router = useRouter();
  const [form, setForm] = useState({ code: "", name: "", level: "", position_type: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code || !form.name) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          level: form.level !== "" ? Number(form.level) : undefined,
          position_type: form.position_type || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json?.error ?? "Create failed"); return; }
      router.push(`/positions/${json.data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 560 }}>
      <p><Link href="/positions">← Positions</Link></p>
      <h1>New Position</h1>

      {err && (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #fca5a5", borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>
          {err}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Code *</label>
            <input
              style={inputStyle}
              placeholder="e.g. SAR-T1"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              style={inputStyle}
              placeholder="e.g. Land SAR Technician Type 1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Level (optional)</label>
            <input
              style={inputStyle}
              type="number"
              placeholder="e.g. 1"
              value={form.level}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
            />
          </div>
          <div>
            <label style={labelStyle}>Position type (optional)</label>
            <input
              style={inputStyle}
              placeholder="e.g. field_role"
              value={form.position_type}
              onChange={(e) => setForm({ ...form, position_type: e.target.value })}
            />
          </div>
        </div>
        <div>
          <button
            type="submit"
            disabled={busy || !form.code || !form.name}
            style={{ padding: "8px 20px", borderRadius: 8, background: "#1e40af", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {busy ? "Creating…" : "Create Position"}
          </button>
        </div>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.8 };
const inputStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, width: "100%", boxSizing: "border-box" };
