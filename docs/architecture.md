# SAR POC — Architecture Overview

A full-stack Search and Rescue team management app built with **Next.js 16 App Router**, **TypeScript**, **React 19**, and **Supabase (PostgreSQL)**. It tracks members, certifications, SAR operations (calls), training sessions, meetings, events, positions, and task-based qualification signoffs.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router |
| Language | TypeScript |
| UI | React 19, inline CSS (no CSS framework) |
| Database | Supabase (hosted PostgreSQL) |
| Auth | Supabase Auth (email/password, cookie-based SSR sessions) |
| DB Client | `supabase-js` SDK — no ORM |

---

## Directory Structure

```
src/
  app/
    (auth)/login/       ← Login page (no Nav)
    api/                ← All API route handlers
    admin/              ← Admin-only management UIs
    calls/              ← SAR operations pages
    events/             ← Events pages
    meetings/           ← Meetings pages
    members/            ← Member list, detail, create
    training/           ← Training sessions pages
    layout.tsx          ← Root layout with <Nav>
    page.tsx            ← Home page
  components/
    Nav.tsx             ← Top navigation bar
  lib/
    supabase/
      db.ts             ← Service-role DB client (bypasses RLS)
      server.ts         ← SSR anon-key client (session cookies)
      auth.ts           ← getAuthContext() — reads session + permissions
      require-permission.ts ← Per-route auth/permission guards
  proxy.ts              ← Next.js middleware (auth gating)
docs/
  architecture.md       ← This file
  dev-log.md            ← Development decisions and notes
```

---

## Authentication & Session Flow

### How Login Works

1. User submits email + password on `/login`.
2. `POST /api/auth/login` calls `supabaseServer().auth.signInWithPassword()`.
3. Supabase sets a session cookie via the `setAll` cookie handler in `supabaseServer()`.
4. On subsequent requests, `proxy.ts` reads the cookie, calls `supabase.auth.getUser()`, and either allows the request or redirects to `/login`.

### Two Supabase Clients

The app maintains two distinct Supabase clients. Using the wrong one is a common mistake:

| Client | File | Key Used | RLS | Used For |
|---|---|---|---|---|
| `supabaseDb` | `src/lib/supabase/db.ts` | Service role key | Bypassed | All DB reads/writes in API routes |
| `supabaseServer()` | `src/lib/supabase/server.ts` | Anon key + cookies | Enforced | Session management only (login, logout, getUser) |

`supabaseDb` is a singleton. `supabaseServer()` is a factory function (async) that reads cookies from the current request — it must be called fresh per request.

### Middleware (proxy.ts)

`src/proxy.ts` exports a `proxy` function (Next.js 16 naming requirement — not `middleware`). It runs on every request matched by the config matcher, which excludes static assets.

**What it does:**
- Skips auth check for public paths: `/login`, `/api/auth/*`
- Creates a Supabase client from request cookies (cannot use `next/headers` here)
- Calls `supabase.auth.getUser()` to validate the session
- If no user:
  - API routes → 401 JSON response
  - Pages → redirect to `/login?next=<pathname>`
- If authenticated → passes the request through with refreshed cookies

---

## RBAC (Role-Based Access Control)

### Roles & Permissions

Three roles are seeded: `member`, `viewer`, `admin`. The system is extensible — adding a new role requires only DB inserts, no code changes.

```
roles table         permissions table       role_permissions table
──────────────      ─────────────────       ──────────────────────
id, name            key (unique)            role_id → permission.key
```

**Permission keys and their meaning:**

| Permission | Holders | Grants |
|---|---|---|
| `read_all` | viewer, admin | Read any member, call, course, etc. |
| `edit_own` | member, viewer, admin | Edit own profile fields |
| `edit_contact` | admin | Edit any member's contact info |
| `edit_status` | admin | Toggle member active/inactive |
| `approve_positions` | admin | Assign/approve positions, sign off tasks |
| `manage_courses` | admin | Create/edit/delete courses and certifications |
| `manage_positions` | admin | Create/edit positions and requirements |
| `manage_calls` | admin | Create/edit calls, attendance, search groups |
| `manage_training` | admin | Create/edit training sessions and events |
| `manage_meetings` | admin | Create/edit meetings |
| `manage_members` | admin | Create/delete members, change roles |

