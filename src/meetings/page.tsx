"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../../components/ui/ui.module.css";

type MeetingRow = {
  id: string;
  title: string;
  start_dt?: string | null;
  end_dt?: string | null;
  location_text?: string | null;
  agenda?: string | null;
  notes?: string | null;
  status?: string | null;     // scheduled|completed|cancelled|archived
  visibility?: string | null; // members|public
  is_test?: boolean | null;
};

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function badgeClass(status: string, stylesMod: any) {
  const st = (status || "scheduled").toLowerCase();
  if (st === "scheduled") return stylesMod.badgeOpen;
  if (st === "completed") return stylesMod.badgeClosed;
  if (st === "cancelled") return stylesMod.badgeCancelled;
  if (st === "archived") return stylesMod.badgeArchived;
  return stylesMod.badgeOpen;
}

export default function MeetingsPage() {
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [form, setForm] = useState({
    title: "",
    location_text: "",
    agenda: "",
    notes: "",
    visibility: "members",
    is_test: false,
  });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/meetings");
    const json = await res.json().catch(() => ([]));
    setRows(Array.isArray(json) ? json : (json?.data ?? []));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      title: form.title.trim(),
      location_text: form.location_text ? form.location_text.trim() : null,
      agenda: form.agenda ? form.agenda.trim() : null,
      notes: form.notes ? form.notes.trim() : null,
      visibility: form.visibility,
      is_test: form.is_test,
    };

    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error ?? "Create meeting failed");
      return;
    }

    setForm({ title: "", location_text: "", agenda: "", notes: "", visibility: "members", is_test: false });
    load();
  }

  const visible = useMemo(() => {
    return rows.filter((r) => {
      const st = (r.status ?? "scheduled").toLowerCase();
      if (!showArchived && st === "archived") return false;
      return true;
    });
  }, [rows, showArchived]);

  async function hardDeleteIfTest(id: string) {
    const ok = confirm("Hard delete this TEST meeting? (Only works for TEST)");
    if (!ok) return;
    const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error ?? "Delete failed");
      return;
    }
    load();
  }

  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h1 className={styles.h1}>Meetings</h1>
          <button type="button" className={styles.buttonSecondary} onClick={load}>
            Refresh
          </button>
        </div>

        <form onSubmit={create} className={styles.formGrid}>
          <div className={styles.label}>Title</div>
          <input
            className={styles.input}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g., Monthly Team Meeting"
          />

          <div className={styles.label}>Location</div>
          <input
            className={styles.input}
            value={form.location_text}
            onChange={(e) => setForm({ ...form, location_text: e.target.value })}
            placeholder="e.g., Station / Firehouse / Zoom"
          />

          <div className={styles.label}>Agenda</div>
          <input
            className={styles.input}
            value={form.agenda}
            onChange={(e) => setForm({ ...form, agenda: e.target.value })}
            placeholder="Short agenda"
          />

          <div className={styles.label}>Notes</div>
          <input
            className={styles.input}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Short notes"
          />

          <div className={styles.label}>Visibility</div>
          <select className={styles.select} value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
            <option value="members">Members</option>
            <option value="public">Public</option>
          </select>

          <div className={styles.row} style={{ marginTop: 6 }}>
            <button className={styles.button} type="submit" disabled={!form.title.trim()}>
              Create Meeting
            </button>

            <label className={styles.row} style={{ gap: 8 }}>
              <input type="checkbox" checked={form.is_test} onChange={(e) => setForm({ ...form, is_test: e.target.checked })} />
              <span className={styles.muted}>TEST</span>
            </label>

            <label className={styles.row} style={{ gap: 8, marginLeft: "auto" }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              <span className={styles.muted}>Show archived</span>
            </label>
          </div>
        </form>

        <hr className={styles.hr} />

        <div className={styles.row} style={{ justifyContent: "space-between" }}>
          <h2 className={styles.h2}>Log</h2>
          <span className={styles.muted}>{loading ? "Loading…" : `${visible.length} showing`}</span>
        </div>

        {loading ? (
          <p className={styles.muted} style={{ marginTop: 10 }}>Loading…</p>
        ) : visible.length === 0 ? (
          <p className={styles.muted} style={{ marginTop: 10 }}>No meetings yet.</p>
        ) : (
          <ul className={styles.list} style={{ marginTop: 8 }}>
            {visible.map((r) => {
              const st = (r.status ?? "scheduled").toLowerCase();
              return (
                <li key={r.id} className={styles.listItem}>
                  <div className={styles.row} style={{ justifyContent: "space-between" }}>
                    <div className={styles.row}>
                      <span className={`${styles.badge} ${badgeClass(st, styles)}`}>{st}</span>
                      {r.is_test ? <span className={`${styles.badge} ${styles.badgeTest}`}>TEST</span> : null}
                      <a href={`/meetings/${r.id}`} className={styles.link}>
  <strong>{r.title}</strong>
</a>

                      {r.start_dt ? <span className={styles.muted}>{fmtDate(r.start_dt)}</span> : null}
                      {r.location_text ? <span className={styles.muted}>• {r.location_text}</span> : null}
                    </div>

                    {r.is_test ? (
                      <button className={styles.buttonSecondary} type="button" onClick={() => hardDeleteIfTest(r.id)}>
                        Hard delete (TEST)
                      </button>
                    ) : null}
                  </div>

                  {r.agenda ? <div style={{ marginTop: 6, opacity: 0.92 }}><strong>Agenda:</strong> {r.agenda}</div> : null}
                  {r.notes ? <div style={{ marginTop: 4, opacity: 0.92 }}><strong>Notes:</strong> {r.notes}</div> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
