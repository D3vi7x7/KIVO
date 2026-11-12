from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Any, Optional
import re
import uuid
from bson import ObjectId

from app.auth import get_current_user, get_db, get_integration_user
from app.projects import _require_project

router = APIRouter(prefix="/integrations/actions", tags=["integrations"])


class PendingActionCreate(BaseModel):
    kind: str  # "task" | "resource" | "note"
    payload: dict[str, Any]
    description: str | None = None


class PendingActionResponse(BaseModel):
    id: str
    kind: str
    description: str | None
    payload: dict[str, Any]
    status: str  # pending | approved | rejected | executed
    created_at: datetime
    resolved_at: datetime | None = None


class PendingActionResolve(BaseModel):
    approve: bool


def _to_response(doc: dict) -> PendingActionResponse:
    return PendingActionResponse(
        id=str(doc["_id"]),
        kind=doc["kind"],
        description=doc.get("description"),
        payload=doc.get("payload", {}),
        status=doc.get("status", "pending"),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
        resolved_at=doc.get("resolved_at"),
    )


@router.post("", response_model=PendingActionResponse, status_code=201)
async def propose_action(
    payload: PendingActionCreate, owner: str = Depends(get_integration_user)
):
    db = get_db()
    if payload.kind not in {"task", "resource", "note"}:
        raise HTTPException(status_code=400, detail="Invalid action kind")

    now = datetime.now(timezone.utc)
    doc = {
        "_id": str(uuid.uuid4()),
        "owner": owner,
        "kind": payload.kind,
        "payload": payload.payload,
        "description": payload.description,
        "status": "pending",
        "created_at": now,
        "resolved_at": None,
    }
    await db["pending_actions"].insert_one(doc)
    return _to_response(doc)


@router.post("/task-assign", response_model=PendingActionResponse, status_code=201)
async def assign_task_action(
    body: dict,
    owner: str = Depends(get_current_user),
):
    """Create a pending task-assignment notification owned by the assignee."""
    assignee = (body.get("assignee") or "").strip()
    if not assignee:
        raise HTTPException(status_code=400, detail="assignee is required")
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "_id": str(uuid.uuid4()),
        "owner": assignee.lower(),
        "kind": "task",
        "payload": {
            "task_id": body.get("task_id"),
            "project_id": body.get("project_id"),
            "task_title": body.get("task_title"),
            "assigned_by": owner,
        },
        "description": body.get("description") or f"You've been assigned to '{body.get('task_title')}'",
        "status": "pending",
        "created_at": now,
        "resolved_at": None,
    }
    await db["pending_actions"].insert_one(doc)
    return _to_response(doc)


@router.get("", response_model=list[PendingActionResponse])
async def list_pending_actions(owner: str = Depends(get_current_user)):
    db = get_db()
    cursor = db["pending_actions"].find(
        {"owner": owner, "status": "pending"}, sort=[("created_at", -1)]
    )
    out = []
    async for doc in cursor:
        out.append(_to_response(doc))
    return out


@router.get("/all", response_model=list[PendingActionResponse])
async def list_all_actions(owner: str = Depends(get_current_user)):
    db = get_db()
    cursor = db["pending_actions"].find({"owner": owner}).sort("created_at", -1)
    out = []
    async for doc in cursor:
        out.append(_to_response(doc))
    return out


