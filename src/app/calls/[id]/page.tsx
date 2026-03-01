"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Member = {
  id: string;
  first_name: string;
  last_name: string;
  field_roles?: string[] | null;
  roster_certs?: string[] | null;
};

type Call = {
  id: string;
  title?: string | null;
  status?: string | null;
  start_dt?: string | null;
  end_dt?: string | null;
  summary?: string | null;
  incident_lat?: number | null;
  incident_lng?: number | null;
  incident_radius_m?: number | null;
};

type Attendance = {
  id: string;
  call_id: string;
  member_id: string;
  time_in?: string | null;
  time_out?: string | null;
  notes?: string | null;
};

type Task = {
  id: string;
  task_code: string;
  task_name: string;
};

type CallSignoff = {
  id: string;
  member_id: string;
  task_id: string;
  evaluator_name?: string | null;
  notes?: string | null;
  signed_at: string;
};

function asArray<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  return ((json as Record<string, unknown>)?.data ?? []) as T[];
}

function fmtDt(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

/** Convert an ISO timestamp to the value expected by datetime-local inputs */
function toDatetimeLocal(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function statusBadge(status: string): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 12,
    padding: "3px 10px",
    borderRadius: 999,
    fontWeight: 700,
    display: "inline-block",
    textTransform: "capitalize",
  };
  if (status === "open") return { ...base, background: "#dcfce7", border: "1px solid #86efac", color: "#14532d" };
  if (status === "closed") return { ...base, background: "#eff6ff", border: "1px solid #93c5fd", color: "#1e3a8a" };
  if (status === "cancelled") return { ...base, background: "#fff7ed", border: "1px solid #fdba74", color: "#7c2d12" };
  return { ...base, background: "#f4f4f4", border: "1px solid #ddd", color: "#555" };
}