**To add a new role** (e.g., a "records" role that can only edit contact info):
```sql
INSERT INTO roles (name, description) VALUES ('records', 'Edit contact info only');
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r, permissions p
WHERE r.name = 'records' AND p.key IN ('read_all', 'edit_own', 'edit_contact');
```
No code changes needed.

### Auth Context (`src/lib/supabase/auth.ts`)

`getAuthContext()` is the central auth function. It:
1. Gets the Supabase session user from cookies via `supabaseServer()`
2. Fetches the linked `members` row by `user_id`
3. Fetches the member's role permissions via join: `roles → role_permissions`
4. Returns `{ member, role, permissions: string[] }` or `null` if unauthenticated

Returns `null` if:
- No valid session cookie
- Session exists but no `members` row has a matching `user_id`
- Role has no permissions configured

### Route Guards (`src/lib/supabase/require-permission.ts`)

Two functions used at the top of API route handlers:

```typescript
// Requires a valid session only
const check = await requireAuth();
if (!check.ok) return check.response;  // 401

// Requires a specific permission
const check = await requirePermission("manage_courses");
if (!check.ok) return check.response;  // 401 (no session) or 403 (no permission)

// On success, check.auth holds the AuthContext
const { member, permissions } = check.auth;
```

---

## API Route Patterns

All API routes follow the same conventions:

**Success:**
```typescript
return NextResponse.json({ data: result });
// or for simple confirmation:
return NextResponse.json({ ok: true });
```

**Error:**
```typescript
return NextResponse.json({ error: "Descriptive message" }, { status: 400 });
```

**Input validation before querying:**
- UUIDs validated with `isUuid(v)` helper
- String inputs trimmed
- Enums checked against allowed values
- Required fields checked for presence

**Context params** (dynamic segments like `[id]`) use:
```typescript
async function getIdFromCtx(ctx: any) { ... }
```
The `any` type is a pre-existing pattern; lint warnings on these are expected and acceptable.

---

## Permission Matrix (Key Routes)

| Route | GET | POST | PATCH | DELETE |
|---|---|---|---|---|
| `/api/members` | `read_all` | `manage_members` | — | — |
| `/api/members/[id]` | auth + self-or-`read_all` | — | auth + field-dependent | `manage_members` |
| `/api/members/[id]/role` | — | — | `manage_members` | — |
| `/api/courses` | `read_all` | `manage_courses` | — | — |
| `/api/courses/[id]` | — | — | `manage_courses` | `manage_courses` |
| `/api/calls` | `read_all` | `manage_calls` | — | — |
| `/api/calls/[id]` | `read_all` | — | `manage_calls` | — |
| `/api/calls/[id]/attendance` | `read_all` | `manage_calls` | — | — |
| `/api/meetings` | `read_all` | `manage_meetings` | — | — |
| `/api/meetings/[id]` | `read_all` | — | `manage_meetings` | `manage_meetings` |
| `/api/positions` | `read_all` | `manage_positions` | — | — |
| `/api/positions/[id]/requirements` | `read_all` | `manage_positions` | — | `manage_positions` |
| `/api/positions/[id]/tasks` | — | `manage_positions` | — | `manage_positions` |
| `/api/member-positions` | auth | `approve_positions` | `approve_positions` | `approve_positions` |
| `/api/member-positions/ready` | `approve_positions` | — | — | — |
| `/api/member-certifications` | auth | auth + self-or-`manage_courses` | — | — |
| `/api/member-task-signoffs` | auth | `approve_positions` | — | — |
| `/api/training-sessions` | `read_all` | `manage_training` | — | — |
| `/api/training-sessions/[id]` | `read_all` | — | `manage_training` | `manage_training` |
| `/api/training-attendance` | auth | auth | — | auth |
| `/api/search-groups` | `read_all` | `manage_calls` | — | `manage_calls` |
| `/api/search-group-members` | auth | `manage_calls` | `manage_calls` | `manage_calls` |
| `/api/events` | `read_all` | `manage_training` | — | — |
| `/api/events/[id]` | `read_all` | — | `manage_training` | `manage_training` |

