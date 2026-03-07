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
  incident_lat?: number | null;
  incident_lng?: number | null;
  incident_radius_m?: number | null;
  allow_rsvp?: boolean;
  allow_early_checkin?: boolean;
  early_checkin_minutes?: number | null;
};

type AttendanceRow = {
  id: string;
  training_session_id: string;
  member_id: string;
  status: string;
  hours?: number | null;
  notes?: string | null;
  rsvp_at?: string | null;
  arrived_at?: string | null;
  time_in?: string | null;
  time_out?: string | null;
  created_at: string;
  members?: { first_name: string; last_name: string } | null;
};

type TaskMapRow = {
  id: string;
  training_session_id?: string | null;
  position_id?: string | null;
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
  position_id?: string | null;
  task_id: string;
  evaluator_name?: string | null;
  signed_at: string;
  notes?: string | null;
  hours?: number | null;
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

function toDatetimeLocal(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [allTasks, setAllTasks] = useState<TaskRow[]>([]);

  // ── Form state: session edit ──
  const [editSession, setEditSession] = useState<Partial<TrainingSession>>({});

  // ── Form state: attendance ──
  const [attMemberId, setAttMemberId] = useState("");

  // ── Form state: task map ──
  const [mapTaskId, setMapTaskId] = useState("");

  // ── Form state: sign-offs ──
  const [soScope, setSoScope] = useState<"member" | "all">("member");
  const [soMemberId, setSoMemberId] = useState("");
  const [soTaskMapId, setSoTaskMapId] = useState(""); // selected task map row id
  const [soEvaluator, setSoEvaluator] = useState("");
  const [soNotes, setSoNotes] = useState("");
  const [soHours, setSoHours] = useState("");

  // ── Search groups state ──
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupMemberAdd, setGroupMemberAdd] = useState<
    Record<string, { memberId: string; positionId: string; isTrainee: boolean }>
  >({});

  // ── UI state ──
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setErr("GPS not available on this device.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEditSession((s) => ({
          ...s,
          incident_lat: parseFloat(pos.coords.latitude.toFixed(6)),
          incident_lng: parseFloat(pos.coords.longitude.toFixed(6)),
        }));
        setGpsLoading(false);
      },
      () => {
        setErr("Could not get location. Check browser permissions.");
        setGpsLoading(false);
      },
      { timeout: 10000 }
    );
  }

  // ── Load all ──────────────────────────────────────────────────────────────

  async function loadAll() {
    if (!sessionId || !isUuid(sessionId)) {
      setErr(`Bad session id: "${sessionId}"`);
      return;
    }
    setBusy("reload");
    setErr("");
    try {
      const [sessRes, attRes, mapRes, soRes, membersRes, posRes, tasksRes, groupsRes] = await Promise.all([
        fetch(`/api/training-sessions/${sessionId}`),
        fetch(`/api/training-attendance?training_session_id=${sessionId}`),
        fetch(`/api/training-task-map?training_session_id=${sessionId}`),
        fetch(`/api/member-task-signoffs?training_session_id=${sessionId}`),
        fetch(`/api/members`),
        fetch(`/api/positions`),
        fetch(`/api/tasks`),
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
      setAllTasks((await tasksRes.json().catch(() => ({}))).data ?? []);
      setGroups(asArray<SearchGroup>(await groupsRes.json().catch(() => [])));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    loadAll();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => setCanEdit(json?.user?.role !== "viewer"))
      .catch(() => {});
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Open / Close training ─────────────────────────────────────────────────

  async function setTrainingStatus(newStatus: string) {
    setBusy("status");
    setErr("");
    try {
      const res = await fetch(`/api/training-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to update status");
      const s = json?.data ?? null;
      setSession(s);
      setEditSession(s ?? {});
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  // ── Session save ──────────────────────────────────────────────────────────

  async function saveSession() {
    setBusy("save");
    setErr("");
    try {
      const payload = { ...editSession };
      if (payload.start_dt) {
        const d = new Date(payload.start_dt);
        if (!isNaN(d.getTime())) payload.start_dt = d.toISOString();
      }
      if (payload.end_dt) {
        const d = new Date(payload.end_dt);
        if (!isNaN(d.getTime())) payload.end_dt = d.toISOString();
      }
      const res = await fetch(`/api/training-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    if (!mapTaskId) return;
    setBusy("map");
    try {
      const res = await fetch("/api/training-task-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ training_session_id: sessionId, task_id: mapTaskId }),
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
          task_id: selectedTaskMapRow.task_id,
          training_session_id: sessionId,
          evaluator_name: soEvaluator || null,
          notes: soNotes || null,
          hours: soHours ? Number(soHours) : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Sign-off failed");
      setSessionSignoffs((prev) => [json.data, ...prev]);
      setSoTaskMapId("");
      setSoNotes("");
      setSoHours("");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy("");
    }
  }

  async function signOffAll() {
    if (!soTaskMapId || !selectedTaskMapRow) return;
    const taskId = selectedTaskMapRow.task_id;
    const targets = attendance.filter((a) => !alreadySigned(a.member_id, taskId));
    if (targets.length === 0) { alert("All attendees are already signed off for this task."); return; }
    setBusy("signoff-all");
    try {
      const results = await Promise.all(
        targets.map((a) =>
          fetch("/api/member-task-signoffs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              member_id: a.member_id,
              task_id: taskId,
              training_session_id: sessionId,
              evaluator_name: soEvaluator || null,
              notes: soNotes || null,
              hours: soHours ? Number(soHours) : null,
            }),
          }).then((r) => r.json().catch(() => ({})))
        )
      );
      const newSignoffs = results.filter((r) => r.data).map((r) => r.data as SignoffRow);
      if (newSignoffs.length > 0) setSessionSignoffs((prev) => [...newSignoffs, ...prev]);
      setSoTaskMapId("");
      setSoNotes("");
      setSoHours("");
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

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>{session?.title ?? "Training Session"}</h1>

        {session && canEdit && (
          session.status === "scheduled" ? (
            <button
              type="button"
              onClick={() => setTrainingStatus("completed")}
              disabled={busy !== ""}
              style={{ padding: "7px 18px", borderRadius: 8, border: "1px solid #a5b4fc", background: "#f2f2ff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              {busy === "status" ? "Closing…" : "Close Training"}
            </button>
          ) : session.status === "completed" ? (
            <button
              type="button"
              onClick={() => setTrainingStatus("scheduled")}
              disabled={busy !== ""}
              style={{ padding: "7px 18px", borderRadius: 8, border: "1px solid #14532d", background: "#166534", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              {busy === "status" ? "Opening…" : "Open Training"}
            </button>
          ) : null
        )}

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
          <Field label="Start">
            <input
              type="datetime-local"
              style={inputStyle}
              value={toDatetimeLocal(editSession.start_dt)}
              onChange={(e) => setEditSession({ ...editSession, start_dt: e.target.value })}
            />
          </Field>
          <Field label="End">
            <input
              type="datetime-local"
              style={inputStyle}
              value={toDatetimeLocal(editSession.end_dt)}
              onChange={(e) => setEditSession({ ...editSession, end_dt: e.target.value || null })}
            />
          </Field>
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Geofence</div>
          <div style={{ marginBottom: 8 }}>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={gpsLoading || busy !== ""}
              style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13, cursor: "pointer" }}
            >
              {gpsLoading ? "Getting location…" : "📍 Use my location"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 3 }}>Lat</div>
              <input style={inputStyle} value={editSession.incident_lat ?? ""} onChange={(e) => setEditSession({ ...editSession, incident_lat: e.target.value === "" ? null : Number(e.target.value) })} placeholder="e.g. 41.12345" />
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 3 }}>Lng</div>
              <input style={inputStyle} value={editSession.incident_lng ?? ""} onChange={(e) => setEditSession({ ...editSession, incident_lng: e.target.value === "" ? null : Number(e.target.value) })} placeholder="e.g. -74.12345" />
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 3 }}>Radius (ft)</div>
              <input style={inputStyle} type="number" min={50} value={editSession.incident_radius_m != null ? Math.round(editSession.incident_radius_m * 3.281) : ""} onChange={(e) => setEditSession({ ...editSession, incident_radius_m: e.target.value === "" ? null : Math.round(Number(e.target.value) / 3.281) })} placeholder="300" />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", border: "1px solid #e5e5e5", borderRadius: 8, background: "#fafafa" }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Attendance Options</div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: canEdit ? "pointer" : "default" }}>
            <input type="checkbox" checked={!!editSession.allow_rsvp} onChange={(e) => canEdit && setEditSession({ ...editSession, allow_rsvp: e.target.checked })} disabled={!canEdit} />
            Allow RSVP
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: canEdit ? "pointer" : "default" }}>
            <input type="checkbox" checked={!!editSession.allow_early_checkin} onChange={(e) => canEdit && setEditSession({ ...editSession, allow_early_checkin: e.target.checked, early_checkin_minutes: e.target.checked ? (editSession.early_checkin_minutes ?? 30) : null })} disabled={!canEdit} />
            Allow Early Check-In
          </label>
          {editSession.allow_early_checkin && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginLeft: 24 }}>
              <input
                type="number"
                min={5}
                style={{ ...inputStyle, width: 80 }}
                value={editSession.early_checkin_minutes ?? ""}
                onChange={(e) => canEdit && setEditSession({ ...editSession, early_checkin_minutes: e.target.value ? Number(e.target.value) : null })}
                readOnly={!canEdit}
              />
              <span style={{ opacity: 0.7 }}>minutes before start</span>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          {canEdit && (
            <button type="button" onClick={saveSession} disabled={busy !== ""}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          )}
          {session?.is_test ? <span style={{ ...muted, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 999 }}>TEST</span> : null}
        </div>
      </section>

      {/* ── Attendance ── */}
      <section style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <h2 style={{ ...h2, margin: 0 }}>Attendance <span style={muted}>({attendance.length})</span></h2>
          {canEdit && attendance.some((a) => a.arrived_at && !a.time_in) && (
            <button
              type="button"
              onClick={async () => {
                setBusy("official");
                try {
                  const meRes = await fetch("/api/auth/me");
                  const me = await meRes.json().catch(() => ({}));
                  const res = await fetch("/api/training-attendance", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ training_session_id: sessionId, member_id: me?.user?.id ?? "", action: "official", status: "attended" }),
                  });
                  if (res.ok) {
                    const json = await res.json().catch(() => ({}));
                    setAttendance(asArray<AttendanceRow>(json));
                  }
                } catch { /* ignore */ }
                setBusy("");
              }}
              disabled={busy !== ""}
              style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid #f59e0b", background: "#fffbeb", color: "#92400e", fontWeight: 600, cursor: "pointer" }}
            >
              Officially Check In All Arrived
            </button>
          )}
        </div>
        {canEdit && (
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
        )}

        {attendance.length > 0 ? (
          <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: "none" }}>
            {attendance.map((a) => {
              const m = a.members;
              const name = m ? `${m.first_name} ${m.last_name}` : a.member_id;
              const memberSignoffs = signoffsByMember.get(a.member_id) ?? [];
              let phase = a.status;
              if (a.time_out) phase = "Checked Out";
              else if (a.time_in) phase = "Checked In";
              else if (a.arrived_at) phase = "Arrived";
              else if (a.rsvp_at) phase = "RSVP'd";
              return (
                <li key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{name}</strong>
                    <span style={{ ...muted, marginLeft: 10 }}>{phase}</span>
                    {memberSignoffs.length > 0 ? (
                      <span style={{ ...muted, marginLeft: 10 }}>
                        {memberSignoffs.length} skill use{memberSignoffs.length !== 1 ? "s" : ""} logged
                      </span>
                    ) : null}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeAttendance(a.id)}
                      disabled={busy !== ""}
                      style={{ fontSize: 12, padding: "2px 8px", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  )}
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
        {canEdit && (
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
        )}

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
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => deleteGroup(g.id)}
                        disabled={busy !== ""}
                        style={{ fontSize: 12, padding: "2px 8px" }}
                      >
                        Delete Group
                      </button>
                    )}
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
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => removeMemberFromGroup(m.id, g.id)}
                                disabled={busy !== ""}
                                style={{ fontSize: 11, padding: "1px 7px" }}
                              >
                                Remove
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p style={{ ...muted, marginBottom: 8 }}>No members in this group.</p>
                  )}

                  {/* Add member sub-form */}
                  {canEdit && (
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Task Map ── */}
      <section style={sectionStyle}>
        <h2 style={h2}>Skills Practiced <span style={muted}>— skills that can be logged for this session</span></h2>

        {canEdit && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={mapTaskId} onChange={(e) => setMapTaskId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              <option value="">Select skill…</option>
              {allTasks
                .filter((t) => t.is_active !== false && !mappedTaskIds.has(t.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.task_code} — {t.task_name}</option>
                ))}
            </select>

            <button type="button" onClick={addTaskToMap} disabled={!mapTaskId || busy !== ""}>
              {busy === "map" ? "Adding…" : "Add Skill"}
            </button>
          </div>
        )}

        {taskMap.length > 0 ? (
          <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: "none" }}>
            {taskMap.map((t) => (
              <li key={t.id} style={{ padding: "6px 0", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{(t.tasks as { task_code?: string })?.task_code}</strong>
                  <span style={muted}> — {(t.tasks as { task_name?: string })?.task_name}</span>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeTaskFromMap(t.id)}
                    disabled={busy !== ""}
                    style={{ fontSize: 12, padding: "2px 8px", cursor: "pointer" }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p style={muted}>No skills added yet. Add skills above to log member use.</p>
        )}
      </section>

      {/* ── Skill Use Log ── */}
      <section style={sectionStyle}>
        <h2 style={h2}>Skill Use Log</h2>
        <p style={{ ...muted, marginTop: 0, marginBottom: 10 }}>
          Record which skills each member practiced this session. These entries feed into admin approval reviews for positions and tasks.
        </p>

        {attendance.length === 0 || taskMap.length === 0 ? (
          <p style={muted}>Add attendance and add skills above to enable use logging.</p>
        ) : (
          <>
            {canEdit && (
              <>
                {/* Scope toggle */}
                <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                  {(["member", "all"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setSoScope(s); setSoMemberId(""); setSoTaskMapId(""); }}
                      style={{
                        padding: "5px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                        fontWeight: soScope === s ? 700 : 400,
                        background: soScope === s ? "#1e40af" : "#f8fafc",
                        color: soScope === s ? "#fff" : "#374151",
                        border: soScope === s ? "1px solid #1e40af" : "1px solid #d1d5db",
                      }}
                    >
                      {s === "member" ? "Specific member" : "All attendees"}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                  {soScope === "member" && (
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
                  )}

                  <div>
                    <div style={labelStyle}>Task</div>
                    <select
                      value={soTaskMapId}
                      onChange={(e) => setSoTaskMapId(e.target.value)}
                      style={inputStyle}
                      disabled={soScope === "member" && !soMemberId}
                    >
                      <option value="">Select task…</option>
                      {taskMap.map((t) => {
                        const signed = soScope === "member" && alreadySigned(soMemberId, t.task_id);
                        return (
                          <option key={t.id} value={t.id} disabled={signed}>
                            {(t.tasks as { task_code?: string })?.task_code} — {(t.tasks as { task_name?: string })?.task_name}
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

                  <div>
                    <div style={labelStyle}>Hours</div>
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      style={inputStyle}
                      value={soHours}
                      onChange={(e) => setSoHours(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>

                  {soScope === "member" ? (
                    <button
                      type="button"
                      onClick={signOff}
                      disabled={!soMemberId || !soTaskMapId || busy !== ""}
                      style={{ alignSelf: "flex-end" }}
                    >
                      {busy === "signoff" ? "Logging…" : "Log Use"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={signOffAll}
                      disabled={!soTaskMapId || busy !== ""}
                      style={{ alignSelf: "flex-end" }}
                    >
                      {busy === "signoff-all" ? "Logging…" : `Log Use for All (${attendance.length})`}
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Use log */}
            {sessionSignoffs.length > 0 ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, marginBottom: 6 }}>
                  Uses logged this session ({sessionSignoffs.length})
                </div>
                <ul style={{ paddingLeft: 0, listStyle: "none" }}>
                  {sessionSignoffs.map((s) => {
                    const m = allMembers.find((x) => x.id === s.member_id);
                    const mName = m ? memberName(m) : s.member_id;
                    const tm = taskMap.find((t) => t.task_id === s.task_id);
                    const taskLabel = tm
                      ? `${(tm.tasks as { task_code?: string })?.task_code} — ${(tm.tasks as { task_name?: string })?.task_name}`
                      : s.task_id;
                    return (
                      <li key={s.id} style={{ padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}>
                        <span style={{ color: "#1a7f3c" }}>✓</span>
                        <strong style={{ marginLeft: 6 }}>{mName}</strong>
                        <span style={muted}> — {taskLabel}</span>
                        {s.evaluator_name ? <span style={muted}> · {s.evaluator_name}</span> : null}
                        {s.hours != null ? <span style={muted}> · {s.hours}h</span> : null}
                        <span style={{ ...muted, marginLeft: 8 }}>{fmtDt(s.signed_at)}</span>
                        {s.notes ? <span style={muted}> · {s.notes}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p style={muted}>No uses logged for this session yet.</p>
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
