"use client";

import { useEffect, useMemo, useState } from "react";

type Member = { id: string; first_name: string; last_name: string; email?: string | null };
type Course = { id: string; code: string; name: string; valid_months: number; warning_days: number; is_active: boolean };

type CertRow = {
  id: string;
  member_id: string;
  course_id: string;
  completed_at: string;
  expires_at: string;
  courses?: { code: string; name: string } | null;
};

function addMonths(dateStr: string, months: number) {
  // dateStr expected yyyy-mm-dd
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));
  const dt = new Date(y, (m - 1), d);
  dt.setMonth(dt.getMonth() + months);
  // keep yyyy-mm-dd
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function CertificationsAdminPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [memberId, setMemberId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [history, setHistory] = useState<CertRow[]>([]);
  const [current, setCurrent] = useState<CertRow[]>([]);

  const selectedCourse = useMemo(() => courses.find(c => c.id === courseId) ?? null, [courses, courseId]);
  const computedExpires = useMemo(() => {
    if (!completedAt || !selectedCourse) return "";
    return addMonths(completedAt, selectedCourse.valid_months);
  }, [completedAt, selectedCourse]);

  async function loadBasics() {
    const [mRes, cRes] = await Promise.all([fetch("/api/members"), fetch("/api/courses")]);
    const mJson = await mRes.json();
    const cJson = await cRes.json();
    setMembers(mJson.data ?? []);
    setCourses(cJson.data ?? []);
  }

  async function loadCerts(mid: string) {
    if (!mid) return;
    const [hRes, curRes] = await Promise.all([
      fetch(`/api/member-certifications?member_id=${mid}&mode=history`),
      fetch(`/api/member-certifications?member_id=${mid}&mode=current`),
    ]);
    const hJson = await hRes.json();
    const curJson = await curRes.json();
    setHistory(hJson.data ?? []);
    setCurrent(curJson.data ?? []);
  }

  useEffect(() => {
    loadBasics();
  }, []);

  useEffect(() => {
    if (memberId) loadCerts(memberId);
  }, [memberId]);

  async function addCert(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId || !courseId || !completedAt || !computedExpires) return;

    const res = await fetch("/api/member-certifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        member_id: memberId,
        course_id: courseId,
        completed_at: completedAt,
        expires_at: computedExpires,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json?.error ?? "Save failed");
      return;
    }

    setCourseId("");
    setCompletedAt("");
    loadCerts(memberId);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100 }}>
      <h1>Member Certifications (Admin)</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Select member…</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.last_name}, {m.first_name}
            </option>
          ))}
        </select>
      </div>

      {memberId && (
        <>
          <form onSubmit={addCert} style={{ marginTop: 16, display: "grid", gap: 8, maxWidth: 560 }}>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Select course…</option>
              {courses.filter(c => c.is_active).map(c => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
              placeholder="Completed date"
            />

            <div style={{ opacity: 0.85, fontSize: 13 }}>
              Expires: <strong>{computedExpires || "—"}</strong>
              {selectedCourse ? ` (valid ${selectedCourse.valid_months} months)` : ""}
            </div>

            <button type="submit" disabled={!courseId || !completedAt}>
              Add Certification Record
            </button>
          </form>

          <h2 style={{ marginTop: 24 }}>Current Status</h2>
          {current.length === 0 ? (
            <p style={{ opacity: 0.7 }}>No current certifications found.</p>
          ) : (
            <ul>
              {current.map(r => (
                <li key={r.id}>
  {(r.courses?.code ?? r.course_id)} — expires {r.expires_at}
</li>

              ))}
            </ul>
          )}

          <h2 style={{ marginTop: 24 }}>History (Audit)</h2>
          {history.length === 0 ? (
            <p style={{ opacity: 0.7 }}>No history yet.</p>
          ) : (
            <ul>
              {history.map(r => (
                <li key={r.id}>
                  {(r.courses?.code ?? r.course_id)} — completed {r.completed_at} → expires {r.expires_at}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
