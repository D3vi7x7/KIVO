from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
import secrets
import uuid
import os
import shutil

from app.auth import get_current_user, get_db, hash_integration_key, get_integration_user
from app.projects import _require_project, _project_to_response, _project_counts
from app.spaces import _to_response as _space_to_response
from app.notes import _to_response as _note_to_response
from bson import ObjectId

router = APIRouter(prefix="/integrations", tags=["integrations"])

SCOPE_READ = "read"
SCOPE_WRITE = "write"
SCOPE_UPLOAD = "upload"
ALL_SCOPES = [SCOPE_READ, SCOPE_WRITE, SCOPE_UPLOAD]


class IntegrationKeyCreate(BaseModel):
    name: str
    scopes: list[str] = ALL_SCOPES


class IntegrationKeyResponse(BaseModel):
    id: str
    name: str
    scopes: list[str]
    key: str  # plaintext, shown only on creation
    created_at: datetime


class IntegrationKeyList(BaseModel):
    id: str
    name: str
    scopes: list[str]
    revoked: bool
    created_at: datetime
    last_used: datetime | None


class IntegrationMe(BaseModel):
    owner: str
    scopes: list[str]


async def _new_key() -> str:
    return "kivo_" + secrets.token_urlsafe(32)


@router.post("/keys", response_model=IntegrationKeyResponse)
async def create_integration_key(
    payload: IntegrationKeyCreate, owner: str = Depends(get_current_user)
):
    db = get_db()
    key = await _new_key()
    key_hash = hash_integration_key(key)
    integration_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    doc = {
        "_id": integration_id,
        "owner": owner,
        "name": payload.name.strip() or "Integration",
        "key_hash": key_hash,
        "scopes": payload.scopes or ALL_SCOPES,
        "revoked": False,
        "created_at": now,
        "last_used": None,
    }
    await db["integrations"].insert_one(doc)

    return IntegrationKeyResponse(
        id=integration_id,
        name=doc["name"],
        scopes=doc["scopes"],
        key=key,
        created_at=now,
    )


@router.get("/keys", response_model=list[IntegrationKeyList])
async def list_integration_keys(owner: str = Depends(get_current_user)):
    db = get_db()
    cursor = db["integrations"].find(
        {"owner": owner}, sort=[("created_at", -1)]
    )
    out = []
    async for doc in cursor:
        out.append(
            IntegrationKeyList(
                id=str(doc["_id"]),
                name=doc["name"],
                scopes=doc.get("scopes", ALL_SCOPES),
                revoked=bool(doc.get("revoked")),
                created_at=doc.get("created_at"),
                last_used=doc.get("last_used"),
            )
        )
    return out


@router.delete("/keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_integration_key(key_id: str, owner: str = Depends(get_current_user)):
    db = get_db()
    result = await db["integrations"].update_one(
        {"_id": key_id, "owner": owner}, {"$set": {"revoked": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Integration key not found")
    return None


@router.get("/me", response_model=IntegrationMe)
async def integration_me(owner: str = Depends(get_integration_user)):
    db = get_db()
    integration = await db["integrations"].find_one(
        {"owner": owner, "revoked": False}, sort=[("created_at", -1)]
    )
    scopes = integration.get("scopes", ALL_SCOPES) if integration else ALL_SCOPES
    return IntegrationMe(owner=owner, scopes=scopes)

# ---------------------------------------------------------------------------
# Integration-scoped read endpoints (bearer auth)
# ---------------------------------------------------------------------------


@router.get("/spaces")
async def integration_list_spaces(owner: str = Depends(get_integration_user)):
    db = get_db()
    cursor = db["spaces"].find({"owner": owner}).sort("created_at", 1)
    out = []
    async for doc in cursor:
        count = await db["space_items"].count_documents({"space_id": str(doc["_id"])})
        out.append({"id": str(doc["_id"]), "name": doc["name"], "description": doc.get("description", ""), "owner": doc["owner"], "created_at": doc.get("created_at"), "item_count": count})
    return out


@router.get("/spaces/{space_id}/projects")
async def integration_list_projects(space_id: str, owner: str = Depends(get_integration_user)):
    db = get_db()
    cursor = db["projects"].find({"space_id": space_id, "owner": owner}).sort("created_at", 1)
    out = []
    async for doc in cursor:
        out.append({"id": str(doc["_id"]), "space_id": doc["space_id"], "name": doc["name"], "kind": doc.get("kind", "project"), "description": doc.get("description", ""), "color": doc.get("color", "#e4e4e9"), "owner": doc["owner"], "created_at": doc.get("created_at"), "updated_at": doc.get("updated_at")})
    return out


@router.get("/projects/{project_id}/tasks")
async def integration_list_tasks(project_id: str, owner: str = Depends(get_integration_user)):
    db = get_db()
    await _require_project(project_id, owner)
    cursor = db["tasks"].find({"project_id": project_id, "owner": owner}).sort("order", 1)
    out = []
    async for doc in cursor:
        out.append({"id": str(doc["_id"]), "project_id": doc["project_id"], "space_id": doc["space_id"], "title": doc["title"], "description": doc.get("description", ""), "assignee": doc.get("assignee", ""), "assigned_to": doc.get("assigned_to", ""), "priority": doc.get("priority", "medium"), "status": doc.get("status", "todo"), "due_date": doc.get("due_date"), "subtasks": doc.get("subtasks", []), "progress": doc.get("progress", 0), "owner": doc["owner"], "created_at": doc.get("created_at"), "updated_at": doc.get("updated_at")})
    return out


@router.post("/projects/{project_id}/resources/upload")
async def integration_upload_resource(
    project_id: str,
    file: UploadFile = File(...),
    name: str | None = None,
    owner: str = Depends(get_integration_user),
):
    project = await _require_project(project_id, owner)
    db = get_db()
    original_name = file.filename or "uploaded_file"
    safe_name = (name or original_name).strip() or original_name
    upload_dir = f"uploads/{project_id}"
    os.makedirs(upload_dir, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}_{os.path.basename(original_name)}"
    stored_path = os.path.join(upload_dir, stored_name)
    size = 0
    try:
        with open(stored_path, "wb") as out:
            shutil.copyfileobj(file.file, out, length=1024 * 1024)
            size = out.tell()
    finally:
        file.file.close()
    now = datetime.now(timezone.utc)
    resource_id = str(uuid.uuid4())
    doc = {
        "_id": resource_id,
        "project_id": project_id,
        "space_id": project["space_id"],
        "owner": owner,
        "name": safe_name,
        "kind": "file",
        "url": f"/files/{resource_id}",
        "stored_path": stored_path,
        "stored_name": original_name,
        "size": size,
        "created_at": now,
    }
    await db["resources"].insert_one(doc)
    await db["projects"].update_one(
        {"_id": ObjectId(project_id)}, {"$set": {"updated_at": now}}
    )
    return {"id": resource_id, "name": safe_name, "kind": "file", "url": f"/files/{resource_id}", "created_at": now}
