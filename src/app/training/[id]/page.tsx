"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

// ── Types ────────────────────────────────────────────────────────────────────

type TrainingSession = {
  id: string;
  title: string;
  start_dt?: string | null;
  end_dt?: string | null;
  location_text?: string | null;
  instructor?: string | null;
  notes?: string | null;
  status?: string | null;
  visibility?: string | null;
  is_test?: boolean | null;
};

type AttendanceRow = {
  id: string;
  training_session_id: string;
  member_id: string;
  status: string;
  hours?: number | null;
  notes?: string | null;
  created_at: string;
  members?: { first_name: string; last_name: string } | null;
};

type TaskMapRow = {
  id: string;
  training_session_id?: string | null;
  position_id: string;
  task_id: string;
  evaluation_method?: string | null;
  positions?: { id: string; code: string; name: string } | null;
  tasks?: { id: string; task_code: string; task_name: string } | null;
};

type MemberRow = { id: string; first_name: string; last_name: string };
type PositionRow = { id: string; code: string; name: string; position_type?: string };
type TaskRow = { id: string; task_code: string; task_name: string; description?: string | null; is_active?: boolean };

type SignoffRow = {
  id: string;
  member_id: string;
  position_id: string;
  task_id: string;
  evaluator_name?: string | null;
  signed_at: string;
  notes?: string | null;
};

type SearchGroup = {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  training_session_id: string | null;
  call_id: string | null;
  search_group_members?: SearchGroupMember[];
};

