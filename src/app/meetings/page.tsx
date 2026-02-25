"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../../components/ui/ui.module.css";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

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

function combineDateTimeToIso(dateStr: string, timeStr: string) {
  // dateStr: "2026-02-15"
  // timeStr: "19:30"
  if (!dateStr || !timeStr) return null;

  // Create a local datetime, then convert to ISO (UTC)
  const dt = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

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

  start_date: "",

  start_hour: "19",
  start_minute: "00",

  end_hour: "",
  end_minute: "",
});


  async function load() {
    setLoading(true);
    const res = await fetch("/api/meetings");
    const json = await res.json().catch(() => ([]));
    setRows(Array.isArray(json) ? (json as MeetingRow[]) : (json?.data ?? []));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();

    const start_time = `${form.start_hour}:${form.start_minute}`;
    const end_time =
    form.end_hour ? `${form.end_hour}:${form.end_minute || "00"}` : "";

    const start_dt = combineDateTimeToIso(form.start_date, start_time);
    const end_dt = end_time ? combineDateTimeToIso(form.start_date, end_time) : null;


    const payload = {
      title: form.title.trim(),
      start_dt: start_dt ?? undefined,
      end_dt,

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

    // Read response ONCE (JSON if possible, otherwise text)
    const contentType = res.headers.get("content-type") || "";
    let body: any = null;

    if (contentType.includes("application/json")) {
      body = await res.json().catch(() => null);
    } else {
      body = await res.text().catch(() => "");
    }

    if (!res.ok) {
      console.log("CREATE MEETING FAIL", res.status, contentType, body);
      const msg =
        typeof body === "string"
          ? `HTTP ${res.status}: ${body.slice(0, 300)}`
          : `HTTP ${res.status}: ${body?.error ?? body?.message ?? JSON.stringify(body)}`;
      alert(msg);
      return;
    }

  setForm({
  title: "",
  location_text: "",
  agenda: "",
  notes: "",
  visibility: "members",
  is_test: false,

  start_date: "",
  start_hour: "19",
  start_minute: "00",
  end_hour: "",
  end_minute: "",
});


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

          <div className={styles.label}>Meeting Date</div>
          <input
            className={styles.input}
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />

          <div className={styles.label}>Start Time</div>
          <div className={styles.row} style={{ gap: 8 }}>
  <select
    className={styles.select}
    value={form.start_hour}
    onChange={(e) => setForm({ ...form, start_hour: e.target.value })}
  >
    {Array.from({ length: 24 }, (_, i) => pad2(i)).map((h) => (
      <option key={h} value={h}>{h}</option>
    ))}
  </select>

  <span className={styles.muted}>:</span>

  <select
    className={styles.select}
    value={form.start_minute}
    onChange={(e) => setForm({ ...form, start_minute: e.target.value })}
  >
    {Array.from({ length: 60 }, (_, i) => pad2(i)).map((m) => (
      <option key={m} value={m}>{m}</option>
    ))}
  </select>
</div>

<div className={styles.label}>End Time (optional)</div>
<div className={styles.row} style={{ gap: 8 }}>
  <select
    className={styles.select}
    value={form.end_hour}
    onChange={(e) => setForm({ ...form, end_hour: e.target.value })}
  >
    <option value="">(none)</option>
    {Array.from({ length: 24 }, (_, i) => pad2(i)).map((h) => (
      <option key={h} value={h}>{h}</option>
    ))}
  </select>

  <span className={styles.muted}>:</span>

  <select
    className={styles.select}
    value={form.end_minute}
    onChange={(e) => setForm({ ...form, end_minute: e.target.value })}
    disabled={!form.end_hour}
  >
    <option value="">(none)</option>
    {Array.from({ length: 60 }, (_, i) => pad2(i)).map((m) => (
      <option key={m} value={m}>{m}</option>
    ))}
  </select>
</div>


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
          <select
            className={styles.select}
            value={form.visibility}
            onChange={(e) => setForm({ ...form, visibility: e.target.value })}
          >
            <option value="members">Members</option>
            <option value="public">Public</option>
          </select>

          <div className={styles.row} style={{ marginTop: 6 }}>
            <button
              className={styles.button}
              type="submit"
              disabled={!form.title.trim() || !form.start_date}
            >
              Create Meeting
            </button>

            <label className={styles.row} style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={form.is_test}
                onChange={(e) => setForm({ ...form, is_test: e.target.checked })}
              />
              <span className={styles.muted}>TEST</span>
            </label>

            <label className={styles.row} style={{ gap: 8, marginLeft: "auto" }}>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
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
          <p className={styles.muted} style={{ marginTop: 10 }}>
            Loading…
          </p>
        ) : visible.length === 0 ? (
          <p className={styles.muted} style={{ marginTop: 10 }}>
            No meetings yet.
          </p>
        ) : (
          <ul className={styles.list} style={{ marginTop: 8 }}>
            {visible.map((r) => {
              const st = (r.status ?? "scheduled").toLowerCase();
              return (
                <li key={r.id} className={styles.listItem}>
                  <div className={styles.row} style={{ justifyContent: "space-between" }}>
                    <div className={styles.row}>
                      <span className={`${styles.badge} ${badgeClass(st, styles)}`}>{st}</span>
                      {r.is_test ? (
                        <span className={`${styles.badge} ${styles.badgeTest}`}>TEST</span>
                      ) : null}

                      <a href={`/meetings/${r.id}`} className={styles.link}>
                        <strong>{r.title}</strong>
                      </a>

                      {r.start_dt ? <span className={styles.muted}>{fmtDate(r.start_dt)}</span> : null}
                      {r.location_text ? <span className={styles.muted}>• {r.location_text}</span> : null}
                    </div>

                    {r.is_test ? (
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        onClick={() => hardDeleteIfTest(r.id)}
                      >
                        Hard delete (TEST)
                      </button>
                    ) : null}
                  </div>

                  {r.agenda ? (
                    <div style={{ marginTop: 6, opacity: 0.92 }}>
                      <strong>Agenda:</strong> {r.agenda}
                    </div>
                  ) : null}
                  {r.notes ? (
                    <div style={{ marginTop: 4, opacity: 0.92 }}>
                      <strong>Notes:</strong> {r.notes}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
