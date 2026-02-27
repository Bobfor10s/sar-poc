"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type AuthUser = {
  id: string;
  name: string;
  role: string;
  permissions: string[];
};

type Member = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  street_address?: string | null;
  street_address_2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  status: string;
  joined_at?: string | null;
  deactivated_at?: string | null;
  reactivated_at?: string | null;
};

type Course = {
  id: string;
  code: string;
  name: string;
  valid_months: number;
  warning_days: number;
  is_active: boolean;
};

type CertRow = {
  id: string;
  course_id: string;
  completed_at: string;
  expires_at: string;
  courses?: { code: string; name: string; never_expires: boolean } | null;
};

type Position = {
  id: string;
  code: string;
  name: string;
};

type MemberPosition = {
  id: string;
  member_id: string;
  position_id: string;
  status: string; // trainee|qualified|pending etc.
  approved_at?: string | null;
  positions?: Position | null;
};

type ReqRow = {
  id: string;
  req_kind: "course" | "position" | "task" | string;
  notes?: string | null;
  courses?: { id: string; code: string; name: string } | null;
  required_position?: { id: string; code: string; name: string } | null;
  tasks?: { id: string; task_code: string; task_name: string } | null;
  task_id?: string | null;
};

type TaskRow = {
  id: string;
  task_code: string;
  task_name: string;
  description?: string | null;
  is_active: boolean;
};

type SignoffRow = {
  id: string;
  task_id: string;
  signed_at: string;
};

