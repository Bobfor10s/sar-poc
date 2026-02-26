"use client";

import { useEffect, useState } from "react";

type Position = {
  id: string;
  code: string;
  name: string;
  level?: number | null;
  position_type?: string | null;
  is_active: boolean;
};

type Course = {
  id: string;
  code: string;
  name: string;
};

type ReqRow = {
  id: string;
  req_kind: string;
  notes?: string | null;
  task_id?: string | null;
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

type PositionDetail = {
  requirements: ReqRow[];
  tasks: TaskRow[];
};

export default function AdminPositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Create position form
  const [newPos, setNewPos] = useState({ code: "", name: "", level: "", position_type: "" });

  // Expanded position details keyed by position id
  const [expanded, setExpanded] = useState<Record<string, PositionDetail | null>>({});

  // Per-position add-requirement form state
  const [reqForms, setReqForms] = useState<
    Record<string, { req_kind: string; course_id: string; required_position_id: string; task_id: string; notes: string }>
  >({});

  // Per-position add-task form state
  const [taskForms, setTaskForms] = useState<
    Record<string, { task_code: string; task_name: string; description: string }>
  >({});

  async function loadPositions() {
    const res = await fetch("/api/positions");
    const json = await res.json().catch(() => ({}));
    setPositions(json.data ?? []);
  }

  async function loadCourses() {
    const res = await fetch("/api/courses");
    const json = await res.json().catch(() => ({}));
    setCourses(json.data ?? []);
  }

  useEffect(() => {
    loadPositions();
    loadCourses();
  }, []);

  async function createPosition(e: React.FormEvent) {
    e.preventDefault();
    if (!newPos.code || !newPos.name) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newPos.code,
          name: newPos.name,
          level: newPos.level !== "" ? Number(newPos.level) : undefined,
          position_type: newPos.position_type || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Create failed"); return; }
      setNewPos({ code: "", name: "", level: "", position_type: "" });
      await loadPositions();
      setMsg("Position created.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleExpand(pos: Position) {
    if (expanded[pos.id] !== undefined) {
      // Collapse
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[pos.id];
        return next;
      });
      return;
    }
    // Expand: set null (loading) then fetch
    setExpanded((prev) => ({ ...prev, [pos.id]: null }));
    const res = await fetch(`/api/positions/${pos.id}/requirements`);
    const json = await res.json().catch(() => ({}));
    const detail: PositionDetail = res.ok
      ? { requirements: json.data?.requirements ?? [], tasks: json.data?.tasks ?? [] }
      : { requirements: [], tasks: [] };
    setExpanded((prev) => ({ ...prev, [pos.id]: detail }));

    // Init form state for this position if not already set
    setReqForms((prev) => prev[pos.id] ? prev : {
      ...prev,
      [pos.id]: { req_kind: "course", course_id: "", required_position_id: "", task_id: "", notes: "" },
    });
    setTaskForms((prev) => prev[pos.id] ? prev : {
      ...prev,
      [pos.id]: { task_code: "", task_name: "", description: "" },
    });
  }

  async function reloadPositionDetail(position_id: string) {
    const res = await fetch(`/api/positions/${position_id}/requirements`);
    const json = await res.json().catch(() => ({}));
    const detail: PositionDetail = res.ok
      ? { requirements: json.data?.requirements ?? [], tasks: json.data?.tasks ?? [] }
      : { requirements: [], tasks: [] };
    setExpanded((prev) => ({ ...prev, [position_id]: detail }));
  }

  async function addRequirement(position_id: string, e: React.FormEvent) {
    e.preventDefault();
    const form = reqForms[position_id];
    if (!form) return;
    setBusy(true);
    setMsg("");
    try {
      const body: Record<string, string | undefined> = { req_kind: form.req_kind, notes: form.notes || undefined };
      if (form.req_kind === "course") body.course_id = form.course_id;
      if (form.req_kind === "position") body.required_position_id = form.required_position_id;
      if (form.req_kind === "task") body.task_id = form.task_id;

      const res = await fetch(`/api/positions/${position_id}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Add requirement failed"); return; }

      // Reset only FK fields, keep req_kind
      setReqForms((prev) => ({
        ...prev,
        [position_id]: { ...prev[position_id], course_id: "", required_position_id: "", task_id: "", notes: "" },
      }));
      await reloadPositionDetail(position_id);
      setMsg("Requirement added.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRequirement(position_id: string, req_id: string) {
    if (!confirm("Remove this requirement?")) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/positions/${position_id}/requirements?req_id=${req_id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Remove failed"); return; }
      await reloadPositionDetail(position_id);
      setMsg("Requirement removed.");
    } finally {
      setBusy(false);
    }
  }

  async function addTask(position_id: string, e: React.FormEvent) {
    e.preventDefault();
    const form = taskForms[position_id];
    if (!form || !form.task_code || !form.task_name) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/positions/${position_id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_code: form.task_code, task_name: form.task_name, description: form.description || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Add task failed"); return; }
      setTaskForms((prev) => ({ ...prev, [position_id]: { task_code: "", task_name: "", description: "" } }));
      await reloadPositionDetail(position_id);
      setMsg("Task added.");
    } finally {
      setBusy(false);
    }
  }

  async function removeTask(position_id: string, task_id: string) {
    if (!confirm("Remove this task? This will also remove any signoffs referencing it.")) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/positions/${position_id}/tasks?task_id=${task_id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Remove failed"); return; }
      await reloadPositionDetail(position_id);
      setMsg("Task removed.");
    } finally {
      setBusy(false);
    }
  }

  function reqLabel(r: ReqRow): string {
    if (r.req_kind === "course") return `Course: ${r.courses?.code ?? "?"} — ${r.courses?.name ?? ""}`;
    if (r.req_kind === "position") return `Prereq position: ${r.required_position?.code ?? "?"} — ${r.required_position?.name ?? ""}`;
    if (r.req_kind === "task") return `Task: ${r.tasks?.task_code ?? "?"} — ${r.tasks?.task_name ?? ""}`;
    return r.req_kind;
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1>Admin — Positions</h1>

      {msg ? (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
          {msg}
        </div>
      ) : null}

      {/* Create position */}
      <section style={{ marginBottom: 28 }}>
        <h2>Create Position</h2>
        <form onSubmit={createPosition} style={{ display: "grid", gap: 8, maxWidth: 560 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
            <input
              placeholder="Code (e.g. SAR-T1)"
              value={newPos.code}
              onChange={(e) => setNewPos({ ...newPos, code: e.target.value })}
              required
            />
            <input
              placeholder="Name (e.g. Land SAR Technician Type 1)"
              value={newPos.name}
              onChange={(e) => setNewPos({ ...newPos, name: e.target.value })}
              required
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
            <input
              type="number"
              placeholder="Level (optional)"
              value={newPos.level}
              onChange={(e) => setNewPos({ ...newPos, level: e.target.value })}
            />
            <input
              placeholder="Position type (optional)"
              value={newPos.position_type}
              onChange={(e) => setNewPos({ ...newPos, position_type: e.target.value })}
            />
          </div>
          <div>
            <button type="submit" disabled={busy || !newPos.code || !newPos.name}>
              Create Position
            </button>
          </div>
        </form>
      </section>

      {/* Position list */}
      <section>
        <h2>Positions ({positions.length})</h2>
        {positions.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No positions found.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {positions.map((pos) => {
              const detail = expanded[pos.id];
              const isExpanded = pos.id in expanded;
              const reqForm = reqForms[pos.id] ?? { req_kind: "course", course_id: "", required_position_id: "", task_id: "", notes: "" };
              const taskForm = taskForms[pos.id] ?? { task_code: "", task_name: "", description: "" };

              return (
                <div key={pos.id} style={{ border: "1px solid #dde", borderRadius: 10, overflow: "hidden" }}>
                  {/* Header */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(pos)}
                    style={{
                      display: "flex",
                      width: "100%",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 14px",
                      background: isExpanded ? "#f0f4ff" : "#f8fafc",
                      border: "none",
                      borderBottom: isExpanded ? "1px solid #dde" : "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "system-ui",
                      fontSize: 15,
                    }}
                  >
                    <strong>{pos.code}</strong>
                    <span style={{ flex: 1, opacity: 0.85 }}>{pos.name}</span>
                    {pos.level != null ? <span style={{ fontSize: 12, opacity: 0.6 }}>Lvl {pos.level}</span> : null}
                    {pos.position_type ? <span style={{ fontSize: 12, opacity: 0.6 }}>{pos.position_type}</span> : null}
                    <span style={{ fontSize: 12, opacity: 0.55 }}>{isExpanded ? "▲" : "▼"}</span>
                  </button>

                  {isExpanded ? (
                    <div style={{ padding: 14, display: "grid", gap: 20 }}>
                      {detail === null ? (
                        <div style={{ opacity: 0.6 }}>Loading…</div>
                      ) : (
                        <>
                          {/* Requirements panel */}
                          <div>
                            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Requirements</h3>
                            {detail.requirements.length === 0 ? (
                              <p style={{ opacity: 0.6, margin: "0 0 8px" }}>No requirements.</p>
                            ) : (
                              <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
                                {detail.requirements.map((r) => (
                                  <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <span style={{ flex: 1, fontSize: 13 }}>{reqLabel(r)}</span>
                                    {r.notes ? <span style={{ fontSize: 12, opacity: 0.6 }}>({r.notes})</span> : null}
                                    <button
                                      type="button"
                                      onClick={() => removeRequirement(pos.id, r.id)}
                                      disabled={busy}
                                      style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #f2c9b8" }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add requirement form */}
                            <form onSubmit={(e) => addRequirement(pos.id, e)} style={{ display: "grid", gap: 6, maxWidth: 560 }}>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                <select
                                  value={reqForm.req_kind}
                                  onChange={(e) => setReqForms((prev) => ({ ...prev, [pos.id]: { ...reqForm, req_kind: e.target.value, course_id: "", required_position_id: "", task_id: "" } }))}
                                  style={{ fontSize: 13 }}
                                >
                                  <option value="course">Course</option>
                                  <option value="position">Prereq Position</option>
                                  <option value="task">Proficiency Task</option>
                                </select>

                                {reqForm.req_kind === "course" && (
                                  <select
                                    value={reqForm.course_id}
                                    onChange={(e) => setReqForms((prev) => ({ ...prev, [pos.id]: { ...reqForm, course_id: e.target.value } }))}
                                    style={{ flex: 1, minWidth: 160, fontSize: 13 }}
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
                                    onChange={(e) => setReqForms((prev) => ({ ...prev, [pos.id]: { ...reqForm, required_position_id: e.target.value } }))}
                                    style={{ flex: 1, minWidth: 160, fontSize: 13 }}
                                    required
                                  >
                                    <option value="">Select position…</option>
                                    {positions.filter((p) => p.id !== pos.id).map((p) => (
                                      <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                                    ))}
                                  </select>
                                )}

                                {reqForm.req_kind === "task" && (
                                  <select
                                    value={reqForm.task_id}
                                    onChange={(e) => setReqForms((prev) => ({ ...prev, [pos.id]: { ...reqForm, task_id: e.target.value } }))}
                                    style={{ flex: 1, minWidth: 160, fontSize: 13 }}
                                    required
                                  >
                                    <option value="">Select task…</option>
                                    {detail.tasks.map((t) => (
                                      <option key={t.id} value={t.id}>{t.task_code} — {t.task_name}</option>
                                    ))}
                                  </select>
                                )}

                                <input
                                  placeholder="Notes (optional)"
                                  value={reqForm.notes}
                                  onChange={(e) => setReqForms((prev) => ({ ...prev, [pos.id]: { ...reqForm, notes: e.target.value } }))}
                                  style={{ width: 140, fontSize: 13 }}
                                />

                                <button
                                  type="submit"
                                  disabled={busy || (reqForm.req_kind === "course" && !reqForm.course_id) || (reqForm.req_kind === "position" && !reqForm.required_position_id) || (reqForm.req_kind === "task" && !reqForm.task_id)}
                                  style={{ fontSize: 13 }}
                                >
                                  Add Req
                                </button>
                              </div>
                            </form>
                          </div>

                          {/* Tasks panel */}
                          <div>
                            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Tasks (Taskbook)</h3>
                            {detail.tasks.length === 0 ? (
                              <p style={{ opacity: 0.6, margin: "0 0 8px" }}>No tasks.</p>
                            ) : (
                              <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
                                {detail.tasks.map((t) => (
                                  <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <span style={{ fontFamily: "monospace", fontSize: 13, minWidth: 100 }}>{t.task_code}</span>
                                    <span style={{ flex: 1, fontSize: 13 }}>{t.task_name}</span>
                                    {t.description ? <span style={{ fontSize: 12, opacity: 0.55 }}>{t.description}</span> : null}
                                    <button
                                      type="button"
                                      onClick={() => removeTask(pos.id, t.id)}
                                      disabled={busy}
                                      style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #f2c9b8" }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add task form */}
                            <form onSubmit={(e) => addTask(pos.id, e)} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              <input
                                placeholder="Task code (e.g. NAV-1)"
                                value={taskForm.task_code}
                                onChange={(e) => setTaskForms((prev) => ({ ...prev, [pos.id]: { ...taskForm, task_code: e.target.value } }))}
                                style={{ width: 120, fontSize: 13 }}
                                required
                              />
                              <input
                                placeholder="Task name"
                                value={taskForm.task_name}
                                onChange={(e) => setTaskForms((prev) => ({ ...prev, [pos.id]: { ...taskForm, task_name: e.target.value } }))}
                                style={{ flex: 1, minWidth: 180, fontSize: 13 }}
                                required
                              />
                              <input
                                placeholder="Description (optional)"
                                value={taskForm.description}
                                onChange={(e) => setTaskForms((prev) => ({ ...prev, [pos.id]: { ...taskForm, description: e.target.value } }))}
                                style={{ width: 180, fontSize: 13 }}
                              />
                              <button
                                type="submit"
                                disabled={busy || !taskForm.task_code || !taskForm.task_name}
                                style={{ fontSize: 13 }}
                              >
                                Add Task
                              </button>
                            </form>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
