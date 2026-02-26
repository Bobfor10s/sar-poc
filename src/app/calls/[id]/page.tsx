"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Member = {
  id: string;
  first_name: string;
  last_name: string;
};

type Call = {
  id: string;
  start_dt?: string | null;
  end_dt?: string | null;

  type?: string | null;
  type_other?: string | null;

  title?: string | null;
  location_text?: string | null;
  summary?: string | null;
  outcome?: string | null;

  visibility?: string | null; // members|public
  is_test?: boolean | null;
  status?: string | null; // open|closed|cancelled|archived

  incident_lat?: number | null;
  incident_lng?: number | null;
  incident_radius_m?: number | null;
};

type Attendance = {
  id: string;
  call_id: string;
  member_id: string;
  role_on_call?: string | null;
  time_in?: string | null;
  time_out?: string | null;
  notes?: string | null;
};

type CallNote = {
  id: string;
  call_id: string;
  note_text: string;
  created_at: string;
};

type MemberPosition = {
  id: string;
  position_id: string;
  positions?: { id: string; code: string; name: string } | null;
};

type TaskRow = {
  id: string;
  task_code: string;
  task_name: string;
};

type SignoffRow = {
  id: string;
  member_id: string;
  position_id: string;
  task_id: string;
  evaluator_name?: string | null;
  signed_at: string;
  call_id?: string | null;
};

function asArray<T>(json: any): T[] {
  if (Array.isArray(json)) return json as T[];
  return (json?.data ?? []) as T[];
}

