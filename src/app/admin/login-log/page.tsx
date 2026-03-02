"use client";

import React, { useEffect, useState } from "react";

const ALLOWED_EMAIL = "bob@wilsonclan.net";

const ACTION_LABELS: Record<string, string> = {
  check_in: "Checked In",
  check_out: "Checked Out",
  rsvp: "RSVP'd",
  early_arrive: "Marked Arrived",
  official_checkin: "Official Check-In",
  create_meeting: "Created Meeting",
  edit_meeting: "Edited Meeting",
  create_event: "Created Event",
  edit_event: "Edited Event",
  create_training: "Created Training",
  edit_training: "Edited Training",
  create_call: "Created Call",
  edit_call: "Edited Call",
  edit_member: "Edited Member Profile",
  skill_signoff: "Skill Sign-Off",
  skill_approval: "Skill Approved",
  edit_settings: "Changed Settings",
  page_view: "Viewed Page",
  on_my_way: "On My Way",
};

type LogEntry = {
  id: string;
  email: string;
  ip_address: string | null;
  user_agent: string | null;
  logged_in_at: string;
  logged_out_at: string | null;
  member_id: string | null;
  members: { first_name: string; last_name: string } | null;
};

type ActivityEntry = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  occurred_at: string;
};

function formatDt(iso: string) {
  return new Date(iso).toLocaleString();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function detailsText(details: Record<string, unknown> | null): string {
  if (!details) return "";
  const vals = Object.values(details).filter((v) => v != null && v !== "");
  return vals.join(" · ");
}

function ActivityPanel({ sessionId }: { sessionId: string }) {
  const [items, setItems] = useState<ActivityEntry[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`/api/admin/login-log?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json)) setItems(json);
        else setErr(json?.error ?? "Failed to load");
      })
      .catch(() => setErr("Network error"));
  }, [sessionId]);

  if (err) return <div style={{ color: "#b91c1c", fontSize: 12, padding: "6px 12px" }}>{err}</div>;
  if (items === null) return <div style={{ color: "#64748b", fontSize: 12, padding: "6px 12px" }}>Loading activity…</div>;
  if (items.length === 0) return <div style={{ color: "#94a3b8", fontSize: 12, padding: "6px 12px" }}>No activity recorded</div>;

  return (
    <ol style={{ margin: 0, padding: "6px 12px 6px 28px", listStyle: "decimal" }}>
      {items.map((a) => (
        <li key={a.id} style={{ fontSize: 12, color: "#374151", padding: "2px 0" }}>
          <span style={{ fontFamily: "monospace", color: "#64748b", marginRight: 8 }}>{formatTime(a.occurred_at)}</span>
          <span style={{ fontWeight: 600, marginRight: 6 }}>{ACTION_LABELS[a.action] ?? a.action}</span>
          {a.details && <span style={{ color: "#64748b" }}>{detailsText(a.details)}</span>}
        </li>
      ))}
    </ol>
  );
}

export default function LoginLogPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => {
        if (json?.user?.email !== ALLOWED_EMAIL) {
          setAllowed(false);
          setLoading(false);
          return;
        }
        setAllowed(true);
        return fetch("/api/admin/login-log?limit=200")
          .then((r) => r.json())
          .then((data) => {
            if (Array.isArray(data)) setEntries(data);
            else setError(data?.error ?? "Failed to load");
          });
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  if (loading) return <main style={{ padding: 24, fontFamily: "system-ui" }}><div style={{ color: "#64748b", fontSize: 14 }}>Loading…</div></main>;

  if (allowed === false) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 14, color: "#b91c1c" }}>
          Access denied
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Login Log</h1>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>
        Most recent 200 successful logins.
      </p>

      {error && (
        <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 13, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      {!error && entries.length === 0 && (
        <div style={{ fontSize: 14, color: "#64748b" }}>No login records yet.</div>
      )}

      {entries.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 32 }} />
                <th style={thStyle}>Logged In</th>
                <th style={thStyle}>Logged Out</th>
                <th style={thStyle}>Member</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>IP Address</th>
                <th style={thStyle}>User Agent</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const open = expanded.has(e.id);
                return (
                  <React.Fragment key={e.id}>
                    <tr style={{ background: open ? "#f8fafc" : "white" }}>
                      <td style={{ ...tdStyle, textAlign: "center", cursor: "pointer", color: "#64748b", fontSize: 11 }} onClick={() => toggleExpanded(e.id)}>
                        {open ? "▼" : "▶"}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDt(e.logged_in_at)}</td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        {e.logged_out_at
                          ? formatDt(e.logged_out_at)
                          : <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 12 }}>Active</span>}
                      </td>
                      <td style={tdStyle}>
                        {e.members
                          ? `${e.members.first_name} ${e.members.last_name}`
                          : <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      <td style={tdStyle}>{e.email}</td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12 }}>
                        {e.ip_address ?? <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                        {e.user_agent ?? <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                    </tr>
                    {open && (
                      <tr style={{ background: "#f8fafc" }}>
                        <td colSpan={7} style={{ padding: 0, borderBottom: "2px solid #e2e8f0" }}>
                          <ActivityPanel sessionId={e.id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
