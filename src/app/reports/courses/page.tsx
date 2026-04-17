"use client";

import { useEffect, useState } from "react";

type Member = { id: string; name: string };
type CourseOption = { id: string; code: string; name: string; is_mandatory: boolean };
type ReportRow = {
  member_id: string;
  member_name: string;
  course_id: string;
  course_code: string;
  course_name: string;
  is_mandatory: boolean;
  never_expires: boolean;
  completed_at: string | null;
  expires_at: string | null;
  status: string;
};

const STATUS_OPTIONS = [
  { key: "current", label: "Current" },
  { key: "expiring", label: "Expiring Soon" },
  { key: "expired", label: "Expired" },
  { key: "never", label: "Never Completed" },
];

const COLUMN_OPTIONS = [
  { key: "member_name", label: "Member Name" },
  { key: "course_code", label: "Course Code" },
  { key: "course_name", label: "Course Name" },
  { key: "is_mandatory", label: "Mandatory" },
  { key: "completed_at", label: "Completion Date" },
  { key: "expires_at", label: "Expiration Date" },
  { key: "status", label: "Status" },
];

function toggleSet(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

function getCellValue(row: ReportRow, key: string): string {
  switch (key) {
    case "member_name": return row.member_name;
    case "course_code": return row.course_code;
    case "course_name": return row.course_name;
    case "is_mandatory": return row.is_mandatory ? "Yes" : "No";
    case "completed_at": return row.completed_at ? new Date(row.completed_at).toLocaleDateString() : "—";
    case "expires_at": return row.never_expires ? "Never" : (row.expires_at ? new Date(row.expires_at).toLocaleDateString() : "—");
    case "status": return row.status;
    default: return "";
  }
}

function statusColor(status: string): string {
  if (status === "Current") return "#15803d";
  if (status === "Expiring Soon") return "#b45309";
  if (status === "Expired") return "#b91c1c";
  return "#6b7280";
}

export default function CourseReportPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);

  const [memberId, setMemberId] = useState("all");
  const [courseFilter, setCourseFilter] = useState<"all" | "mandatory" | "specific">("all");
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState(new Set(["current", "expiring", "expired", "never"]));
  const [columns, setColumns] = useState(new Set(["member_name", "course_code", "course_name", "is_mandatory", "completed_at", "expires_at", "status"]));

  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then((j) => setMembers((j.data ?? []).filter((m: Member & { is_active?: boolean }) => m.is_active !== false)));
    fetch("/api/courses")
      .then((r) => r.json())
      .then((j) => setCourses(j.data ?? []));
  }, []);

  async function runReport() {
    if (statuses.size === 0) { setErr("Select at least one status."); return; }
    const coursesParam =
      courseFilter === "specific"
        ? selectedCourses.size === 0 ? "all" : [...selectedCourses].join(",")
        : courseFilter;

    setBusy(true);
    setErr("");
    try {
      const params = new URLSearchParams({
        member_id: memberId,
        courses: coursesParam,
        status: [...statuses].join(","),
      });
      const res = await fetch(`/api/reports/courses?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json?.error ?? "Report failed"); return; }
      setRows(json.data);
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    if (!rows) return;
    const visibleCols = COLUMN_OPTIONS.filter((c) => columns.has(c.key));
    const header = visibleCols.map((c) => c.label).join(",");
    const body = rows
      .map((row) =>
        visibleCols
          .map((c) => `"${getCellValue(row, c.key).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "course-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const visibleCols = COLUMN_OPTIONS.filter((c) => columns.has(c.key));

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 16 }}>Course Certification Report</h1>

      {err && (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #fca5a5", borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>
          {err}
        </div>
      )}

      {/* Filter panel */}
      <div className="no-print" style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 20, padding: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 }}>

        {/* Member */}
        <div>
          <div style={sectionLabel}>Member</div>
          <select style={selectStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="all">All Members</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Courses */}
        <div>
          <div style={sectionLabel}>Courses</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {(["all", "mandatory", "specific"] as const).map((v) => (
              <label key={v} style={checkLabel}>
                <input type="radio" name="courseFilter" value={v} checked={courseFilter === v} onChange={() => setCourseFilter(v)} />
                {v === "all" ? "All Courses" : v === "mandatory" ? "Mandatory Only" : "Select Specific"}
              </label>
            ))}
          </div>
          {courseFilter === "specific" && (
            <div style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, paddingLeft: 4 }}>
              {courses.map((c) => (
                <label key={c.id} style={{ ...checkLabel, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={selectedCourses.has(c.id)}
                    onChange={() => setSelectedCourses((prev) => toggleSet(prev, c.id))}
                  />
                  <span>{c.code} — {c.name}{c.is_mandatory ? " *" : ""}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Status */}
        <div>
          <div style={sectionLabel}>Status</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {STATUS_OPTIONS.map((s) => (
              <label key={s.key} style={checkLabel}>
                <input
                  type="checkbox"
                  checked={statuses.has(s.key)}
                  onChange={() => setStatuses((prev) => toggleSet(prev, s.key))}
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        {/* Columns */}
        <div>
          <div style={sectionLabel}>Show Columns</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {COLUMN_OPTIONS.map((c) => (
              <label key={c.key} style={checkLabel}>
                <input
                  type="checkbox"
                  checked={columns.has(c.key)}
                  onChange={() => setColumns((prev) => toggleSet(prev, c.key))}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        {/* Run */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <button
            onClick={runReport}
            disabled={busy}
            style={{ padding: "8px 20px", borderRadius: 8, background: "#1e40af", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {busy ? "Running…" : "Run Report"}
          </button>
        </div>
      </div>

      {/* Results */}
      {rows !== null && (
        <>
          <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, opacity: 0.7 }}>{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
            <button onClick={() => window.print()} style={actionBtn}>Print</button>
            <button onClick={downloadCsv} style={actionBtn}>Download CSV</button>
          </div>

          {rows.length === 0 ? (
            <p style={{ opacity: 0.6, fontSize: 14 }}>No results match the selected filters.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    {visibleCols.map((c) => (
                      <th key={c.key} style={thStyle}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                      {visibleCols.map((c) => (
                        <td
                          key={c.key}
                          style={{
                            ...tdStyle,
                            color: c.key === "status" ? statusColor(row.status) : undefined,
                            fontWeight: c.key === "status" ? 600 : undefined,
                          }}
                        >
                          {getCellValue(row, c.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}

const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", marginBottom: 8 };
const selectStyle: React.CSSProperties = { padding: "6px 10px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13, minWidth: 180 };
const checkLabel: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" };
const thStyle: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 12, borderBottom: "2px solid #cbd5e1", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "7px 12px", borderBottom: "1px solid #e2e8f0" };
const actionBtn: React.CSSProperties = { padding: "5px 14px", borderRadius: 7, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 };
