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

type ReqRow = {
  id: string;
  req_kind: string;
  notes?: string | null;
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

  const [editPos, setEditPos] = useState<Partial<Position>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const [reqForm, setReqForm] = useState({ req_kind: "task", task_id: "", course_id: "", notes: "" });

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
      const body: Record<string, string | undefined> = {
        req_kind: reqForm.req_kind,
        notes: reqForm.notes || undefined,
      };
      if (reqForm.req_kind === "task") body.task_id = reqForm.task_id;
      if (reqForm.req_kind === "course") body.course_id = reqForm.course_id;

      const res = await fetch(`/api/positions/${positionId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Add requirement failed"); return; }
      setReqForm({ req_kind: "task", task_id: "", course_id: "", notes: "" });
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

  async function reloadReqs() {
    const res = await fetch(`/api/positions/${positionId}/requirements`);
    const json = await res.json().catch(() => ({}));
    setRequirements(json.data?.requirements ?? []);
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
    return r.req_kind;
  }

  // Already-required task/course IDs to avoid dupes
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
          Members must earn all listed skills and hold all listed courses to qualify for this position.
        </p>

        {requirements.length === 0 ? (
          <p style={muted}>No requirements defined.</p>
        ) : (
          <div style={{ display: "grid", gap: 4, marginBottom: 14 }}>
            {requirements.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, marginRight: 4,
                  background: r.req_kind === "task" ? "#eff6ff" : r.req_kind === "course" ? "#ecfdf5" : "#f5f3ff",
                  border: r.req_kind === "task" ? "1px solid #93c5fd" : r.req_kind === "course" ? "1px solid #6ee7b7" : "1px solid #c4b5fd",
                  color: r.req_kind === "task" ? "#1e40af" : r.req_kind === "course" ? "#065f46" : "#5b21b6",
                  textTransform: "uppercase" as const,
                }}>
                  {r.req_kind === "task" ? "Skill" : r.req_kind === "course" ? "Class" : r.req_kind}
                </span>
                {r.req_kind === "task" && r.tasks ? (
                  <Link href={`/tasks/${r.tasks.id}`} style={{ flex: 1, fontSize: 13, color: "#1e40af" }}>
                    {reqLabel(r)}
                  </Link>
                ) : (
                  <span style={{ flex: 1, fontSize: 13 }}>{reqLabel(r)}</span>
                )}
                {r.notes && <span style={muted}>· {r.notes}</span>}
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

        {/* Add requirement form */}
        <form onSubmit={addRequirement} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={reqForm.req_kind}
            onChange={(e) => setReqForm({ req_kind: e.target.value, task_id: "", course_id: "", notes: "" })}
            style={selectStyle}
          >
            <option value="task">Skill / Task</option>
            <option value="course">Course / Class</option>
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

          <input
            placeholder="Notes (opt)"
            value={reqForm.notes}
            onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })}
            style={{ width: 120, ...selectStyle }}
          />

          <button
            type="submit"
            disabled={
              busy === "req" ||
              (reqForm.req_kind === "task" && !reqForm.task_id) ||
              (reqForm.req_kind === "course" && !reqForm.course_id)
            }
            style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "1px solid #94a3b8", cursor: "pointer" }}
          >
            Add
          </button>
        </form>

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
