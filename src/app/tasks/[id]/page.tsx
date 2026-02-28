"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type TaskDetail = {
  id: string;
  task_code: string;
  task_name: string;
  description?: string | null;
  is_active: boolean;
};

type TaskReq = {
  id: string;
  req_kind: "course" | "time";
  course_id?: string | null;
  courses?: { id: string; code: string; name: string } | null;
  min_hours?: number | null;
  within_months?: number | null;
  activity_type?: string | null;
  notes?: string | null;
};

type Course = { id: string; code: string; name: string };

type Signoff = {
  id: string;
  member_id: string;
  signed_at: string;
  evaluator_name?: string | null;
  notes?: string | null;
  members?: { first_name: string; last_name: string } | null;
};

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [edit, setEdit] = useState<Partial<TaskDetail>>({});
  const [reqs, setReqs] = useState<TaskReq[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [signoffs, setSignoffs] = useState<Signoff[]>([]);

  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const [reqForm, setReqForm] = useState({
    req_kind: "course",
    course_id: "",
    min_hours: "",
    within_months: "",
    activity_type: "any",
    notes: "",
  });

  async function load() {
    if (!taskId) return;
    const [taskRes, reqsRes, coursesRes, soRes] = await Promise.all([
      fetch(`/api/tasks/${taskId}`),
      fetch(`/api/tasks/${taskId}/requirements`),
      fetch("/api/courses"),
      fetch(`/api/member-task-signoffs?task_id=${taskId}`),
    ]);

    const taskJson = await taskRes.json().catch(() => ({}));
    if (taskRes.ok && taskJson.data) {
      setTask(taskJson.data);
      setEdit(taskJson.data);
    }

    setReqs((await reqsRes.json().catch(() => ({}))).data ?? []);
    setCourses((await coursesRes.json().catch(() => ({}))).data ?? []);
    setSignoffs((await soRes.json().catch(() => ({}))).data ?? []);
  }

  useEffect(() => { load(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveTask(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setMsg("");
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Save failed"); return; }
      setTask(json.data);
      setEdit(json.data);
      setMsg("Saved.");
    } finally {
      setBusy("");
    }
  }

  async function addReq(e: React.FormEvent) {
    e.preventDefault();
    setBusy("req");
    setMsg("");
    try {
      const body: Record<string, string | number | undefined> = {
        req_kind: reqForm.req_kind,
        notes: reqForm.notes || undefined,
      };
      if (reqForm.req_kind === "course") {
        body.course_id = reqForm.course_id;
      }
      if (reqForm.req_kind === "time") {
        body.min_hours = Number(reqForm.min_hours);
        body.activity_type = reqForm.activity_type;
        if (reqForm.within_months) body.within_months = Number(reqForm.within_months);
      }
      const res = await fetch(`/api/tasks/${taskId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Add failed"); return; }
      setReqs((prev) => [...prev, json.data]);
      setReqForm({ req_kind: "course", course_id: "", min_hours: "", within_months: "", activity_type: "any", notes: "" });
      setMsg("Requirement added.");
    } finally {
      setBusy("");
    }
  }

  async function removeReq(req_id: string) {
    if (!confirm("Remove this requirement?")) return;
    setBusy("req-del");
    try {
      const res = await fetch(`/api/tasks/${taskId}/requirements?req_id=${req_id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setMsg(j?.error ?? "Remove failed"); return; }
      setReqs((prev) => prev.filter((r) => r.id !== req_id));
      setMsg("");
    } finally {
      setBusy("");
    }
  }

  function reqLabel(r: TaskReq): string {
    if (r.req_kind === "course") {
      const c = r.courses;
      return c ? `${c.code} — ${c.name}` : "Unknown course";
    }
    if (r.req_kind === "time") {
      const hrs = r.min_hours ?? 0;
      const type = r.activity_type === "training" ? "training" : r.activity_type === "call" ? "calls" : "any activity";
      const win = r.within_months ? ` within ${r.within_months} months` : "";
      return `${hrs} hr${hrs !== 1 ? "s" : ""} in ${type}${win}`;
    }
    return r.req_kind;
  }

  // Summary line: "Requires CPR + 4 hrs training + approval"
  const reqSummary = (() => {
    const parts: string[] = [];
    for (const r of reqs) {
      if (r.req_kind === "course") parts.push(r.courses?.code ?? "course");
      if (r.req_kind === "time") {
        const type = r.activity_type === "training" ? "training" : r.activity_type === "call" ? "call" : "activity";
        parts.push(`${r.min_hours}h ${type}`);
      }
    }
    parts.push("approval");
    return parts.join(" + ");
  })();

  if (!task) return <div style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</div>;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 700 }}>
      <p><Link href="/tasks">← Skills</Link></p>

      {msg && (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
          {msg}
        </div>
      )}

      {/* Skill info */}
      <section style={sectionStyle}>
        <h2 style={h2}>Skill Info</h2>
        <form onSubmit={saveTask} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Code</label>
              <input style={inputStyle} value={edit.task_code ?? ""} onChange={(e) => setEdit({ ...edit, task_code: e.target.value })} required />
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={edit.task_name ?? ""} onChange={(e) => setEdit({ ...edit, task_name: e.target.value })} required />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <input style={inputStyle} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value || null })} placeholder="Optional" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={edit.is_active ?? true} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
            Active
          </label>
          <div>
            <button type="submit" disabled={busy === "save"} style={btnStyle}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </section>

      {/* How to earn */}
      <section style={sectionStyle}>
        <h2 style={h2}>How to Earn This Skill</h2>

        {/* Summary pill */}
        <div style={{ marginBottom: 14, padding: "8px 12px", background: "#f0f4ff", border: "1px solid #c7d2fe", borderRadius: 8, fontSize: 13, color: "#3730a3" }}>
          <strong>Earn by:</strong> {reqSummary}
        </div>

        {reqs.length === 0 ? (
          <p style={muted}>No prerequisites — approval only.</p>
        ) : (
          <div style={{ display: "grid", gap: 4, marginBottom: 14 }}>
            {reqs.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, marginRight: 4,
                  background: r.req_kind === "course" ? "#ecfdf5" : "#eff6ff",
                  border: r.req_kind === "course" ? "1px solid #6ee7b7" : "1px solid #93c5fd",
                  color: r.req_kind === "course" ? "#065f46" : "#1e40af",
                  textTransform: "uppercase",
                }}>
                  {r.req_kind === "course" ? "Class" : "Time"}
                </span>
                <span style={{ flex: 1, fontSize: 13 }}>{reqLabel(r)}</span>
                {r.notes && <span style={muted}>· {r.notes}</span>}
                <button
                  type="button"
                  onClick={() => removeReq(r.id)}
                  disabled={busy !== ""}
                  style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #f2c9b8", borderRadius: 4, cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add requirement */}
        <form onSubmit={addReq} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={reqForm.req_kind}
            onChange={(e) => setReqForm({ ...reqForm, req_kind: e.target.value, course_id: "", min_hours: "", within_months: "" })}
            style={selectStyle}
          >
            <option value="course">Class / Course</option>
            <option value="time">Time in activity</option>
          </select>

          {reqForm.req_kind === "course" && (
            <select
              value={reqForm.course_id}
              onChange={(e) => setReqForm({ ...reqForm, course_id: e.target.value })}
              style={{ ...selectStyle, flex: 1, minWidth: 160 }}
              required
            >
              <option value="">Select course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          )}

          {reqForm.req_kind === "time" && (
            <>
              <input
                type="number"
                placeholder="Hours"
                min={0.5}
                step={0.5}
                value={reqForm.min_hours}
                onChange={(e) => setReqForm({ ...reqForm, min_hours: e.target.value })}
                style={{ width: 80, ...selectStyle }}
                required
              />
              <select
                value={reqForm.activity_type}
                onChange={(e) => setReqForm({ ...reqForm, activity_type: e.target.value })}
                style={selectStyle}
              >
                <option value="any">Any activity</option>
                <option value="training">Training</option>
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

          <button
            type="submit"
            disabled={busy === "req" || (reqForm.req_kind === "course" && !reqForm.course_id) || (reqForm.req_kind === "time" && !reqForm.min_hours)}
            style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "1px solid #94a3b8", cursor: "pointer" }}
          >
            Add
          </button>
        </form>
      </section>

      {/* Members with sign-offs */}
      <section style={sectionStyle}>
        <h2 style={h2}>
          Approved Members{" "}
          <span style={muted}>({signoffs.length})</span>
        </h2>
        {signoffs.length === 0 ? (
          <p style={muted}>No approvals recorded yet.</p>
        ) : (
          <ul style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
            {signoffs.map((s) => {
              const m = s.members;
              const name = m ? `${m.first_name} ${m.last_name}` : s.member_id;
              return (
                <li key={s.id} style={{ padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: "#1a7f3c" }}>✓</span>
                  <strong>{name}</strong>
                  <span style={muted}>{new Date(s.signed_at).toLocaleDateString()}</span>
                  {s.evaluator_name && <span style={muted}>· {s.evaluator_name}</span>}
                  {s.notes && <span style={muted}>· {s.notes}</span>}
                </li>
              );
            })}
          </ul>
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
