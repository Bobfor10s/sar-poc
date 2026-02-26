"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type MemberRow = {
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
  town?: string | null;

  status?: string | null;
  joined_at?: string | null;

  // from members_with_sar view (if you’re using it)
  sar_codes?: string | null;
  sar_positions?: string | null;
  sar_primary_code?: string | null;
  sar_primary_name?: string | null;
  sar_primary_rank?: number | null;
};

type SortKey =
  | "name"
  | "sar"
  | "status"
  | "email"
  | "phone"
  | "city"
  | "state";

function norm(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

function formatAddress(m: MemberRow) {
  const line1 = (m.street_address ?? "").trim();
  const line2 = (m.street_address_2 ?? "").trim();
  const city = (m.city ?? m.town ?? "").trim();
  const st = (m.state ?? "").trim();
  const zip = (m.postal_code ?? "").trim();

  const parts: string[] = [];
  if (line1) parts.push(line1);
  if (line2) parts.push(line2);

  const cityLine = [city, st, zip].filter(Boolean).join(" ");
  if (cityLine) parts.push(cityLine);

  return parts.join(", ");
}

export default function MembersPage() {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  async function load() {
    setLoading(true);
    setErr("");

    try {
      const res = await fetch("/api/members", { cache: "no-store" });

      // Try JSON; if not JSON, show text snippet
      const contentType = res.headers.get("content-type") || "";
      let body: any = null;

      if (contentType.includes("application/json")) {
        body = await res.json().catch(() => null);
      } else {
        body = await res.text().catch(() => "");
      }

      if (!res.ok) {
        const msg =
          typeof body === "string"
            ? `HTTP ${res.status}: ${body.slice(0, 400)}`
            : `HTTP ${res.status}: ${body?.error ?? body?.message ?? "Request failed"}`;
        setErr(msg);
        setRows([]);
        return;
      }

      const data: MemberRow[] = Array.isArray(body)
        ? body
        : Array.isArray(body?.data)
          ? body.data
          : [];

      setRows(data);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(next);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const qq = norm(q);
    if (!qq) return rows;

    return rows.filter((m) => {
      const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`;
      const hay = [
        name,
        m.email,
        m.phone,
        m.status,
        m.city,
        m.town,
        m.state,
        m.sar_codes,
        m.sar_primary_code,
        m.sar_primary_name,
        formatAddress(m),
      ]
        .map(norm)
        .join(" | ");

      return hay.includes(qq);
    });
  }, [rows, q]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    const get = (m: MemberRow): string => {
      if (sortKey === "name") return norm(`${m.last_name ?? ""}, ${m.first_name ?? ""}`);
      if (sortKey === "sar") return norm(m.sar_primary_code ?? m.sar_codes ?? "");
      if (sortKey === "status") return norm(m.status ?? "");
      if (sortKey === "email") return norm(m.email ?? "");
      if (sortKey === "phone") return norm(m.phone ?? "");
      if (sortKey === "city") return norm(m.city ?? m.town ?? "");
      if (sortKey === "state") return norm(m.state ?? "");
      return "";
    };

    return [...filtered].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Members</h1>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={load}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Refresh
          </button>

          <Link
            href="/members/new"
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              textDecoration: "none",
              fontWeight: 700,
              display: "inline-block",
            }}
          >
            + Add Member
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, typing, status, email, phone, address…"
          style={{
            width: 420,
            maxWidth: "100%",
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        />

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {loading ? "Loading…" : `${sorted.length} shown`}
          {rows.length !== sorted.length ? ` (of ${rows.length})` : ""}
        </div>
      </div>

      {err ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #f2c9b8",
            borderRadius: 10,
            background: "#fff6f2",
            whiteSpace: "pre-wrap",
          }}
        >
          <strong>Members load failed:</strong>
          <div style={{ marginTop: 6 }}>{err}</div>
        </div>
      ) : null}

      <div style={{ marginTop: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>
                Name
              </Th>
              <Th onClick={() => toggleSort("sar")} active={sortKey === "sar"} dir={sortDir}>
                SAR typing
              </Th>
              <Th onClick={() => toggleSort("status")} active={sortKey === "status"} dir={sortDir}>
                Status
              </Th>
              <Th onClick={() => toggleSort("email")} active={sortKey === "email"} dir={sortDir}>
                Email
              </Th>
              <Th onClick={() => toggleSort("phone")} active={sortKey === "phone"} dir={sortDir}>
                Phone
              </Th>
              <Th onClick={() => toggleSort("city")} active={sortKey === "city"} dir={sortDir}>
                City
              </Th>
              <Th onClick={() => toggleSort("state")} active={sortKey === "state"} dir={sortDir}>
                State
              </Th>
              <th style={th}>Address</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: 14, opacity: 0.75 }}>
                  Loading…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 14, opacity: 0.75 }}>
                  No members found.
                </td>
              </tr>
            ) : (
              sorted.map((m) => {
                const name = `${m.last_name ?? ""}, ${m.first_name ?? ""}`.trim().replace(/^,/, "");
                const typing =
                  (m.sar_primary_code ?? "").trim() ||
                  (m.sar_codes ?? "").trim() ||
                  "";

                return (
                  <tr key={m.id}>
                    <td style={td}>
                      <Link href={`/members/${m.id}`} style={{ textDecoration: "none" }}>
                        <strong>{name || m.id}</strong>
                      </Link>
                    </td>

                    <td style={td}>
                      {typing ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid #ddd",
                            fontSize: 12,
                          }}
                          title={m.sar_positions ?? ""}
                        >
                          {typing}
                        </span>
                      ) : (
                        <span style={{ opacity: 0.5 }}>—</span>
                      )}
                    </td>

                    <td style={td}>
                      {!m.joined_at ? (
                        <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #f0c040", borderRadius: 999, background: "#fffbe6", color: "#7a5a00" }}>
                          Applicant
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 999 }}>
                          {(m.status ?? "active").toLowerCase()}
                        </span>
                      )}
                    </td>

                    <td style={td}>{m.email ?? <span style={{ opacity: 0.5 }}>—</span>}</td>
                    <td style={td}>{m.phone ?? <span style={{ opacity: 0.5 }}>—</span>}</td>
                    <td style={td}>{(m.city ?? m.town ?? "") || <span style={{ opacity: 0.5 }}>—</span>}</td>
                    <td style={td}>{m.state ?? <span style={{ opacity: 0.5 }}>—</span>}</td>
                    <td style={td}>{formatAddress(m) || <span style={{ opacity: 0.5 }}>—</span>}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        Click a column header to sort. Click a member to open their detail page.
      </p>
    </main>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th
      onClick={onClick}
      style={{
        ...th,
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
      title="Sort"
    >
      {children}
      {active ? <span style={{ marginLeft: 6, opacity: 0.7 }}>{dir === "asc" ? "▲" : "▼"}</span> : null}
    </th>
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
  verticalAlign: "top",
  fontSize: 13,
};