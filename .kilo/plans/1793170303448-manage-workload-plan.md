# Manage Section: Activity, Comments, Timeline Pages

## Goal
Build the three remaining Manage subsections (Activity, Comments, Timeline) as dynamic, data-driven pages matching the workload page's layout/look. Workload is already complete; sidebar links for all four exist.

## Scope
- Backend: new `comments` collection + CRUD routes (`/api/comments`, `/api/comments/:id`) — dynamic, persistent comments.
- Backend: aggregate `/api/activity` route for Activity + Timeline (synthesized from existing `tasks` + `notes`, no audit table exists).
- Frontend: `/dashboard/manage/activity`, `/dashboard/manage/comments`, `/dashboard/manage/timeline` page routes (replace 3-line placeholders).
- Layout: bento grid `lg:grid-cols-6` with `SectionCard`, matching workload; white icons; rounded dropdowns with black text; glass look consistent with workload.

## Data model — comments (new, FastAPI + MongoDB)
`comments` collection doc:
- `_id`: uuid string
- `task_id`: str | None (optional link to a task)
- `project_id`: str | None
- `content`: str
- `author_email`: str (current user email, cookie auth)
- `created_at`: datetime

Routes:
- `GET /api/comments` — query `?task_id=` or `?project_id=` optional; returns comments sorted desc by created_at. Owner = current user.
- `POST /api/comments` — body `{content, task_id?, project_id?}`; inserts doc owned by current user.
- `DELETE /api/comments/:id` — only if owner matches current user.

Backend proxy: `nextjs-app/src/app/api/comments/route.ts` (GET/POST) and `.../[id]/route.ts` (DELETE), forwarding cookies like existing `/api/integrations/actions/route.ts`.

## Data — activity/timeline (no new backend; synthesize from existing)
`GET /api/activity` route (`nextjs-app/src/app/api/activity/route.ts`):
- Fetch all projects user owns/is accepted member of (`getProjects`).
- For each project fetch tasks (`getTasks`) and notes (existing `/api/spaces/{space_id}/notes` or a new lightweight server helper).
- Synthesize events:
  - task created → at `created_at`
  - task completed → when `status === "done"`, at `updated_at`
  - task updated → at `updated_at`
  - note created → at `created_at`
  - note updated → when `updated_at !== created_at`, at `updated_at`
- Each event: `{type, actor_email, target_title, project_name, project_id, space_id, ts, task_id?, note_id?}`
- Sort desc by ts. Optional `?project_id=` filter.

Notes access: add a server helper or reuse the notes route pattern. Simplest: in `/api/activity`, call the notes backend directly per space (or add `getNotes` server helper in `src/lib/session.ts`/`projects.ts`). Keep it server-side to avoid N+1 in UI.

## Frontend pages

### Activity (`/dashboard/manage/activity`)
- Header card: title "Activity", description "Recent activity across your projects".
- Feed card: list of events grouped by date header, each row: actor avatar/initial + action badge (task-completed=green, task-created=blue, note-created=purple, updated=gray) + target title + project chip + time.
- Empty state: `EmptyRow("No recent activity")`.
- Project filter dropdown (rounded, black text).

### Timeline (`/dashboard/manage/timeline`)
- Header card: title "Timeline", description "Chronological view of tasks and notes".
- Vertical timeline: left connector line, day group headers, items as cards alternating left/right (or single column). Each item: badge (task/note), title, status/priority chip, date, project chip.
- Filters: project dropdown + date range (This Week / This Month / All), rounded, black text.
- Empty state: `EmptyRow("No timeline items")`.

### Comments (`/dashboard/manage/comments`)
- Header card: title "Comments", description "Discuss tasks across your projects".
- Comment list: each item shows author initial + content + timestamp + delete button (only for owner).
- Create form: task selector dropdown (rounded, black text) + content textarea + "Add comment" button.
- POST new comment via `/api/comments`; DELETE via `/api/comments/:id`; reload/refetch on change.
- Empty state: `EmptyRow("No comments yet")`.

## Shared UI notes
- Reuse `SectionCard`, `EmptyRow`, `PriorityBadge`-style chip component.
- Icons from `@hugeicons/core-free-icons`: Activity01Icon/Clock01Icon (Activity), Comment01Icon (Comments), TimelineIcon (Timeline), Task01Icon/Note-style (generic).
- Keep `min-h-screen`, `p-4 lg:p-6`, `space-y-6`, `lg:grid-cols-6`, `lg:col-span-*` bento layout exactly like workload.
- No static/mock data — all content fetched from APIs.

## Tasks (implementation order)
1. Backend: add `comments` CRUD to FastAPI (`app/comments.py`, register router in `main.py`).
2. Frontend: `/api/comments/route.ts` (GET/POST) and `/api/comments/[id]/route.ts` (DELETE).
3. Frontend: `/api/activity/route.ts` aggregate (GET).
4. Replace `activity/page.tsx`, `comments/page.tsx`, `timeline/page.tsx` placeholders with full implementations.
5. Run `tsc --noEmit` and `npx eslint` on all changed files; fix errors.
6. Restart FastAPI backend to load comments router; verify `/api/comments` appears in OpenAPI.

## Risks / open items
- Activity "task completed" is inferred from `status === done` (no audit table) — acceptable approximation; note in plan.
- Comments have no backend today — Option (A) confirmed by user, so backend is in scope.
- Comments currently not linked to notifications/pending pill; out of scope for this plan (can link later via `/integrations/actions/task-assign` pattern).

## Validation
- `npx tsc --noEmit -p tsconfig.json` → no errors.
- `npx eslint <changed files>` → no errors.
- FastAPI `/api/comments` and `/api/activity` appear in `http://localhost:5000/openapi.json`.
- Pages load without console/HTTP errors (verify via `npm run bench` or manual navigation while logged in).
