"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "../../components/ui/ui.module.css";

type CallRow = {
  id: string;
  type?: string | null;
  location_text?: string | null;
  summary?: string | null;
  visibility?: string | null;

  start_dt?: string | null;
  end_dt?: string | null;
  outcome?: string | null;

  status?: string | null; // open/closed/cancelled/archived
  is_test?: boolean | null;
};

function fmtDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function statusBadgeClass(status: string) {
  const st = (status || "open").toLowerCase();
  if (st === "open") return styles.badgeOpen;
  if (st === "closed") return styles.badgeClosed;
  if (st === "cancelled") return styles.badgeCancelled;
  if (st === "archived") return styles.badgeArchived;
  return styles.badgeOpen;
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    type: "",
    search: "", // label-only for now
    location_text: "",
    summary: "",
    visibility: "members",
  });

  const [showArchived, setShowArchived] = useState(false);

  async function loadCalls() {
    setLoading(true);
    const res = await fetch("/api/calls");
    const json = await res.json().catch(() => []);
    const rows: CallRow[] = Array.isArray(json) ? json : (json?.data ?? []);
    setCalls(rows);
    setLoading(false);
  }

  useEffect(() => {
    loadCalls();
  }, []);

  async function createCall(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      type: form.type || undefined,
      location_text: form.location_text ? form.location_text.trim() : null,
      summary: form.summary ? form.summary.trim() : null,
      visibility: form.visibility || "members",
    };

    const res = await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json?.error ?? "Create call failed");
      return;
    }

    setForm({
      type: "",
      search: "",
      location_text: "",
      summary: "",
      visibility: "members",
    });

    loadCalls();
  }

  const visibleCalls = useMemo(() => {
    return calls.filter((c) => {
      const st = (c.status ?? "open").toLowerCase();
      if (!showArchived && st === "archived") return false;
      return true;
    });
  }, [calls, showArchived]);

  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h1 className={styles.h1}>Calls</h1>
          <button
            type="button"
            className={styles.buttonSecondary}
            onClick={loadCalls}
          >
            Refresh
          </button>
        </div>

        <form onSubmit={createCall} className={styles.formGrid}>
          <div className={styles.label}>Type</div>
          <input
            className={styles.input}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            placeholder="Type"
          />

          <div className={styles.label}>Search</div>
          <input
            className={styles.input}
            value={form.search}
            onChange={(e) => setForm({ ...form, search: e.target.value })}
            placeholder="Search"
          />

          <div className={styles.label}>Location (text works off-grid)</div>
          <input
            className={styles.input}
            value={form.location_text}
            onChange={(e) =>
              setForm({ ...form, location_text: e.target.value })
            }
            placeholder="e.g., Trailhead lot / mile marker / GPS later"
          />

          <div className={styles.label}>Summary</div>
          <input
            className={styles.input}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
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
            <button type="submit" className={styles.button}>
              Create Call
            </button>

            <label
              className={styles.row}
              style={{ gap: 8, marginLeft: "auto" }}
            >
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
          <h2 className={styles.h2}>Call Log</h2>
          <span className={styles.muted}>
            {loading ? "Loading…" : `${visibleCalls.length} showing`}
          </span>
        </div>

        {loading ? (
          <p className={styles.muted} style={{ marginTop: 10 }}>
            Loading…
          </p>
        ) : visibleCalls.length === 0 ? (
          <p className={styles.muted} style={{ marginTop: 10 }}>
            No calls yet.
          </p>
        ) : (
          <ul className={styles.list} style={{ marginTop: 8 }}>
            {visibleCalls.map((c) => {
              const status = (c.status ?? "open").toLowerCase();
              return (
                <li key={c.id} className={styles.listItem}>
                  <div
                    className={styles.row}
                    style={{ justifyContent: "space-between" }}
                  >
                    <div className={styles.row}>
                      <span
                        className={`${styles.badge} ${statusBadgeClass(status)}`}
                      >
                        {status}
                      </span>

                      {c.is_test ? (
                        <span className={`${styles.badge} ${styles.badgeTest}`}>
                          TEST
                        </span>
                      ) : null}

                      <Link
                        href={`/calls/${c.id}`}
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <strong>{c.type || "Call"}</strong>
                      </Link>

                      {c.start_dt ? (
                        <span className={styles.muted}>
                          {fmtDate(c.start_dt)}
                        </span>
                      ) : null}

                      {c.location_text ? (
                        <span className={styles.muted}>
                          • {c.location_text}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {c.summary ? (
                    <div style={{ marginTop: 6, opacity: 0.92 }}>
                      {c.summary}
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
