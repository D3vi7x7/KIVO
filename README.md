# KIVO

Monorepo containing:

- `nextjs-app` — Next.js frontend (Tailwind CSS, shadcn/ui, Sentry)
- `services/fastapi-app` — FastAPI backend (MongoDB, Redis, JWT auth)

## Infrastructure

Local services run via Docker Compose:

| Service  | Port  | Notes                       |
| -------- | ----- | --------------------------- |
| MongoDB  | 27017 | user `admin` / `password`  |
| Redis    | 6379  | append-only persistence     |
| FastAPI  | 5000  | API + auth                  |
| Next.js  | 3000  | frontend                    |

## Get started

```bash
# 1. Configure secrets (Postmark, JWT, Google OAuth)
cp .env.example .env

# 2. Start infra + backend
docker compose up -d --build mongodb redis fastapi

# 3. Next.js (dev)
cd nextjs-app
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000/auth

## Scripts

```bash
cd nextjs-app
npm run dev     # dev server
npm run build   # production build
npm run lint    # eslint
npm test        # vitest (component tests)
```

## Dashboard

The dashboard uses the shadcn/ui `sidebar` component (`collapsible="icon"`).

- **Header** — workspace switcher
- **Work** section
  - **Spaces** — a collapsible group listing the signed-in user's spaces, with
    a "New space" action that opens a create dialog
  - **Boards**
- **App** section — reserved, currently empty
- **Footer** — account avatar with email, and a settings item in the account
  menu

`src/app/dashboard/layout.tsx` is the server component that guards the route
and renders `SidebarProvider` + `AppSidebar` + `SidebarInset`. The sidebar
itself is a client component (`src/components/app-sidebar.tsx`) and receives
the signed-in email and the space list as props, fetched server-side.

### Spaces

| Route                | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `GET /spaces`        | List spaces owned by the caller            |
| `POST /spaces`       | Create a space (name, optional description)|
| `GET /spaces/{id}`   | Fetch one space                           |
| `DELETE /spaces/{id}`| Delete a space and its items               |

Spaces are scoped to the user that created them — a space is only returned to
its owner. Duplicate names within the same account are rejected with `409`.

### Space layout

Each space renders a bento grid (`src/components/space-bento.tsx`) on a
six-column grid:

| Section                | Row | Columns      | Min height |
| ---------------------- | --- | ------------ | ---------- |
| Recents                | 1   | 2 of 6       | 350px      |
| Upcoming deadlines     | 1   | 2 of 6       | 350px      |
| Docs & notes           | 1   | 2 of 6       | 350px      |
| Folders & projects     | 2   | 6 of 6 (full)| –          |
| Workload by status     | 3   | 3 of 6       | –          |
| Attachments            | 3   | 3 of 6       | –          |

The section data is typed and currently empty (`EMPTY_SPACE_DATA`); each
section renders an empty state until the data source is wired up.

### Notes & docs

Each space holds notes/docs. The **Docs & notes** section of the bento grid has
a **Create a note/doc** button that opens a rich text editor.

| Route                            | Purpose                          |
| -------------------------------- | -------------------------------- |
| `GET /spaces/{id}/notes`         | List notes in a space            |
| `POST /spaces/{id}/notes`        | Create a note                    |
| `PATCH /notes/{id}`              | Update a note                    |
| `DELETE /notes/{id}`             | Delete a note                    |

A note stores `title`, `content` (HTML), `background` and `color`. Notes can
belong to a space or to a project (`project_id`).

The list supports **select and delete multiple**: pick "Select", tick the notes
you want, then delete them in one go.

**Editor** — TipTap (`@tiptap/react` + StarterKit) in `src/components/note-editor.tsx`:
bold, italic, underline, strikethrough, H1–H3, bullet and numbered lists,
blockquote, code block, undo/redo, text colour and a custom highlight colour.
The note's own background is chosen with a separate colour picker (preset
swatches plus an arbitrary hex picker).

**Sanitisation** — note HTML is sanitised server-side with `nh3` before it is
stored, and inline styles are filtered down to `color` and `background-color`
only, so a note cannot inject scripts or arbitrary CSS.

### Projects & folders

A space holds projects and folders. Each has its own page with the same set of
sections, and appears under its space in the sidebar.

| Route                            | Purpose                        |
| -------------------------------- | ------------------------------ |
| `GET /projects`                  | Every project the caller owns  |
| `GET /spaces/{id}/projects`      | Projects in a space            |
| `POST /spaces/{id}/projects`     | Create a project or folder     |
| `GET/PATCH/DELETE /projects/{id}`| Read, rename, delete           |
| `GET/POST /projects/{id}/tasks`  | List and create tasks          |
| `PATCH/DELETE /tasks/{id}`       | Update and delete a task       |
| `GET/POST /projects/{id}/resources` | List and add resources      |
| `DELETE /resources/{id}`         | Remove a resource              |

**A project page** has four sections: *Recents*, *Resources* (files and links),
*Notes & docs*, and *Tasks*.

**Tasks** carry a title, description, assignee, assigned-to, priority, status,
a due date, and a completion checklist. **Progress is derived from that
checklist** — the share of ticked sub-tasks — so it always matches the work
actually listed. Tasks can be viewed as a **List**, a **Board** (columns by
status) or a **Calendar** (by due date).

**Custom priorities and statuses** — every account starts with the built-in
options (`low`/`medium`/`high`/`urgent` and `todo`/`in_progress`/`review`/`done`),
each with its own colour. From the task form you can create additional
priorities or statuses with a name and a colour of your choice; they are
stored per account and appear in the dropdowns and on the board/calendar
views. Removing a custom option is supported via
`DELETE /task-options/{id}`; built-in options cannot be removed.

| Route                            | Purpose                          |
| -------------------------------- | -------------------------------- |
| `GET /task-options`              | List all options (built-in + custom) |
| `POST /task-options`             | Create a custom priority or status |
| `DELETE /task-options/{id}`      | Remove a custom option           |

### Backgrounds

Page-level backgrounds are painted by the page itself, inside a
`SidebarInset` set to `bg-transparent` so the layers can show through.

The dashboard, space and project pages all use the shadcn background snippet
(`src/components/ui/background-snippets.tsx`) — a light grid with a purple
radial glow.

### Glass surfaces

The cards and sections on those pages use CSS glassmorphism, defined as two
Tailwind v4 utilities in `src/app/globals.css`:

- `glass` — a translucent surface mixed from `--card` (so it follows the
  theme) with `backdrop-filter: blur(16px) saturate(1.7)`, a bright inner
  edge highlight and a soft drop shadow.
- `glass-subtle` — the same idea, denser and less blurred, for panels nested
  inside another glass surface (board columns, view switchers).

No shaders or WebGL are involved. The shadcn `Card` primitive carries
`glass`, so every section card picks it up automatically.

## Routing

| Route           | Not signed in    | Signed in        |
| --------------- | ---------------- | ---------------- |
| `/`             | → `/auth`        | → `/dashboard`   |
| `/auth`         | shows auth form  | → `/dashboard`   |
| `/dashboard`    | → `/auth`        | shows dashboard  |
| `/auth/callback`| → `/auth`        | → `/dashboard`   |

`src/proxy.ts` (Next 16's replacement for middleware) enforces these rules
before a route renders. It also performs a **silent refresh**: when the access
token has expired but the refresh token is still valid, it rotates both, writes
the new cookies to the browser, and forwards them to the server component so
the request sees a valid session.

## Authentication

Two sign-in options, both issuing **httpOnly cookie** sessions:

### 1. Email (OTP)

- `POST /auth/signup/request-otp` / `POST /auth/login/request-otp` — sends a
  6-digit code via **Postmark**. Codes are stored in Redis with a 10 minute TTL.
- `POST /auth/signup/verify-otp` / `POST /auth/verify-otp` — verifies the code,
  creates the session, and sets the cookies.

Signup rejects existing accounts; login rejects unknown accounts.

### 2. Google (OAuth2)

- `GET /auth/google` — returns the Google consent URL.
- `GET /auth/google/callback` — exchanges the code, upserts the user, sets the
  cookies, redirects to `/auth/callback`.

Configure `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and register
`http://localhost:5000/auth/google/callback` as an authorized redirect URI.

