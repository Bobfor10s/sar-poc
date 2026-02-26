"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ReadyRow = {
  id: string;
  member_id: string;
  position_id: string;
  status: string;
  created_at: string;
  members?: { id: string; first_name: string; last_name: string } | null;
  positions?: { id: string; code: string; name: string } | null;
};

export default function ApprovalsPage() {
  const [rows, setRows] = useState<ReadyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

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

  async function approve(mpId: string) {
    setBusy(mpId);
    try {
      const res = await fetch("/api/member-positions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mpId, approve: true, status: "qualified" }),
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== mpId));
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json?.error ?? "Approve failed");
      }
    } finally {
      setBusy("");
    }
  }

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
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20 }}>
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
            {rows.map((r) => {
              const name = r.members
                ? `${r.members.last_name}, ${r.members.first_name}`
                : r.member_id;
              return (
                <tr key={r.id}>
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
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td style={td}>
                    <button
                      type="button"
                      onClick={() => approve(r.id)}
                      disabled={busy === r.id}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 6,
                        border: "1px solid #4a90d9",
                        background: "#e8f0fb",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      {busy === r.id ? "Approving…" : "Approve"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
