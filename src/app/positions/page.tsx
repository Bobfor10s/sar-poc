"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Position = {
  id: string;
  code: string;
  name: string;
  level?: number | null;
  position_type?: string | null;
  is_active: boolean;
};

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/positions?all=${showAll}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setPositions(j.data ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) { setPositions([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [showAll]);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Positions</h1>
        <Link
          href="/positions/new"
          style={{
            marginLeft: "auto",
            padding: "7px 16px",
            borderRadius: 8,
            background: "#1e40af",
            color: "#fff",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          + Add Position
        </Link>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Show inactive
      </label>

      {loading ? (
        <p style={{ opacity: 0.6 }}>Loading…</p>
      ) : positions.length === 0 ? (
        <p style={{ opacity: 0.6 }}>No positions found.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {positions.map((pos) => (
            <Link
              key={pos.id}
              href={`/positions/${pos.id}`}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: "10px 14px",
                border: "1px solid #dde",
                borderRadius: 8,
                textDecoration: "none",
                background: pos.is_active ? "#f8fafc" : "#fafafa",
                color: "#1f2937",
              }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 13, minWidth: 100, fontWeight: 600 }}>{pos.code}</span>
              <span style={{ flex: 1, fontSize: 14 }}>{pos.name}</span>
              {pos.level != null && (
                <span style={{ fontSize: 12, opacity: 0.55 }}>Lvl {pos.level}</span>
              )}
              {pos.position_type && (
                <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #dde", borderRadius: 999, background: "#f0f4ff" }}>
                  {pos.position_type}
                </span>
              )}
              {!pos.is_active && (
                <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #eee", borderRadius: 999, background: "#f3f4f6", color: "#6b7280" }}>
                  inactive
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
