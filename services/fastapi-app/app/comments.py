from datetime import datetime, timezone
from typing import Any, Optional
import uuid

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.auth import get_current_user, get_db

router = APIRouter(prefix="/comments", tags=["comments"])


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10_000)
    task_id: Optional[str] = Field(default=None, max_length=64)
    project_id: Optional[str] = Field(default=None, max_length=64)
    parent_id: Optional[str] = Field(default=None, max_length=64)


class CommentResponse(BaseModel):
    id: str
    task_id: Optional[str]
    project_id: Optional[str]
    parent_id: Optional[str]
    content: str
    author_email: str
    created_at: datetime


def _to_response(doc: dict) -> CommentResponse:
    return CommentResponse(
        id=str(doc["_id"]),
        task_id=str(doc["task_id"]) if doc.get("task_id") else None,
        project_id=str(doc["project_id"]) if doc.get("project_id") else None,
        parent_id=str(doc["parent_id"]) if doc.get("parent_id") else None,
        content=doc.get("content", ""),
        author_email=doc.get("author_email", ""),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
    )


async def _get_accessible_project_ids(db, user_email: str) -> set[str]:
    """Return set of string project IDs accessible to the user (as owner or accepted member)."""
    user_clean = user_email.strip().lower()
    cursor = db["projects"].find(
        {
            "$or": [
                {"owner": user_clean},
                {"members": {"$elemMatch": {"email": user_clean, "status": "accepted"}}},
            ]
        },
        {"_id": 1},
    )
    project_ids = set()
    async for p in cursor:
        project_ids.add(str(p["_id"]))
    return project_ids


async def _find_task(db, task_id: str) -> Optional[dict]:
    """Look up a task safely handling ObjectId and string formats."""
    if not task_id:
        return None
    if ObjectId.is_valid(task_id):
        task = await db["tasks"].find_one({"_id": ObjectId(task_id)})
        if task:
            return task
    return await db["tasks"].find_one({"_id": task_id})


@router.get("", response_model=list[CommentResponse])
async def list_comments(
    task_id: Optional[str] = None,
    project_id: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    owner: str = Depends(get_current_user),
):
    db = get_db()
    owner_clean = owner.strip().lower()
    accessible_projects = await _get_accessible_project_ids(db, owner_clean)

    query: dict[str, Any] = {}

    if task_id is not None:
        query["task_id"] = task_id
    if project_id is not None:
        query["project_id"] = project_id

    # If neither task_id nor project_id is filtered specifically, ensure project_id is in accessible projects
    # or the user is the author of the comment
    if project_id is None and task_id is None:
        query["$or"] = [
            {"project_id": {"$in": list(accessible_projects)}},
            {"author_email": owner_clean},
        ]
    elif project_id is not None and project_id not in accessible_projects:
        # Access denied for requested project
        return []

    cursor = (
        db["comments"]
        .find(query)
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
    )

    out = []
    async for doc in cursor:
        out.append(_to_response(doc))
    return out


@router.post("", response_model=CommentResponse, status_code=201)
async def create_comment(
    payload: CommentCreate, owner: str = Depends(get_current_user)
):
    db = get_db()
    author = owner.strip().lower()
    now = datetime.now(timezone.utc)

    task_id = payload.task_id.strip() if payload.task_id else None
    project_id = payload.project_id.strip() if payload.project_id else None
    accessible_projects = await _get_accessible_project_ids(db, author)

    task_doc = None
    if task_id:
        task_doc = await _find_task(db, task_id)
        if not task_doc:
            raise HTTPException(status_code=404, detail="Task not found")
        # In Mongo tasks, project_id might be stored as string or ObjectId
        task_project_id = str(task_doc.get("project_id", ""))
        if not project_id:
            project_id = task_project_id
        if project_id not in accessible_projects:
            raise HTTPException(
                status_code=403,
                detail="Not a member or owner of the task's project",
            )
    elif project_id:
        if project_id not in accessible_projects:
            raise HTTPException(
                status_code=403, detail="Not a member or owner of this project"
            )
    else:
        # If neither provided, assign to user's first accessible project if available
        if accessible_projects:
            project_id = next(iter(accessible_projects))

    doc = {
        "_id": str(uuid.uuid4()),
        "task_id": task_id,
        "project_id": project_id,
        "parent_id": payload.parent_id.strip() if payload.parent_id else None,
        "content": payload.content.strip(),
        "author_email": author,
        "created_at": now,
    }
    await db["comments"].insert_one(doc)

    # 1. Notify task assignee if someone commented on their task
    if task_doc:
        assignee = (
            task_doc.get("assigned_to") or task_doc.get("assignee") or ""
        ).strip().lower()
        if assignee and assignee != author:
            await db["pending_actions"].insert_one(
                {
                    "_id": str(uuid.uuid4()),
                    "owner": assignee,
                    "kind": "task",
                    "payload": {
                        "task_id": task_id,
                        "project_id": project_id,
                        "task_title": task_doc.get("title", ""),
                        "comment_id": str(doc["_id"]),
                        "commented_by": author,
                    },
                    "description": f"{author.split('@')[0]} commented on '{task_doc.get('title', '')}'",
                    "status": "pending",
                    "created_at": now,
                    "resolved_at": None,
                }
            )

    # 2. Notify parent comment author if this is a reply to another comment
    if payload.parent_id:
        parent_comment = await db["comments"].find_one({"_id": payload.parent_id})
        if parent_comment:
            parent_author = parent_comment.get("author_email", "").strip().lower()
            if parent_author and parent_author != author:
                await db["pending_actions"].insert_one(
                    {
                        "_id": str(uuid.uuid4()),
                        "owner": parent_author,
                        "kind": "comment_reply",
                        "payload": {
                            "comment_id": str(doc["_id"]),
                            "parent_id": payload.parent_id,
                            "task_id": task_id,
                            "project_id": project_id,
                            "replied_by": author,
                        },
                        "description": f"{author.split('@')[0]} replied to your comment",
                        "status": "pending",
                        "created_at": now,
                        "resolved_at": None,
                    }
                )

    return _to_response(doc)


@router.delete("/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: str, owner: str = Depends(get_current_user)
):
    db = get_db()
    author = owner.strip().lower()
    res = await db["comments"].delete_one(
        {"_id": comment_id, "author_email": author}
    )
    if res.deleted_count == 0:
        raise HTTPException(
            status_code=404, detail="Comment not found or not owned by you"
        )
    # Also clean up child replies
    await db["comments"].delete_many({"parent_id": comment_id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
