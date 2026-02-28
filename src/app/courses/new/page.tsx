"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewCoursePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    code: "",
    name: "",
    valid_months: "",
    warning_days: "30",
    never_expires: false,
    show_on_roster: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code || !name) return;

    const never_expires = form.never_expires;
    const valid_months = never_expires ? 24 : Number(form.valid_months);
    const warning_days = never_expires ? 0 : Number(form.warning_days);

    if (!never_expires && (!Number.isFinite(valid_months) || valid_months <= 0)) {
      setErr("Certification length (months) must be a positive number, or check Never expires.");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, never_expires, show_on_roster: form.show_on_roster, valid_months, warning_days }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json?.error ?? "Create failed"); return; }
      router.push(`/courses/${json.data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 560 }}>
      <p><Link href="/courses">← Courses</Link></p>
      <h1>New Course</h1>

      {err && (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #fca5a5", borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>
          {err}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={labelStyle}>Code *</label>
          <input style={inputStyle} placeholder="e.g. CPR" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        </div>
        <div>
          <label style={labelStyle}>Name *</label>
          <input style={inputStyle} placeholder="e.g. CPR / AED" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.never_expires}
            onChange={(e) => setForm({ ...form, never_expires: e.target.checked, warning_days: e.target.checked ? "0" : "30" })}
          />
          <strong>Never expires</strong>
          <span style={{ opacity: 0.6 }}>(e.g. ICS/IS courses)</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.show_on_roster}
            onChange={(e) => setForm({ ...form, show_on_roster: e.target.checked })}
          />
          <strong>Show on roster</strong>
          <span style={{ opacity: 0.6 }}>(badge on member list)</span>
        </label>

        <div>
          <label style={labelStyle}>Certification length (months)</label>
          <input
            style={inputStyle}
            type="number"
            min={1}
            placeholder="e.g. 24"
            value={form.never_expires ? "" : form.valid_months}
            onChange={(e) => setForm({ ...form, valid_months: e.target.value })}
            disabled={form.never_expires}
          />
        </div>

        <div>
          <label style={labelStyle}>Warning window (days)</label>
          <input
            style={inputStyle}
            type="number"
            min={0}
            placeholder="e.g. 30"
            value={form.never_expires ? "0" : form.warning_days}
            onChange={(e) => setForm({ ...form, warning_days: e.target.value })}
            disabled={form.never_expires}
          />
        </div>

        <div>
          <button
            type="submit"
            disabled={busy || !form.code || !form.name}
            style={{ padding: "8px 20px", borderRadius: 8, background: "#1e40af", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {busy ? "Creating…" : "Create Course"}
          </button>
        </div>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.8 };
const inputStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, width: "100%", boxSizing: "border-box" };
