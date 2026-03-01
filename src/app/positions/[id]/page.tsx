"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Position = {
  id: string;
  code: string;
  name: string;
  level?: number | null;
  position_type?: string | null;
  is_active: boolean;
};

type Course = { id: string; code: string; name: string };

type Task = {
  id: string;
  task_code: string;
  task_name: string;
  description?: string | null;
  is_active: boolean;
};

type ReqGroup = {
  id: string;
  label: string;
  min_met: number;
};

type ReqRow = {
  id: string;
  req_kind: string;
  req_group_id?: string | null;
  notes?: string | null;
  min_count?: number | null;
  activity_type?: string | null;
  within_months?: number | null;
  courses?: { id: string; code: string; name: string } | null;
  required_position?: { id: string; code: string; name: string } | null;
  tasks?: { id: string; task_code: string; task_name: string } | null;
};

export default function PositionDetailPage() {
  const params = useParams();
  const positionId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const [position, setPosition] = useState<Position | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [requirements, setRequirements] = useState<ReqRow[]>([]);
  const [groups, setGroups] = useState<ReqGroup[]>([]);

  const [editPos, setEditPos] = useState<Partial<Position>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const [reqForm, setReqForm] = useState({
    req_kind: "task",
    task_id: "",
    course_id: "",
    notes: "",
    min_count: "",
    activity_type: "any",
    within_months: "",
    req_group_id: "",
  });

  const [groupForm, setGroupForm] = useState({ label: "", min_met: "1" });

  async function load() {
    if (!positionId) return;
    const [posRes, courseRes, tasksRes, detailRes] = await Promise.all([
      fetch(`/api/positions/${positionId}`),
      fetch("/api/courses"),
      fetch("/api/tasks"),
      fetch(`/api/positions/${positionId}/requirements`),
    ]);

    const posJson = await posRes.json().catch(() => ({}));
    if (posRes.ok && posJson.data) {
      setPosition(posJson.data);
      setEditPos(posJson.data);
    }

    setCourses((await courseRes.json().catch(() => ({}))).data ?? []);
    setAllTasks((await tasksRes.json().catch(() => ({}))).data ?? []);

    const detailJson = await detailRes.json().catch(() => ({}));
    setRequirements(detailJson.data?.requirements ?? []);
    setGroups(detailJson.data?.groups ?? []);
  }

  useEffect(() => { load(); }, [positionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function savePosition(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setMsg("");
    try {
      const res = await fetch(`/api/positions/${positionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editPos),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Save failed"); return; }
      setPosition(json.data);
      setEditPos(json.data ?? {});
      setMsg("Saved.");
    } finally {
      setBusy("");
    }
  }

  async function addRequirement(e: React.FormEvent) {
    e.preventDefault();
    setBusy("req");
    setMsg("");
    try {
      const body: Record<string, string | number | undefined> = {
        req_kind: reqForm.req_kind,
        notes: reqForm.notes || undefined,
      };
      if (reqForm.req_kind === "task") body.task_id = reqForm.task_id;
      if (reqForm.req_kind === "course") body.course_id = reqForm.course_id;
      if (reqForm.req_kind === "time") {
        body.min_count = Number(reqForm.min_count);
        body.activity_type = reqForm.activity_type;
        if (reqForm.within_months) body.within_months = Number(reqForm.within_months);
      }
      if (reqForm.req_group_id) body.req_group_id = reqForm.req_group_id;

      const res = await fetch(`/api/positions/${positionId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Add requirement failed"); return; }
      setReqForm({ req_kind: "task", task_id: "", course_id: "", notes: "", min_count: "", activity_type: "any", within_months: "", req_group_id: "" });
      await reloadReqs();
      setMsg("Requirement added.");
    } finally {
      setBusy("");
    }
  }

  async function removeRequirement(req_id: string) {
    if (!confirm("Remove this requirement?")) return;
    setBusy("req-del");
    setMsg("");
    try {
      const res = await fetch(`/api/positions/${positionId}/requirements?req_id=${req_id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setMsg(j?.error ?? "Remove failed"); return; }
      await reloadReqs();
      setMsg("Requirement removed.");
    } finally {
      setBusy("");
    }
  }

  async function addGroup(e: React.FormEvent) {
    e.preventDefault();
    setBusy("grp");
    setMsg("");
    try {
      const res = await fetch(`/api/positions/${positionId}/req-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: groupForm.label || "Alternative Paths", min_met: Number(groupForm.min_met) || 1 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Add group failed"); return; }
      setGroupForm({ label: "", min_met: "1" });
      await reloadReqs();
      setMsg("Group added.");
    } finally {
      setBusy("");
    }
  }

  async function deleteGroup(group_id: string, groupLabel: string) {
    if (!confirm(`Delete group "${groupLabel}"? Requirements in this group will become standalone.`)) return;
    setBusy("grp-del");
    setMsg("");
    try {
      const res = await fetch(`/api/positions/${positionId}/req-groups?group_id=${group_id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setMsg(j?.error ?? "Delete failed"); return; }
      await reloadReqs();
      setMsg("Group deleted.");
    } finally {
      setBusy("");
    }
  }

  async function reloadReqs() {
    const res = await fetch(`/api/positions/${positionId}/requirements`);
    const json = await res.json().catch(() => ({}));
    setRequirements(json.data?.requirements ?? []);
    setGroups(json.data?.groups ?? []);
  }

  function reqLabel(r: ReqRow): string {
    if (r.req_kind === "task") {
      const t = r.tasks;
      return t ? `${t.task_code} — ${t.task_name}` : "Unknown skill";
    }
    if (r.req_kind === "course") {
      const c = r.courses;
      return c ? `${c.code} — ${c.name}` : "Unknown course";
    }
    if (r.req_kind === "position") {
      const p = r.required_position;
      return p ? `Prereq: ${p.code} — ${p.name}` : "Unknown position";
    }
    if (r.req_kind === "time") {
      const n = r.min_count ?? 1;
      const type = r.activity_type === "training" ? "training sessions" : r.activity_type === "call" ? "calls" : "activities";
      const win = r.within_months ? ` within ${r.within_months} months` : "";
      return `${n} ${type}${win}`;
    }
    return r.req_kind;
  }

  function reqBadgeStyle(req_kind: string): React.CSSProperties {
    if (req_kind === "task")     return { background: "#eff6ff", border: "1px solid #93c5fd", color: "#1e40af" };
    if (req_kind === "course")   return { background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46" };
    if (req_kind === "time")     return { background: "#fff7ed", border: "1px solid #fdba74", color: "#c2410c" };
    if (req_kind === "position") return { background: "#f5f3ff", border: "1px solid #c4b5fd", color: "#5b21b6" };
    return { background: "#f3f4f6", border: "1px solid #d1d5db", color: "#374151" };
  }
  const reqBadgeLabels: Record<string, string> = { task: "Skill", course: "Class", time: "Time", position: "Prereq" };

  const standaloneReqs = requirements.filter((r) => !r.req_group_id);
  const requiredTaskIds = new Set(requirements.filter((r) => r.req_kind === "task").map((r) => r.tasks?.id).filter(Boolean));
  const requiredCourseIds = new Set(requirements.filter((r) => r.req_kind === "course").map((r) => r.courses?.id).filter(Boolean));

  if (!position) return <div style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</div>;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 800 }}>
      <p><Link href="/positions">← Positions</Link></p>

      {msg && (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
          {msg}
        </div>
      )}

      {/* Position info */}
      <section style={sectionStyle}>
        <h2 style={h2}>Position Info</h2>
        <form onSubmit={savePosition} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Code</label>
              <input style={inputStyle} value={editPos.code ?? ""} onChange={(e) => setEditPos({ ...editPos, code: e.target.value })} required />
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={editPos.name ?? ""} onChange={(e) => setEditPos({ ...editPos, name: e.target.value })} required />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Level</label>
              <input
                style={inputStyle}
                type="number"
                placeholder="Optional"
                value={editPos.level ?? ""}
                onChange={(e) => setEditPos({ ...editPos, level: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <label style={labelStyle}>Position type</label>
              <input
                style={inputStyle}
                placeholder="Optional"
                value={editPos.position_type ?? ""}
                onChange={(e) => setEditPos({ ...editPos, position_type: e.target.value || null })}
              />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={editPos.is_active ?? true} onChange={(e) => setEditPos({ ...editPos, is_active: e.target.checked })} />
            Active
          </label>
          <div>
            <button type="submit" disabled={busy === "save"} style={btnStyle}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </section>

      {/* Requirements */}
      <section style={sectionStyle}>
        <h2 style={h2}>Requirements</h2>
        <p style={{ ...muted, marginTop: 0, marginBottom: 12 }}>
          Members must satisfy all standalone requirements AND each requirement group. Within a group, only the specified minimum number of requirements must be met.
        </p>

        {/* Standalone requirements */}
        {standaloneReqs.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              <span style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, padding: "2px 10px" }}>
                All required
              </span>
            </div>
            {standaloneReqs.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, marginRight: 4, textTransform: "uppercase" as const, ...reqBadgeStyle(r.req_kind) }}>
                  {reqBadgeLabels[r.req_kind] ?? r.req_kind}
                </span>
                {r.req_kind === "task" && r.tasks ? (
                  <Link href={`/tasks/${r.tasks.id}`} style={{ flex: 1, fontSize: 13, color: "#1e40af" }}>{reqLabel(r)}</Link>
                ) : (
                  <span style={{ flex: 1, fontSize: 13 }}>{reqLabel(r)}</span>
                )}
                {r.notes && <span style={muted}>· {r.notes}</span>}
                <button type="button" onClick={() => removeRequirement(r.id)} disabled={busy !== ""} style={removeBtnStyle}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Requirement groups */}
        {groups.map((g) => {
          const groupReqs = requirements.filter((r) => r.req_group_id === g.id);
          return (
            <div key={g.id} style={{ marginBottom: 12, border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", background: "#fafbfc" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{g.label}</span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#ede9fe", color: "#5b21b6", border: "1px solid #c4b5fd" }}>
                  {g.min_met} of {groupReqs.length} required
                </span>
                <button
                  type="button"
                  onClick={() => deleteGroup(g.id, g.label)}
                  disabled={busy !== ""}
                  style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #f2c9b8", borderRadius: 4, cursor: "pointer", color: "#c2410c", background: "none" }}
                >
                  Delete group
                </button>
              </div>
              {groupReqs.length === 0 ? (
                <p style={{ ...muted, margin: 0 }}>No requirements in this group yet.</p>
              ) : (
                groupReqs.map((r) => (
                  <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f0f0f0" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, marginRight: 4, textTransform: "uppercase" as const, ...reqBadgeStyle(r.req_kind) }}>
                      {reqBadgeLabels[r.req_kind] ?? r.req_kind}
                    </span>
                    {r.req_kind === "task" && r.tasks ? (
                      <Link href={`/tasks/${r.tasks.id}`} style={{ flex: 1, fontSize: 13, color: "#1e40af" }}>{reqLabel(r)}</Link>
                    ) : (
                      <span style={{ flex: 1, fontSize: 13 }}>{reqLabel(r)}</span>
                    )}
                    {r.notes && <span style={muted}>· {r.notes}</span>}
                    <button type="button" onClick={() => removeRequirement(r.id)} disabled={busy !== ""} style={removeBtnStyle}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          );
        })}

        {requirements.length === 0 && groups.length === 0 && (
          <p style={muted}>No requirements defined.</p>
        )}

        {/* Add requirement form */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.7 }}>Add requirement</div>
          <form onSubmit={addRequirement} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={reqForm.req_kind}
              onChange={(e) => setReqForm({ req_kind: e.target.value, task_id: "", course_id: "", notes: "", min_count: "", activity_type: "any", within_months: "", req_group_id: reqForm.req_group_id })}
              style={selectStyle}
            >
              <option value="task">Skill / Task</option>
              <option value="course">Course / Class</option>
              <option value="time">Time in activity</option>
            </select>

            {reqForm.req_kind === "task" && (
              <select
                value={reqForm.task_id}
                onChange={(e) => setReqForm({ ...reqForm, task_id: e.target.value })}
                style={{ ...selectStyle, flex: 1, minWidth: 200 }}
                required
              >
                <option value="">Select skill…</option>
                {allTasks.filter((t) => t.is_active && !requiredTaskIds.has(t.id)).map((t) => (
                  <option key={t.id} value={t.id}>{t.task_code} — {t.task_name}</option>
                ))}
              </select>
            )}

            {reqForm.req_kind === "course" && (
              <select
                value={reqForm.course_id}
                onChange={(e) => setReqForm({ ...reqForm, course_id: e.target.value })}
                style={{ ...selectStyle, flex: 1, minWidth: 200 }}
                required
              >
                <option value="">Select course…</option>
                {courses.filter((c) => !requiredCourseIds.has(c.id)).map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            )}

            {reqForm.req_kind === "time" && (
              <>
                <input
                  type="number"
                  placeholder="Count"
                  min={1}
                  step={1}
                  value={reqForm.min_count}
                  onChange={(e) => setReqForm({ ...reqForm, min_count: e.target.value })}
                  style={{ width: 70, ...selectStyle }}
                  required
                />
                <select
                  value={reqForm.activity_type}
                  onChange={(e) => setReqForm({ ...reqForm, activity_type: e.target.value })}
                  style={selectStyle}
                >
                  <option value="any">Any activity</option>
                  <option value="training">Training sessions</option>
                  <option value="call">Calls</option>
                </select>
                <input
                  type="number"
                  placeholder="Within months"
                  min={1}
                  value={reqForm.within_months}
                  onChange={(e) => setReqForm({ ...reqForm, within_months: e.target.value })}
                  style={{ width: 130, ...selectStyle }}
                />
              </>
            )}

            <input
              placeholder="Notes (opt)"
              value={reqForm.notes}
              onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })}
              style={{ width: 120, ...selectStyle }}
            />

            {groups.length > 0 && (
              <select
                value={reqForm.req_group_id}
                onChange={(e) => setReqForm({ ...reqForm, req_group_id: e.target.value })}
                style={selectStyle}
              >
                <option value="">Standalone</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
            )}

            <button
              type="submit"
              disabled={
                busy === "req" ||
                (reqForm.req_kind === "task" && !reqForm.task_id) ||
                (reqForm.req_kind === "course" && !reqForm.course_id) ||
                (reqForm.req_kind === "time" && !reqForm.min_count)
              }
              style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "1px solid #94a3b8", cursor: "pointer" }}
            >
              Add
            </button>
          </form>
        </div>

        {/* Add group form */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.7 }}>Add requirement group (N of M logic)</div>
          <form onSubmit={addGroup} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input
              placeholder="Group label (e.g. Alternative Paths)"
              value={groupForm.label}
              onChange={(e) => setGroupForm({ ...groupForm, label: e.target.value })}
              style={{ flex: 1, minWidth: 200, ...selectStyle }}
            />
            <input
              type="number"
              placeholder="Min"
              min={1}
              value={groupForm.min_met}
              onChange={(e) => setGroupForm({ ...groupForm, min_met: e.target.value })}
              style={{ width: 60, ...selectStyle }}
              required
            />
            <span style={{ fontSize: 12, color: "#666" }}>of group must be met</span>
            <button
              type="submit"
              disabled={busy === "grp"}
              style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "1px solid #94a3b8", cursor: "pointer" }}
            >
              {busy === "grp" ? "Adding…" : "Add Group"}
            </button>
          </form>
        </div>

        {allTasks.length === 0 && (
          <p style={{ ...muted, marginTop: 10 }}>
            No skills defined yet. <Link href="/tasks/new" style={{ color: "#1e40af" }}>Create a skill</Link> first.
          </p>
        )}
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = { marginTop: 16, padding: 16, border: "1px solid #e5e5e5", borderRadius: 10 };
const h2: React.CSSProperties = { marginTop: 0, marginBottom: 12, fontSize: 16, fontWeight: 700 };
const muted: React.CSSProperties = { fontSize: 12, opacity: 0.65 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.8 };
const inputStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, width: "100%", boxSizing: "border-box" };
const selectStyle: React.CSSProperties = { padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 };
const btnStyle: React.CSSProperties = { padding: "7px 18px", borderRadius: 8, background: "#1e40af", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const removeBtnStyle: React.CSSProperties = { fontSize: 12, padding: "2px 8px", border: "1px solid #f2c9b8", borderRadius: 4, cursor: "pointer", background: "none" };
