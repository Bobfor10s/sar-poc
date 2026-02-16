"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "../../../components/ui/ui.module.css";

type Meeting = {
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
  created_at?: string | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function toLocalInputValue(dt?: string | null) {
  if (!dt) return "";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(v: string) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();

  const meetingId =
    typeof (params as any)?.id === "string"
      ? (params as any).id
      : Array.isArray((params as any)?.id)
      ? (params as any).id[0]
      : "";

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // local datetime inputs (so the browser control works nicely)
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");

  async function load() {
    if (!meetingId || !isUuid(meetingId)) {
      setMsg(`Bad meeting id: ${meetingId || "(missing)"}`);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMsg("");

    const res = await fetch(`/api/meetings/${meetingId}`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMsg(json?.error ?? "Failed to load meeting");
      setLoading(false);
      return;
    }

    const m = json?.data ?? null;
    setMeeting(m);
    setStartLocal(toLocalInputValue(m?.start_dt));
    setEndLocal(toLocalInputValue(m?.end_dt));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  async function save() {
    if (!meeting) return;

    setBusy(true);
    setMsg("");

    const payload: any = {
      title: meeting.title,
      location_text: meeting.location_text ?? null,
      agenda: meeting.agenda ?? null,
      notes: meeting.notes ?? null,
      status: meeting.status ?? "scheduled",
      visibility: meeting.visibility ?? "members",
      is_test: !!meeting.is_test,
      start_dt: localInputToIso(startLocal),
      end_dt: endLocal ? localInputToIso(endLocal) : null,
    };

    const res = await fetch(`/api/meetings/${meeting.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(json?.error ?? "Save failed");
      setBusy(false);
      return;
    }

    setMeeting(json.data ?? null);
    setMsg("Saved.");
    setBusy(false);
  }

  async function hardDeleteTest() {
    if (!meeting) return;

    if (!meeting.is_test) {
      alert("Hard delete is allowed only for TEST meetings.");
      return;
    }

    const ok = confirm("Hard delete this TEST meeting? This cannot be undone.");
    if (!ok) return;

    setBusy(true);
    setMsg("");

    const res = await fetch(`/api/meetings/${meeting.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMsg(json?.error ?? "Delete failed");
      setBusy(false);
      return;
    }

    router.push("/meetings");
  }

  if (loading) {
    return (
      <main className={styles.container}>
        <div className={styles.card}>
          <p className={styles.muted}>Loading…</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h1 className={styles.h1} style={{ marginBottom: 0 }}>
              Meeting Detail
            </h1>
            <a href="/meetings" className={styles.link}>
              ← Back to Meetings
            </a>
          </div>

          <button type="button" className={styles.buttonSecondary} onClick={load}>
            Refresh
          </button>
        </div>

        {msg ? (
          <div style={{ marginTop: 10, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10, background: "#f8fafc" }}>
            {msg}
          </div>
        ) : null}

        {!meeting ? (
          <p className={styles.muted} style={{ marginTop: 12 }}>
            Meeting not found.
          </p>
        ) : (
          <>
            <div className={styles.formGrid} style={{ marginTop: 12 }}>
              <div className={styles.label}>Title</div>
              <input
                className={styles.input}
                value={meeting.title ?? ""}
                onChange={(e) => setMeeting({ ...meeting, title: e.target.value })}
                placeholder="Meeting title"
              />

              <div className={styles.label}>Start</div>
              <input
                className={styles.input}
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />

              <div className={styles.label}>End</div>
              <input
                className={styles.input}
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
              />

              <div className={styles.label}>Location</div>
              <input
                className={styles.input}
                value={meeting.location_text ?? ""}
                onChange={(e) => setMeeting({ ...meeting, location_text: e.target.value })}
                placeholder="Station / Firehouse / Zoom / etc."
              />

              <div className={styles.label}>Agenda</div>
              <input
                className={styles.input}
                value={meeting.agenda ?? ""}
                onChange={(e) => setMeeting({ ...meeting, agenda: e.target.value })}
                placeholder="Short agenda"
              />

              <div className={styles.label}>Notes</div>
              <input
                className={styles.input}
                value={meeting.notes ?? ""}
                onChange={(e) => setMeeting({ ...meeting, notes: e.target.value })}
                placeholder="Short notes"
              />

              <div className={styles.label}>Status</div>
              <select
                className={styles.select}
                value={(meeting.status ?? "scheduled").toLowerCase()}
                onChange={(e) => setMeeting({ ...meeting, status: e.target.value })}
              >
                <option value="scheduled">scheduled</option>
                <option value="completed">completed</option>
                <option value="cancelled">cancelled</option>
                <option value="archived">archived</option>
              </select>

              <div className={styles.label}>Visibility</div>
              <select
                className={styles.select}
                value={(meeting.visibility ?? "members").toLowerCase()}
                onChange={(e) => setMeeting({ ...meeting, visibility: e.target.value })}
              >
                <option value="members">members</option>
                <option value="public">public</option>
              </select>

              <div className={styles.label}>TEST</div>
              <label className={styles.row} style={{ gap: 10 }}>
                <input
                  type="checkbox"
                  checked={!!meeting.is_test}
                  onChange={(e) => setMeeting({ ...meeting, is_test: e.target.checked })}
                />
                <span className={styles.muted}>Mark as TEST (allows hard delete)</span>
              </label>
            </div>

            <div className={styles.row} style={{ marginTop: 14, gap: 10 }}>
              <button
                type="button"
                className={styles.button}
                onClick={save}
                disabled={busy || !String(meeting.title ?? "").trim()}
              >
                {busy ? "Saving…" : "Save"}
              </button>

              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={() => router.push("/meetings")}
                disabled={busy}
              >
                Done
              </button>

              <div style={{ marginLeft: "auto" }}>
                <button
                  type="button"
                  className={styles.buttonDanger ?? styles.buttonSecondary}
                  onClick={hardDeleteTest}
                  disabled={busy || !meeting.is_test}
                  title={meeting.is_test ? "Hard delete TEST meeting" : "Enable TEST to allow hard delete"}
                >
                  Hard delete (TEST)
                </button>
              </div>
            </div>

            <hr className={styles.hr} />

            <div className={styles.muted} style={{ fontSize: 12 }}>
              <div><strong>ID:</strong> {meeting.id}</div>
              {meeting.created_at ? <div><strong>Created:</strong> {new Date(meeting.created_at).toLocaleString()}</div> : null}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
