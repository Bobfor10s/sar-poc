"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ReadyRow = {
  id: string | null;          // null = auto-detected (no prior member_positions row)
  member_id: string;
  position_id: string;
  status: string | null;      // null = auto-detected
  created_at: string | null;
  members?: { id: string; first_name: string; last_name: string } | null;
  positions?: { id: string; code: string; name: string } | null;
};

export default function ApprovalsPage() {
  const [authPerms, setAuthPerms] = useState<string[] | null>(null);
  const [rows, setRows] = useState<ReadyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => setAuthPerms(json?.user?.permissions ?? []))
      .catch(() => setAuthPerms([]));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/member-positions/ready");
      const json = await res.json().catch(() => ({}));
      setRows(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function approve(row: ReadyRow) {
    const key = row.id ?? `${row.member_id}:${row.position_id}`;
    setBusy(key);
    try {
      const body = row.id
        ? { id: row.id, approve: true, status: "qualified" }
        : { member_id: row.member_id, position_id: row.position_id, approve: true };

      const res = await fetch("/api/member-positions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => {
          const k = r.id ?? `${r.member_id}:${r.position_id}`;
          return k !== key;
        }));
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json?.error ?? "Approve failed");
      }
    } finally {
      setBusy("");
    }
  }

  if (authPerms !== null && !authPerms.includes("approve_positions")) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Pending Approvals</h1>
        <div style={{ marginTop: 16, padding: 16, border: "1px solid #fca5a5", borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>
          Access denied — requires <strong>approve_positions</strong> permission.
        </div>
      </main>
    );
  }

  const autoRows = rows.filter((r) => r.id === null);
  const enrolledRows = rows.filter((r) => r.id !== null);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <p><Link href="/members">← Members</Link></p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Pending Approvals</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.65 }}>
            Members who have met all requirements for a position and are ready to be approved.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <p style={{ marginTop: 20, opacity: 0.65 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div style={{ marginTop: 24, padding: 20, border: "1px solid #e5e5e5", borderRadius: 10, textAlign: "center", opacity: 0.65 }}>
          No pending approvals — all qualified members are up to date.
        </div>
      ) : (
        <>
          {/* Auto-detected: qualified but never enrolled */}
          {autoRows.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px", color: "#15803d" }}>
                Auto-detected — requirements met
              </h2>
              <p style={{ fontSize: 12, opacity: 0.65, margin: "0 0 12px" }}>
                These members were never manually enrolled but have completed all requirements for the position.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Member</th>
                    <th style={th}>Position</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {autoRows.map((r) => {
                    const key = `${r.member_id}:${r.position_id}`;
                    const name = r.members ? `${r.members.last_name}, ${r.members.first_name}` : r.member_id;
                    return (
                      <tr key={key}>
                        <td style={td}>
                          <Link href={`/members/${r.member_id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                            {name}
                          </Link>
                        </td>
                        <td style={td}>
                          <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 999, marginRight: 6, background: "#f8fafc" }}>
                            {r.positions?.code}
                          </span>
                          <span style={{ opacity: 0.8 }}>{r.positions?.name}</span>
                        </td>
                        <td style={td}>
                          <button
                            type="button"
                            onClick={() => approve(r)}
                            disabled={busy === key}
                            style={approveBtn}
                          >
                            {busy === key ? "Approving…" : "Approve & Qualify"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {/* Enrolled and ready */}
          {enrolledRows.length > 0 && (
            <section style={{ marginTop: 24 }}>
              {autoRows.length > 0 && (
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>
                  Enrolled — requirements met
                </h2>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Member</th>
                    <th style={th}>Position</th>
                    <th style={th}>Current Status</th>
                    <th style={th}>Working Since</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {enrolledRows.map((r) => {
                    const key = r.id!;
                    const name = r.members ? `${r.members.last_name}, ${r.members.first_name}` : r.member_id;
                    return (
                      <tr key={key}>
                        <td style={td}>
                          <Link href={`/members/${r.member_id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                            {name}
                          </Link>
                        </td>
                        <td style={td}>
                          <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 999, marginRight: 6, background: "#f8fafc" }}>
                            {r.positions?.code}
                          </span>
                          <span style={{ opacity: 0.8 }}>{r.positions?.name}</span>
                        </td>
                        <td style={td}>
                          <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 999 }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={td}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td style={td}>
                          <button
                            type="button"
                            onClick={() => approve(r)}
                            disabled={busy === key}
                            style={approveBtn}
                          >
                            {busy === key ? "Approving…" : "Approve"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #ddd",
  fontSize: 12,
  opacity: 0.85,
  background: "#fafafa",
};

const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #eee",
  fontSize: 13,
  verticalAlign: "middle",
};

const approveBtn: React.CSSProperties = {
  padding: "5px 14px",
  borderRadius: 6,
  border: "1px solid #4a90d9",
  background: "#e8f0fb",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};
