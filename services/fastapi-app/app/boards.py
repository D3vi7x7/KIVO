import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
from typing import Any, Optional
import uuid

from bson import ObjectId
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
import httpx
from pydantic import BaseModel, Field

from app.auth import get_current_user, get_db, get_redis, verify_token

router = APIRouter(prefix="/boards", tags=["boards"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class BoardMember(BaseModel):
    email: str
    role: str = "editor"  # "owner" | "editor" | "viewer"


class BoardCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=500)
    space_id: Optional[str] = None
    project_id: Optional[str] = None
    background: Optional[str] = "dots"  # "dots" | "grid" | "plain" | "dark"


class BoardUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    space_id: Optional[str] = None
    project_id: Optional[str] = None
    background: Optional[str] = None
    viewport: Optional[dict[str, Any]] = None


class BoardResponse(BaseModel):
    id: str
    name: str
    description: str
    space_id: Optional[str]
    project_id: Optional[str]
    owner: str
    members: list[dict[str, Any]]
    background: str
    viewport: dict[str, Any]
    element_count: int
    created_at: datetime
    updated_at: datetime


class ElementCreate(BaseModel):
    id: Optional[str] = None
    type: str = "note"  # note | image | video | link | palette | text | connector | frame
    x: float = 0.0
    y: float = 0.0
    width: float = 240.0
    height: float = 180.0
    rotation: float = 0.0
    z_index: int = 1
    data: dict[str, Any] = Field(default_factory=dict)


class ElementUpdate(BaseModel):
    type: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    rotation: Optional[float] = None
    z_index: Optional[int] = None
    data: Optional[dict[str, Any]] = None


class ElementResponse(BaseModel):
    id: str
    board_id: str
    type: str
    x: float
    y: float
    width: float
    height: float
    rotation: float
    z_index: int
    data: dict[str, Any]
    created_by: str
    updated_at: datetime


class BatchElementsPayload(BaseModel):
    elements: list[ElementCreate]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _board_to_response(doc: dict, element_count: int = 0) -> BoardResponse:
    return BoardResponse(
        id=str(doc["_id"]),
        name=doc.get("name", "Untitled Board"),
        description=doc.get("description", ""),
        space_id=str(doc["space_id"]) if doc.get("space_id") else None,
        project_id=str(doc["project_id"]) if doc.get("project_id") else None,
        owner=doc.get("owner", ""),
        members=doc.get("members", []),
        background=doc.get("background", "dots"),
        viewport=doc.get("viewport", {"x": 0, "y": 0, "zoom": 1.0}),
        element_count=element_count,
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
        updated_at=doc.get("updated_at", datetime.now(timezone.utc)),
    )


def _element_to_response(doc: dict) -> ElementResponse:
    return ElementResponse(
        id=str(doc["_id"]),
        board_id=str(doc.get("board_id", "")),
        type=doc.get("type", "note"),
        x=float(doc.get("x", 0.0)),
        y=float(doc.get("y", 0.0)),
        width=float(doc.get("width", 240.0)),
        height=float(doc.get("height", 180.0)),
        rotation=float(doc.get("rotation", 0.0)),
        z_index=int(doc.get("z_index", 1)),
        data=doc.get("data", {}),
        created_by=doc.get("created_by", ""),
        updated_at=doc.get("updated_at", datetime.now(timezone.utc)),
    )


async def _get_board_or_404(db, board_id: str) -> dict:
    query = {"_id": ObjectId(board_id)} if ObjectId.is_valid(board_id) else {"_id": board_id}
    board = await db["boards"].find_one(query)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


async def _require_board_access(db, board_id: str, user_email: str, allow_read_only: bool = False) -> dict:
    board = await _get_board_or_404(db, board_id)
    user_clean = user_email.strip().lower()

    # Direct owner
    if board.get("owner", "").strip().lower() == user_clean:
        return board

    # Direct board member
    for m in board.get("members", []) or []:
        if m.get("email", "").strip().lower() == user_clean:
            if not allow_read_only and m.get("role") == "viewer":
                raise HTTPException(status_code=403, detail="Board is read-only for your role")
            return board

    # Check project membership if board is attached to a project
    project_id = board.get("project_id")
    if project_id:
        p_query = {"_id": ObjectId(project_id)} if ObjectId.is_valid(project_id) else {"_id": project_id}
        project = await db["projects"].find_one(p_query)
        if project:
            if project.get("owner", "").strip().lower() == user_clean:
                return board
            for pm in project.get("members", []) or []:
                if pm.get("email", "").strip().lower() == user_clean and pm.get("status") == "accepted":
                    return board

    # Check space membership if board is attached to a space
    space_id = board.get("space_id")
    if space_id:
        s_query = {"_id": ObjectId(space_id)} if ObjectId.is_valid(space_id) else {"_id": space_id}
        space = await db["spaces"].find_one(s_query)
        if space and space.get("owner", "").strip().lower() == user_clean:
            return board

    raise HTTPException(status_code=403, detail="Access denied to this board")


# ---------------------------------------------------------------------------
# Board REST Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=list[BoardResponse])
async def list_boards(
    space_id: Optional[str] = None,
    project_id: Optional[str] = None,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    user_clean = owner.strip().lower()

    query: dict[str, Any] = {
        "$or": [
            {"owner": user_clean},
            {"members.email": user_clean},
        ]
    }

    if space_id:
        query["space_id"] = space_id
    if project_id:
        query["project_id"] = project_id

    boards = []
    async for b in db["boards"].find(query).sort("updated_at", -1):
        board_id_str = str(b["_id"])
        count = await db["board_elements"].count_documents({"board_id": board_id_str})
        boards.append(_board_to_response(b, count))

    return boards


@router.post("", response_model=BoardResponse, status_code=201)
async def create_board(
    payload: BoardCreate,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    user_clean = owner.strip().lower()
    now = datetime.now(timezone.utc)

    doc = {
        "name": payload.name.strip(),
        "description": payload.description.strip() if payload.description else "",
        "space_id": payload.space_id,
        "project_id": payload.project_id,
        "owner": user_clean,
        "members": [{"email": user_clean, "role": "owner"}],
        "background": payload.background or "dots",
        "viewport": {"x": 0, "y": 0, "zoom": 1.0},
        "created_at": now,
        "updated_at": now,
    }

    result = await db["boards"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _board_to_response(doc, 0)


@router.get("/{board_id}", response_model=BoardResponse)
async def get_board(
    board_id: str,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    board = await _require_board_access(db, board_id, owner, allow_read_only=True)
    count = await db["board_elements"].count_documents({"board_id": str(board["_id"])})
    return _board_to_response(board, count)


@router.patch("/{board_id}", response_model=BoardResponse)
async def update_board(
    board_id: str,
    payload: BoardUpdate,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    board = await _require_board_access(db, board_id, owner)

    updates: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.description is not None:
        updates["description"] = payload.description.strip()
    if payload.space_id is not None:
        updates["space_id"] = payload.space_id or None
    if payload.project_id is not None:
        updates["project_id"] = payload.project_id or None
    if payload.background is not None:
        updates["background"] = payload.background
    if payload.viewport is not None:
        updates["viewport"] = payload.viewport

    b_id = board["_id"]
    await db["boards"].update_one({"_id": b_id}, {"$set": updates})
    updated = await db["boards"].find_one({"_id": b_id})
    count = await db["board_elements"].count_documents({"board_id": str(b_id)})
    return _board_to_response(updated, count)


@router.delete("/{board_id}", status_code=204)
async def delete_board(
    board_id: str,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    board = await _require_board_access(db, board_id, owner)

    # Only board owner can delete
    if board.get("owner", "").strip().lower() != owner.strip().lower():
        raise HTTPException(status_code=403, detail="Only board owner can delete this board")

    b_id = board["_id"]
    await db["boards"].delete_one({"_id": b_id})
    await db["board_elements"].delete_many({"board_id": str(b_id)})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Board Elements Endpoints
# ---------------------------------------------------------------------------


@router.get("/{board_id}/elements", response_model=list[ElementResponse])
async def list_elements(
    board_id: str,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    await _require_board_access(db, board_id, owner, allow_read_only=True)

    elements = []
    async for elem in db["board_elements"].find({"board_id": board_id}).sort("z_index", 1):
        elements.append(_element_to_response(elem))
    return elements


@router.post("/{board_id}/elements", response_model=ElementResponse, status_code=201)
async def create_element(
    board_id: str,
    payload: ElementCreate,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    await _require_board_access(db, board_id, owner)

    elem_id = payload.id or str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    doc = {
        "_id": elem_id,
        "board_id": board_id,
        "type": payload.type,
        "x": payload.x,
        "y": payload.y,
        "width": payload.width,
        "height": payload.height,
        "rotation": payload.rotation,
        "z_index": payload.z_index,
        "data": payload.data,
        "created_by": owner.strip().lower(),
        "created_at": now,
        "updated_at": now,
    }

    await db["board_elements"].insert_one(doc)

    # Touch board updated_at
    b_query = {"_id": ObjectId(board_id)} if ObjectId.is_valid(board_id) else {"_id": board_id}
    await db["boards"].update_one(b_query, {"$set": {"updated_at": now}})

    return _element_to_response(doc)


@router.patch("/{board_id}/elements/{element_id}", response_model=ElementResponse)
async def update_element(
    board_id: str,
    element_id: str,
    payload: ElementUpdate,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    await _require_board_access(db, board_id, owner)

    now = datetime.now(timezone.utc)
    updates: dict[str, Any] = {"updated_at": now}

    if payload.type is not None:
        updates["type"] = payload.type
    if payload.x is not None:
        updates["x"] = payload.x
    if payload.y is not None:
        updates["y"] = payload.y
    if payload.width is not None:
        updates["width"] = payload.width
    if payload.height is not None:
        updates["height"] = payload.height
    if payload.rotation is not None:
        updates["rotation"] = payload.rotation
    if payload.z_index is not None:
        updates["z_index"] = payload.z_index
    if payload.data is not None:
        # Shallow merge or set data
        for k, v in payload.data.items():
            updates[f"data.{k}"] = v

    res = await db["board_elements"].find_one_and_update(
        {"_id": element_id, "board_id": board_id},
        {"$set": updates},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Element not found")

    return _element_to_response(res)


@router.delete("/{board_id}/elements/{element_id}", status_code=204)
async def delete_element(
    board_id: str,
    element_id: str,
    owner: str = Depends(get_current_user),
):
    db = get_db()
    await _require_board_access(db, board_id, owner)

    res = await db["board_elements"].delete_one({"_id": element_id, "board_id": board_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Element not found")

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Media Upload & Link Preview Scraper
# ---------------------------------------------------------------------------


@router.post("/upload")
async def upload_moodboard_file(
    file: UploadFile = File(...),
    owner: str = Depends(get_current_user),
):
    """Save an image/video to uploads folder and return relative URL."""
    ext = Path(file.filename or "").suffix.lower()
    allowed_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp4", ".mov"}
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"File extension {ext} not supported")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = UPLOAD_DIR / unique_name

    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:  # 20MB limit
        raise HTTPException(status_code=400, detail="File exceeds 20MB limit")

    with open(dest_path, "wb") as f:
        f.write(contents)

    return {"url": f"/uploads/{unique_name}", "filename": file.filename}


@router.get("/link-preview")
async def get_link_preview(
    url: str = Query(..., description="Target URL to scrape OpenGraph metadata"),
    owner: str = Depends(get_current_user),
):
    """Scrape title, description, image, and favicon from a link."""
    url_clean = url.strip()
    if not url_clean.startswith(("http://", "https://")):
        url_clean = f"https://{url_clean}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            resp = await client.get(url_clean, headers=headers)
            if resp.status_code != 200:
                return {
                    "url": url_clean,
                    "title": url_clean,
                    "description": "",
                    "image": None,
                    "favicon": f"https://www.google.com/s2/favicons?domain={httpx.URL(url_clean).host}&sz=64",
                }

            html = resp.text

            # Parse OpenGraph or standard meta
            title_match = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\'](.*?)["\']', html, re.I)
            if not title_match:
                title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.I)
            title = title_match.group(1).strip() if title_match else httpx.URL(url_clean).host

            desc_match = re.search(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\'](.*?)["\']', html, re.I)
            if not desc_match:
                desc_match = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', html, re.I)
            description = desc_match.group(1).strip() if desc_match else ""

            image_match = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](.*?)["\']', html, re.I)
            image = image_match.group(1).strip() if image_match else None
            if image and not image.startswith(("http://", "https://")):
                image = str(httpx.URL(url_clean).join(image))

            host = httpx.URL(url_clean).host
            favicon = f"https://www.google.com/s2/favicons?domain={host}&sz=64"

            return {
                "url": url_clean,
                "title": title[:100],
                "description": description[:200],
                "image": image,
                "favicon": favicon,
            }
    except Exception:
        # Fallback graceful card
        host = httpx.URL(url_clean).host if "://" in url_clean else url_clean
        return {
            "url": url_clean,
            "title": host,
            "description": "",
            "image": None,
            "favicon": f"https://www.google.com/s2/favicons?domain={host}&sz=64",
        }


# ---------------------------------------------------------------------------
# Real-Time WebSocket Manager
# ---------------------------------------------------------------------------


class BoardConnectionManager:
    def __init__(self):
        # board_id -> set of WebSocket connections
        self.active_connections: dict[str, set[WebSocket]] = {}
        # websocket -> { email, name, color }
        self.connection_meta: dict[WebSocket, dict[str, Any]] = {}

    async def connect(self, board_id: str, websocket: WebSocket, meta: dict[str, Any]):
        await websocket.accept()
        if board_id not in self.active_connections:
            self.active_connections[board_id] = set()
        self.active_connections[board_id].add(websocket)
        self.connection_meta[websocket] = meta

        # Notify board members of join
        await self.broadcast(
            board_id,
            {
                "type": "presence:join",
                "user": meta,
                "active_users": [self.connection_meta[ws] for ws in self.active_connections[board_id]],
            },
            sender=websocket,
        )

    def disconnect(self, board_id: str, websocket: WebSocket):
        meta = self.connection_meta.pop(websocket, None)
        if board_id in self.active_connections:
            self.active_connections[board_id].discard(websocket)
            if not self.active_connections[board_id]:
                del self.active_connections[board_id]
        return meta

    async def broadcast(self, board_id: str, message: dict, sender: Optional[WebSocket] = None):
        connections = self.active_connections.get(board_id, set()).copy()
        payload = json.dumps(message)
        for conn in connections:
            if sender is not None and conn == sender:
                continue
            try:
                await conn.send_text(payload)
            except Exception:
                pass


manager = BoardConnectionManager()


@router.websocket("/ws/{board_id}")
async def board_websocket_endpoint(
    websocket: WebSocket,
    board_id: str,
):
    # Authenticate token from query or cookie
    token = websocket.query_params.get("token") or websocket.cookies.get("access_token")
    user_payload = verify_token(token) if token else None

    if not user_payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_email = user_payload.get("sub", "Anonymous")
    user_name = user_email.split("@")[0]

    # Generate a consistent color for user cursor
    palette = ["#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#06b6d4"]
    user_color = palette[sum(ord(c) for c in user_email) % len(palette)]

    meta = {
        "email": user_email,
        "name": user_name,
        "color": user_color,
    }

    await manager.connect(board_id, websocket, meta)
    redis_client = get_redis()
    channel_name = f"board:{board_id}"

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                msg = json.loads(data_text)
            except Exception:
                continue

            msg_type = msg.get("type")

            if msg_type == "cursor:move":
                # Real-time cursor coordinates
                await manager.broadcast(
                    board_id,
                    {
                        "type": "cursor:move",
                        "user": meta,
                        "x": msg.get("x", 0),
                        "y": msg.get("y", 0),
                    },
                    sender=websocket,
                )
            elif msg_type == "element:update":
                # Broadcast real-time element translation/rotation
                await manager.broadcast(
                    board_id,
                    {
                        "type": "element:update",
                        "element": msg.get("element"),
                        "user": meta,
                    },
                    sender=websocket,
                )
            elif msg_type == "element:create":
                await manager.broadcast(
                    board_id,
                    {
                        "type": "element:create",
                        "element": msg.get("element"),
                        "user": meta,
                    },
                    sender=websocket,
                )
            elif msg_type == "element:delete":
                await manager.broadcast(
                    board_id,
                    {
                        "type": "element:delete",
                        "element_id": msg.get("element_id"),
                        "user": meta,
                    },
                    sender=websocket,
                )
            elif msg_type == "presence:ping":
                await websocket.send_text(json.dumps({"type": "presence:pong"}))

    except WebSocketDisconnect:
        left_meta = manager.disconnect(board_id, websocket)
        active_users = [
            manager.connection_meta[ws] for ws in manager.active_connections.get(board_id, set())
        ]
        await manager.broadcast(
            board_id,
            {
                "type": "presence:leave",
                "user": left_meta,
                "active_users": active_users,
            },
        )
    except Exception:
        manager.disconnect(board_id, websocket)
