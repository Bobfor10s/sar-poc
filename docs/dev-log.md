## 2026-01-30 – Attendance API: Arrived/Cleared support

Updated POST /api/calls/[id]/attendance to support:
- action: "arrive" -> set time_in (only if not already set)
- action: "clear"  -> set time_out (only if not already set)

Reason:
call_attendance has unique (call_id, member_id), so plain insert fails on repeat.
We now select existing row, then update/insert accordingly.

File:
- src/app/api/calls/[id]/attendance/route.ts