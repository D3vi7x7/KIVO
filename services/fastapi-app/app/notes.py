import re
from datetime import datetime, timezone

import nh3
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user, get_db
from app.colors import sanitize_color as _sanitize_color

router = APIRouter(tags=["notes"])

ALLOWED_TAGS = {
    "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "code", "pre",
    "blockquote", "ul", "ol", "li", "a", "hr", "mark", "span",
}

ALLOWED_ATTRIBUTES = {
    "a": {"href", "title", "target"},
    "span": {"style"},
    "mark": {"style"},
    "p": {"style"},
}

# Only the two colour properties the editor can produce are allowed through.
_STYLE_VALUE = r"(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([^<>;]*\)|[a-zA-Z]+)"
_STYLE_DECL = re.compile(
    rf"\b(color|background-color)\s*:\s*({_STYLE_VALUE})",
    re.IGNORECASE,
)
_STYLE_ATTR = re.compile(r'\s*style="([^"]*)"', re.IGNORECASE)


def _filter_style(match: re.Match) -> str:
    decls = _STYLE_DECL.findall(match.group(1))
    if not decls:
        return ""

    kept = [f"{prop.lower()}: {value}" for prop, value in decls]
    return ' style="%s"' % "; ".join(kept)


def sanitize_note_html(html: str) -> str:
    """Strip anything that is not editor output, and tighten inline styles."""
    # Normalise literal backslash-n sequences into real newlines first, so
    # they never reach the client as visible text.
    html = html.replace("\\n", "\n")
    cleaned = nh3.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        link_rel=None,
    )
    return _STYLE_ATTR.sub(_filter_style, cleaned)


class NoteCreate(BaseModel):
    title: str = Field(default="", max_length=200)
    content: str = Field(default="", max_length=200_000)
    background: str = Field(default="#ffffff", max_length=32)
    color: str = Field(default="#000000", max_length=32)
    project_id: str | None = Field(default=None, max_length=64)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = Field(default=None, max_length=200_000)
    background: str | None = Field(default=None, max_length=32)
    color: str | None = Field(default=None, max_length=32)


class NoteResponse(BaseModel):
    id: str
    space_id: str
    project_id: str | None
    title: str
    content: str
    background: str
    color: str
    created_at: datetime
    updated_at: datetime


def _to_response(doc: dict) -> NoteResponse:
    return NoteResponse(
        id=str(doc["_id"]),
        space_id=doc["space_id"],
        project_id=doc.get("project_id"),
        title=doc.get("title", ""),
        content=doc.get("content", ""),
        background=doc.get("background", "#ffffff"),
        color=doc.get("color", "#000000"),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
        updated_at=doc.get("updated_at", datetime.now(timezone.utc)),
    )


async def _require_space(space_id: str, owner: str) -> dict:
    db = get_db()

    if not ObjectId.is_valid(space_id):
        raise HTTPException(status_code=404, detail="Space not found")

    space = await db["spaces"].find_one({"_id": ObjectId(space_id), "owner": owner})
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    return space


@router.get(
    "/spaces/{space_id}/notes",
    response_model=list[NoteResponse],
)
async def list_notes(
    space_id: str,
    project_id: str | None = None,
    owner: str = Depends(get_current_user),
):
    db = get_db()

    if project_id:
        from app.projects import _require_project
        await _require_project(project_id, owner)
        query: dict = {"project_id": project_id}
    else:
        await _require_space(space_id, owner)
        query: dict = {"space_id": space_id, "owner": owner, "project_id": None}

    cursor = db["notes"].find(query).sort("updated_at", -1)

    notes = []
    async for doc in cursor:
        notes.append(_to_response(doc))

    return notes


@router.post(
    "/spaces/{space_id}/notes",
    response_model=NoteResponse,
    status_code=201,
)
async def create_note(
    space_id: str,
    payload: NoteCreate,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    now = datetime.now(timezone.utc)

    project_id = payload.project_id
    if project_id:
        from app.projects import _require_project
        await _require_project(project_id, owner, required_roles=["admin", "member"])
    else:
        await _require_space(space_id, owner)

    doc = {
        "space_id": space_id,
        "project_id": project_id,
        "owner": owner,
        "title": payload.title.strip().replace("\\n", "\n"),
        "content": sanitize_note_html(payload.content),
        "background": _sanitize_color(payload.background, "#ffffff"),
        "color": _sanitize_color(payload.color, "#000000"),
        "created_at": now,
        "updated_at": now,
    }

    result = await db["notes"].insert_one(doc)
    doc["_id"] = result.inserted_id

    return _to_response(doc)


@router.patch("/notes/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: str,
    payload: NoteUpdate,
    owner: str = Depends(get_current_user),
):
    db = get_db()

    if not ObjectId.is_valid(note_id):
        raise HTTPException(status_code=404, detail="Note not found")

    updates: dict = {}

    if payload.title is not None:
        updates["title"] = payload.title.strip().replace("\\n", "\n")
    if payload.content is not None:
        updates["content"] = sanitize_note_html(payload.content)
    if payload.background is not None:
        updates["background"] = _sanitize_color(payload.background, "#ffffff")
    if payload.color is not None:
        updates["color"] = _sanitize_color(payload.color, "#000000")

    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    updates["updated_at"] = datetime.now(timezone.utc)

    doc = await db["notes"].find_one_and_update(
        {"_id": ObjectId(note_id), "owner": owner},
        {"$set": updates},
        return_document=True,
    )

    if not doc:
        raise HTTPException(status_code=404, detail="Note not found")

    return _to_response(doc)


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, owner: str = Depends(get_current_user)):
    db = get_db()

    if not ObjectId.is_valid(note_id):
        raise HTTPException(status_code=404, detail="Note not found")

    result = await db["notes"].delete_one({"_id": ObjectId(note_id), "owner": owner})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")

    return {"detail": "Note deleted"}
