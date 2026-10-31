# ChatGPT integration with KIVO

## Overview
KIVO exposes a bearer-token API so your ChatGPT (custom GPT / assistant) can act on your account: create tasks from a prompt, add files/links to resources, and create notes/docs as summaries — always with your approval before any write.

## Setup
1. Log in to KIVO, open Settings → Integrations.
2. Click "Create integration key", name it (e.g. "ChatGPT"), copy the key (`kivo_...`).
3. In your ChatGPT custom GPT, add an Action with:
   - **Auth**: API Key (Bearer), header `Authorization: Bearer <your key>`.
   - **Base URL**: `https://your-kivo-backend.example.com` (or `http://localhost:5000` for dev).
   - **OpenAPI schema**: import `/openapi.json` from the backend (or use the spec below).

## Bearer endpoints (all require `Authorization: Bearer <key>`)
- `GET /integrations/me` — validate key, return owner + scopes.
- `GET /integrations/spaces` — list your spaces.
- `GET /integrations/spaces/{space_id}/projects` — list projects in a space.
- `GET /integrations/projects/{project_id}/tasks` — list tasks in a project.
- `POST /integrations/actions` — propose a write (human-in-the-loop). Body:
  - `kind`: `"task"` | `"resource"` | `"note"`
  - `payload`: object with the fields for that kind
  - `description`: human-readable summary
- `GET /integrations/actions` — list pending actions (cookie auth, for the UI).
- `POST /integrations/actions/{id}/resolve` — approve/reject (cookie auth, for the UI). Body: `{ "approve": true|false }`.
- `POST /integrations/projects/{project_id}/resources/upload` — upload a file (multipart).

## Action kinds and payloads
### task
```json
{
  "kind": "task",
  "payload": {
    "project_id": "<project id>",
    "title": "Ship landing page",
    "description": "Optional description",
    "assignee": "Harshit",
    "assigned_to": "Design team",
    "priority": "high",
    "status": "todo",
    "due_date": "2026-12-01",
    "subtasks": [{"title": "Copy", "done": false}]
  },
  "description": "Create task: Ship landing page"
}
```

### resource (link)
```json
{
  "kind": "resource",
  "payload": {
    "project_id": "<project id>",
    "space_id": "<space id>",
    "name": "Design brief",
    "url": "https://example.com/brief.pdf"
  },
  "description": "Add link: Design brief"
}
```

### note
```json
{
  "kind": "note",
  "payload": {
    "space_id": "<space id>",
    "project_id": "<project id or null>",
    "title": "Space summary",
    "content": "<p>Markdown/HTML summary…</p>"
  },
  "description": "Create note: Space summary"
}
```

## Human-in-the-loop flow
1. ChatGPT calls `POST /integrations/actions` to **propose** a write. The action is stored with status `pending`.
2. The user sees it in the KIVO UI (Pending Actions inbox) with Approve/Reject.
3. On Approve, KIVO executes the write (task/resource/note created) and marks the action `executed`.
4. On Reject, it's discarded.

ChatGPT can poll `GET /integrations/actions` (with the user's cookie? no — use the integration key's `/integrations/actions` is cookie-only; ChatGPT instead relies on the user approving in the UI) to check status, or simply inform the user to approve in KIVO.

## Notes
- ChatGPT's own browsing tool handles internet research; KIVO's API only stores the results.
- All writes require explicit user approval — ChatGPT never writes directly without going through the propose flow.
- API keys are bearer tokens: store securely, revoke/regenerate if compromised.
- CORS: set `CORS_ORIGINS` env var to your ChatGPT origin (or `*` for dev).
