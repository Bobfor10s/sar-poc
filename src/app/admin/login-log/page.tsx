"use client";

import { useEffect, useState } from "react";

type LogEntry = {
  id: string;
  email: string;
  ip_address: string | null;
  user_agent: string | null;
  logged_in_at: string;
  member_id: string | null;
  members: { first_name: string; last_name: string } | null;
};

function formatDt(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function LoginLogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/login-log?limit=200")
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json)) {
          setEntries(json);
        } else {
          setError(json?.error ?? "Failed to load");
        }
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 700,
    color: "#64748b",
    borderBottom: "2px solid #e2e8f0",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: 13,
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Login Log</h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>
        Most recent 200 successful logins.
      </p>

      {loading && <div style={{ color: "#64748b", fontSize: 14 }}>Loading…</div>}
      {error && (
        <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 13, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div style={{ fontSize: 14, color: "#64748b" }}>No login records yet.</div>
      )}

      {entries.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Member</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>IP Address</th>
                <th style={thStyle}>User Agent</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ background: "white" }}>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDt(e.logged_in_at)}</td>
                  <td style={tdStyle}>
                    {e.members
                      ? `${e.members.first_name} ${e.members.last_name}`
                      : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={tdStyle}>{e.email}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>
                    {e.ip_address ?? <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                    {e.user_agent ?? <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
