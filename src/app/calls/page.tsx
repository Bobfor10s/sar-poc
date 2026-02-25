"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type CallRow = {
  id: string;

  title?: string | null;       // NEW
  type?: string | null;        // Search/Rescue/Assist/Mutual Aid/Recovery/Standby/Other
  type_other?: string | null;  // NEW (when type === "Other")

  location_text?: string | null;
  summary?: string | null;
  visibility?: string | null;

  start_dt?: string | null;
  end_dt?: string | null;
  outcome?: string | null;

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

function asArray<T>(json: any): T[] {
  if (Array.isArray(json)) return json as T[];
  return (json?.data ?? []) as T[];
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [form, setForm] = useState({
    title: "",
    type: "",
    type_other: "",
    location_text: "",
    summary: "",
    visibility: "members",
  });

  const [showArchived, setShowArchived] = useState(false);

  async function loadCalls() {
    setLoading(true);
    const res = await fetch("/api/calls");
    const json = await res.json().catch(() => ([]));
    setCalls(asArray<CallRow>(json));
    setLoading(false);
  }

  useEffect(() => {
    loadCalls();
  }, []);

  async function createCall(e: React.FormEvent) {
    e.preventDefault();

    if (!form.type) {
      alert("Type is required");
      return;
    }
    if (form.type === "Other" && !form.type_other.trim()) {
      alert("Please specify the call type for 'Other'.");
      return;
    }

    const payload = {
      title: form.title ? form.title.trim() : null,
      type: form.type,
      type_other: form.type === "Other" ? form.type_other.trim() : null,
      location_text: form.location_text ? form.location_text.trim() : null,
      summary: form.summary ? form.summary.trim() : null,
      visibility: form.visibility || "members",
      // status defaults to 'open' via DB
    };

    const res = await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((json as any)?.error ?? "Create call failed");
      return;
    }

    setForm({
      title: "",
      type: "",
      type_other: "",
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

  function displayType(c: CallRow) {
    if ((c.type ?? "").toLowerCase() === "other" && c.type_other) return c.type_other;
    return c.type ?? "Call";
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 980 }}>
      <h1>Calls</h1>

      <form onSubmit={createCall} style={{ display: "grid", gap: 10, maxWidth: 720, marginTop: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Title</label>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder='e.g., "Missing hiker – Macopin Trail"'
        />

        <label style={{ fontSize: 13, fontWeight: 600 }}>Type</label>
        <select
          value={form.type}
          onChange={(e) =>
            setForm({
              ...form,
              type: e.target.value,
              type_other: "",
            })
          }
        >
          <option value="">Select type…</option>
          <option value="Search">Search</option>
          <option value="Rescue">Rescue</option>
          <option value="Assist">Assist</option>
          <option value="Mutual Aid">Mutual Aid</option>
          <option value="Recovery">Recovery</option>
          <option value="Standby">Standby</option>
          <option value="Other">Other</option>
        </select>

        {form.type === "Other" && (
          <>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Specify Type</label>
            <input
              value={form.type_other}
              onChange={(e) => setForm({ ...form, type_other: e.target.value })}
              placeholder="Describe call type"
            />
          </>
        )}

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
        <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
          <option value="members">Members</option>
          <option value="public">Public</option>
        </select>

        <button
          type="submit"
          style={{ width: 160 }}
          disabled={!form.type || (form.type === "Other" && !form.type_other.trim())}
        >
          Create Call
        </button>
      </form>

      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Call Log</h2>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
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
        <ul style={{ marginTop: 16, listStyle: "none", padding: 0 }}>
  {visibleCalls.map((c) => {
    const status = (c.status ?? "open").toLowerCase();

    return (
      <li
        key={c.id}
        style={{
          marginBottom: 12,
          padding: "12px 14px",
          border: "1px solid #e5e5e5",
          borderRadius: 10,
          background: "#ffffff",
        }}
      >
        <Link
          href={`/calls/${c.id}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px 140px 1fr 1fr auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            {/* Date */}
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              {c.start_dt ? fmtDate(c.start_dt) : "—"}
            </div>

            {/* Type */}
            <div style={{ fontWeight: 600 }}>
              {displayType(c)}
            </div>

            {/* Title */}
            <div>
              {c.title ?? "—"}
            </div>

            {/* Location */}
            <div style={{ opacity: 0.85 }}>
              {c.location_text ?? "—"}
            </div>

            {/* Status Badge */}
            <div>
              <span style={chipStyle(status)}>
                {status}
              </span>
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
