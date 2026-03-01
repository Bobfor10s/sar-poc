"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type CallRow = {
  id: string;
  title?: string | null;
  start_dt?: string | null;
  status?: string | null;
};

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function chipStyle(kind: string): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 12,
    padding: "2px 8px",
    border: "1px solid #ddd",
    borderRadius: 999,
    display: "inline-block",
  };
  if (kind === "open") return { ...base, background: "#166534", borderColor: "#14532d", color: "#fff" };
  if (kind === "closed") return { ...base, background: "#f2f2ff" };
  if (kind === "cancelled") return { ...base, background: "#fff6f2" };
  if (kind === "archived") return { ...base, background: "#f4f4f4", opacity: 0.8 };
  return base;
}

function asArray<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  return ((json as any)?.data ?? []) as T[];
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
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

  const visibleCalls = useMemo(() => {
    return calls.filter((c) => {
      const st = (c.status ?? "open").toLowerCase();
      if (!showArchived && st === "archived") return false;
      return true;
    });
  }, [calls, showArchived]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 860 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Calls</h1>
        <Link
          href="/calls/new"
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
          + Add Call
        </Link>
      </div>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <button type="button" onClick={loadCalls} style={{ marginLeft: "auto", fontSize: 13 }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ opacity: 0.7, marginTop: 16 }}>Loading…</p>
      ) : visibleCalls.length === 0 ? (
        <p style={{ opacity: 0.7, marginTop: 16 }}>No calls yet.</p>
      ) : (
        <ul style={{ marginTop: 16, listStyle: "none", padding: 0 }}>
          {visibleCalls.map((c) => {
            const status = (c.status ?? "open").toLowerCase();
            return (
              <li
                key={c.id}
                style={{
                  marginBottom: 8,
                  padding: "10px 14px",
                  border: "1px solid #e5e5e5",
                  borderRadius: 10,
                  background: "#ffffff",
                }}
              >
                <Link href={`/calls/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, opacity: 0.75, minWidth: 140 }}>
                      {c.start_dt ? fmtDate(c.start_dt) : "—"}
                    </div>
                    <div style={{ fontWeight: 600, flex: 1 }}>
                      {c.title ?? "(Untitled)"}
                    </div>
                    <div>
                      <span style={chipStyle(status)}>{status}</span>
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