type SearchGroupMember = {
  id: string;
  search_group_id: string;
  member_id: string;
  position_id: string | null;
  is_trainee: boolean;
  notes: string | null;
  created_at: string;
  members?: { first_name: string; last_name: string } | null;
  positions?: { id: string; code: string; name: string } | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

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

function memberName(m: MemberRow) {
  return `${m.first_name} ${m.last_name}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrainingDetailPage() {
  const params = useParams();
  const sessionId =
    typeof (params as any)?.id === "string"
      ? (params as any).id
      : Array.isArray((params as any)?.id)
      ? (params as any).id[0]
      : "";

  // ── Core data ──
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [taskMap, setTaskMap] = useState<TaskMapRow[]>([]);
  const [sessionSignoffs, setSessionSignoffs] = useState<SignoffRow[]>([]);
  const [allMembers, setAllMembers] = useState<MemberRow[]>([]);
  const [allPositions, setAllPositions] = useState<PositionRow[]>([]);

  // ── Form state: session edit ──
  const [editSession, setEditSession] = useState<Partial<TrainingSession>>({});

  // ── Form state: attendance ──
  const [attMemberId, setAttMemberId] = useState("");

  // ── Form state: task map ──
  const [mapPositionId, setMapPositionId] = useState("");
  const [mapTaskId, setMapTaskId] = useState("");
  const [mapPositionTasks, setMapPositionTasks] = useState<TaskRow[]>([]);

  // ── Form state: sign-offs ──
  const [soMemberId, setSoMemberId] = useState("");
  const [soTaskMapId, setSoTaskMapId] = useState(""); // selected task map row id
  const [soEvaluator, setSoEvaluator] = useState("");
  const [soNotes, setSoNotes] = useState("");

  // ── Search groups state ──
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupMemberAdd, setGroupMemberAdd] = useState<
    Record<string, { memberId: string; positionId: string; isTrainee: boolean }>
  >({});

  // ── UI state ──
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  // ── Load all ──────────────────────────────────────────────────────────────

  async function loadAll() {
    if (!sessionId || !isUuid(sessionId)) {
      setErr(`Bad session id: "${sessionId}"`);
      return;
    }
    setBusy("reload");
    setErr("");
    try {
      const [sessRes, attRes, mapRes, soRes, membersRes, posRes, groupsRes] = await Promise.all([
        fetch(`/api/training-sessions/${sessionId}`),
        fetch(`/api/training-attendance?training_session_id=${sessionId}`),
        fetch(`/api/training-task-map?training_session_id=${sessionId}`),
        fetch(`/api/member-task-signoffs?training_session_id=${sessionId}`),
        fetch(`/api/members`),
        fetch(`/api/positions`),
        fetch(`/api/search-groups?training_session_id=${sessionId}`),
      ]);

      const sessJson = await sessRes.json().catch(() => ({}));
      if (!sessRes.ok) throw new Error(sessJson?.error ?? "Failed to load session");
      const s = sessJson?.data ?? null;
      setSession(s);
      setEditSession(s ?? {});

      setAttendance(asArray<AttendanceRow>(await attRes.json().catch(() => [])));
      setTaskMap(asArray<TaskMapRow>(await mapRes.json().catch(() => [])));
      setSessionSignoffs(asArray<SignoffRow>(await soRes.json().catch(() => [])));
      setAllMembers(asArray<MemberRow>(await membersRes.json().catch(() => [])));
      setAllPositions(asArray<PositionRow>(await posRes.json().catch(() => [])));
      setGroups(asArray<SearchGroup>(await groupsRes.json().catch(() => [])));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  useEffect(() => { loadAll(); }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When map position changes, load tasks for that position
  useEffect(() => {
    if (!mapPositionId || !isUuid(mapPositionId)) {
      setMapPositionTasks([]);
      setMapTaskId("");
      return;
    }
    fetch(`/api/positions/${mapPositionId}/requirements`)
      .then((r) => r.json())
      .then((j) => {
        setMapPositionTasks(j?.data?.tasks ?? []);
        setMapTaskId("");
      })
      .catch(() => setMapPositionTasks([]));
  }, [mapPositionId]);

  // ── Session save ──────────────────────────────────────────────────────────

  async function saveSession() {
    setBusy("save");
    setErr("");
    try {
      const res = await fetch(`/api/training-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editSession),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Save failed");
      const s = json?.data ?? null;
      setSession(s);
      setEditSession(s ?? {});
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  // ── Attendance ────────────────────────────────────────────────────────────

  async function addAttendance() {
    if (!attMemberId) return;
    setBusy("att");
    try {
      const res = await fetch("/api/training-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ training_session_id: sessionId, member_id: attMemberId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to add attendance");
      setAttendance((prev) => {
        const exists = prev.find((a) => a.member_id === attMemberId);
        if (exists) return prev;
        return [...prev, json.data];
      });
      setAttMemberId("");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function removeAttendance(id: string) {
    setBusy("att-del-" + id);
    try {
      const res = await fetch(`/api/training-attendance?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? "Delete failed");
      }
      setAttendance((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  // ── Task map ──────────────────────────────────────────────────────────────

  // Deduplicate: tasks already in the map for this session
  const mappedTaskIds = useMemo(() => new Set(taskMap.map((t) => t.task_id)), [taskMap]);

  async function addTaskToMap() {
    if (!mapPositionId || !mapTaskId) return;
    setBusy("map");
    try {
      const res = await fetch("/api/training-task-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ training_session_id: sessionId, position_id: mapPositionId, task_id: mapTaskId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to add task");
      setTaskMap((prev) => [...prev, json.data]);
      setMapTaskId("");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function removeTaskFromMap(id: string) {
    setBusy("map-del-" + id);
    try {
      const res = await fetch(`/api/training-task-map?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? "Delete failed");
      }
      setTaskMap((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  // ── Sign-offs ─────────────────────────────────────────────────────────────

  const selectedTaskMapRow = useMemo(
    () => taskMap.find((t) => t.id === soTaskMapId) ?? null,
    [taskMap, soTaskMapId]
  );

  // Check if a member+task combo already has a sign-off from this session
  function alreadySigned(member_id: string, task_id: string) {
    return sessionSignoffs.some((s) => s.member_id === member_id && s.task_id === task_id);
  }

  async function signOff() {
    if (!soMemberId || !soTaskMapId || !selectedTaskMapRow) return;
    setBusy("signoff");
    try {
      const res = await fetch("/api/member-task-signoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: soMemberId,
          position_id: selectedTaskMapRow.position_id,
          task_id: selectedTaskMapRow.task_id,
          training_session_id: sessionId,
          evaluator_name: soEvaluator || null,
          notes: soNotes || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Sign-off failed");
      setSessionSignoffs((prev) => [json.data, ...prev]);
      setSoTaskMapId("");
      setSoNotes("");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  // ── Search groups ─────────────────────────────────────────────────────────

  async function addGroup() {
    if (!newGroupName.trim()) return;
    setBusy("grp-add");
    try {
      const res = await fetch("/api/search-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ training_session_id: sessionId, name: newGroupName.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to create group");
      setGroups((prev) => [...prev, json.data]);
      setNewGroupName("");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function deleteGroup(id: string) {
    setBusy("grp-del-" + id);
    try {
      const res = await fetch(`/api/search-groups?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? "Delete failed");
      }
      setGroups((prev) => prev.filter((g) => g.id !== id));
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function addMemberToGroup(groupId: string) {
    const form = groupMemberAdd[groupId];
    if (!form?.memberId) return;
    setBusy("sgm-add-" + groupId);
    try {
      const res = await fetch("/api/search-group-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          search_group_id: groupId,
          member_id: form.memberId,
          position_id: form.positionId || null,
          is_trainee: form.isTrainee ?? true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to add member");
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, search_group_members: [...(g.search_group_members ?? []), json.data] }
            : g
        )
      );
      setGroupMemberAdd((prev) => ({ ...prev, [groupId]: { memberId: "", positionId: "", isTrainee: true } }));
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function removeMemberFromGroup(sgmId: string, groupId: string) {
    setBusy("sgm-del-" + sgmId);
    try {
      const res = await fetch(`/api/search-group-members?id=${sgmId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? "Delete failed");
      }
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, search_group_members: (g.search_group_members ?? []).filter((m) => m.id !== sgmId) }
            : g
        )
      );
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  // Group sign-offs by member for display
  const signoffsByMember = useMemo(() => {
    const map = new Map<string, SignoffRow[]>();
    for (const s of sessionSignoffs) {
      if (!map.has(s.member_id)) map.set(s.member_id, []);
      map.get(s.member_id)!.push(s);
    }
    return map;
  }, [sessionSignoffs]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!session && !err && busy) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</main>;
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <p><Link href="/training">← Back to Training</Link></p>

      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>{session?.title ?? "Training Session"}</h1>
        <button type="button" onClick={loadAll} disabled={busy !== ""} style={{ marginLeft: "auto" }}>
          {busy === "reload" ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {err ? (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
          <strong>Error:</strong> {err}
        </div>
      ) : null}

      {/* ── Session Info ── */}
      <section style={sectionStyle}>
        <h2 style={h2}>Session Info</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Title">
            <input style={inputStyle} value={editSession.title ?? ""} onChange={(e) => setEditSession({ ...editSession, title: e.target.value })} />
          </Field>
          <Field label="Instructor">
            <input style={inputStyle} value={editSession.instructor ?? ""} onChange={(e) => setEditSession({ ...editSession, instructor: e.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Location">
            <input style={inputStyle} value={editSession.location_text ?? ""} onChange={(e) => setEditSession({ ...editSession, location_text: e.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Status">
            <select style={inputStyle} value={editSession.status ?? "scheduled"} onChange={(e) => setEditSession({ ...editSession, status: e.target.value })}>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Notes">
            <input style={inputStyle} value={editSession.notes ?? ""} onChange={(e) => setEditSession({ ...editSession, notes: e.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Visibility">
            <select style={inputStyle} value={editSession.visibility ?? "members"} onChange={(e) => setEditSession({ ...editSession, visibility: e.target.value })}>
              <option value="members">Members</option>
              <option value="public">Public</option>
            </select>
          </Field>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={saveSession} disabled={busy !== ""}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          {session?.start_dt ? <span style={muted}>Start: {fmtDt(session.start_dt)}</span> : null}
          {session?.is_test ? <span style={{ ...muted, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 999 }}>TEST</span> : null}
        </div>
      </section>

      {/* ── Attendance ── */}
      <section style={sectionStyle}>
        <h2 style={h2}>Attendance <span style={muted}>({attendance.length})</span></h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={attMemberId} onChange={(e) => setAttMemberId(e.target.value)} style={inputStyle}>
            <option value="">Select member…</option>
            {allMembers
              .filter((m) => !attendance.find((a) => a.member_id === m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>{memberName(m)}</option>
              ))}
          </select>
          <button type="button" onClick={addAttendance} disabled={!attMemberId || busy !== ""}>
            {busy === "att" ? "Adding…" : "Add"}
          </button>
        </div>

        {attendance.length > 0 ? (
          <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: "none" }}>
            {attendance.map((a) => {
              const m = a.members;
              const name = m ? `${m.first_name} ${m.last_name}` : a.member_id;
              const memberSignoffs = signoffsByMember.get(a.member_id) ?? [];
              return (
                <li key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{name}</strong>
                    <span style={{ ...muted, marginLeft: 10 }}>{a.status}</span>
                    {memberSignoffs.length > 0 ? (
                      <span style={{ ...muted, marginLeft: 10 }}>
                        {memberSignoffs.length} sign-off{memberSignoffs.length !== 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttendance(a.id)}
                    disabled={busy !== ""}
                    style={{ fontSize: 12, padding: "2px 8px", cursor: "pointer" }}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p style={muted}>No members added yet.</p>
        )}
      </section>

      {/* ── Search Groups ── */}
      <section style={sectionStyle}>
        <h2 style={h2}>Search Groups <span style={muted}>({groups.length})</span></h2>

        {/* Add group form */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Group name (e.g. Team Alpha)"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addGroup(); }}
          />
          <button type="button" onClick={addGroup} disabled={!newGroupName.trim() || busy !== ""}>
            {busy === "grp-add" ? "Adding…" : "Add Group"}
          </button>
        </div>

        {groups.length === 0 ? (
          <p style={muted}>No groups yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {groups.map((g) => {
              const gMembers = g.search_group_members ?? [];
              const memberIdsInGroup = new Set(gMembers.map((m) => m.member_id));
              const form = groupMemberAdd[g.id] ?? { memberId: "", positionId: "", isTrainee: true };
              const fieldRolePositions = allPositions.filter((p) => p.position_type === "field_role");

              return (
                <div key={g.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
                  {/* Group header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong style={{ fontSize: 14 }}>{g.name}</strong>
                    <button
                      type="button"
                      onClick={() => deleteGroup(g.id)}
                      disabled={busy !== ""}
                      style={{ fontSize: 12, padding: "2px 8px" }}
                    >
                      Delete Group
                    </button>
                  </div>

                  {/* Member list */}
                  {gMembers.length > 0 ? (
                    <ul style={{ paddingLeft: 0, listStyle: "none", marginBottom: 10 }}>
                      {gMembers.map((m) => {
                        const name = m.members
                          ? `${m.members.first_name} ${m.members.last_name}`
                          : m.member_id;
                        return (
                          <li key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}>
                            <div>
                              <strong>{name}</strong>
                              {m.positions ? (
                                <span style={{ ...muted, marginLeft: 8 }}>{m.positions.code}</span>
                              ) : null}
                              <span style={{
                                marginLeft: 8, fontSize: 11, padding: "1px 6px",
                                border: "1px solid #ddd", borderRadius: 999,
                                background: m.is_trainee ? "#fffbe6" : "#e6f7e6",
                              }}>
                                {m.is_trainee ? "trainee" : "qualified"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeMemberFromGroup(m.id, g.id)}
                              disabled={busy !== ""}
                              style={{ fontSize: 11, padding: "1px 7px" }}
                            >
                              Remove
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p style={{ ...muted, marginBottom: 8 }}>No members in this group.</p>
                  )}

                  {/* Add member sub-form */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                      value={form.memberId}
                      onChange={(e) => setGroupMemberAdd((prev) => ({ ...prev, [g.id]: { ...form, memberId: e.target.value } }))}
                    >
                      <option value="">Add attendee…</option>
                      {attendance
                        .filter((a) => !memberIdsInGroup.has(a.member_id))
                        .map((a) => {
                          const m = a.members;
                          const name = m ? `${m.first_name} ${m.last_name}` : a.member_id;
                          return <option key={a.member_id} value={a.member_id}>{name}</option>;
                        })}
                    </select>
                    <select
                      style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                      value={form.positionId}
                      onChange={(e) => setGroupMemberAdd((prev) => ({ ...prev, [g.id]: { ...form, positionId: e.target.value } }))}
                    >
                      <option value="">Role (optional)…</option>
                      {fieldRolePositions.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                      ))}
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, whiteSpace: "nowrap" }}>
                      <input
                        type="checkbox"
                        checked={form.isTrainee ?? true}
                        onChange={(e) => setGroupMemberAdd((prev) => ({ ...prev, [g.id]: { ...form, isTrainee: e.target.checked } }))}
                      />
                      Trainee
                    </label>
                    <button
                      type="button"
                      onClick={() => addMemberToGroup(g.id)}
                      disabled={!form.memberId || busy !== ""}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {busy === "sgm-add-" + g.id ? "Adding…" : "Add"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Task Map ── */}
      <section style={sectionStyle}>
        <h2 style={h2}>Task Map <span style={muted}>— define which competency tasks are evaluated in this session</span></h2>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={mapPositionId} onChange={(e) => setMapPositionId(e.target.value)} style={inputStyle}>
            <option value="">Select position…</option>
            {allPositions.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>

          <select value={mapTaskId} onChange={(e) => setMapTaskId(e.target.value)} style={inputStyle} disabled={!mapPositionId}>
            <option value="">Select task…</option>
            {mapPositionTasks
              .filter((t) => t.is_active !== false && !mappedTaskIds.has(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>{t.task_code} — {t.task_name}</option>
              ))}
          </select>

          <button type="button" onClick={addTaskToMap} disabled={!mapPositionId || !mapTaskId || busy !== ""}>
            {busy === "map" ? "Adding…" : "Add Task"}
          </button>
        </div>

        {taskMap.length > 0 ? (
          <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: "none" }}>
            {taskMap.map((t) => (
              <li key={t.id} style={{ padding: "6px 0", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 12, padding: "1px 6px", border: "1px solid #ddd", borderRadius: 999, marginRight: 8 }}>
                    {(t.positions as any)?.code ?? "?"}
                  </span>
                  <strong>{(t.tasks as any)?.task_code}</strong>
                  <span style={muted}> — {(t.tasks as any)?.task_name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeTaskFromMap(t.id)}
                  disabled={busy !== ""}
                  style={{ fontSize: 12, padding: "2px 8px", cursor: "pointer" }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p style={muted}>No tasks mapped yet. Add tasks above to enable competency sign-offs.</p>
        )}
      </section>

      {/* ── Competency Sign-offs ── */}
      <section style={sectionStyle}>
        <h2 style={h2}>Competency Sign-offs</h2>

        {attendance.length === 0 || taskMap.length === 0 ? (
          <p style={muted}>Add attendance and map tasks above to enable sign-offs.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
              <div>
                <div style={labelStyle}>Member</div>
                <select value={soMemberId} onChange={(e) => { setSoMemberId(e.target.value); setSoTaskMapId(""); }} style={inputStyle}>
                  <option value="">Select member…</option>
                  {attendance.map((a) => {
                    const m = a.members;
                    const name = m ? `${m.first_name} ${m.last_name}` : a.member_id;
                    return <option key={a.member_id} value={a.member_id}>{name}</option>;
                  })}
                </select>
              </div>

              <div>
                <div style={labelStyle}>Task</div>
                <select value={soTaskMapId} onChange={(e) => setSoTaskMapId(e.target.value)} style={inputStyle} disabled={!soMemberId}>
                  <option value="">Select task…</option>
                  {taskMap.map((t) => {
                    const signed = alreadySigned(soMemberId, t.task_id);
                    return (
                      <option key={t.id} value={t.id} disabled={signed}>
                        {(t.positions as any)?.code} · {(t.tasks as any)?.task_code} — {(t.tasks as any)?.task_name}
                        {signed ? " ✓" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <div style={labelStyle}>Evaluator name</div>
                <input style={inputStyle} value={soEvaluator} onChange={(e) => setSoEvaluator(e.target.value)} placeholder="Optional" />
              </div>

              <div>
                <div style={labelStyle}>Notes</div>
                <input style={inputStyle} value={soNotes} onChange={(e) => setSoNotes(e.target.value)} placeholder="Optional" />
              </div>

              <button
                type="button"
                onClick={signOff}
                disabled={!soMemberId || !soTaskMapId || busy !== ""}
                style={{ alignSelf: "flex-end" }}
              >
                {busy === "signoff" ? "Signing…" : "Sign Off"}
              </button>
            </div>

            {/* Sign-off log */}
            {sessionSignoffs.length > 0 ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, marginBottom: 6 }}>
                  Sign-offs recorded this session ({sessionSignoffs.length})
                </div>
                <ul style={{ paddingLeft: 0, listStyle: "none" }}>
                  {sessionSignoffs.map((s) => {
                    const m = allMembers.find((x) => x.id === s.member_id);
                    const mName = m ? memberName(m) : s.member_id;
                    const tm = taskMap.find((t) => t.task_id === s.task_id);
                    const taskLabel = tm
                      ? `${(tm.positions as any)?.code} · ${(tm.tasks as any)?.task_code} — ${(tm.tasks as any)?.task_name}`
                      : s.task_id;
                    return (
                      <li key={s.id} style={{ padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}>
                        <span style={{ color: "#1a7f3c" }}>✓</span>
                        <strong style={{ marginLeft: 6 }}>{mName}</strong>
                        <span style={muted}> — {taskLabel}</span>
                        {s.evaluator_name ? <span style={muted}> · {s.evaluator_name}</span> : null}
                        <span style={{ ...muted, marginLeft: 8 }}>{fmtDt(s.signed_at)}</span>
                        {s.notes ? <span style={muted}> · {s.notes}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p style={muted}>No sign-offs recorded for this session yet.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 16,
  border: "1px solid #e5e5e5",
  borderRadius: 10,
};

const h2: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 12,
  fontSize: 16,
  fontWeight: 700,
};

const muted: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.65,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  opacity: 0.8,
};

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 13,
  width: "100%",
};
