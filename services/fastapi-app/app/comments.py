from datetime import datetime, timezone
from typing import Any, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import get_current_user, get_db

router = APIRouter(prefix="/comments", tags=["comments"])


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10_000)
    task_id: Optional[str] = Field(default=None, max_length=64)
    project_id: Optional[str] = Field(default=None, max_length=64)


class CommentResponse(BaseModel):
    id: str
    task_id: Optional[str]
    project_id: Optional[str]
    content: str
    author_email: str
    created_at: datetime


def _to_response(doc: dict) -> CommentResponse:
    return CommentResponse(
        id=str(doc["_id"]),
        task_id=doc.get("task_id"),
        project_id=doc.get("project_id"),
        content=doc.get("content", ""),
        author_email=doc.get("author_email", ""),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
    )


@router.get("", response_model=list[CommentResponse])
async def list_comments(
    task_id: Optional[str] = None,
    project_id: Optional[str] = None,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    query: dict[str, Any] = {}
    if task_id is not None:
        query["task_id"] = task_id
    if project_id is not None:
        query["project_id"] = project_id

    cursor = db["comments"].find(query).sort("created_at", -1)
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

    doc = {
        "_id": str(uuid.uuid4()),
        "task_id": payload.task_id,
        "project_id": payload.project_id,
        "content": payload.content.strip(),
        "author_email": author,
        "created_at": now,
    }
    await db["comments"].insert_one(doc)
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
    return None
