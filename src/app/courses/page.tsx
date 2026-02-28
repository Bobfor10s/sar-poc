"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Course = {
  id: string;
  code: string;
  name: string;
  valid_months: number;
  never_expires: boolean;
  show_on_roster: boolean;
  is_active: boolean;
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((j) => setCourses(j.data ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Courses</h1>
        <Link
          href="/courses/new"
          style={{
            marginLeft: "auto",
            padding: "7px 16px",
            borderRadius: 8,
            background: "#1e40af",
            color: "#fff",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          + Add Course
        </Link>
      </div>

      {loading ? (
        <p style={{ opacity: 0.6 }}>Loading…</p>
      ) : courses.length === 0 ? (
        <p style={{ opacity: 0.6 }}>No courses found.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/courses/${c.id}`}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: "10px 14px",
                border: "1px solid #dde",
                borderRadius: 8,
                textDecoration: "none",
                background: c.is_active ? "#f8fafc" : "#fafafa",
                color: "#1f2937",
              }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 13, minWidth: 80, fontWeight: 600 }}>{c.code}</span>
              <span style={{ flex: 1, fontSize: 14 }}>{c.name}</span>
              {c.never_expires ? (
                <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #d1fae5", borderRadius: 999, background: "#ecfdf5", color: "#065f46" }}>
                  never expires
                </span>
              ) : (
                <span style={{ fontSize: 12, opacity: 0.55 }}>{c.valid_months} mo</span>
              )}
              {c.show_on_roster && (
                <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #dde", borderRadius: 999, background: "#f0f4ff" }}>
                  roster
                </span>
              )}
              {!c.is_active && (
                <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #eee", borderRadius: 999, background: "#f3f4f6", color: "#6b7280" }}>
                  inactive
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
