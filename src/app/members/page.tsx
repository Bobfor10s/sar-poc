"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Member = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;

  street_address?: string | null;
  street_address_2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;

  status: string;
};

function formatAddress(m: Member) {
  const line1 = [m.street_address, m.street_address_2].filter(Boolean).join(", ");
  const line2Parts = [m.city, m.state].filter(Boolean).join(", ");
  const zip = m.postal_code ? `${m.postal_code}` : "";
  const line2 = [line2Parts, zip].filter(Boolean).join(" ");
  if (!line1 && !line2) return "";
  if (line1 && line2) return `${line1} • ${line2}`;
  return line1 || line2;
}

export default function MembersListPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    const res = await fetch("/api/members");
    const json = await res.json();
    // your /api/members returns { data: [...] } in this project
    setMembers(json.data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return members;

    return members.filter((m) => {
      const blob = [
        m.first_name,
        m.last_name,
        m.email,
        m.phone,
        m.street_address,
        m.street_address_2,
        m.city,
        m.state,
        m.postal_code,
        m.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(s);
    });
  }, [members, q]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Members</h1>

        <Link
          href="/members/new"
          style={{
            border: "1px solid #ddd",
            padding: "8px 12px",
            borderRadius: 8,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          + Add Member
        </Link>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Search name, email, phone, city..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 360, maxWidth: "100%" }}
        />
        <span style={{ opacity: 0.7, fontSize: 13 }}>{filtered.length} member(s)</span>
      </div>

      <div style={{ marginTop: 16, border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee" }}>Name</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee" }}>Contact</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee" }}>Address</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 12, opacity: 0.7 }}>
                  No members found.
                </td>
              </tr>
            ) : (
              filtered.map((m) => {
                const addr = formatAddress(m);
                return (
                  <tr key={m.id}>
                    <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                      <Link href={`/members/${m.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                        <strong>
                          {m.last_name}, {m.first_name}
                        </strong>
                      </Link>
                    </td>

                    <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                      <div>{m.email ?? ""}</div>
                      <div style={{ opacity: 0.8 }}>{m.phone ?? ""}</div>
                    </td>

                    <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                      {addr ? addr : <span style={{ opacity: 0.6 }}>—</span>}
                    </td>

                    <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{m.status}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>
        Click a member to view/edit details, delete, and manage certifications.
      </p>
    </main>
  );
}