type PtbErr = {
  message: string;
  missing_courses: string[];
  missing_positions: string[];
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function addMonths(dateStr: string, months: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + months);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isPtbCompleteTaskCode(code: string) {
  const c = (code || "").toUpperCase().replace(/\s+/g, "-");
  return c === "PTB-COMPLETE" || c === "PTB_COMPLETE" || c === "PTB-COMPLETED";
}

export default function MemberDetailPage() {
  const params = useParams();
  const memberId = typeof (params as any)?.id === "string" ? (params as any).id : "";

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [history, setHistory] = useState<CertRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [ptbErrorByPosition, setPtbErrorByPosition] = useState<Record<string, PtbErr | null>>({});
  const [roleEdit, setRoleEdit] = useState("");
  const [roleMsg, setRoleMsg] = useState("");

  const [certForm, setCertForm] = useState({ course_id: "", completed_at: "" });

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === certForm.course_id) ?? null,
    [courses, certForm.course_id]
  );

  const computedExpires = useMemo(() => {
    if (!selectedCourse || !certForm.completed_at) return "";
    return addMonths(certForm.completed_at, selectedCourse.valid_months);
  }, [selectedCourse, certForm.completed_at]);

  const [positions, setPositions] = useState<Position[]>([]);
  const [memberPositions, setMemberPositions] = useState<MemberPosition[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState("");

  const [reqsByPosition, setReqsByPosition] = useState<Record<string, ReqRow[]>>({});
  const [tasksByPosition, setTasksByPosition] = useState<Record<string, TaskRow[]>>({});
  const [signoffsByPosition, setSignoffsByPosition] = useState<Record<string, SignoffRow[]>>({});

  const completedCourseCodes = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const set = new Set<string>();
    for (const r of history) {
      const neverExpires = r.courses?.never_expires ?? false;
      if (!neverExpires && r.expires_at && r.expires_at < today) continue;
      const code = r.courses?.code;
      if (code) set.add(code);
    }
    return set;
  }, [history]);

  // Use course_id directly (no join required) for reliable completion checks
  const completedCourseIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return new Set(
      history
        .filter((r) => {
          const neverExpires = r.courses?.never_expires ?? false;
          return neverExpires || !r.expires_at || r.expires_at >= today;
        })
        .map((r) => r.course_id)
        .filter(Boolean)
    );
  }, [history]);

  const memberHasPositionCode = useMemo(() => {
    const set = new Set<string>();
    for (const mp of memberPositions) {
      const code = mp.positions?.code;
      if (code) set.add(code);
    }
    return set;
  }, [memberPositions]);

  async function loadAll() {
    if (!memberId || !isUuid(memberId)) {
      setMsg(`Bad member id: ${memberId || "(missing)"}`);
      return;
    }

    const [mRes, cRes, hRes, pRes, mpRes] = await Promise.all([
      fetch(`/api/members/${memberId}`),
      fetch(`/api/courses`),
      fetch(`/api/member-certifications?member_id=${memberId}&mode=history`),
      fetch(`/api/positions`),
      fetch(`/api/member-positions?member_id=${memberId}`),
    ]);

    const mJson = await mRes.json().catch(() => ({}));
    if (!mRes.ok) throw new Error(mJson?.error ?? "Failed to load member");

    const cJson = await cRes.json().catch(() => ({}));
    const hJson = await hRes.json().catch(() => ({}));
    const pJson = await pRes.json().catch(() => ({}));
    const mpJson = await mpRes.json().catch(() => ({}));

    setMember(mJson.data);
    setCourses(cJson.data ?? []);
    setHistory(hJson.data ?? []);
    setPositions(pJson.data ?? []);
    setMemberPositions(mpJson.data ?? []);

    // Auto-load requirements for all assigned positions so badges are correct on load
    for (const mp of (mpJson.data ?? [])) {
      if (mp.position_id) await ensurePositionLoaded(mp.position_id);
    }
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => setAuthUser(json?.user ?? null))
      .catch(() => setAuthUser(null));
    loadAll().catch((e) => setMsg(e?.message ?? String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  async function saveMember(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setBusy(true);
    setMsg("");

    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(member),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error ?? "Save failed");
        return;
      }

      setMember(json.data);
      setMsg("Saved.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!member) return;
    const nextStatus = member.status === "inactive" ? "active" : "inactive";
    const action = nextStatus === "inactive" ? "deactivate" : "reactivate";

    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${member.first_name} ${member.last_name}?`)) return;

    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggle_status: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error ?? `${action} failed`);
        return;
      }
      setMember(json.data);
      setMsg(`Member ${action}d.`);
    } finally {
      setBusy(false);
    }
  }

  async function addCertification(e: React.FormEvent) {
    e.preventDefault();
    if (!member || !certForm.course_id || !certForm.completed_at || !computedExpires) return;

    setBusy(true);
    setMsg("");

    try {
      const res = await fetch(`/api/member-certifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: member.id,
          course_id: certForm.course_id,
          completed_at: certForm.completed_at,
          expires_at: computedExpires,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error ?? "Add certification failed");
        return;
      }

      setCertForm({ course_id: "", completed_at: "" });

      const hRes = await fetch(`/api/member-certifications?member_id=${member.id}&mode=history`);
      const hJson = await hRes.json().catch(() => ({}));
      setHistory(hJson.data ?? []);
      setMsg("Certification added.");
    } finally {
      setBusy(false);
    }
  }

  // --------------------
  // POSITIONS helpers
  // --------------------
  async function ensurePositionLoaded(position_id: string) {
    if (!position_id) return { reqs: [] as ReqRow[], tasks: [] as TaskRow[] };

    let reqs = reqsByPosition[position_id];
    let tasks = tasksByPosition[position_id];

    if (!reqs || !tasks) {
      const res = await fetch(`/api/positions/${position_id}/requirements`);
      const json = await res.json().catch(() => ({}));

      if (res.ok) {
        reqs = json?.data?.requirements ?? [];
        tasks = json?.data?.tasks ?? [];

        setReqsByPosition((prev) => ({ ...prev, [position_id]: reqs! }));
        setTasksByPosition((prev) => ({ ...prev, [position_id]: tasks! }));
      } else {
        reqs = [];
        tasks = [];
      }
    }

    // Also load requirements for any prerequisite positions so course checks work
    const prereqUpdates: Record<string, ReqRow[]> = {};
    for (const req of reqs ?? []) {
      if (req.req_kind === "position" && req.required_position?.id) {
        const prereqId = req.required_position.id;
        if (!reqsByPosition[prereqId] && !prereqUpdates[prereqId]) {
          const prereqRes = await fetch(`/api/positions/${prereqId}/requirements`);
          const prereqJson = await prereqRes.json().catch(() => ({}));
          if (prereqRes.ok) {
            prereqUpdates[prereqId] = prereqJson?.data?.requirements ?? [];
          }
        }
      }
    }
    if (Object.keys(prereqUpdates).length > 0) {
      setReqsByPosition((prev) => ({ ...prev, ...prereqUpdates }));
    }

    if (!signoffsByPosition[position_id] && memberId) {
      const sRes = await fetch(
        `/api/member-task-signoffs?member_id=${memberId}&position_id=${position_id}`
      );
      const sJson = await sRes.json().catch(() => ({}));
      if (sRes.ok) setSignoffsByPosition((prev) => ({ ...prev, [position_id]: sJson?.data ?? [] }));
    }

    return { reqs: (reqs ?? []) as ReqRow[], tasks: (tasks ?? []) as TaskRow[] };
  }

  async function refreshMemberPositions() {
    if (!member?.id) return;
    const mpRes = await fetch(`/api/member-positions?member_id=${member.id}`);
    const mpJson = await mpRes.json().catch(() => ({}));
    setMemberPositions(mpJson.data ?? []);
  }

  async function assignPosition() {
    if (!member || !selectedPositionId) return;
    setBusy(true);
    setMsg("");

    try {
      const res = await fetch(`/api/member-positions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: member.id, position_id: selectedPositionId, status: "trainee" }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error ?? "Assign failed");
        return;
      }

      await refreshMemberPositions();
      setSelectedPositionId("");
      setMsg("Position assigned (trainee).");
    } finally {
      setBusy(false);
    }
  }

  async function unassignMemberPosition(memberPositionId: string, position_id: string) {
    if (!memberPositionId) return;

    const ok = confirm("Unassign this position from the member? This removes the assignment record.");
    if (!ok) return;

    setBusy(true);
    setMsg("");

    try {
      const res = await fetch(`/api/member-positions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberPositionId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error ?? "Unassign failed");
        return;
      }

      // Clean up cached UI state for that position so it doesn't "ghost" in the UI
      setReqsByPosition((prev) => {
        const next = { ...prev };
        delete next[position_id];
        return next;
      });
      setTasksByPosition((prev) => {
        const next = { ...prev };
        delete next[position_id];
        return next;
      });
      setSignoffsByPosition((prev) => {
        const next = { ...prev };
        delete next[position_id];
        return next;
      });
      setPtbErrorByPosition((prev) => {
        const next = { ...prev };
        delete next[position_id];
        return next;
      });

      await refreshMemberPositions();
      setMsg("Position unassigned.");
    } finally {
      setBusy(false);
    }
  }

  function meetsRequirements(position_id: string) {
    const reqs = reqsByPosition[position_id] ?? [];
    let ok = true;

    for (const r of reqs) {
      if (r.req_kind === "course") {
        const code = r.courses?.code;
        const reqCourseId = r.courses?.id;
        const hasIt =
          (code && completedCourseCodes.has(code)) ||
          !!(reqCourseId && completedCourseIds.has(reqCourseId));
        if (!hasIt) ok = false;
      }
      if (r.req_kind === "position") {
        const prereqId = r.required_position?.id;
        if (prereqId) {
          const prereqReqs = reqsByPosition[prereqId];
          if (prereqReqs !== undefined) {
            for (const pr of prereqReqs) {
              if (pr.req_kind === "course") {
                const code = pr.courses?.code;
                const cid = pr.courses?.id;
                const has = (code && completedCourseCodes.has(code)) || !!(cid && completedCourseIds.has(cid));
                if (!has) ok = false;
              }
            }
          }
        }
      }
      if (r.req_kind === "task") {
        const reqTaskId = r.task_id ?? r.tasks?.id;
        if (reqTaskId) {
          const signoffs = signoffsByPosition[position_id] ?? [];
          const signed = signoffs.some((s) => s.task_id === reqTaskId);
          if (!signed) ok = false;
        }
      }
    }

    const tasks = (tasksByPosition[position_id] ?? []).filter((t) => t.is_active);
    const ptb = tasks.find((t) => isPtbCompleteTaskCode(t.task_code));
    if (ptb) {
      const signoffs = signoffsByPosition[position_id] ?? [];
      const has = signoffs.some((s) => s.task_id === ptb.id);
      if (!has) ok = false;
    }

    return ok;
  }

  async function signoffPTB(position_id: string) {
    if (!member) return;

    setPtbErrorByPosition((prev) => ({ ...prev, [position_id]: null }));

    setBusy(true);
    setMsg("");

    try {
      const bundle = await ensurePositionLoaded(position_id);
      const tasks = (bundle.tasks ?? []).filter((t) => t.is_active);

      const ptb = tasks.find((t) => isPtbCompleteTaskCode(t.task_code));
      if (!ptb) {
        setMsg("No PTB Complete task found for this position (check position_tasks).");
        return;
      }

      const res = await fetch(`/api/member-task-signoffs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: member.id,
          position_id,
          task_id: ptb.id,
          evaluator_name: "Admin",
          evaluator_position: "Coordinator",
          notes: "PTB complete",
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = json?.error ?? "Signoff failed";
        setMsg(message);

        const missing_courses = Array.isArray(json?.missing_courses) ? json.missing_courses : [];
        const missing_positions = Array.isArray(json?.missing_positions) ? json.missing_positions : [];

        if (missing_courses.length || missing_positions.length) {
          setPtbErrorByPosition((prev) => ({
            ...prev,
            [position_id]: { message, missing_courses, missing_positions },
          }));
        }
        return;
      }

      const sRes = await fetch(
        `/api/member-task-signoffs?member_id=${member.id}&position_id=${position_id}`
      );
      const sJson = await sRes.json().catch(() => ({}));
      if (sRes.ok) setSignoffsByPosition((prev) => ({ ...prev, [position_id]: sJson?.data ?? [] }));

      setMsg("PTB signed off.");
    } finally {
      setBusy(false);
    }
  }

  async function approveMemberPosition(mpId: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/member-positions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({ id: mpId, approve: true, status: "qualified" }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json?.error ?? "Approve failed");
        return;
      }

      await refreshMemberPositions();
      setMsg("Position approved / marked qualified.");
    } finally {
      setBusy(false);
    }
  }

  if (!member && !msg) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</main>;
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 980 }}>
      <p>
        <a href="/members">← Back to Members</a>
      </p>

      <h1>Member Detail</h1>

      {msg ? (
        <div style={{ marginTop: 8, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
          {msg}
        </div>
      ) : null}

      {member ? (
        <>
          <h2 style={{ marginTop: 14 }}>
            {member.last_name}, {member.first_name}
          </h2>

          <form onSubmit={saveMember} style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <input value={member.first_name} onChange={(e) => setMember({ ...member, first_name: e.target.value })} placeholder="First name" />
              <input value={member.last_name} onChange={(e) => setMember({ ...member, last_name: e.target.value })} placeholder="Last name" />
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <input value={member.email ?? ""} onChange={(e) => setMember({ ...member, email: e.target.value })} placeholder="Email" />
              <input value={member.phone ?? ""} onChange={(e) => setMember({ ...member, phone: e.target.value })} placeholder="Phone" />
            </div>

            <div style={{ fontWeight: 600, marginTop: 6 }}>Address</div>

            <input value={member.street_address ?? ""} onChange={(e) => setMember({ ...member, street_address: e.target.value })} placeholder="Street address" />
            <input value={member.street_address_2 ?? ""} onChange={(e) => setMember({ ...member, street_address_2: e.target.value })} placeholder="Apt / Unit (optional)" />

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1.2fr 0.6fr 0.8fr" }}>
              <input value={member.city ?? ""} onChange={(e) => setMember({ ...member, city: e.target.value })} placeholder="City" />
              <input value={member.state ?? ""} onChange={(e) => setMember({ ...member, state: e.target.value })} placeholder="State" />
              <input value={member.postal_code ?? ""} onChange={(e) => setMember({ ...member, postal_code: e.target.value })} placeholder="ZIP" />
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                Town Approval Date:
                <input
                  type="date"
                  value={member.joined_at ?? ""}
                  onChange={(e) => setMember({ ...member, joined_at: e.target.value || null })}
                />
              </label>
              {!member.joined_at ? (
                <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #d97706", borderRadius: 999, background: "#fde68a", color: "#78350f", display: "inline-block", minWidth: 66, textAlign: "center", fontWeight: 700 }}>
                  Applicant
                </span>
              ) : null}

              <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>

          {/* Status toggle — requires edit_status permission */}
          <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {member.status === "inactive" ? (
              <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #dc2626", borderRadius: 999, background: "#fca5a5", color: "#7f1d1d", display: "inline-block", minWidth: 66, textAlign: "center", fontWeight: 700 }}>
                Inactive
              </span>
            ) : (
              <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #16a34a", borderRadius: 999, background: "#86efac", color: "#14532d", display: "inline-block", minWidth: 66, textAlign: "center", fontWeight: 700 }}>
                Active
              </span>
            )}
            {authUser?.permissions.includes("edit_status") && (
              <button
                type="button"
                onClick={toggleStatus}
                disabled={busy}
                style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #94a3b8", background: "#f8fafc", cursor: "pointer", fontSize: 13 }}
              >
                {member.status === "inactive" ? "Reactivate" : "Deactivate"}
              </button>
            )}
            {member.deactivated_at && (
              <span style={{ fontSize: 12, opacity: 0.6 }}>
                Deactivated: {new Date(member.deactivated_at).toLocaleDateString()}
              </span>
            )}
            {member.reactivated_at && (
              <span style={{ fontSize: 12, opacity: 0.6 }}>
                Reactivated: {new Date(member.reactivated_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Role management — requires manage_members permission */}
          {authUser?.permissions.includes("manage_members") && (
            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Role:</span>
              <select
                value={roleEdit || (member as any).role || "member"}
                onChange={(e) => setRoleEdit(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
              >
                <option value="member">member</option>
                <option value="viewer">viewer</option>
                <option value="admin">admin</option>
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setRoleMsg("");
                  try {
                    const res = await fetch(`/api/members/${member.id}/role`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ role: roleEdit || (member as any).role || "member" }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) { setRoleMsg(json?.error ?? "Save failed"); return; }
                    setRoleMsg("Role saved.");
                  } finally {
                    setBusy(false);
                  }
                }}
                style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #94a3b8", background: "#f8fafc", fontSize: 13, cursor: "pointer" }}
              >
                Save role
              </button>
              {roleMsg && <span style={{ fontSize: 12, opacity: 0.7 }}>{roleMsg}</span>}
            </div>
          )}

          <hr style={{ margin: "24px 0" }} />

          <h2>Certifications</h2>

          <form onSubmit={addCertification} style={{ display: "grid", gap: 10, maxWidth: 560 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Course</label>
            <select value={certForm.course_id} onChange={(e) => setCertForm({ ...certForm, course_id: e.target.value })}>
              <option value="">Select course…</option>
              {courses.filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>

            <label style={{ fontSize: 13, fontWeight: 600 }}>Completion date</label>
            <input type="date" value={certForm.completed_at} onChange={(e) => setCertForm({ ...certForm, completed_at: e.target.value })} />

            <div style={{ opacity: 0.85, fontSize: 13 }}>
              Expires: <strong>{computedExpires || "—"}</strong>
              {selectedCourse ? ` (valid ${selectedCourse.valid_months} months)` : ""}
            </div>

            <button type="submit" disabled={busy || !certForm.course_id || !certForm.completed_at}>
              Add Certification Record
            </button>
          </form>

          <h3 style={{ marginTop: 18 }}>History (Audit)</h3>
          {history.length === 0 ? (
            <p style={{ opacity: 0.7 }}>No certification records yet.</p>
          ) : (
            <ul>
              {history.map((r) => (
                <li key={r.id}>
                  {(r.courses?.code ?? r.course_id)} — completed {r.completed_at} → expires {r.expires_at}
                </li>
              ))}
            </ul>
          )}

          <hr style={{ margin: "24px 0" }} />

          <h2>Positions</h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={selectedPositionId}
              onChange={async (e) => {
                const pid = e.target.value;
                setSelectedPositionId(pid);
                if (pid) await ensurePositionLoaded(pid);
              }}
            >
              <option value="">Assign position…</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>

            <button type="button" onClick={assignPosition} disabled={!selectedPositionId || busy}>
              Assign (trainee)
            </button>
          </div>

          {memberPositions.length === 0 ? (
            <p style={{ opacity: 0.7, marginTop: 10 }}>No positions assigned yet.</p>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              {memberPositions.map((mp) => {
                const pos = mp.positions;
                const pid = mp.position_id;

                const reqs = reqsByPosition[pid] ?? [];
                const tasks = (tasksByPosition[pid] ?? []).filter((t) => t.is_active);
                const ptb = tasks.find((t) => isPtbCompleteTaskCode(t.task_code));
                const signoffs = signoffsByPosition[pid] ?? [];
                const ptbDone = ptb ? signoffs.some((s) => s.task_id === ptb.id) : true;

                const ok = meetsRequirements(pid);
                const ptbErr = ptbErrorByPosition[pid];

                return (
                  <div key={mp.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{pos?.code ?? pid}</strong>
                      <span style={{ opacity: 0.85 }}>{pos?.name ?? ""}</span>

                      <span style={{ marginLeft: "auto", fontSize: 12, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 999 }}>
                        {mp.status}
                      </span>

                      <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #ddd", borderRadius: 999, background: ok ? "#f2fff2" : "#fff6f2" }}>
                        {ok ? "Meets requirements" : "Missing items"}
                      </span>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <button type="button" onClick={() => ensurePositionLoaded(pid)} disabled={busy}>
                        Refresh checklist
                      </button>

                      {ptb && !ptbDone ? (
                        <button type="button" onClick={() => signoffPTB(pid)} disabled={busy} style={{ marginLeft: 8 }}>
                          Mark PTB Complete
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => approveMemberPosition(mp.id)}
                        disabled={busy || !ok}
                        style={{ marginLeft: 8 }}
                        title={!ok ? "Must meet requirements first" : "Approve/qualify"}
                      >
                        Approve / Qualify
                      </button>

                      <button
                        type="button"
                        onClick={() => unassignMemberPosition(mp.id, pid)}
                        disabled={busy}
                        style={{ marginLeft: 8, border: "1px solid #f2c9b8" }}
                        title="Remove this position assignment from the member"
                      >
                        Unassign
                      </button>
                    </div>

                    {ptbErr ? (
                      <div style={{ marginTop: 10, padding: 10, border: "1px solid #f2c9b8", borderRadius: 8, background: "#fff6f2" }}>
                        <div style={{ fontWeight: 700 }}>{ptbErr.message}</div>

                        {ptbErr.missing_courses.length ? (
                          <div style={{ marginTop: 6 }}>
                            <strong>Missing courses:</strong> {ptbErr.missing_courses.join(", ")}
                          </div>
                        ) : null}

                        {ptbErr.missing_positions.length ? (
                          <div style={{ marginTop: 6 }}>
                            <strong>Missing positions:</strong> {ptbErr.missing_positions.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                      {reqs.length === 0 && tasks.length === 0 ? (
                        <div style={{ opacity: 0.7 }}>No requirements loaded yet. Click "Refresh checklist".</div>
                      ) : null}

                      {reqs.map((r) => {
                        if (r.req_kind === "course") {
                          const code = r.courses?.code ?? "(course)";
                          const reqCourseId = r.courses?.id;
                          const has =
                            completedCourseCodes.has(code) ||
                            !!(reqCourseId && completedCourseIds.has(reqCourseId));
                          return (
                            <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              <span style={{ width: 18 }}>{has ? "✅" : "⬜"}</span>
                              <span><strong>{code}</strong> — {r.courses?.name}</span>
                            </div>
                          );
                        }

                        if (r.req_kind === "position") {
                          const prereqId = r.required_position?.id;
                          const prereqCode = r.required_position?.code ?? "(position)";
                          const prereqName = r.required_position?.name ?? "";
                          const prereqReqs = prereqId ? (reqsByPosition[prereqId] ?? []) : [];
                          const prereqCourseReqs = prereqReqs.filter((pr) => pr.req_kind === "course");
                          const allMet = prereqCourseReqs.length > 0 && prereqCourseReqs.every((pr) => {
                            const code = pr.courses?.code;
                            const cid = pr.courses?.id;
                            return (code && completedCourseCodes.has(code)) || !!(cid && completedCourseIds.has(cid));
                          });
                          return (
                            <div key={r.id}>
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <span style={{ width: 18 }}>{allMet ? "✅" : "⬜"}</span>
                                <span>Prereq: <strong>{prereqCode}</strong>{prereqName ? ` — ${prereqName}` : ""}</span>
                              </div>
                              {prereqCourseReqs.map((pr) => {
                                const code = pr.courses?.code ?? "(course)";
                                const cid = pr.courses?.id;
                                const has = (code !== "(course)" && completedCourseCodes.has(code)) || !!(cid && completedCourseIds.has(cid));
                                return (
                                  <div key={pr.id} style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: 28, fontSize: 13, opacity: 0.9 }}>
                                    <span style={{ width: 18 }}>{has ? "✅" : "⬜"}</span>
                                    <span><strong>{code}</strong>{pr.courses?.name ? ` — ${pr.courses.name}` : ""}</span>
                                  </div>
                                );
                              })}
                              {prereqId && !reqsByPosition[prereqId] ? (
                                <div style={{ marginLeft: 28, fontSize: 12, opacity: 0.6 }}>Loading prereq requirements…</div>
                              ) : null}
                            </div>
                          );
                        }

                        if (r.req_kind === "task") {
                          const reqTaskId = r.task_id ?? r.tasks?.id;
                          const signoffs = signoffsByPosition[pid] ?? [];
                          const signed = !!reqTaskId && signoffs.some((s) => s.task_id === reqTaskId);
                          return (
                            <div key={r.id} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                              <span style={{ width: 18 }}>{signed ? "✅" : "⬜"}</span>
                              <span>
                                <strong>{r.tasks?.task_code ?? "?"}</strong>
                                {" — "}{r.tasks?.task_name ?? "Unknown task"}
                                {r.notes ? <span style={{ opacity: 0.65 }}> ({r.notes})</span> : null}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", opacity: 0.8 }}>
                            <span style={{ width: 18 }}>•</span>
                            <span>{r.req_kind}: {r.notes ?? ""}</span>
                          </div>
                        );
                      })}

                      {ptb ? (
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ width: 18 }}>{ptbDone ? "✅" : "⬜"}</span>
                          <span><strong>{ptb.task_code}</strong> — {ptb.task_name}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}
