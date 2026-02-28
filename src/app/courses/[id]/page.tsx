"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Course = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  valid_months: number;
  warning_days: number;
  never_expires: boolean;
  show_on_roster: boolean;
  is_active: boolean;
};

type EditCourse = {
  code: string;
  name: string;
  description: string;
  valid_months: string;
  warning_days: string;
  never_expires: boolean;
  show_on_roster: boolean;
  is_active: boolean;
};

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  const [course, setCourse] = useState<Course | null>(null);
  const [edit, setEdit] = useState<EditCourse | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!courseId) return;
    fetch(`/api/courses/${courseId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setCourse(j.data);
          setEdit({
            code: j.data.code ?? "",
            name: j.data.name ?? "",
            description: j.data.description ?? "",
            valid_months: String(j.data.valid_months ?? 24),
            warning_days: String(j.data.warning_days ?? 30),
            never_expires: !!j.data.never_expires,
            show_on_roster: !!j.data.show_on_roster,
            is_active: !!j.data.is_active,
          });
        }
      })
      .catch(() => setMsg("Failed to load course."));
  }, [courseId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const never_expires = edit.never_expires;
    const valid_months = never_expires ? 24 : Number(edit.valid_months);
    const warning_days = never_expires ? 0 : Number(edit.warning_days);

    if (!never_expires && (!Number.isFinite(valid_months) || valid_months <= 0)) {
      setMsg("Certification length must be a positive number, or check Never expires.");
      return;
    }

    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: edit.code.trim(),
          name: edit.name.trim(),
          description: edit.description.trim() || null,
          never_expires,
          valid_months,
          warning_days,
          show_on_roster: edit.show_on_roster,
          is_active: edit.is_active,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json?.error ?? "Save failed"); return; }
      setCourse(json.data);
      setEdit({
        code: json.data.code ?? "",
        name: json.data.name ?? "",
        description: json.data.description ?? "",
        valid_months: String(json.data.valid_months ?? 24),
        warning_days: String(json.data.warning_days ?? 30),
        never_expires: !!json.data.never_expires,
        show_on_roster: !!json.data.show_on_roster,
        is_active: !!json.data.is_active,
      });
      setMsg("Saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!course || !edit) return <div style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</div>;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 600 }}>
      <p><Link href="/courses">← Courses</Link></p>
      <h1 style={{ marginBottom: 4 }}>{course.code}</h1>
      <p style={{ opacity: 0.6, marginTop: 0 }}>{course.name}</p>

      {msg && (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
          {msg}
        </div>
      )}

      <section style={sectionStyle}>
        <h2 style={h2}>Course Info</h2>
        <form onSubmit={save} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Code</label>
              <input style={inputStyle} value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} required />
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description (optional)</label>
            <input style={inputStyle} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Optional" />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={edit.never_expires}
              onChange={(e) => setEdit({ ...edit, never_expires: e.target.checked, warning_days: e.target.checked ? "0" : edit.warning_days })}
            />
            <strong>Never expires</strong>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={edit.show_on_roster} onChange={(e) => setEdit({ ...edit, show_on_roster: e.target.checked })} />
            <strong>Show on roster</strong>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
            <strong>Active</strong>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Certification length (months)</label>
              <input
                style={inputStyle}
                type="number"
                min={1}
                value={edit.never_expires ? "" : edit.valid_months}
                onChange={(e) => setEdit({ ...edit, valid_months: e.target.value })}
                disabled={edit.never_expires}
                placeholder={edit.never_expires ? "—" : "e.g. 24"}
              />
            </div>
            <div>
              <label style={labelStyle}>Warning window (days)</label>
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={edit.never_expires ? "0" : edit.warning_days}
                onChange={(e) => setEdit({ ...edit, warning_days: e.target.value })}
                disabled={edit.never_expires}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={busy}
              style={{ padding: "8px 20px", borderRadius: 8, background: "#1e40af", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = { marginTop: 16, padding: 16, border: "1px solid #e5e5e5", borderRadius: 10 };
const h2: React.CSSProperties = { marginTop: 0, marginBottom: 12, fontSize: 16, fontWeight: 700 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.8 };
const inputStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, width: "100%", boxSizing: "border-box" };
