"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Member = {
  id: string;
  first_name: string;
  last_name: string;
};

type Call = {
  id: string;
  title?: string | null;
  status: string;
  is_test?: boolean | null;
  start_dt?: string | null;
};

type Attendance = {
  id: string;
  call_id: string;
  member_id: string;
  role_on_call?: string | null;
  time_in?: string | null;
  time_out?: string | null;
  notes?: string | null;
};

function asArray<T>(json: any): T[] {
  if (Array.isArray(json)) return json as T[];
  return (json?.data ?? []) as T[];
}

function fmtDt(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

export default function CallDetail() {
  const params = useParams();
  const router = useRouter();

  const callId =
    typeof (params as any)?.id === "string"
      ? (params as any).id
      : Array.isArray((params as any)?.id)
        ? (params as any).id[0]
        : "";

  const [call, setCall] = useState<Call | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "add" | "arrive" | "clear">("");
  const [err, setErr] = useState("");

  const selectedAttendance = useMemo(() => {
    if (!selectedMemberId) return null;
    return attendance.find((a) => a.member_id === selectedMemberId) ?? null;
  }, [attendance, selectedMemberId]);

  const canArrive =
    !!selectedMemberId && (!selectedAttendance || !selectedAttendance.time_in);

  const canClear =
    !!selectedMemberId &&
    !!selectedAttendance?.time_in &&
    !selectedAttendance?.time_out;

  const isCleared =
    !!selectedMemberId &&
    !!selectedAttendance?.time_in &&
    !!selectedAttendance?.time_out;

  useEffect(() => {
    if (!callId) return;

    if (!isUuid(callId)) {
      setErr(`Invalid call id in URL: "${callId}"`);
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setErr("");

        const [callRes, membersRes, attendanceRes] = await Promise.all([
          fetch(`/api/calls/${callId}`),
          fetch("/api/members"),
          fetch(`/api/calls/${callId}/attendance`),
        ]);

        const callJson = await callRes.json();
        if (!callRes.ok)
          throw new Error(callJson?.error ?? "Failed to load call");
        setCall(callJson.data);

        setMembers(asArray<Member>(await membersRes.json()));
        setAttendance(asArray<Attendance>(await attendanceRes.json()));
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [callId]);

  async function postAttendance(action?: "arrive" | "clear") {
    if (!callId || !selectedMemberId) return;

    try {
      setBusy(
        action === "arrive" ? "arrive" : action === "clear" ? "clear" : "add",
      );

      const res = await fetch(`/api/calls/${callId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: selectedMemberId,
          ...(action ? { action } : {}),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Attendance update failed");

      setAttendance(asArray<Attendance>(json));
    } catch (e: any) {
      alert(e.message ?? "Attendance update failed");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <div style={{ padding: 16, fontFamily: "system-ui" }}>Loading…</div>;
  }

  return (
    <main style={{ padding: 16, fontFamily: "system-ui", maxWidth: 900 }}>
      <p>
        <a href="/calls">← Back to Calls</a>
      </p>

      <h1>Call Detail</h1>

      <p>
        <strong>Call ID:</strong> {callId}
      </p>

      {err && (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid #ddd" }}>
          <strong>Error:</strong> {err}
        </div>
      )}

      {call && (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <label>
            Status:
            <select
              value={call.status}
              onChange={async (e) => {
                const status = e.target.value;
                const res = await fetch(`/api/calls/${callId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status }),
                });

                const json = await res.json();
                if (!res.ok) {
                  alert(json?.error ?? "Status update failed");
                  return;
                }

                setCall(json.data);
              }}
            >
              <option value="open">open</option>
              <option value="closed">closed</option>
              <option value="cancelled">cancelled</option>
              <option value="archived">archived</option>
            </select>
          </label>

          {call.is_test && (
            <span
              style={{
                fontSize: 12,
                padding: "2px 8px",
                border: "1px solid #ddd",
                borderRadius: 999,
              }}
            >
              TEST
            </span>
          )}

          {call.title && <span>• {call.title}</span>}
        </div>
      )}

      <h2>Attendance</h2>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <select
          value={selectedMemberId}
          onChange={(e) => setSelectedMemberId(e.target.value)}
        >
          <option value="">Select member</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.first_name} {m.last_name}
            </option>
          ))}
        </select>

        <button
          onClick={() => postAttendance()}
          disabled={!selectedMemberId || busy !== ""}
        >
          {busy === "add" ? "Adding…" : "Add"}
        </button>

        <button
          onClick={() => postAttendance("arrive")}
          disabled={!canArrive || busy !== ""}
        >
          {busy === "arrive" ? "Arriving…" : "Arrived"}
        </button>

        <button
          onClick={() => postAttendance("clear")}
          disabled={!canClear || busy !== ""}
        >
          {busy === "clear" ? "Clearing…" : "Cleared"}
        </button>

        {isCleared && (
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            Cleared at {fmtDt(selectedAttendance?.time_out)}
          </span>
        )}
      </div>

      <ul style={{ marginTop: 12 }}>
        {attendance.map((a) => {
          const m = members.find((x) => x.id === a.member_id);
          return (
            <li key={a.id}>
              {m ? `${m.first_name} ${m.last_name}` : a.member_id}
              {a.role_on_call && ` — ${a.role_on_call}`}
              {a.time_in && ` | in: ${fmtDt(a.time_in)}`}
              {a.time_out && ` | out: ${fmtDt(a.time_out)}`}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
