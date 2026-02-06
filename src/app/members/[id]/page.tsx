"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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
  courses?: { code: string; name: string } | null;
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

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const memberId = typeof (params as any)?.id === "string" ? (params as any).id : "";

  const [member, setMember] = useState<Member | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [history, setHistory] = useState<CertRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [certForm, setCertForm] = useState({
    course_id: "",
    completed_at: "",
  });

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === certForm.course_id) ?? null,
    [courses, certForm.course_id]
  );

  const computedExpires = useMemo(() => {
    if (!selectedCourse || !certForm.completed_at) return "";
    return addMonths(certForm.completed_at, selectedCourse.valid_months);
  }, [selectedCourse, certForm.completed_at]);

  async function loadAll() {
    if (!memberId || !isUuid(memberId)) {
      setMsg(`Bad member id: ${memberId || "(missing)"}`);
      return;
    }

    const [mRes, cRes, hRes] = await Promise.all([
      fetch(`/api/members/${memberId}`),
      fetch(`/api/courses`),
      fetch(`/api/member-certifications?member_id=${memberId}&mode=history`),
    ]);

    const mJson = await mRes.json().catch(() => ({}));
    if (!mRes.ok) throw new Error(mJson?.error ?? "Failed to load member");

    const cJson = await cRes.json().catch(() => ({}));
    const hJson = await hRes.json().catch(() => ({}));

    setMember(mJson.data);
    setCourses(cJson.data ?? []);
    setHistory(hJson.data ?? []);
  }

  useEffect(() => {
    loadAll().catch((e) => setMsg(e.message ?? String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

async function deactivateMember() {
  if (!member) return;
  setBusy(true);
  setMsg("");

  try {
    const res = await fetch(`/api/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "inactive" }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(json?.error ?? "Deactivate failed");
      return;
    }

    setMember(json.data);
    setMsg("Member deactivated.");
  } finally {
    setBusy(false);
  }
}


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

 async function deleteMember() {
  if (!member) return;

  const ok = confirm(
    `Delete ${member.first_name} ${member.last_name}?\n\nThis is intended for test users with NO history.`
  );
  if (!ok) return;

  setBusy(true);
  setMsg("");

  try {
    const res = await fetch(`/api/members/${member.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      // If blocked due to history, offer force delete ONLY if API says it can
      if (res.status === 409) {
        const canForce = Boolean(json?.can_force);

        const baseMsg =
          json?.error ??
          "Delete blocked because the member has history. Deactivate instead.";

        if (!canForce) {
          setMsg(baseMsg);
          return;
        }

        const forceOk = confirm(
          `${baseMsg}\n\nFORCE DELETE will remove ALL certifications and call attendance for this member, then delete them.\n\nUse only for TEST DATA.\n\nProceed?`
        );
        if (!forceOk) {
          setMsg(baseMsg);
          return;
        }

        const forceRes = await fetch(`/api/members/${member.id}?force=1`, {
          method: "DELETE",
        });
        const forceJson = await forceRes.json().catch(() => ({}));

        if (!forceRes.ok) {
          setMsg(forceJson?.error ?? "Force delete failed");
          return;
        }

        router.push("/members");
        return;
      }

      setMsg(json?.error ?? "Delete failed");
      return;
    }

    router.push("/members");
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

      // reload history
      const hRes = await fetch(`/api/member-certifications?member_id=${member.id}&mode=history`);
      const hJson = await hRes.json().catch(() => ({}));
      setHistory(hJson.data ?? []);
      setMsg("Certification added.");
    } finally {
      setBusy(false);
    }
  }

  if (!member && !msg) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</main>;
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
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
              <input
                value={member.first_name}
                onChange={(e) => setMember({ ...member, first_name: e.target.value })}
                placeholder="First name"
              />
              <input
                value={member.last_name}
                onChange={(e) => setMember({ ...member, last_name: e.target.value })}
                placeholder="Last name"
              />
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <input
                value={member.email ?? ""}
                onChange={(e) => setMember({ ...member, email: e.target.value })}
                placeholder="Email"
              />
              <input
                value={member.phone ?? ""}
                onChange={(e) => setMember({ ...member, phone: e.target.value })}
                placeholder="Phone"
              />
            </div>

            <div style={{ fontWeight: 600, marginTop: 6 }}>Address</div>

            <input
              value={member.street_address ?? ""}
              onChange={(e) => setMember({ ...member, street_address: e.target.value })}
              placeholder="Street address"
            />
            <input
              value={member.street_address_2 ?? ""}
              onChange={(e) => setMember({ ...member, street_address_2: e.target.value })}
              placeholder="Apt / Unit (optional)"
            />

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1.2fr 0.6fr 0.8fr" }}>
              <input
                value={member.city ?? ""}
                onChange={(e) => setMember({ ...member, city: e.target.value })}
                placeholder="City"
              />
              <input
                value={member.state ?? ""}
                onChange={(e) => setMember({ ...member, state: e.target.value })}
                placeholder="State"
              />
              <input
                value={member.postal_code ?? ""}
                onChange={(e) => setMember({ ...member, postal_code: e.target.value })}
                placeholder="ZIP"
              />
            </div>

<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
    Status:
    <select
      value={member.status}
      onChange={(e) => setMember({ ...member, status: e.target.value })}
    >
      <option value="active">active</option>
      <option value="inactive">inactive</option>
    </select>
  </label>

  <button type="submit" disabled={busy}>
    {busy ? "Saving…" : "Save"}
  </button>

  <button type="button" onClick={deactivateMember} disabled={busy}>
    Deactivate
  </button>

  <button
    type="button"
    onClick={deleteMember}
    disabled={busy}
    style={{ marginLeft: "auto" }}
  >
    Delete (test only)
  </button>
</div>
</form>

<hr style={{ margin: "24px 0" }} />


          <h2>Certifications</h2>

          <form onSubmit={addCertification} style={{ display: "grid", gap: 10, maxWidth: 560 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Course</label>
            <select value={certForm.course_id} onChange={(e) => setCertForm({ ...certForm, course_id: e.target.value })}>
              <option value="">Select course…</option>
              {courses
                .filter((c) => c.is_active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
            </select>

            <label style={{ fontSize: 13, fontWeight: 600 }}>Completion date</label>
            <input
              type="date"
              value={certForm.completed_at}
              onChange={(e) => setCertForm({ ...certForm, completed_at: e.target.value })}
            />

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
        </>
      ) : null}
    </main>
  );
}
