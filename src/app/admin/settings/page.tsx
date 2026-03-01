"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SettingRow = {
  key: string;
  value: string;
  updated_at: string;
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => {
        if (r.status === 403 || r.status === 401) {
          router.replace("/members");
          return null;
        }
        return r.json();
      })
      .then((json) => {
        if (!json) return;
        const rows: SettingRow[] = Array.isArray(json) ? json : [];
        setSettings(rows);
        const wd = rows.find((s) => s.key === "activity_window_days");
        if (wd) setWindowDays(wd.value);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "activity_window_days", value: windowDays }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Save failed");
      setMsg("Saved.");
    } catch (e: any) {
      setMsg(e?.message ?? "Error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</main>;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 600 }}>
      <h1>Admin Settings</h1>

      <form onSubmit={save} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Activity window (days)
          </label>
          <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 6px" }}>
            Rolling window used for attendance history and statistics.
          </p>
          <input
            type="number"
            min={1}
            max={3650}
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, width: 120 }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="submit" disabled={saving || !windowDays}>
            {saving ? "Saving…" : "Save"}
          </button>
          {msg && <span style={{ fontSize: 13, color: msg === "Saved." ? "#15803d" : "#dc2626" }}>{msg}</span>}
        </div>
      </form>

      <section style={{ marginTop: 32, padding: 14, border: "1px solid #e5e5e5", borderRadius: 10 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>All Settings</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #eee", opacity: 0.75 }}>Key</th>
              <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #eee", opacity: 0.75 }}>Value</th>
              <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #eee", opacity: 0.75 }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <tr key={s.key}>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid #f5f5f5", fontFamily: "monospace" }}>{s.key}</td>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid #f5f5f5" }}>{s.value}</td>
                <td style={{ padding: "6px 8px", borderBottom: "1px solid #f5f5f5", opacity: 0.65 }}>
                  {new Date(s.updated_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
