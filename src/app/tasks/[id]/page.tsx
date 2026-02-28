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
  is_global: boolean;
  position_id?: string | null;
  positions?: { id: string; code: string; name: string } | null;
};

type TaskReq = {
  id: string;
  req_kind: "time" | "proficiency";
  min_hours?: number | null;
  within_months?: number | null;
  activity_type?: string | null;
  notes?: string | null;
  created_at: string;
};

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
  const [signoffs, setSignoffs] = useState<Signoff[]>([]);

  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  // Requirement add form
  const [reqForm, setReqForm] = useState({
    req_kind: "time",
    min_hours: "",
    within_months: "",
    activity_type: "any",
    notes: "",
  });

  async function load() {
    if (!taskId) return;
    const [taskRes, reqsRes, signoffsRes] = await Promise.all([
      fetch(`/api/tasks/${taskId}`),
      fetch(`/api/tasks/${taskId}/requirements`),
      fetch(`/api/member-task-signoffs?task_id=${taskId}`),
    ]);

    const taskJson = await taskRes.json().catch(() => ({}));
    if (taskRes.ok && taskJson.data) {
      setTask(taskJson.data);
      setEdit(taskJson.data);
    }

    const reqsJson = await reqsRes.json().catch(() => ({}));
    setReqs(reqsJson.data ?? []);

    const soJson = await signoffsRes.json().catch(() => ({}));
    setSignoffs(soJson.data ?? []);
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
    if (reqForm.req_kind === "time" && !reqForm.min_hours) return;
    setBusy("req");
    setMsg("");
    try {
      const body: Record<string, string | number | undefined> = {
        req_kind: reqForm.req_kind,
        notes: reqForm.notes || undefined,
      };
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
      if (!res.ok) { setMsg(json?.error ?? "Add requirement failed"); return; }
      setReqs((prev) => [...prev, json.data]);
      setReqForm({ req_kind: "time", min_hours: "", within_months: "", activity_type: "any", notes: "" });
      setMsg("Requirement added.");
    } finally {
      setBusy("");
    }
  }

  async function removeReq(req_id: string) {
    if (!confirm("Remove this requirement?")) return;
    setBusy("req-del");
    setMsg("");
    try {
      const res = await fetch(`/api/tasks/${taskId}/requirements?req_id=${req_id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Remove failed"); return; }
      setReqs((prev) => prev.filter((r) => r.id !== req_id));
      setMsg("Requirement removed.");
    } finally {
      setBusy("");
    }
  }

  function reqLabel(r: TaskReq): string {
    if (r.req_kind === "time") {
      const type = r.activity_type ?? "any";
      const hrs = r.min_hours ?? 0;
      const win = r.within_months ? ` within ${r.within_months} months` : "";
      const typeLabel = type === "training" ? "training" : type === "call" ? "calls" : "any activity";
      return `${hrs} hour${hrs !== 1 ? "s" : ""} in ${typeLabel}${win}`;
    }
    if (r.req_kind === "proficiency") {
      return `Proficiency sign-off${r.notes ? `: ${r.notes}` : ""}`;
    }
    return r.req_kind;
  }

  const pos = task?.positions as { id: string; code: string; name: string } | null | undefined;

  if (!task) return <div style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</div>;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 800 }}>
      <p><Link href="/tasks">← Tasks</Link></p>

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
              <label style={labelStyle}>Task code</label>
              <input style={inputStyle} value={edit.task_code ?? ""} onChange={(e) => setEdit({ ...edit, task_code: e.target.value })} required />
            </div>
            <div>
              <label style={labelStyle}>Task name</label>
              <input style={inputStyle} value={edit.task_name ?? ""} onChange={(e) => setEdit({ ...edit, task_name: e.target.value })} required />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <input style={inputStyle} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value || null })} placeholder="Optional" />
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={edit.is_active ?? true} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
              Active
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={edit.is_global ?? false} onChange={(e) => setEdit({ ...edit, is_global: e.target.checked })} />
              Global (not position-specific)
            </label>
          </div>
          {pos && !edit.is_global && (
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              Position: <Link href={`/positions/${pos.id}`} style={{ color: "#1e40af" }}>{pos.code} — {pos.name}</Link>
            </div>
          )}
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

        {reqs.length === 0 ? (
          <p style={muted}>No requirements defined — add one below.</p>
        ) : (
          <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
            {reqs.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ flex: 1, fontSize: 13 }}>
                  <strong>{r.req_kind === "time" ? "Time" : "Proficiency"}:</strong>{" "}
                  {reqLabel(r)}
                </span>
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

        <form onSubmit={addReq} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={reqForm.req_kind}
            onChange={(e) => setReqForm({ ...reqForm, req_kind: e.target.value, min_hours: "", within_months: "", notes: "" })}
            style={{ fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
          >
            <option value="time">Time in activity</option>
            <option value="proficiency">Proficiency sign-off</option>
          </select>

          {reqForm.req_kind === "time" && (
            <>
              <input
                type="number"
                placeholder="Hours required"
                min={0.5}
                step={0.5}
                value={reqForm.min_hours}
                onChange={(e) => setReqForm({ ...reqForm, min_hours: e.target.value })}
                style={{ width: 120, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
                required
              />
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
                placeholder="Within months (opt)"
                min={1}
                value={reqForm.within_months}
                onChange={(e) => setReqForm({ ...reqForm, within_months: e.target.value })}
                style={{ width: 160, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
              />
            </>
          )}

          {reqForm.req_kind === "proficiency" && (
            <input
              placeholder="Criteria / notes (optional)"
              value={reqForm.notes}
              onChange={(e) => setReqForm({ ...reqForm, notes: e.target.value })}
              style={{ flex: 1, minWidth: 200, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd" }}
            />
          )}

          <button
            type="submit"
            disabled={busy === "req" || (reqForm.req_kind === "time" && !reqForm.min_hours)}
            style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "1px solid #94a3b8", cursor: "pointer" }}
          >
            Add
          </button>
        </form>
      </section>

      {/* Members who earned this skill */}
      <section style={sectionStyle}>
        <h2 style={h2}>Members with Sign-offs <span style={muted}>({signoffs.length})</span></h2>
        {signoffs.length === 0 ? (
          <p style={muted}>No sign-offs recorded yet.</p>
        ) : (
          <ul style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
            {signoffs.map((s) => {
              const m = s.members;
              const name = m ? `${m.first_name} ${m.last_name}` : s.member_id;
              return (
                <li key={s.id} style={{ padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: "#1a7f3c", fontSize: 14 }}>✓</span>
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
const btnStyle: React.CSSProperties = { padding: "7px 18px", borderRadius: 8, background: "#1e40af", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" };
