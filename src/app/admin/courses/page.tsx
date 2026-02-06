"use client";

import { useEffect, useState } from "react";

type Course = {
  id: string;
  code: string;
  name: string;
  valid_months: number;
  warning_days: number;
  is_active: boolean;
};

export default function CoursesAdminPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    valid_months: "24",
    warning_days: "30",
  });

  async function load() {
    const res = await fetch("/api/courses");
    const json = await res.json();
    setCourses(json.data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function addCourse(e: React.FormEvent) {
    e.preventDefault();

    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        name: form.name,
        valid_months: Number(form.valid_months),
        warning_days: Number(form.warning_days),
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json?.error ?? "Add failed");
      return;
    }

    setForm({ code: "", name: "", valid_months: "24", warning_days: "30" });
    load();
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1>Courses (Admin)</h1>

      <form onSubmit={addCourse} style={{ display: "grid", gap: 8, maxWidth: 520 }}>
        <input
          placeholder="Code (e.g. CPR)"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <input
          placeholder="Name (e.g. CPR / AED)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <div style={{ display: "grid", gap: 6 }}>
  <label style={{ fontSize: 13, fontWeight: 600 }}>
    Certification length (months)
  </label>
  <input
    inputMode="numeric"
    placeholder='e.g. 24 (2 years), 12 (1 year)'
    value={form.valid_months}
    onChange={(e) => setForm({ ...form, valid_months: e.target.value })}
  />
  <div style={{ fontSize: 12, opacity: 0.7 }}>
    How long the certification stays valid after completion.
  </div>
</div>

<div style={{ display: "grid", gap: 6 }}>
  <label style={{ fontSize: 13, fontWeight: 600 }}>
    Warning window (days)
  </label>
  <input
    inputMode="numeric"
    placeholder='e.g. 30 (remind 30 days before expiry)'
    value={form.warning_days}
    onChange={(e) => setForm({ ...form, warning_days: e.target.value })}
  />
  <div style={{ fontSize: 12, opacity: 0.7 }}>
    How many days before expiration the system should start alerting.
  </div>
</div>

        <button type="submit">Add Course</button>
      </form>

      <h2 style={{ marginTop: 24 }}>Existing Courses</h2>
      <ul>
        {courses.map((c) => (
          <li key={c.id}>
            <strong>{c.code}</strong> — {c.name} (valid {c.valid_months} mo, warn {c.warning_days} days)
            {c.is_active ? "" : " [inactive]"}
          </li>
        ))}
      </ul>
    </main>
  );
}
