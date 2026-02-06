"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type CallRow = {
  id: string;
  type?: string | null;
  location_text?: string | null;
  summary?: string | null;
  visibility?: string | null;

  // your schema fields
  start_dt?: string | null;
  end_dt?: string | null;
  outcome?: string | null;

  // new fields
  status?: string | null;   // open/closed/cancelled/archived
  is_test?: boolean | null; // optional
};

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function chipStyle(kind: string) {
  const base: React.CSSProperties = {
    fontSize: 12,
    padding: "2px 8px",
    border: "1px solid #ddd",
    borderRadius: 999,
    display: "inline-block",
  };

  if (kind === "open") return { ...base, background: "#f7f7f7" };
  if (kind === "closed") return { ...base, background: "#f2f2ff" };
  if (kind === "cancelled") return { ...base, background: "#fff6f2" };
  if (kind === "archived") return { ...base, background: "#f4f4f4", opacity: 0.8 };
  if (kind === "test") return { ...base, background: "#f9f9f9" };
  return base;
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form (matches your current labels)
  const [form, setForm] = useState({
    type: "",
    search: "", // UI label; we don't store separately right now
    location_text: "",
    summary: "",
    visibility: "members",
  });

  const [showArchived, setShowArchived] = useState(false);

  async function loadCalls() {
    setLoading(true);
    const res = await fetch("/api/calls");
    const json = await res.json().catch(() => ([]));

    const rows: CallRow[] = Array.isArray(json) ? json : (json?.data ?? []);
    setCalls(rows);
    setLoading(false);
  }

  useEffect(() => {
    loadCalls();
  }, []);

  async function createCall(e: React.FormEvent) {
    e.preventDefault();

    // Your POST handler supports:
    // type, location_text, summary, visibility (and start_dt if provided)
    const summaryParts: string[] = [];
if (form.search.trim()) summaryParts.push(`Search: ${form.search.trim()}`);
if (form.summary.trim()) summaryParts.push(form.summary.trim());

const payload = {
  type: form.type || undefined,
  location_text: form.location_text ? form.location_text.trim() : null,
  summary: summaryParts.length ? summaryParts.join(" — ") : null,
  visibility: form.visibility || "members",
  // status defaults to 'open'
};


    const res = await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json?.error ?? "Create call failed");
      return;
    }

    setForm({
      type: "",
      search: "",
      location_text: "",
      summary: "",
      visibility: "members",
    });

    loadCalls();
  }

  const visibleCalls = useMemo(() => {
    return calls.filter((c) => {
      const st = (c.status ?? "open").toLowerCase();
      if (!showArchived && st === "archived") return false;
      return true;
    });
  }, [calls, showArchived]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 980 }}>
      <h1>Calls</h1>

      <form onSubmit={createCall} style={{ display: "grid", gap: 10, maxWidth: 720, marginTop: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Type</label>
        <input
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          placeholder="Type"
        />

        <label style={{ fontSize: 13, fontWeight: 600 }}>Search</label>
        <input
          value={form.search}
          onChange={(e) => setForm({ ...form, search: e.target.value })}
          placeholder="Search"
        />

        <label style={{ fontSize: 13, fontWeight: 600 }}>Location (text works off-grid)</label>
        <input
          value={form.location_text}
          onChange={(e) => setForm({ ...form, location_text: e.target.value })}
          placeholder="e.g., Trailhead lot / mile marker / GPS later"
        />

        <label style={{ fontSize: 13, fontWeight: 600 }}>Summary</label>
        <input
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
          placeholder="Short notes"
        />

        <label style={{ fontSize: 13, fontWeight: 600 }}>Visibility</label>
        <select
          value={form.visibility}
          onChange={(e) => setForm({ ...form, visibility: e.target.value })}
        >
          <option value="members">Members</option>
          <option value="public">Public</option>
        </select>

        <button type="submit" style={{ width: 160 }}>
          Create Call
        </button>
      </form>

      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Call Log</h2>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>

        <button type="button" onClick={loadCalls} style={{ marginLeft: "auto" }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ opacity: 0.7 }}>Loading…</p>
      ) : visibleCalls.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No calls yet.</p>
      ) : (
        <ul style={{ marginTop: 12, paddingLeft: 18 }}>
          {visibleCalls.map((c) => {
            const status = (c.status ?? "open").toLowerCase();
            return (
              <li key={c.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={chipStyle(status)}>{status}</span>

                  {c.is_test ? (
                    <span style={chipStyle("test")}>TEST</span>
                  ) : null}

                  <Link href={`/calls/${c.id}`} style={{ textDecoration: "none" }}>
                    <strong>{c.type || "Call"}</strong>
                  </Link>

                  <span style={{ opacity: 0.75, fontSize: 12 }}>
                    {c.start_dt ? fmtDate(c.start_dt) : ""}
                  </span>

                  {c.location_text ? (
                    <span style={{ opacity: 0.85, fontSize: 12 }}>• {c.location_text}</span>
                  ) : null}
                </div>

                {c.summary ? (
                  <div style={{ marginTop: 4, opacity: 0.9 }}>{c.summary}</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
