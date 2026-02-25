# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server on http://127.0.0.1:3000
npm run build    # Production build
npm run lint     # ESLint
```

No test suite is configured. There is no single-test runner command.

## Project Overview

SAR POC is a full-stack **Search and Rescue team management** application built with **Next.js 16 App Router** and **Supabase (PostgreSQL)**. It tracks team members, certifications, search/rescue calls, meetings, training sessions, and events.

## Architecture

### Stack
- **Framework:** Next.js 16 App Router (TypeScript, React 19)
- **Database:** Supabase (hosted PostgreSQL) accessed via `supabase-js` SDK — no ORM
- **Styling:** Inline CSS (no CSS framework)
- **Auth:** Infrastructure in place (Supabase + cookie-based SSR) but not yet enforced on any routes

### Supabase Clients
Two distinct clients — use the right one:
- **`src/lib/supabase/db.ts`** — `supabaseDb`: uses the service role key, bypasses RLS. Use this in API routes for all database operations.
- **`src/lib/supabase/server.ts`** — SSR client using anon key + cookies. Reserved for future auth/session work.

### API Routes (`src/app/api/`)
All data mutations go through Next.js API route handlers. Pattern:
- Success: `return NextResponse.json({ data: ... })`
- Error: `return NextResponse.json({ error: "..." }, { status: 4xx|5xx })`
- Routes validate UUIDs, trim string inputs, and validate enums before querying Supabase.

Key endpoints:
- `/api/members`, `/api/members/[id]` — member CRUD
- `/api/calls`, `/api/calls/[id]` — call/operation CRUD
- `/api/calls/[id]/attendance` — arrive/clear tracking (uses upsert logic; see `docs/dev-log.md`)
- `/api/calls/[id]/notes` — call notes
- `/api/courses`, `/api/courses/[id]` — certification course management
- `/api/meetings`, `/api/meetings/[id]` — meetings
- `/api/positions`, `/api/member-positions` — position definitions and assignments
- `/api/member-certifications` — member cert tracking
- `/api/training-sessions`, `/api/events` — training and events

### Page Structure (`src/app/`)
- **`layout.tsx`** — root layout with `<Nav>` sidebar
- **`members/`** — list, detail (`[id]`), and create (`new/`) pages
- **`calls/`** — list and detail pages
- **`meetings/`** — list/create page
- **`admin/courses/`**, **`admin/certifications/`** — admin-only management UIs
- **`training/`**, **`events/`** — additional operational pages

Pages fetch data by calling the app's own API routes (client-side fetch), not by querying Supabase directly.

### Key Database Tables
- `members` / `members_with_sar` (view) — team members with SAR codes and positions
- `calls` — operations with type, status, visibility, incident location (lat/lng)
- `call_attendance` — unique (call_id, member_id); tracks time_in / time_out
- `courses` — certification courses (code, valid_months, never_expires)
- `member_certifications` — links members to courses with completion dates
- `meetings` — team meetings with agenda/notes
- `positions` / `member_positions` — role definitions and assignments

### Environment Variables
Stored in `.env.local` (never committed):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, used in `supabaseDb`