function fmtDt(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

const TYPE_OPTIONS = [
  "Search",
  "Rescue",
  "Assist",
  "Mutual Aid",
  "Recovery",
  "Standby",
  "Other",
] as const;

export default function CallDetailPage() {
  const params = useParams();
  const callId =
    typeof (params as any)?.id === "string"
      ? (params as any).id
      : Array.isArray((params as any)?.id)
      ? (params as any).id[0]
      : "";

  const [call, setCall] = useState<Call | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [notes, setNotes] = useState<CallNote[]>([]);

  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [busy, setBusy] = useState<
    "" | "save" | "addNote" | "add" | "arrive" | "clear" | "reload" | "signoff"
  >("");
  const [err, setErr] = useState("");

  const [noteText, setNoteText] = useState("");

  // ── Mission Competency state ──
  const [compMemberId, setCompMemberId] = useState("");
  const [compPositionId, setCompPositionId] = useState("");
  const [compMemberPositions, setCompMemberPositions] = useState<MemberPosition[]>([]);
  const [compTasks, setCompTasks] = useState<TaskRow[]>([]);
  const [compSignoffs, setCompSignoffs] = useState<SignoffRow[]>([]); // signoffs for this call
  const [compSelectedTaskIds, setCompSelectedTaskIds] = useState<Set<string>>(new Set());
  const [compEvaluator, setCompEvaluator] = useState("");
  const [compNotes, setCompNotes] = useState("");

  const selectedAttendance = useMemo(() => {
    if (!selectedMemberId) return null;
    return attendance.find((a) => a.member_id === selectedMemberId) ?? null;
  }, [attendance, selectedMemberId]);

  const canArrive =
    !!selectedMemberId && (!selectedAttendance || !selectedAttendance.time_in);
  const canClear =
    !!selectedMemberId &&
    !!selectedAttendance?.time_in &&
    !selectedAttendance?.time_out;

  function memberName(id: string) {
    const m = members.find((x) => x.id === id);
    return m ? `${m.first_name} ${m.last_name}` : id;
  }

  async function loadAll() {
    if (!callId) return;

    if (!isUuid(callId)) {
      setErr(`Bad call id in URL: "${callId}"`);
      return;
    }

    try {
      setBusy("reload");
      setErr("");

      const [callRes, membersRes, attRes, notesRes, soRes] = await Promise.all([
        fetch(`/api/calls/${callId}`),
        fetch(`/api/members`),
        fetch(`/api/calls/${callId}/attendance`),
        fetch(`/api/calls/${callId}/notes`),
        fetch(`/api/member-task-signoffs?call_id=${callId}`),
      ]);

      const callJson = await callRes.json().catch(() => ({}));
      if (!callRes.ok) throw new Error(callJson?.error ?? "Failed to load call");
      setCall(callJson?.data ?? null);

      const membersJson = await membersRes.json().catch(() => ([]));
      setMembers(asArray<Member>(membersJson));

      const attJson = await attRes.json().catch(() => ([]));
      setAttendance(asArray<Attendance>(attJson));

      const notesJson = await notesRes.json().catch(() => ([]));
      setNotes(asArray<CallNote>(notesJson));

      const soJson = await soRes.json().catch(() => ([]));
      setCompSignoffs(asArray<SignoffRow>(soJson));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  // Load member's positions when competency member changes
  useEffect(() => {
    setCompPositionId("");
    setCompTasks([]);
    setCompSelectedTaskIds(new Set());
    if (!compMemberId || !isUuid(compMemberId)) { setCompMemberPositions([]); return; }
    fetch(`/api/member-positions?member_id=${compMemberId}`)
      .then((r) => r.json())
      .then((j) => setCompMemberPositions(asArray<MemberPosition>(j)))
      .catch(() => setCompMemberPositions([]));
  }, [compMemberId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load tasks when competency position changes
  useEffect(() => {
    setCompTasks([]);
    setCompSelectedTaskIds(new Set());
    if (!compPositionId || !isUuid(compPositionId)) return;
    fetch(`/api/positions/${compPositionId}/requirements`)
      .then((r) => r.json())
      .then((j) => setCompTasks(j?.data?.tasks ?? []))
      .catch(() => setCompTasks([]));
  }, [compPositionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function signOffMissionTask(taskId: string) {
    if (!compMemberId || !compPositionId) return;
    setBusy("signoff");
    try {
      const res = await fetch("/api/member-task-signoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: compMemberId,
          position_id: compPositionId,
          task_id: taskId,
          call_id: callId,
          evaluator_name: compEvaluator || null,
          notes: compNotes || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Sign-off failed");
      setCompSignoffs((prev) => [json.data, ...prev]);
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function saveCall() {
    if (!call) return;

    // enforce Other rules client-side
    if ((call.type ?? "") === "Other" && !(call.type_other ?? "").trim()) {
      alert("Please specify type_other when Type = Other.");
      return;
    }

    try {
      setBusy("save");
      setErr("");

      const res = await fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: call.title,
          type: call.type,
          type_other: call.type === "Other" ? call.type_other : null,
          location_text: call.location_text,
          summary: call.summary,
          visibility: call.visibility,
          status: call.status,

          // staging/incident location fields (for later geo-checkin)
          incident_lat: call.incident_lat,
          incident_lng: call.incident_lng,
          incident_radius_m: call.incident_radius_m,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Save failed");

      setCall(json?.data ?? null);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    try {
      setBusy("addNote");
      setErr("");

      const res = await fetch(`/api/calls/${callId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_text: noteText.trim() }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Add note failed");

      setNotes(asArray<CallNote>(json));
      setNoteText("");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function postAttendance(action?: "arrive" | "clear") {
    if (!selectedMemberId) return;

    try {
      setBusy(action === "arrive" ? "arrive" : action === "clear" ? "clear" : "add");

      const res = await fetch(`/api/calls/${callId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: selectedMemberId, ...(action ? { action } : {}) }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Attendance update failed");

      setAttendance(asArray<Attendance>(json));
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  if (!call && !err) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</main>;
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1000 }}>
      <p>
        <a href="/calls">← Back to Calls</a>
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Call Detail</h1>
        <span style={{ opacity: 0.7, fontSize: 12 }}>{callId}</span>
        <button
          type="button"
          onClick={loadAll}
          disabled={busy !== ""}
          style={{ marginLeft: "auto" }}
        >
          {busy === "reload" ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {err ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: "1px solid #eee",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          <strong>Error:</strong> {err}
        </div>
      ) : null}

      {call ? (
        <>
          {/* Editable call fields */}
          <section style={{ marginTop: 16, padding: 14, border: "1px solid #e5e5e5", borderRadius: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                Status:
                <select
                  value={(call.status ?? "open") as any}
                  onChange={(e) => setCall({ ...call, status: e.target.value })}
                >
                  <option value="open">open</option>
                  <option value="closed">closed</option>
                  <option value="cancelled">cancelled</option>
                  <option value="archived">archived</option>
                </select>
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                Visibility:
                <select
                  value={(call.visibility ?? "members") as any}
                  onChange={(e) => setCall({ ...call, visibility: e.target.value })}
                >
                  <option value="members">members</option>
                  <option value="public">public</option>
                </select>
              </label>

              {call.is_test ? (
                <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 999 }}>
                  TEST
                </span>
              ) : null}

              <span style={{ opacity: 0.75, fontSize: 12 }}>
                Start: {call.start_dt ? fmtDt(call.start_dt) : "—"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Title</div>
                <input
                  style={{ width: "100%", padding: 8 }}
                  value={call.title ?? ""}
                  onChange={(e) => setCall({ ...call, title: e.target.value })}
                  placeholder="Case name / incident title"
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Type</div>
                <select
                  style={{ width: "100%", padding: 8 }}
                  value={call.type ?? ""}
                  onChange={(e) => {
                    const t = e.target.value;
                    setCall({
                      ...call,
                      type: t,
                      type_other: t === "Other" ? (call.type_other ?? "") : null,
                    });
                  }}
                >
                  <option value="">Select type…</option>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                {call.type === "Other" ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Type (Other)</div>
                    <input
                      style={{ width: "100%", padding: 8 }}
                      value={call.type_other ?? ""}
                      onChange={(e) => setCall({ ...call, type_other: e.target.value })}
                      placeholder="Specify type"
                    />
                  </div>
                ) : null}
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Location</div>
                <input
                  style={{ width: "100%", padding: 8 }}
                  value={call.location_text ?? ""}
                  onChange={(e) => setCall({ ...call, location_text: e.target.value })}
                  placeholder="Staging / trailhead / mile marker / etc."
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Summary</div>
                <input
                  style={{ width: "100%", padding: 8 }}
                  value={call.summary ?? ""}
                  onChange={(e) => setCall({ ...call, summary: e.target.value })}
                  placeholder="Short notes"
                />
              </div>
            </div>

            {/* Staging location fields (for future geolocation check-in) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Staging Lat (optional)</div>
                <input
                  style={{ width: "100%", padding: 8 }}
                  value={call.incident_lat ?? ""}
                  onChange={(e) =>
                    setCall({ ...call, incident_lat: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  placeholder="e.g. 41.12345"
                />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Staging Lng (optional)</div>
                <input
                  style={{ width: "100%", padding: 8 }}
                  value={call.incident_lng ?? ""}
                  onChange={(e) =>
                    setCall({ ...call, incident_lng: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  placeholder="e.g. -74.12345"
                />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Radius m</div>
                <input
                  style={{ width: "100%", padding: 8 }}
                  value={call.incident_radius_m ?? 600}
                  onChange={(e) =>
                    setCall({
                      ...call,
                      incident_radius_m: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="button" onClick={saveCall} disabled={busy !== ""}>
                {busy === "save" ? "Saving…" : "Save Call"}
              </button>
            </div>
          </section>

          {/* Notes / narrative log */}
          <section style={{ marginTop: 16, padding: 14, border: "1px solid #e5e5e5", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>Narrative / Notes (timestamped)</h2>

            <textarea
              style={{ width: "100%", minHeight: 90, padding: 10 }}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a time-stamped narrative entry (append-only)…"
            />

            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button type="button" onClick={addNote} disabled={busy !== "" || !noteText.trim()}>
                {busy === "addNote" ? "Adding…" : "Add Note"}
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {notes.length === 0 ? (
                <p style={{ opacity: 0.7 }}>No notes yet.</p>
              ) : (
                <ul style={{ paddingLeft: 18 }}>
                  {notes.map((n) => (
                    <li key={n.id} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{fmtDt(n.created_at)}</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{n.note_text}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Attendance */}
          <section style={{ marginTop: 16, padding: 14, border: "1px solid #e5e5e5", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>Attendance</h2>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)}>
                <option value="">Select member</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.first_name} {m.last_name}
                  </option>
                ))}
              </select>

              <button onClick={() => postAttendance()} disabled={!selectedMemberId || busy !== ""}>
                {busy === "add" ? "Adding…" : "Add"}
              </button>

              <button onClick={() => postAttendance("arrive")} disabled={!canArrive || busy !== ""}>
                {busy === "arrive" ? "Arriving…" : "Arrived"}
              </button>

              <button onClick={() => postAttendance("clear")} disabled={!canClear || busy !== ""}>
                {busy === "clear" ? "Clearing…" : "Cleared"}
              </button>
            </div>

            <ul style={{ marginTop: 12, paddingLeft: 18 }}>
              {attendance.map((a) => (
                <li key={a.id} style={{ marginBottom: 8 }}>
                  <strong>{memberName(a.member_id)}</strong>
                  {a.role_on_call ? ` — ${a.role_on_call}` : ""}
                  {a.time_in ? ` | in: ${fmtDt(a.time_in)}` : ""}
                  {a.time_out ? ` | out: ${fmtDt(a.time_out)}` : ""}
                </li>
              ))}
            </ul>
          </section>

          {/* ── Mission Competency Sign-offs ── */}
          <section style={{ marginTop: 16, padding: 14, border: "1px solid #e5e5e5", borderRadius: 10 }}>
            <h2 style={{ marginTop: 0 }}>Mission Competency Sign-offs</h2>
            <p style={{ fontSize: 12, opacity: 0.65, marginTop: 0 }}>
              Record task sign-offs observed during this mission. Select a member on this call, their position, and the tasks demonstrated.
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Member</div>
                <select
                  value={compMemberId}
                  onChange={(e) => setCompMemberId(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}
                >
                  <option value="">Select member…</option>
                  {attendance.map((a) => (
                    <option key={a.member_id} value={a.member_id}>{memberName(a.member_id)}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Position</div>
                <select
                  value={compPositionId}
                  onChange={(e) => setCompPositionId(e.target.value)}
                  disabled={!compMemberId}
                  style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}
                >
                  <option value="">Select position…</option>
                  {compMemberPositions.map((mp) => (
                    <option key={mp.position_id} value={mp.position_id}>
                      {(mp.positions as any)?.code} — {(mp.positions as any)?.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Evaluator name</div>
                <input
                  value={compEvaluator}
                  onChange={(e) => setCompEvaluator(e.target.value)}
                  placeholder="Optional"
                  style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Notes</div>
                <input
                  value={compNotes}
                  onChange={(e) => setCompNotes(e.target.value)}
                  placeholder="Optional"
                  style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}
                />
              </div>
            </div>

            {compPositionId && compTasks.length > 0 ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.8 }}>Tasks</div>
                <ul style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
                  {compTasks.map((t) => {
                    const signed = compSignoffs.some(
                      (s) => s.member_id === compMemberId && s.task_id === t.id
                    );
                    return (
                      <li key={t.id} style={{ padding: "6px 0", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 13 }}>
                          {signed ? (
                            <span style={{ color: "#1a7f3c", marginRight: 6 }}>✓</span>
                          ) : (
                            <span style={{ marginRight: 6, opacity: 0.3 }}>○</span>
                          )}
                          <strong>{t.task_code}</strong>
                          <span style={{ opacity: 0.65, marginLeft: 6 }}>{t.task_name}</span>
                        </div>
                        {!signed ? (
                          <button
                            type="button"
                            onClick={() => signOffMissionTask(t.id)}
                            disabled={busy !== ""}
                            style={{ fontSize: 12, padding: "3px 10px", cursor: "pointer", borderRadius: 6, border: "1px solid #ddd" }}
                          >
                            {busy === "signoff" ? "…" : "Sign Off"}
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, opacity: 0.5 }}>
                            {(() => {
                              const s = compSignoffs.find((s) => s.member_id === compMemberId && s.task_id === t.id);
                              return s ? `${s.evaluator_name ?? "Signed"} · ${new Date(s.signed_at).toLocaleDateString()}` : "Signed";
                            })()}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : compPositionId ? (
              <p style={{ fontSize: 12, opacity: 0.65, marginTop: 10 }}>No tasks defined for this position.</p>
            ) : null}

            {compSignoffs.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, marginBottom: 6 }}>
                  All sign-offs on this call ({compSignoffs.length})
                </div>
                <ul style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
                  {compSignoffs.map((s) => (
                    <li key={s.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f5f5f5", opacity: 0.85 }}>
                      <strong>{memberName(s.member_id)}</strong>
                      <span style={{ opacity: 0.65, marginLeft: 6 }}>task {s.task_id.slice(0, 8)}…</span>
                      {s.evaluator_name ? <span style={{ opacity: 0.65 }}> · {s.evaluator_name}</span> : null}
                      <span style={{ opacity: 0.5, marginLeft: 6 }}>{new Date(s.signed_at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
