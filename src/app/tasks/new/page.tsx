"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewTaskPage() {
  const router = useRouter();
  const [form, setForm] = useState({ task_code: "", task_name: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.task_code || !form.task_name) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_code: form.task_code,
          task_name: form.task_name,
          description: form.description || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json?.error ?? "Create failed"); return; }
      router.push(`/tasks/${json.data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 500 }}>
      <p><Link href="/tasks">← Skills</Link></p>
      <h1>New Skill / Task</h1>

      {err && (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #fca5a5", borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>
          {err}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Code *</label>
            <input style={inputStyle} placeholder="e.g. NAV-1" value={form.task_code} onChange={(e) => setForm({ ...form, task_code: e.target.value })} required />
          </div>
          <div>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} placeholder="e.g. Map & Compass Navigation" value={form.task_name} onChange={(e) => setForm({ ...form, task_name: e.target.value })} required />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description (optional)</label>
          <input style={inputStyle} placeholder="Brief description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <button
            type="submit"
            disabled={busy || !form.task_code || !form.task_name}
            style={{ padding: "8px 20px", borderRadius: 8, background: "#1e40af", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {busy ? "Creating…" : "Create Skill"}
          </button>
        </div>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.8 };
const inputStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, width: "100%", boxSizing: "border-box" };
