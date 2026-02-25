"use client";

import { useEffect, useState } from "react";

type Course = {
  id: string;
  code: string;
  name: string;
  valid_months: number;
  warning_days: number;
  never_expires: boolean; // ✅ NEW
  is_active: boolean;
};

type EditRow = {
  code: string;
  name: string;
  valid_months: string; // keep as string for input editing
  warning_days: string; // keep as string for input editing
  never_expires: boolean; // ✅ NEW
  is_active: boolean;
  dirty: boolean;
  saving: boolean;
};

export default function CoursesAdminPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [edits, setEdits] = useState<Record<string, EditRow>>({});
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    code: "",
    name: "",
    valid_months: "",
    warning_days: "",
    never_expires: false, // ✅ NEW
  });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/courses");
    const json = await res.json().catch(() => ({}));
    const rows: Course[] = Array.isArray(json) ? json : (json?.data ?? []);
    setCourses(rows);

    const nextEdits: Record<string, EditRow> = {};
    for (const c of rows) {
      nextEdits[c.id] = {
        code: c.code ?? "",
        name: c.name ?? "",
        valid_months: String(c.valid_months ?? 24),
        warning_days: String(c.warning_days ?? 30),
        never_expires: !!c.never_expires,
        is_active: !!c.is_active,
        dirty: false,
        saving: false,
      };
    }
    setEdits(nextEdits);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function setRow(id: string, patch: Partial<EditRow>) {
    setEdits((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return {
        ...prev,
        [id]: { ...cur, ...patch, dirty: patch.dirty ?? true },
      };
    });
  }

  function parseNumOrNaN(v: string) {
    // allow blank input -> NaN
    if (v === "" || v === null || v === undefined) return Number.NaN;
    return Number(v);
  }

  async function addCourse(e: React.FormEvent) {
    e.preventDefault();

    const code = form.code.trim();
    const name = form.name.trim();
    const never_expires = !!form.never_expires;

    const valid_months = parseNumOrNaN(form.valid_months);
    const warning_days = parseNumOrNaN(form.warning_days);

    if (!code || !name) {
      alert("Code and Name are required.");
      return;
    }

    // ✅ rule: either never_expires OR valid_months > 0
    if (!never_expires) {
      if (!Number.isFinite(valid_months) || valid_months <= 0) {
        alert("Certification length (months) must be a positive number (or check Never expires).");
        return;
      }
      if (!Number.isFinite(warning_days) || warning_days < 0) {
        alert("Warning window (days) must be 0 or more.");
        return;
      }
    }

    const payload = {
      code,
      name,
      never_expires,
      // If never expires, these are ignored by rules/logic; keep sane values anyway:
      valid_months: never_expires ? 24 : Number(valid_months),
      warning_days: never_expires ? 0 : Number(warning_days),
      is_active: true,
    };

    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json?.error ?? "Add failed");
      return;
    }

    setForm({ code: "", name: "", valid_months: "", warning_days: "", never_expires: false });
    load();
  }

  async function saveRow(id: string) {
    const row = edits[id];
    if (!row) return;

    const code = row.code.trim();
    const name = row.name.trim();
    const never_expires = !!row.never_expires;

    const valid_months = parseNumOrNaN(row.valid_months);
    const warning_days = parseNumOrNaN(row.warning_days);

    if (!code || !name) {
      alert("Code and Name are required.");
      return;
    }

    if (!never_expires) {
      if (!Number.isFinite(valid_months) || valid_months <= 0) {
        alert("Certification length (months) must be a positive number (or check Never expires).");
        return;
      }
      if (!Number.isFinite(warning_days) || warning_days < 0) {
        alert("Warning window (days) must be 0 or more.");
        return;
      }
    }

    // mark saving
    setRow(id, { saving: true, dirty: row.dirty });

    try {
      const res = await fetch(`/api/courses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          never_expires,
          valid_months: never_expires ? 24 : Number(valid_months),
          warning_days: never_expires ? 0 : Number(warning_days),
          is_active: row.is_active,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json?.error ?? "Save failed");
        return;
      }

      const updated: Course | null = json?.data ?? null;
      if (updated) {
        setCourses((prev) => prev.map((c) => (c.id === id ? updated : c)));
        setEdits((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            code: updated.code,
            name: updated.name,
            valid_months: String(updated.valid_months),
            warning_days: String(updated.warning_days),
            never_expires: !!updated.never_expires,
            is_active: updated.is_active,
            dirty: false,
            saving: false,
          },
        }));
      } else {
        load();
      }
    } finally {
      setEdits((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        return { ...prev, [id]: { ...cur, saving: false } };
      });
    }
  }

  async function toggleActive(id: string) {
    const row = edits[id];
    if (!row) return;
    setRow(id, { is_active: !row.is_active });
  }

  function toggleNeverExpiresRow(id: string) {
    const row = edits[id];
    if (!row) return;
    const next = !row.never_expires;

    // When toggled ON: force warn_days to 0 (since it's meaningless) but keep a sane valid_months
    if (next) {
      setRow(id, { never_expires: true, warning_days: "0" });
    } else {
      setRow(id, { never_expires: false });
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100 }}>
      <h1>Courses (Admin)</h1>

      <form onSubmit={addCourse} style={{ display: "grid", gap: 8, maxWidth: 640, marginTop: 12 }}>
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

        <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
          <input
            type="checkbox"
            checked={form.never_expires}
            onChange={(e) => {
              const checked = e.target.checked;
              setForm((prev) => ({
                ...prev,
                never_expires: checked,
                warning_days: checked ? "0" : prev.warning_days,
              }));
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Never expires</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            (e.g., many ICS/IS courses)
          </span>
        </label>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Certification length (months)</label>
          <input
            inputMode="numeric"
            placeholder={form.never_expires ? "—" : "e.g. 24 (2 years), 12 (1 year)"}
            value={form.never_expires ? "" : form.valid_months}
            onChange={(e) => setForm({ ...form, valid_months: e.target.value })}
            disabled={form.never_expires}
          />
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Required unless “Never expires” is checked.
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Warning window (days)</label>
          <input
            inputMode="numeric"
            placeholder={form.never_expires ? "0" : "e.g. 30"}
            value={form.never_expires ? "0" : form.warning_days}
            onChange={(e) => setForm({ ...form, warning_days: e.target.value })}
            disabled={form.never_expires}
          />
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            How many days before expiration to start alerting. (0 when never expires)
          </div>
        </div>

        <button type="submit" disabled={!form.code.trim() || !form.name.trim()}>
          Add Course
        </button>
      </form>

      <h2 style={{ marginTop: 28 }}>Existing Courses</h2>

      {loading ? (
        <p style={{ opacity: 0.7 }}>Loading…</p>
      ) : courses.length === 0 ? (
        <p style={{ opacity: 0.7 }}>No courses yet.</p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 980 }}>
            <thead>
              <tr>
                <th style={th}>Code</th>
                <th style={th}>Name</th>
                <th style={th}>Never expires</th>
                <th style={th}>Valid (months)</th>
                <th style={th}>Warn (days)</th>
                <th style={th}>Active</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => {
                const row = edits[c.id];
                if (!row) return null;

                return (
                  <tr key={c.id}>
                    <td style={td}>
                      <input
                        style={input}
                        value={row.code}
                        onChange={(e) => setRow(c.id, { code: e.target.value })}
                      />
                    </td>

                    <td style={td}>
                      <input
                        style={input}
                        value={row.name}
                        onChange={(e) => setRow(c.id, { name: e.target.value })}
                      />
                    </td>

                    <td style={td}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={row.never_expires}
                          onChange={() => toggleNeverExpiresRow(c.id)}
                        />
                        <span style={{ fontSize: 12, opacity: 0.8 }}>
                          {row.never_expires ? "yes" : "no"}
                        </span>
                      </label>
                    </td>

                    <td style={td}>
                      <input
                        style={{ ...input, opacity: row.never_expires ? 0.6 : 1 }}
                        inputMode="numeric"
                        value={row.never_expires ? "" : row.valid_months}
                        onChange={(e) => setRow(c.id, { valid_months: e.target.value })}
                        disabled={row.never_expires}
                        placeholder={row.never_expires ? "—" : ""}
                      />
                    </td>

                    <td style={td}>
                      <input
                        style={{ ...input, opacity: row.never_expires ? 0.6 : 1 }}
                        inputMode="numeric"
                        value={row.never_expires ? "0" : row.warning_days}
                        onChange={(e) => setRow(c.id, { warning_days: e.target.value })}
                        disabled={row.never_expires}
                      />
                    </td>

                    <td style={td}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={row.is_active}
                          onChange={() => toggleActive(c.id)}
                        />
                        <span style={{ fontSize: 12, opacity: 0.8 }}>
                          {row.is_active ? "active" : "inactive"}
                        </span>
                      </label>
                    </td>

                    <td style={{ ...td, width: 240, whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        onClick={() => saveRow(c.id)}
                        disabled={!row.dirty || row.saving}
                        style={btn}
                      >
                        {row.saving ? "Saving…" : "Save"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEdits((prev) => ({
                            ...prev,
                            [c.id]: {
                              ...prev[c.id],
                              code: c.code ?? "",
                              name: c.name ?? "",
                              valid_months: String(c.valid_months ?? 24),
                              warning_days: String(c.warning_days ?? 30),
                              never_expires: !!c.never_expires,
                              is_active: !!c.is_active,
                              dirty: false,
                              saving: false,
                            },
                          }));
                        }}
                        disabled={!row.dirty || row.saving}
                        style={btnSecondary}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
            Tip: toggling “Never expires” or “Active” marks the row dirty — click Save to persist.
          </p>
        </div>
      )}
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #ddd",
  fontSize: 12,
  opacity: 0.8,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid #ddd",
  borderRadius: 8,
  fontSize: 13,
};

const btn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  cursor: "pointer",
  marginRight: 8,
};

const btnSecondary: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  cursor: "pointer",
  opacity: 0.85,
};