### Sessions

| Cookie         | Type   | Lifetime | Purpose                          |
| -------------- | ------ | -------- | -------------------------------- |
| `access_token` | httpOnly | 15 min  | JWT, `HS256`                    |
| `refresh_token`| httpOnly | 7 days  | JWT, rotated on every refresh   |

- `POST /auth/refresh` — rotates both tokens from the refresh cookie.
- `POST /auth/logout` — clears both cookies.
- `GET /auth/me` — returns the current user.

Set `SECURE_COOKIES=true` behind HTTPS in production.

Without a `POSTMARK_API_KEY`, OTPs are printed to the backend logs as
`[DEV OTP] <email> (<flow>): <code>`.

## Stack

- Next.js 16 (App Router, Turbopack)
- Tailwind CSS v4
- shadcn/ui
- Hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`)
- TipTap (`@tiptap/react`, StarterKit) for the note editor
- Sentry (`@sentry/nextjs`)
- FastAPI + Uvicorn
- MongoDB (Motor) + Redis
- `python-jose` (JWT), `httpx` (Postmark API), `nh3` (HTML sanitising)

## Layout

```
KIVO/
├── docker-compose.yml
├── .env.example                  # Docker Compose secrets (copy to .env)
├── .gitignore                    # ignores .env / .env.local
├── docker/mongo-init.js
├── nextjs-app/
│   ├── sentry.{client,server,edge}.config.ts
│   ├── src/
│   │   ├── proxy.ts              # Session refresh + route guards
│   │   ├── lib/session.ts        # Server-side session helper
│   │   ├── components/
│   │   │   ├── app-sidebar.tsx   # Dashboard sidebar
│   │   │   ├── spaces-nav.tsx    # Collapsible spaces + nested projects
│   │   │   ├── space-bento.tsx   # Space bento grid
│   │   │   ├── space-section-card.tsx
│   │   │   ├── color-picker.tsx  # Swatch + hex colour picker
│   │   │   ├── docs-notes-section.tsx  # Docs & notes + bulk select
│   │   │   ├── note-editor.tsx   # TipTap rich text editor dialog
│   │   │   ├── projects-section.tsx    # Folders & projects + glass cards
│   │   │   ├── resources-section.tsx   # Files and links
│   │   │   ├── tasks-panel.tsx        # List / Board / Calendar views
│   │   │   ├── task-form-dialog.tsx   # Task create + edit
│   │   │   └── ui/               # shadcn/ui components
│   │   └── app/
│   │       ├── page.tsx          # → /auth or /dashboard
│   │       ├── auth/             # Login / signup + Google callback
│   │       ├── dashboard/        # Sidebar layout + content
│   │       │   └── spaces/[spaceId]/
│   │       │       ├── page.tsx  # Space bento grid page
│   │       │       └── projects/[projectId]/  # Project page
│   │       └── api/              # Proxy routes → FastAPI (forwards cookies)
└── services/fastapi-app/
    └── app/
        ├── main.py               # App wiring + health + cache
        └── auth.py               # OTP, Google OAuth, JWT, cookies
```

## Tests

`nextjs-app` uses Vitest + Testing Library (jsdom). The `GrainGradient`
shader is mocked in `vitest.setup.ts` because jsdom has no WebGL.

```bash
cd nextjs-app
npm test
```

The FastAPI Google callback is covered by
`services/fastapi-app/test_google_callback.py`, which mocks the Google token
and userinfo endpoints:

```bash
cd services/fastapi-app
python test_google_callback.py
python test_routes.py
```