export default function CallDetailPage() {
  const params = useParams();
  const callId =
    typeof (params as Record<string, unknown>)?.id === "string"
      ? (params as Record<string, string>).id
      : Array.isArray((params as Record<string, unknown>)?.id)
      ? ((params as Record<string, string[]>).id)[0]
      : "";

  const [call, setCall] = useState<Call | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [callSignoffs, setCallSignoffs] = useState<CallSignoff[]>([]);

  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [closing, setClosing] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [geoSaveMsg, setGeoSaveMsg] = useState("");

  // Per-row time edits: attendance.id → {time_in, time_out} as datetime-local strings
  const [rowEdits, setRowEdits] = useState<Record<string, { time_in: string; time_out: string }>>({});
  const [savingRow, setSavingRow] = useState("");

  // Skill sign-off form
  const [signoffForm, setSignoffForm] = useState({ member_id: "", task_id: "", evaluator_name: "", notes: "" });
  const [busySignoff, setBusySignoff] = useState(false);
  const [signoffMsg, setSignoffMsg] = useState("");

  // Sync rowEdits whenever attendance changes
  useEffect(() => {
    setRowEdits((prev) => {
      const next: Record<string, { time_in: string; time_out: string }> = {};
      for (const a of attendance) {
        // Keep any in-progress edits; only initialise for new rows
        next[a.id] = prev[a.id] ?? { time_in: toDatetimeLocal(a.time_in), time_out: toDatetimeLocal(a.time_out) };
      }
      return next;
    });
  }, [attendance]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoSaveMsg("GPS not available on this device.");
      return;
    }
    setGpsLoading(true);
    setGeoSaveMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCall((c) => c ? {
          ...c,
          incident_lat: parseFloat(pos.coords.latitude.toFixed(6)),
          incident_lng: parseFloat(pos.coords.longitude.toFixed(6)),
        } : c);
        setGpsLoading(false);
      },
      () => {
        setGeoSaveMsg("Could not get location. Check browser permissions.");
        setGpsLoading(false);
      },
      { timeout: 10000 }
    );
  }

  async function saveGeo() {
    if (!call) return;
    setBusy("geo");
    setGeoSaveMsg("");
    try {
      const res = await fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incident_lat: call.incident_lat ?? null,
          incident_lng: call.incident_lng ?? null,
          incident_radius_m: call.incident_radius_m ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Save failed");
      setCall(json?.data ?? call);
      setGeoSaveMsg("Saved.");
    } catch (e: unknown) {
      setGeoSaveMsg((e as Error)?.message ?? "Error");
    } finally {
      setBusy("");
    }
  }

  const selectedAttendance = useMemo(
    () => attendance.find((a) => a.member_id === selectedMemberId) ?? null,
    [attendance, selectedMemberId]
  );
  const canArrive = !!selectedMemberId && (!selectedAttendance || !selectedAttendance.time_in);
  const canClear = !!selectedMemberId && !!selectedAttendance?.time_in && !selectedAttendance?.time_out;

  function memberName(id: string) {
    const m = members.find((x) => x.id === id);
    return m ? `${m.first_name} ${m.last_name}` : id;
  }

  async function loadAll() {
    if (!callId || !isUuid(callId)) {
      setErr(`Bad call id in URL: "${callId}"`);
      return;
    }
    try {
      setBusy("reload");
      setErr("");
      const [callRes, membersRes, attRes, tasksRes, signoffsRes] = await Promise.all([
        fetch(`/api/calls/${callId}`),
        fetch(`/api/members`),
        fetch(`/api/calls/${callId}/attendance`),
        fetch(`/api/tasks`),
        fetch(`/api/member-task-signoffs?call_id=${callId}`),
      ]);

      const callJson = await callRes.json().catch(() => ({}));
      if (!callRes.ok) throw new Error(callJson?.error ?? "Failed to load call");
      setCall(callJson?.data ?? null);

      const membersJson = await membersRes.json().catch(() => ([]));
      setMembers(asArray<Member>(membersJson));

      const attJson = await attRes.json().catch(() => ([]));
      setAttendance(asArray<Attendance>(attJson));

      const tasksJson = await tasksRes.json().catch(() => ({}));
      setTasks(tasksJson.data ?? []);

      const signoffsJson = await signoffsRes.json().catch(() => ({}));
      setCallSignoffs(signoffsJson.data ?? []);
    } catch (e: unknown) {
      setErr((e as Error)?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

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
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function saveRowTime(attendanceId: string) {
    const edit = rowEdits[attendanceId];
    if (!edit) return;
    setSavingRow(attendanceId);
    try {
      const time_in = edit.time_in ? new Date(edit.time_in).toISOString() : null;
      const time_out = edit.time_out ? new Date(edit.time_out).toISOString() : null;
      const res = await fetch(`/api/calls/${callId}/attendance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendance_id: attendanceId, time_in, time_out }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Save failed");
      setAttendance(asArray<Attendance>(json));
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setSavingRow("");
    }
  }

  async function closeCall() {
    if (!call) return;
    setClosing(true);
    try {
      const res = await fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed", end_dt: new Date().toISOString() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Close failed");
      setCall(json?.data ?? call);
    } catch (e: unknown) {
      alert((e as Error)?.message ?? String(e));
    } finally {
      setClosing(false);
    }
  }

  async function addSignoff(e: React.FormEvent) {
    e.preventDefault();
    setBusySignoff(true);
    setSignoffMsg("");
    try {
      const res = await fetch("/api/member-task-signoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: signoffForm.member_id,
          task_id: signoffForm.task_id,
          call_id: callId,
          evaluator_name: signoffForm.evaluator_name || undefined,
          notes: signoffForm.notes || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setSignoffMsg(json?.error ?? "Failed to record skill"); return; }
      // Reload signoffs
      const soRes = await fetch(`/api/member-task-signoffs?call_id=${callId}`);
      const soJson = await soRes.json().catch(() => ({}));
      setCallSignoffs(soJson.data ?? []);
      setSignoffForm((f) => ({ ...f, task_id: "", notes: "" }));
      setSignoffMsg("Skill recorded.");
    } finally {
      setBusySignoff(false);
    }
  }

  // Members who attended the call (have time_in)
  const attendingMembers = useMemo(() => {
    return attendance
      .filter((a) => a.time_in)
      .map((a) => {
        const m = members.find((x) => x.id === a.member_id);
        return { ...a, member: m ?? null };
      });
  }, [attendance, members]);

  if (!call && !err) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</main>;
  }

  const status = (call?.status ?? "open").toLowerCase();
  const isClosed = status === "closed";

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <p style={{ marginTop: 0 }}>
        <a href="/calls">← Back to Calls</a>
      </p>

      {err && (
        <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fafafa", marginBottom: 12 }}>
          <strong>Error:</strong> {err}
        </div>
      )}

      {call && (
        <>
          {/* Header */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: "0 0 6px" }}>{call.title ?? "(Untitled)"}</h1>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={statusBadge(status)}>{status}</span>
                <span style={{ fontSize: 13, opacity: 0.7 }}>Start: {fmtDt(call.start_dt)}</span>
                {call.end_dt && <span style={{ fontSize: 13, opacity: 0.7 }}>End: {fmtDt(call.end_dt)}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={loadAll}
                disabled={busy !== ""}
                style={{ fontSize: 13, padding: "6px 12px" }}
              >
                {busy === "reload" ? "Refreshing…" : "Refresh"}
              </button>
              {!isClosed && (
                <button
                  type="button"
                  onClick={closeCall}
                  disabled={closing}
                  style={{
                    fontSize: 13,
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "1px solid #dc2626",
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {closing ? "Closing…" : "Close Call"}
                </button>
              )}
            </div>
          </div>

          {/* Info section */}
          <section style={{ padding: 14, border: "1px solid #e5e5e5", borderRadius: 10, marginBottom: 16 }}>
            {call.summary && (
              <div style={{ fontSize: 13, marginBottom: 12, whiteSpace: "pre-wrap", opacity: 0.85 }}>
                {call.summary}
              </div>
            )}

            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Geofence</div>
            <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 10px" }}>
              Members must be within the radius to self check-in. Leave blank to disable.
            </p>

            <div style={{ marginBottom: 10 }}>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={gpsLoading || busy === "geo"}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, cursor: "pointer" }}
              >
                {gpsLoading ? "Getting location…" : "📍 Use my location"}
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, opacity: 0.65, marginBottom: 3 }}>
                  Incident Lat
                </label>
                <input
                  value={call.incident_lat ?? ""}
                  onChange={(e) => setCall({ ...call, incident_lat: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="e.g. 41.12345"
                  style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, opacity: 0.65, marginBottom: 3 }}>
                  Incident Lng
                </label>
                <input
                  value={call.incident_lng ?? ""}
                  onChange={(e) => setCall({ ...call, incident_lng: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="e.g. -74.12345"
                  style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, opacity: 0.65, marginBottom: 3 }}>
                  Radius (m)
                </label>
                <input
                  type="number"
                  min={50}
                  value={call.incident_radius_m ?? ""}
                  onChange={(e) => setCall({ ...call, incident_radius_m: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="500"
                  style={{ width: "100%", padding: "7px 8px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={saveGeo}
                disabled={busy === "geo" || gpsLoading}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, cursor: "pointer" }}
              >
                {busy === "geo" ? "Saving…" : "Save Geofence"}
              </button>
              {geoSaveMsg && (
                <span style={{ fontSize: 12, color: geoSaveMsg === "Saved." ? "#15803d" : "#dc2626" }}>
                  {geoSaveMsg}
                </span>
              )}
            </div>
          </section>

          {/* Attendance section */}
          <section style={{ padding: 14, border: "1px solid #e5e5e5", borderRadius: 10, marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>
              Attendance
              <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.65, marginLeft: 8 }}>
                ({attendance.length} records)
              </span>
            </h2>

            {/* Admin controls — available on both open and closed calls */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }}
              >
                <option value="">Select member…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.first_name} {m.last_name}
                  </option>
                ))}
              </select>
              <button onClick={() => postAttendance()} disabled={!selectedMemberId || busy !== ""} style={{ fontSize: 13 }}>
                {busy === "add" ? "Adding…" : "Add"}
              </button>
              <button onClick={() => postAttendance("arrive")} disabled={!canArrive || busy !== ""} style={{ fontSize: 13 }}>
                {busy === "arrive" ? "…" : "Mark Arrived"}
              </button>
              <button onClick={() => postAttendance("clear")} disabled={!canClear || busy !== ""} style={{ fontSize: 13 }}>
                {busy === "clear" ? "…" : "Mark Cleared"}
              </button>
            </div>

            {attendance.length === 0 ? (
              <p style={{ fontSize: 13, opacity: 0.65 }}>No attendance records yet.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Member</th>
                    <th style={thStyle}>Time In</th>
                    <th style={thStyle}>Time Out</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((a) => {
                    const edit = rowEdits[a.id] ?? { time_in: "", time_out: "" };
                    const isSaving = savingRow === a.id;
                    const isDirty =
                      edit.time_in !== toDatetimeLocal(a.time_in) ||
                      edit.time_out !== toDatetimeLocal(a.time_out);
                    return (
                      <tr key={a.id}>
                        <td style={tdStyle}>
                          <strong>{memberName(a.member_id)}</strong>
                          {a.time_in && !a.time_out && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 11,
                                padding: "1px 7px",
                                borderRadius: 999,
                                background: "#dcfce7",
                                border: "1px solid #86efac",
                                color: "#15803d",
                                fontWeight: 600,
                              }}
                            >
                              On Site
                            </span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <input
                            type="datetime-local"
                            value={edit.time_in}
                            onChange={(e) =>
                              setRowEdits((prev) => ({
                                ...prev,
                                [a.id]: { ...edit, time_in: e.target.value },
                              }))
                            }
                            style={timeInputStyle}
                          />
                        </td>
                        <td style={tdStyle}>
                          <input
                            type="datetime-local"
                            value={edit.time_out}
                            onChange={(e) =>
                              setRowEdits((prev) => ({
                                ...prev,
                                [a.id]: { ...edit, time_out: e.target.value },
                              }))
                            }
                            style={timeInputStyle}
                          />
                        </td>
                        <td style={tdStyle}>
                          {isDirty && (
                            <button
                              type="button"
                              onClick={() => saveRowTime(a.id)}
                              disabled={isSaving}
                              style={{
                                fontSize: 12,
                                padding: "3px 10px",
                                borderRadius: 6,
                                border: "1px solid #93c5fd",
                                background: "#eff6ff",
                                color: "#1e40af",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              {isSaving ? "Saving…" : "Save"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* Post-call section (closed only) */}
          {isClosed && (
            <section style={{ padding: 14, border: "1px solid #e5e5e5", borderRadius: 10, marginBottom: 16, background: "#fafafa" }}>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Post-Call Summary</h2>

              {attendingMembers.length === 0 ? (
                <p style={{ fontSize: 13, opacity: 0.65 }}>No members attended this call.</p>
              ) : (
                <>
                  <p style={{ fontSize: 12, opacity: 0.65, marginTop: 0 }}>
                    Members who attended with their field roles and certifications:
                  </p>
                  <ul style={{ paddingLeft: 0, listStyle: "none", margin: "0 0 20px" }}>
                    {attendingMembers.map((a) => {
                      const m = a.member;
                      const name = m ? `${m.first_name} ${m.last_name}` : a.member_id;
                      const fieldRoles = m?.field_roles ?? [];
                      const certs = m?.roster_certs ?? [];
                      return (
                        <li
                          key={a.id}
                          style={{
                            padding: "8px 0",
                            borderBottom: "1px solid #eee",
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            flexWrap: "wrap",
                            fontSize: 13,
                          }}
                        >
                          <strong style={{ minWidth: 160 }}>{name}</strong>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {fieldRoles.map((code) => (
                              <span
                                key={code}
                                style={{
                                  fontSize: 11,
                                  padding: "1px 8px",
                                  borderRadius: 999,
                                  background: "#f0fdf4",
                                  border: "1px solid #86efac",
                                  color: "#15803d",
                                }}
                              >
                                {code}
                              </span>
                            ))}
                            {certs.map((code) => (
                              <span
                                key={code}
                                style={{
                                  fontSize: 11,
                                  padding: "1px 8px",
                                  borderRadius: 999,
                                  background: "#eff6ff",
                                  border: "1px solid #93c5fd",
                                  color: "#1e3a8a",
                                }}
                              >
                                {code}
                              </span>
                            ))}
                            {fieldRoles.length === 0 && certs.length === 0 && (
                              <span style={{ opacity: 0.45 }}>—</span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {/* Skill Sign-offs */}
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                Skill Sign-offs
                <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 13, marginLeft: 8 }}>
                  ({callSignoffs.length})
                </span>
              </h3>

              {callSignoffs.length > 0 && (
                <ul style={{ paddingLeft: 0, listStyle: "none", margin: "0 0 14px" }}>
                  {callSignoffs.map((s) => {
                    const task = tasks.find((t) => t.id === s.task_id);
                    return (
                      <li
                        key={s.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          padding: "6px 0",
                          borderBottom: "1px solid #eee",
                          fontSize: 13,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ color: "#1a7f3c", fontWeight: 700 }}>✓</span>
                        <strong style={{ minWidth: 140 }}>{memberName(s.member_id)}</strong>
                        <span style={{ flex: 1 }}>
                          {task ? `${task.task_code} — ${task.task_name}` : s.task_id}
                        </span>
                        {s.evaluator_name && (
                          <span style={{ fontSize: 12, opacity: 0.6 }}>by {s.evaluator_name}</span>
                        )}
                        {s.notes && <span style={{ fontSize: 12, opacity: 0.6 }}>· {s.notes}</span>}
                        <span style={{ fontSize: 12, opacity: 0.5 }}>{new Date(s.signed_at).toLocaleDateString()}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Add sign-off form */}
              <form onSubmit={addSignoff} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={signoffForm.member_id}
                  onChange={(e) => setSignoffForm((f) => ({ ...f, member_id: e.target.value }))}
                  style={selectStyle}
                  required
                >
                  <option value="">Select member…</option>
                  {attendingMembers.map((a) => {
                    const m = a.member;
                    const name = m ? `${m.first_name} ${m.last_name}` : a.member_id;
                    return <option key={a.member_id} value={a.member_id}>{name}</option>;
                  })}
                </select>

                <select
                  value={signoffForm.task_id}
                  onChange={(e) => setSignoffForm((f) => ({ ...f, task_id: e.target.value }))}
                  style={{ ...selectStyle, flex: 1, minWidth: 200 }}
                  required
                >
                  <option value="">Select skill…</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.task_code} — {t.task_name}</option>
                  ))}
                </select>

                <input
                  placeholder="Evaluator (opt)"
                  value={signoffForm.evaluator_name}
                  onChange={(e) => setSignoffForm((f) => ({ ...f, evaluator_name: e.target.value }))}
                  style={{ width: 140, ...selectStyle }}
                />

                <input
                  placeholder="Notes (opt)"
                  value={signoffForm.notes}
                  onChange={(e) => setSignoffForm((f) => ({ ...f, notes: e.target.value }))}
                  style={{ width: 120, ...selectStyle }}
                />

                <button
                  type="submit"
                  disabled={busySignoff || !signoffForm.member_id || !signoffForm.task_id}
                  style={{
                    fontSize: 13,
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "1px solid #86efac",
                    background: "#f0fdf4",
                    color: "#15803d",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {busySignoff ? "Recording…" : "Record Skill"}
                </button>
              </form>

              {signoffMsg && (
                <p style={{ fontSize: 12, marginTop: 8, color: signoffMsg.startsWith("Skill recorded") ? "#15803d" : "#dc2626" }}>
                  {signoffMsg}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #ddd",
  fontSize: 12,
  opacity: 0.85,
  background: "#fafafa",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #eee",
  verticalAlign: "middle",
};

const timeInputStyle: React.CSSProperties = {
  padding: "4px 6px",
  borderRadius: 6,
  border: "1px solid #ddd",
  fontSize: 12,
  width: "100%",
};

const selectStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #ddd",
  fontSize: 13,
};
