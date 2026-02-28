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

type ReqRow = {
  id: string;
  req_kind: string;
  notes?: string | null;
  activity_type?: string | null;
  min_count?: number | null;
  within_months?: number | null;
  courses?: { id: string; code: string; name: string } | null;
  required_position?: { id: string; code: string; name: string } | null;
  tasks?: { id: string; task_code: string; task_name: string } | null;
};

type TaskRow = {
  id: string;
  task_code: string;
  task_name: string;
  description?: string | null;
  is_active: boolean;
};

export default function PositionDetailPage() {
  const params = useParams();
  const positionId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const [position, setPosition] = useState<Position | null>(null);
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [requirements, setRequirements] = useState<ReqRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  const [editPos, setEditPos] = useState<Partial<Position>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  // Requirement form
  const [reqForm, setReqForm] = useState({
    req_kind: "course",
    course_id: "",
    required_position_id: "",
    task_id: "",
    activity_type: "any",
    min_count: "",
    within_months: "",
    notes: "",
  });

  // Task form
  const [taskForm, setTaskForm] = useState({ task_code: "", task_name: "", description: "" });

  async function load() {
    if (!positionId) return;
    const [posRes, allPosRes, courseRes, detailRes] = await Promise.all([
      fetch(`/api/positions/${positionId}`),
      fetch("/api/positions?all=true"),
      fetch("/api/courses"),
      fetch(`/api/positions/${positionId}/requirements`),
    ]);

    const posJson = await posRes.json().catch(() => ({}));
    if (posRes.ok) {
      setPosition(posJson.data);
      setEditPos(posJson.data ?? {});
    }

    const allPosJson = await allPosRes.json().catch(() => ({}));
    setAllPositions(allPosJson.data ?? []);

    const courseJson = await courseRes.json().catch(() => ({}));
    setCourses(courseJson.data ?? []);

    const detailJson = await detailRes.json().catch(() => ({}));
    setRequirements(detailJson.data?.requirements ?? []);
    setTasks(detailJson.data?.tasks ?? []);
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
      if (reqForm.req_kind === "course") body.course_id = reqForm.course_id;
      if (reqForm.req_kind === "position") body.required_position_id = reqForm.required_position_id;
      if (reqForm.req_kind === "task") body.task_id = reqForm.task_id;
      if (reqForm.req_kind === "time") {
        body.activity_type = reqForm.activity_type;
        if (reqForm.min_count) body.min_count = Number(reqForm.min_count);
        if (reqForm.within_months) body.within_months = Number(reqForm.within_months);
      }

      const res = await fetch(`/api/positions/${positionId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Add requirement failed"); return; }
      setReqForm((f) => ({ ...f, course_id: "", required_position_id: "", task_id: "", notes: "", min_count: "", within_months: "" }));
      await reload();
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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Remove failed"); return; }
      await reload();
      setMsg("Requirement removed.");
    } finally {
      setBusy("");
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskForm.task_code || !taskForm.task_name) return;
    setBusy("task");
    setMsg("");
    try {
      const res = await fetch(`/api/positions/${positionId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_code: taskForm.task_code, task_name: taskForm.task_name, description: taskForm.description || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Add task failed"); return; }
      setTaskForm({ task_code: "", task_name: "", description: "" });
      await reload();
      setMsg("Task added.");
    } finally {
      setBusy("");
    }
  }

  async function removeTask(task_id: string) {
    if (!confirm("Remove this task? This will also remove any signoffs referencing it.")) return;
    setBusy("task-del");
    setMsg("");
    try {
      const res = await fetch(`/api/positions/${positionId}/tasks?task_id=${task_id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Remove failed"); return; }
      await reload();
      setMsg("Task removed.");
    } finally {
      setBusy("");
    }
  }

  async function reload() {
    const [detailRes] = await Promise.all([fetch(`/api/positions/${positionId}/requirements`)]);
    const detailJson = await detailRes.json().catch(() => ({}));
    setRequirements(detailJson.data?.requirements ?? []);
    setTasks(detailJson.data?.tasks ?? []);
  }

  function reqLabel(r: ReqRow): string {
    if (r.req_kind === "course") return `Course: ${r.courses?.code ?? "?"} — ${r.courses?.name ?? ""}`;
    if (r.req_kind === "position") return `Prereq: ${r.required_position?.code ?? "?"} — ${r.required_position?.name ?? ""}`;
    if (r.req_kind === "task") return `Task: ${r.tasks?.task_code ?? "?"} — ${r.tasks?.task_name ?? ""}`;
    if (r.req_kind === "time") {
      const type = r.activity_type ?? "any";
      const count = r.min_count ?? 1;
      const win = r.within_months ? ` within ${r.within_months} months` : "";
      return `Time: ${count} ${type} activities${win}`;
    }
    return r.req_kind;
  }

  if (!position && !msg) return <div style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</div>;

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
              <input
                style={inputStyle}
                value={editPos.code ?? ""}
                onChange={(e) => setEditPos({ ...editPos, code: e.target.value })}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input
                style={inputStyle}
                value={editPos.name ?? ""}
                onChange={(e) => setEditPos({ ...editPos, name: e.target.value })}
                required
              />
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
            <input
              type="checkbox"
              checked={editPos.is_active ?? true}
              onChange={(e) => setEditPos({ ...editPos, is_active: e.target.checked })}
            />
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

        {requirements.length === 0 ? (
          <p style={muted}>No requirements.</p>
        ) : (
          <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
            {requirements.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ flex: 1, fontSize: 13 }}>{reqLabel(r)}</span>
                {r.notes && <span style={{ fontSize: 12, opacity: 0.6 }}>({r.notes})</span>}
                <button
                  type="button"
                  onClick={() => removeRequirement(r.id)}
                  disabled={busy !== ""}
                  style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #f2c9b8", borderRadius: 4, cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addRequirement} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={reqForm.req_kind}
            onChange={(e) => setReqForm({ ...reqForm, req_kind: e.target.value, course_id: "", required_position_id: "", task_id: "" })}
            style={{ fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
          >
            <option value="course">Course</option>
            <option value="position">Prereq Position</option>
            <option value="task">Task Sign-off</option>
            <option value="time">Time in Activities</option>
          </select>

          {reqForm.req_kind === "course" && (
            <select
              value={reqForm.course_id}
              onChange={(e) => setReqForm({ ...reqForm, course_id: e.target.value })}
              style={{ flex: 1, minWidth: 160, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
              required
            >
              <option value="">Select course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          )}

          {reqForm.req_kind === "position" && (
            <select
              value={reqForm.required_position_id}
              onChange={(e) => setReqForm({ ...reqForm, required_position_id: e.target.value })}
              style={{ flex: 1, minWidth: 160, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
              required
            >
              <option value="">Select position…</option>
              {allPositions.filter((p) => p.id !== positionId).map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          )}

          {reqForm.req_kind === "task" && (
            <select
              value={reqForm.task_id}
              onChange={(e) => setReqForm({ ...reqForm, task_id: e.target.value })}
              style={{ flex: 1, minWidth: 160, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
              required
            >
              <option value="">Select task…</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.task_code} — {t.task_name}</option>
              ))}
            </select>
          )}

          {reqForm.req_kind === "time" && (
            <>
              <select
                value={reqForm.activity_type}
                onChange={(e) => setReqForm({ ...reqForm, activity_type: e.target.value })}
                style={{ fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
              >
                <option value="any">Any activity</option>
                <option value="training">Training only</option>
                <option value="call">Calls only</option>
              </select>
              <input
                type="number"
                placeholder="Count"
                min={1}
                value={reqForm.min_count}
                onChange={(e) => setReqForm({ ...reqForm, min_count: e.target.value })}
                style={{ width: 70, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
                required
              />
              <input
                type="number"
                placeholder="Within months"
                min={1}
                value={reqForm.within_months}
                onChange={(e) => setReqForm({ ...reqForm, within_months: e.target.value })}
                style={{ width: 120, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
              />
            </>
          )}

          <input
            placeholder="Notes (optional)"
            value={reqForm.notes}
            onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })}
            style={{ width: 130, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
          />

          <button
            type="submit"
            disabled={busy === "req" ||
              (reqForm.req_kind === "course" && !reqForm.course_id) ||
              (reqForm.req_kind === "position" && !reqForm.required_position_id) ||
              (reqForm.req_kind === "task" && !reqForm.task_id) ||
              (reqForm.req_kind === "time" && !reqForm.min_count)
            }
            style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "1px solid #94a3b8", cursor: "pointer" }}
          >
            Add Req
          </button>
        </form>
      </section>

      {/* Tasks (taskbook) */}
      <section style={sectionStyle}>
        <h2 style={h2}>Tasks (Taskbook)</h2>

        {tasks.length === 0 ? (
          <p style={muted}>No tasks defined.</p>
        ) : (
          <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
            {tasks.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                <Link href={`/tasks/${t.id}`} style={{ fontFamily: "monospace", fontSize: 13, minWidth: 100, color: "#1e40af" }}>{t.task_code}</Link>
                <span style={{ flex: 1, fontSize: 13 }}>{t.task_name}</span>
                {t.description && <span style={{ fontSize: 12, opacity: 0.55 }}>{t.description}</span>}
                {!t.is_active && <span style={{ fontSize: 11, opacity: 0.5 }}>inactive</span>}
                <button
                  type="button"
                  onClick={() => removeTask(t.id)}
                  disabled={busy !== ""}
                  style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #f2c9b8", borderRadius: 4, cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addTask} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Task code (e.g. NAV-1)"
            value={taskForm.task_code}
            onChange={(e) => setTaskForm({ ...taskForm, task_code: e.target.value })}
            style={{ width: 120, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
            required
          />
          <input
            placeholder="Task name"
            value={taskForm.task_name}
            onChange={(e) => setTaskForm({ ...taskForm, task_name: e.target.value })}
            style={{ flex: 1, minWidth: 180, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
            required
          />
          <input
            placeholder="Description (optional)"
            value={taskForm.description}
            onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
            style={{ width: 180, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
          />
          <button
            type="submit"
            disabled={busy === "task" || !taskForm.task_code || !taskForm.task_name}
            style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "1px solid #94a3b8", cursor: "pointer" }}
          >
            Add Task
          </button>
        </form>
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = { marginTop: 16, padding: 16, border: "1px solid #e5e5e5", borderRadius: 10 };
const h2: React.CSSProperties = { marginTop: 0, marginBottom: 12, fontSize: 16, fontWeight: 700 };
const muted: React.CSSProperties = { fontSize: 12, opacity: 0.65 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.8 };
const inputStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, width: "100%", boxSizing: "border-box" };
const btnStyle: React.CSSProperties = { padding: "7px 18px", borderRadius: 8, background: "#1e40af", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" };