@router.post("/{action_id}/resolve", response_model=PendingActionResponse)
async def resolve_action(
    action_id: str,
    body: PendingActionResolve,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    action = await db["pending_actions"].find_one(
        {"_id": action_id, "owner": owner}
    )
    if not action:
        raise HTTPException(status_code=404, detail="Pending action not found")
    if action.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Action already resolved")

    now = datetime.now(timezone.utc)
    if not body.approve:
        if action.get("kind") == "project_invite":
            project_id = action.get("payload", {}).get("project_id")
            if project_id and ObjectId.is_valid(project_id):
                await db["projects"].update_one(
                    {
                        "_id": ObjectId(project_id),
                        "members.email": {"$regex": f"^{re.escape(owner.strip().lower())}$", "$options": "i"},
                    },
                    {"$set": {"members.$.status": "rejected", "updated_at": now}},
                )

        await db["pending_actions"].update_one(
            {"_id": action_id},
            {"$set": {"status": "rejected", "resolved_at": now}},
        )
        action["status"] = "rejected"
        action["resolved_at"] = now
        return _to_response(action)

    # Execute the action
    try:
        await _execute_action(db, action, owner)
    except Exception as exc:
        await db["pending_actions"].update_one(
            {"_id": action_id},
            {"$set": {"status": "failed", "resolved_at": now, "error": str(exc)}},
        )
        action["status"] = "failed"
        action["resolved_at"] = now
        return _to_response(action)

    await db["pending_actions"].update_one(
        {"_id": action_id},
        {"$set": {"status": "executed", "resolved_at": now}},
    )
    action["status"] = "executed"
    action["resolved_at"] = now
    return _to_response(action)


async def _execute_action(db, action: dict, owner: str):
    kind = action["kind"]
    payload = action["payload"]

    if kind == "task":
        from app.projects import create_task as _create_task
        from fastapi import HTTPException as _HTTPException
        # build a TaskCreate-compatible dict
        from app.projects import TaskCreate as _TaskCreate

        task_payload = _TaskCreate(
            title=payload.get("title", ""),
            description=payload.get("description", ""),
            assignee=payload.get("assignee", ""),
            assigned_to=payload.get("assigned_to", ""),
            priority=payload.get("priority", "medium"),
            status=payload.get("status", "todo"),
            due_date=payload.get("due_date"),
            subtasks=payload.get("subtasks", []),
        )
        project_id = payload.get("project_id")
        if not project_id:
            raise ValueError("project_id required")
        await _require_project(project_id, owner)
        await _create_task_impl(db, project_id, task_payload, owner)

    elif kind == "resource":
        from app.projects import _require_project as _rp
        project_id = payload.get("project_id")
        if not project_id:
            raise ValueError("project_id required")
        await _rp(project_id, owner)
        # link resource
        await db["resources"].insert_one(
            {
                "project_id": project_id,
                "space_id": payload.get("space_id"),
                "owner": owner,
                "name": payload.get("name", "Resource"),
                "kind": "url",
                "url": payload.get("url", ""),
                "created_at": datetime.now(timezone.utc),
            }
        )

    elif kind == "project_invite":
        project_id = payload.get("project_id")
        if not project_id or not ObjectId.is_valid(project_id):
            raise ValueError("Valid project_id required")
        now = datetime.now(timezone.utc)
        res = await db["projects"].update_one(
            {
                "_id": ObjectId(project_id),
                "members.email": {"$regex": f"^{re.escape(owner.strip().lower())}$", "$options": "i"},
            },
            {
                "$set": {
                    "members.$.status": "accepted",
                    "members.$.joined_at": now,
                    "updated_at": now,
                }
            },
        )
        if res.matched_count == 0:
            raise ValueError("Project or invitation not found")

    elif kind == "note":
        from app.notes import NoteCreate as _NoteCreate
        from app.notes import _require_space as _rs

        space_id = payload.get("space_id")
        if not space_id:
            raise ValueError("space_id required")
        await _rs(space_id, owner)
        title = payload.get("title", "Note")
        content = payload.get("content", "")
        now = datetime.now(timezone.utc)
        await db["notes"].insert_one(
            {
                "space_id": space_id,
                "project_id": payload.get("project_id"),
                "owner": owner,
                "title": title,
                "content": content,
                "background": "#ffffff",
                "color": "#000000",
                "created_at": now,
                "updated_at": now,
            }
        )
    else:
        raise ValueError(f"Unknown action kind: {kind}")


async def _create_task_impl(db, project_id, task_payload, owner):
    import os
    from bson import ObjectId
    from datetime import datetime, timezone

    priority = task_payload.priority or "medium"
    status_val = task_payload.status or "todo"
    # validate priority/status
    existing_p = await db["task_options"].find_one(
        {"owner": owner, "kind": "priority", "value": priority}
    )
    if not existing_p:
        priority = "medium"
    existing_s = await db["task_options"].find_one(
        {"owner": owner, "kind": "status", "value": status_val}
    )
    if not existing_s:
        status_val = "todo"

    project = await db["projects"].find_one({"_id": ObjectId(project_id), "owner": owner})
    count = await db["tasks"].count_documents({"project_id": project_id})
    now = datetime.now(timezone.utc)
    doc = {
        "project_id": project_id,
        "space_id": project["space_id"],
        "owner": owner,
        "title": task_payload.title.strip(),
        "description": task_payload.description.strip(),
        "assignee": task_payload.assignee.strip(),
        "assigned_to": task_payload.assigned_to.strip(),
        "priority": priority,
        "status": status_val,
        "due_date": task_payload.due_date or None,
        "subtasks": [
            {"id": item.id or str(ObjectId()), "title": item.title, "done": item.done}
            for item in task_payload.subtasks
        ],
        "order": count,
        "created_at": now,
        "updated_at": now,
    }
    await db["tasks"].insert_one(doc)
    await db["projects"].update_one(
        {"_id": ObjectId(project_id)}, {"$set": {"updated_at": now}}
    )
