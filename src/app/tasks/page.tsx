"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TaskRow = {
  id: string;
  task_code: string;
  task_name: string;
  description?: string | null;
  is_active: boolean;
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((j) => { setTasks(j.data ?? []); setLoading(false); })
      .catch(() => { setTasks([]); setLoading(false); });
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Skills / Tasks</h1>
        <Link
          href="/tasks/new"
          style={{ marginLeft: "auto", padding: "7px 16px", borderRadius: 8, background: "#1e40af", color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600 }}
        >
          + New Skill
        </Link>
      </div>

      {loading ? (
        <p style={{ opacity: 0.6 }}>Loading…</p>
      ) : tasks.length === 0 ? (
        <p style={{ opacity: 0.6 }}>No skills defined yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {tasks.map((t) => (
            <Link
              key={t.id}
              href={`/tasks/${t.id}`}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: "10px 14px",
                border: "1px solid #dde",
                borderRadius: 8,
                textDecoration: "none",
                background: t.is_active ? "#f8fafc" : "#fafafa",
                color: "#1f2937",
              }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 13, minWidth: 90, fontWeight: 600 }}>{t.task_code}</span>
              <span style={{ flex: 1, fontSize: 14 }}>{t.task_name}</span>
              {t.description && <span style={{ fontSize: 12, opacity: 0.5 }}>{t.description}</span>}
              {!t.is_active && (
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