**Self-edit rules for `PATCH /api/members/[id]`:**
- `status` toggle → requires `edit_status`
- Contact fields → allowed if `auth.member.id === id` (own profile) OR has `edit_contact`

---

## Key Database Tables

| Table | Purpose |
|---|---|
| `members` | Team members: contact info, role, status, `user_id` FK to auth.users |
| `roles` | Role definitions (member / viewer / admin) |
| `role_permissions` | Maps role → permission_key |
| `calls` | SAR operations: type, status, visibility, location, timestamps |
| `call_attendance` | Unique (call_id, member_id): tracks time_in, time_out, role_on_call |
| `call_notes` | Notes attached to calls |
| `courses` | Certification courses: code, valid_months, never_expires, show_on_roster |
| `member_certifications` | Member → course with completed_at, expires_at |
| `positions` | Role definitions: code, name, level, position_type, is_active |
| `member_positions` | Member → position with status (trainee / qualified / awarded) |
| `position_requirements` | Prerequisites for a position: req_kind (course / position / task) |
| `position_tasks` | Named tasks within a position for taskbook-style signoffs |
| `member_task_signoffs` | Task completion with evaluator info, linked to call or training |
| `meetings` | Team meetings with agenda/notes, status, visibility |
| `training_sessions` | Training events with instructor, location, status |
| `training_attendance` | Attendance records for training sessions |
| `training_task_map` | Maps tasks to training sessions or courses |
| `events` | General events (social, training-adjacent) |
| `search_groups` | Groups within calls or training sessions |
| `search_group_members` | Members in a search group with position and trainee flag |

**Views:**
- `members_with_sar` — members enriched with SAR codes, positions, field roles, roster certs
- `v_member_course_current` — current (non-expired) certifications per member

---

## Page Architecture

All pages are `"use client"` components. They:
1. Fetch data by calling the app's own API routes (not Supabase directly)
2. Manage loading/error state locally with `useState`
3. Render permission-dependent UI by fetching `/api/auth/me` on mount

**Common pattern:**
```typescript
"use client";
const [data, setData] = useState([]);
const [authPerms, setAuthPerms] = useState<string[]>([]);

useEffect(() => {
  fetch("/api/auth/me").then(r => r.json()).then(d => setAuthPerms(d.user?.permissions ?? []));
  fetch("/api/some-resource").then(r => r.json()).then(d => setData(d.data ?? []));
}, []);

// Conditionally render edit controls:
{authPerms.includes("manage_members") && <button>Edit</button>}
```

**Route groups:**
- `(auth)/` — login page; uses a minimal pass-through layout with no Nav
- All other pages use the root layout which includes `<Nav>`

---

## Nav Component (`src/components/Nav.tsx`)

The Nav fetches `/api/auth/me` on mount and on pathname change. It:
- Shows general links (Members visible to all; Calls, Training, Meetings, Events require `read_all`)
- Shows admin section links (Courses, Positions, Approvals) conditionally by permission
- Displays the logged-in user's name and role badge on the right
- Has a logout button that calls `POST /api/auth/logout` then redirects to `/login`
- Returns `null` on the `/login` path (no nav on login screen)

---

## Attendance Upsert Logic (`/api/calls/[id]/attendance`)

Call attendance uses upsert semantics with an `action` field:
- `action: "arrive"` — sets `time_in` to now, leaves `time_out` null
- `action: "clear"` — sets `time_out` to now on an existing record
- `action: "update"` — sets both times explicitly

The upsert targets the unique constraint `(call_id, member_id)`. See `docs/dev-log.md` for full rationale.

---

## Position Qualification System

Positions have three requirement types (`req_kind`):
- `"course"` — member must hold a valid certification for the linked course
- `"position"` — member must hold a qualified/awarded status in another position
- `"task"` — member must have a signoff for the linked task

`GET /api/member-positions/ready` runs `checkPositionRequirements()` across all trainee members and returns those whose requirements are all met — used by the approvals queue.

Missing requirements are returned as an array:
- Course missing: `"COURSE_CODE"`
- Task missing: `"TASK:TASK_CODE"`
- Position missing: `"position:<id>"`
