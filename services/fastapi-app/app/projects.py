from datetime import datetime, timezone
import mimetypes
import os
import re
import shutil
import uuid

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.auth import get_current_user, get_db
from app.colors import sanitize_color as _sanitize_color

router = APIRouter(tags=["projects"])

async def _valid_priority(db, owner: str, value: str) -> str:
    """Accept any priority the caller has defined (built-in or custom)."""
    value = value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="priority cannot be empty")

    builtins = {"low", "medium", "high", "urgent"}
    if value in builtins:
        return value

    doc = await db["task_options"].find_one(
        {"owner": owner, "kind": "priority", "value": value}
    )
    if doc:
        return value

    # Fall back to matching by name, so a custom option created with a
    # different value (older rows) still validates.
    doc = await db["task_options"].find_one(
        {"owner": owner, "kind": "priority", "name": value}
    )
    if doc:
        return doc.get("value", doc["name"])

    raise HTTPException(
        status_code=400,
        detail=f"priority must be one of the defined options (got '{value}')",
    )


async def _valid_status(db, owner: str, value: str) -> str:
    """Accept any status the caller has defined (built-in or custom)."""
    value = value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="status cannot be empty")

    builtins = {"todo", "in_progress", "review", "done"}
    if value in builtins:
        return value

    doc = await db["task_options"].find_one(
        {"owner": owner, "kind": "status", "value": value}
    )
    if doc:
        return value

    doc = await db["task_options"].find_one(
        {"owner": owner, "kind": "status", "name": value}
    )
    if doc:
        return doc.get("value", doc["name"])

    raise HTTPException(
        status_code=400,
        detail=f"status must be one of the defined options (got '{value}')",
    )
PROJECT_KINDS = ["folder", "project"]
RESOURCE_KINDS = ["file", "url"]

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB


def _ensure_upload_dir(project_id: str) -> str:
    project_dir = os.path.join(UPLOAD_DIR, project_id)
    os.makedirs(project_dir, exist_ok=True)
    return project_dir


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(default="project")
    description: str = Field(default="", max_length=500)
    color: str = Field(default="#e4e4e9", max_length=32)


class ProjectMember(BaseModel):
    email: str
    role: str = "member"  # admin | member | viewer
    status: str = "pending"  # pending | accepted | rejected
    invited_by: str | None = None
    invited_at: datetime | None = None
    joined_at: datetime | None = None


class ProjectInviteCreate(BaseModel):
    email: str
    role: str = "member"  # admin | member | viewer


class ProjectMemberUpdate(BaseModel):
    role: str  # admin | member | viewer


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    kind: str | None = Field(default=None)
    description: str | None = Field(default=None, max_length=500)
    color: str | None = Field(default=None, max_length=32)


class ProjectResponse(BaseModel):
    id: str
    space_id: str
    name: str
    kind: str
    description: str
    color: str
    owner: str
    created_at: datetime
    updated_at: datetime
    members: list[ProjectMember] = Field(default_factory=list)
    current_user_role: str = "admin"
    task_count: int = 0
    open_task_count: int = 0
    resource_count: int = 0
    note_count: int = 0


class Subtask(BaseModel):
    id: str = ""
    title: str = Field(min_length=1, max_length=300)
    done: bool = False


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(default="", max_length=4000)
    assignee: str = Field(default="", max_length=200)
    assigned_to: str = Field(default="", max_length=200)
    priority: str = Field(default="medium")
    status: str = Field(default="todo")
    due_date: str | None = Field(default=None, max_length=40)
    subtasks: list[Subtask] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=4000)
    assignee: str | None = Field(default=None, max_length=200)
    assigned_to: str | None = Field(default=None, max_length=200)
    priority: str | None = Field(default=None)
    status: str | None = Field(default=None)
    due_date: str | None = Field(default=None, max_length=40)
    subtasks: list[Subtask] | None = Field(default=None)


class TaskResponse(BaseModel):
    id: str
    project_id: str
    space_id: str
    title: str
    description: str
    assignee: str
    assigned_to: str
    priority: str
    status: str
    due_date: str | None
    subtasks: list[Subtask]
    progress: int
    order: int
    owner: str
    created_by: str = ""
    created_at: datetime
    updated_at: datetime


class ResourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    kind: str = Field(default="file")
    url: str = Field(default="", max_length=2000)


class ResourceResponse(BaseModel):
    id: str
    project_id: str
    space_id: str
    name: str
    kind: str
    url: str
    owner: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _progress(subtasks: list) -> int:
    """Progress is the share of the completion checklist that is ticked off."""
    if not subtasks:
        return 0
    done = sum(1 for item in subtasks if item.get("done"))
    return round((done / len(subtasks)) * 100)


def _get_project_member_list(doc: dict) -> list[dict]:
    raw_members = doc.get("members")
    owner = doc.get("owner", "")
    now = doc.get("created_at", datetime.now(timezone.utc))
    if not raw_members:
        return [
            {
                "email": owner,
                "role": "admin",
                "status": "accepted",
                "invited_by": owner,
                "invited_at": now,
                "joined_at": now,
            }
        ]
    has_owner = any(
        m.get("email", "").strip().lower() == owner.strip().lower()
        for m in raw_members
    )
    members = list(raw_members)
    if not has_owner and owner:
        members.insert(
            0,
            {
                "email": owner,
                "role": "admin",
                "status": "accepted",
                "invited_by": owner,
                "invited_at": now,
                "joined_at": now,
            },
        )
    return members


def _project_to_response(
    doc: dict,
    current_user: str | None = None,
    task_count: int = 0,
    open_task_count: int = 0,
    resource_count: int = 0,
    note_count: int = 0,
) -> ProjectResponse:
    raw_members = _get_project_member_list(doc)
    members = [ProjectMember(**m) for m in raw_members]

    current_user_role = "viewer"
    if current_user:
        user_clean = current_user.strip().lower()
        if doc.get("owner", "").strip().lower() == user_clean:
            current_user_role = "admin"
        else:
            found = next(
                (
                    m
                    for m in members
                    if m.email.strip().lower() == user_clean and m.status == "accepted"
                ),
                None,
            )
            if found:
                current_user_role = found.role
    else:
        current_user_role = "admin"

    return ProjectResponse(
        id=str(doc["_id"]),
        space_id=doc["space_id"],
        name=doc["name"],
        kind=doc.get("kind", "project"),
        description=doc.get("description", ""),
        color=doc.get("color", "#e4e4e9"),
        owner=doc["owner"],
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
        updated_at=doc.get("updated_at", datetime.now(timezone.utc)),
        members=members,
        current_user_role=current_user_role,
        task_count=task_count,
        open_task_count=open_task_count,
        resource_count=resource_count,
        note_count=note_count,
    )


async def _project_counts(db, project_id: str) -> dict:
    """Counts of everything living inside a project."""
    return {
        "task_count": await db["tasks"].count_documents({"project_id": project_id}),
        "open_task_count": await db["tasks"].count_documents(
            {"project_id": project_id, "status": {"$ne": "done"}}
        ),
        "resource_count": await db["resources"].count_documents(
            {"project_id": project_id}
        ),
        "note_count": await db["notes"].count_documents({"project_id": project_id}),
    }


def _task_to_response(doc: dict) -> TaskResponse:
    subtasks = doc.get("subtasks", [])
    return TaskResponse(
        id=str(doc["_id"]),
        project_id=doc["project_id"],
        space_id=doc["space_id"],
        title=doc.get("title", ""),
        description=doc.get("description", ""),
        assignee=doc.get("assignee", ""),
        assigned_to=doc.get("assigned_to", ""),
        priority=doc.get("priority", "medium"),
        status=doc.get("status", "todo"),
        due_date=doc.get("due_date"),
        subtasks=[Subtask(**item) for item in subtasks],
        progress=_progress(subtasks),
        order=doc.get("order", 0),
        owner=doc["owner"],
        created_by=doc.get("created_by", doc["owner"]),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
        updated_at=doc.get("updated_at", datetime.now(timezone.utc)),
    )


def _resource_to_response(doc: dict) -> ResourceResponse:
    return ResourceResponse(
        id=str(doc["_id"]),
        project_id=doc["project_id"],
        space_id=doc["space_id"],
        name=doc.get("name", ""),
        kind=doc.get("kind", "file"),
        url=doc.get("url", ""),
        owner=doc["owner"],
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
    )


async def _require_space(space_id: str, owner: str) -> dict:
    db = get_db()

    if not ObjectId.is_valid(space_id):
        raise HTTPException(status_code=404, detail="Space not found")

    owner_clean = owner.strip().lower()
    space = await db["spaces"].find_one({
        "_id": ObjectId(space_id),
        "owner": {"$regex": f"^{re.escape(owner_clean)}$", "$options": "i"},
    })
    if not space:
        # Check if caller is an accepted member of any project in this space
        has_proj = await db["projects"].find_one({
            "space_id": space_id,
            "members": {
                "$elemMatch": {
                    "email": {"$regex": f"^{re.escape(owner_clean)}$", "$options": "i"},
                    "status": "accepted",
                }
            },
        })
        if has_proj:
            space = await db["spaces"].find_one({"_id": ObjectId(space_id)})

    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    return space


async def _require_project(
    project_id: str,
    user: str,
    required_roles: list[str] | None = None,
) -> dict:
    db = get_db()

    if not ObjectId.is_valid(project_id):
        raise HTTPException(status_code=404, detail="Project not found")

    user_clean = user.strip().lower()
    project = await db["projects"].find_one({
        "_id": ObjectId(project_id),
        "$or": [
            {"owner": {"$regex": f"^{re.escape(user_clean)}$", "$options": "i"}},
            {
                "members": {
                    "$elemMatch": {
                        "email": {"$regex": f"^{re.escape(user_clean)}$", "$options": "i"},
                        "status": "accepted",
                    }
                }
            },
        ],
    })
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Determine user role
    if project.get("owner", "").strip().lower() == user_clean:
        role = "admin"
    else:
        member = next(
            (
                m
                for m in project.get("members", [])
                if m.get("email", "").strip().lower() == user_clean
                and m.get("status") == "accepted"
            ),
            None,
        )
        role = member.get("role", "member") if member else None

    if not role:
        raise HTTPException(status_code=403, detail="Access denied")

    project["_role"] = role

    if required_roles and role not in required_roles:
        raise HTTPException(
            status_code=403,
            detail=f"This action requires one of the following roles: {', '.join(required_roles)} (current: {role})",
        )

    return project


def _validate_member_for_assignment(project: dict, target: str) -> None:
    target_clean = target.strip()
    if not target_clean:
        return
    target_lower = target_clean.lower()
    owner_lower = project.get("owner", "").strip().lower()
    if target_lower == owner_lower:
        return
    members = _get_project_member_list(project)
    for m in members:
        if m.get("email", "").strip().lower() == target_lower:
            if m.get("status") == "accepted":
                return
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"User '{target_clean}' has an invite with status '{m.get('status')}'. They can only be assigned tasks after accepting the invitation.",
                )
    raise HTTPException(
        status_code=400,
        detail=f"User '{target_clean}' is not an accepted member of this project.",
    )


def _validate_enum(value: str, allowed: list[str], field: str) -> str:
    if value not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"{field} must be one of: {', '.join(allowed)}",
        )
    return value


# ---------------------------------------------------------------------------
# Projects & folders
# ---------------------------------------------------------------------------


@router.get("/projects", response_model=list[ProjectResponse])
async def list_all_projects(owner: str = Depends(get_current_user)):
    """Every project the caller owns or is an accepted member of."""
    db = get_db()
    owner_clean = owner.strip().lower()
    cursor = db["projects"].find({
        "$or": [
            {"owner": {"$regex": f"^{re.escape(owner_clean)}$", "$options": "i"}},
            {
                "members": {
                    "$elemMatch": {
                        "email": {"$regex": f"^{re.escape(owner_clean)}$", "$options": "i"},
                        "status": "accepted",
                    }
                }
            },
        ]
    }).sort("created_at", 1)

    projects = []
    async for doc in cursor:
        project_id = str(doc["_id"])
        counts = await _project_counts(db, project_id)
        projects.append(_project_to_response(doc, current_user=owner, **counts))

    return projects


@router.get("/spaces/{space_id}/projects", response_model=list[ProjectResponse])
async def list_projects(space_id: str, owner: str = Depends(get_current_user)):
    await _require_space(space_id, owner)

    db = get_db()
    owner_clean = owner.strip().lower()
    cursor = db["projects"].find({
        "space_id": space_id,
        "$or": [
            {"owner": {"$regex": f"^{re.escape(owner_clean)}$", "$options": "i"}},
            {
                "members": {
                    "$elemMatch": {
                        "email": {"$regex": f"^{re.escape(owner_clean)}$", "$options": "i"},
                        "status": "accepted",
                    }
                }
            },
        ],
    }).sort("created_at", 1)

    projects = []
    async for doc in cursor:
        project_id = str(doc["_id"])
        counts = await _project_counts(db, project_id)
        projects.append(_project_to_response(doc, current_user=owner, **counts))

    return projects


@router.post(
    "/spaces/{space_id}/projects",
    response_model=ProjectResponse,
    status_code=201,
)
async def create_project(
    space_id: str,
    payload: ProjectCreate,
    owner: str = Depends(get_current_user),
):
    await _require_space(space_id, owner)

    db = get_db()
    name = payload.name.strip().replace("\\n", "\n")
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    kind = _validate_enum(payload.kind, PROJECT_KINDS, "kind")

    existing = await db["projects"].find_one(
        {"space_id": space_id, "owner": owner, "name": name}
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="A project with that name already exists"
        )

    now = datetime.now(timezone.utc)
    doc = {
        "space_id": space_id,
        "owner": owner,
        "name": name,
        "kind": kind,
        "description": payload.description.strip(),
        "color": _sanitize_color(payload.color, "#e4e4e9"),
        "members": [
            {
                "email": owner,
                "role": "admin",
                "status": "accepted",
                "invited_by": owner,
                "invited_at": now,
                "joined_at": now,
            }
        ],
        "created_at": now,
        "updated_at": now,
    }

    result = await db["projects"].insert_one(doc)
    doc["_id"] = result.inserted_id

    return _project_to_response(doc, current_user=owner)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, owner: str = Depends(get_current_user)):
    project = await _require_project(project_id, owner)

    db = get_db()
    counts = await _project_counts(db, project_id)

    return _project_to_response(project, current_user=owner, **counts)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    owner: str = Depends(get_current_user),
):
    project = await _require_project(project_id, owner, required_roles=["admin"])

    db = get_db()
    updates: dict = {}

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        updates["name"] = name
    if payload.kind is not None:
        updates["kind"] = _validate_enum(payload.kind, PROJECT_KINDS, "kind")
    if payload.description is not None:
        updates["description"] = payload.description.strip()
    if payload.color is not None:
        updates["color"] = _sanitize_color(payload.color, "#e4e4e9")

    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    updates["updated_at"] = datetime.now(timezone.utc)

    doc = await db["projects"].find_one_and_update(
        {"_id": ObjectId(project_id)},
        {"$set": updates},
        return_document=True,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    return _project_to_response(doc, current_user=owner)


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, owner: str = Depends(get_current_user)):
    project = await _require_project(project_id, owner, required_roles=["admin"])

    db = get_db()
    await db["projects"].delete_one({"_id": ObjectId(project_id)})
    await db["tasks"].delete_many({"project_id": project_id})
    await db["resources"].delete_many({"project_id": project_id})
    await db["notes"].delete_many({"project_id": project_id})
    await db["pending_actions"].delete_many({"payload.project_id": project_id})

    return {"detail": "Project deleted"}


# ---------------------------------------------------------------------------
# Project Members & Invitations
# ---------------------------------------------------------------------------


@router.get("/projects/{project_id}/members", response_model=list[ProjectMember])
async def list_project_members(
    project_id: str, user: str = Depends(get_current_user)
):
    project = await _require_project(project_id, user)
    raw_list = _get_project_member_list(project)
    return [ProjectMember(**m) for m in raw_list]


@router.post("/projects/{project_id}/invites", response_model=ProjectMember, status_code=201)
async def invite_member(
    project_id: str,
    payload: ProjectInviteCreate,
    user: str = Depends(get_current_user),
):
    project = await _require_project(project_id, user, required_roles=["admin"])
    db = get_db()

    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if email == user.strip().lower():
        raise HTTPException(status_code=400, detail="You cannot invite yourself")

    role = payload.role.strip().lower()
    if role not in {"admin", "member", "viewer"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid role. Must be admin, member, or viewer",
        )

    # Verify invitee exists in db["users"]
    invitee = await db["users"].find_one(
        {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}
    )
    if not invitee:
        raise HTTPException(
            status_code=404,
            detail=f"No registered user found with email '{email}'. They must sign up for KIVO first.",
        )

    # Check current membership
    members = project.get("members", [])
    existing_member = next(
        (m for m in members if m.get("email", "").strip().lower() == email), None
    )
    if existing_member:
        if existing_member.get("status") == "accepted":
            raise HTTPException(
                status_code=409,
                detail=f"User '{email}' is already an accepted member of this project.",
            )
        elif existing_member.get("status") == "pending":
            raise HTTPException(
                status_code=409,
                detail=f"An invitation is already pending for '{email}'.",
            )

    now = datetime.now(timezone.utc)
    member_dict = {
        "email": email,
        "role": role,
        "status": "pending",
        "invited_by": user,
        "invited_at": now,
        "joined_at": None,
    }

    if existing_member:
        # Re-invite previously rejected member
        await db["projects"].update_one(
            {"_id": ObjectId(project_id), "members.email": existing_member["email"]},
            {"$set": {"members.$": member_dict, "updated_at": now}},
        )
    else:
        await db["projects"].update_one(
            {"_id": ObjectId(project_id)},
            {"$push": {"members": member_dict}, "$set": {"updated_at": now}},
        )

    # Create pending action notification for invitee
    action_doc = {
        "_id": str(uuid.uuid4()),
        "owner": email,
        "kind": "project_invite",
        "description": f"{user} invited you to collaborate on '{project['name']}' as {role.capitalize()}",
        "payload": {
            "project_id": project_id,
            "project_name": project["name"],
            "space_id": project["space_id"],
            "inviter": user,
            "role": role,
        },
        "status": "pending",
        "created_at": now,
        "resolved_at": None,
    }
    await db["pending_actions"].insert_one(action_doc)

    return ProjectMember(**member_dict)


@router.delete("/projects/{project_id}/members/{email}")
async def remove_member(
    project_id: str,
    email: str,
    user: str = Depends(get_current_user),
):
    project = await _require_project(project_id, user)
    user_role = project.get("_role")
    target_email = email.strip().lower()
    user_clean = user.strip().lower()

    # Project owner cannot be removed
    if target_email == project.get("owner", "").strip().lower():
        raise HTTPException(
            status_code=400, detail="Cannot remove the project creator"
        )

    # Only admin can remove others; members can remove themselves (leave)
    if user_role != "admin" and user_clean != target_email:
        raise HTTPException(
            status_code=403, detail="Only admins can remove other members"
        )

    db = get_db()
    now = datetime.now(timezone.utc)
    res = await db["projects"].update_one(
        {"_id": ObjectId(project_id)},
        {
            "$pull": {
                "members": {
                    "email": {"$regex": f"^{re.escape(target_email)}$", "$options": "i"}
                }
            },
            "$set": {"updated_at": now},
        },
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=404, detail="Member not found")

    # Mark any pending action for this user & project as rejected
    await db["pending_actions"].update_many(
        {
            "owner": {"$regex": f"^{re.escape(target_email)}$", "$options": "i"},
            "kind": "project_invite",
            "payload.project_id": project_id,
            "status": "pending",
        },
        {"$set": {"status": "rejected", "resolved_at": now}},
    )

    return {"detail": "Member removed"}


@router.patch("/projects/{project_id}/members/{email}", response_model=ProjectMember)
async def update_member_role(
    project_id: str,
    email: str,
    payload: ProjectMemberUpdate,
    user: str = Depends(get_current_user),
):
    project = await _require_project(project_id, user, required_roles=["admin"])
    target_email = email.strip().lower()
    if target_email == project.get("owner", "").strip().lower():
        raise HTTPException(
            status_code=400, detail="Cannot change the project creator's role"
        )

    new_role = payload.role.strip().lower()
    if new_role not in {"admin", "member", "viewer"}:
        raise HTTPException(
            status_code=400, detail="Invalid role. Must be admin, member, or viewer"
        )

    db = get_db()
    now = datetime.now(timezone.utc)
    res = await db["projects"].find_one_and_update(
        {
            "_id": ObjectId(project_id),
            "members.email": {"$regex": f"^{re.escape(target_email)}$", "$options": "i"},
        },
        {
            "$set": {
                "members.$.role": new_role,
                "updated_at": now,
            }
        },
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Member not found")

    updated_member = next(
        (
            m
            for m in res.get("members", [])
            if m.get("email", "").strip().lower() == target_email
        ),
        None,
    )
    return ProjectMember(**updated_member)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


@router.get("/projects/{project_id}/tasks", response_model=list[TaskResponse])
async def list_tasks(project_id: str, owner: str = Depends(get_current_user)):
    await _require_project(project_id, owner)

    db = get_db()
    cursor = db["tasks"].find({"project_id": project_id}).sort("order", 1)

    tasks = []
    async for doc in cursor:
        tasks.append(_task_to_response(doc))

    return tasks


@router.post(
    "/projects/{project_id}/tasks",
    response_model=TaskResponse,
    status_code=201,
)
async def create_task(
    project_id: str,
    payload: TaskCreate,
    owner: str = Depends(get_current_user),
):
    project = await _require_project(project_id, owner, required_roles=["admin", "member"])

    db = get_db()

    priority = await _valid_priority(db, project["owner"], payload.priority)
    status = await _valid_status(db, project["owner"], payload.status)

    # Validate assignee and assigned_to against accepted members
    _validate_member_for_assignment(project, payload.assignee)
    _validate_member_for_assignment(project, payload.assigned_to)

    count = await db["tasks"].count_documents({"project_id": project_id})
    now = datetime.now(timezone.utc)

    doc = {
        "project_id": project_id,
        "space_id": project["space_id"],
        "owner": project["owner"],
        "created_by": owner,
        "title": payload.title.strip().replace("\\n", "\n"),
        "description": payload.description.strip().replace("\\n", "\n"),
        "assignee": payload.assignee.strip(),
        "assigned_to": payload.assigned_to.strip(),
        "priority": priority,
        "status": status,
        "due_date": payload.due_date or None,
        "subtasks": [
            {"id": item.id or str(ObjectId()), "title": item.title, "done": item.done}
            for item in payload.subtasks
        ],
        "order": count,
        "created_at": now,
        "updated_at": now,
    }

    result = await db["tasks"].insert_one(doc)
    doc["_id"] = result.inserted_id

    await db["projects"].update_one(
        {"_id": ObjectId(project_id)}, {"$set": {"updated_at": now}}
    )

    return _task_to_response(doc)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str,
    payload: TaskUpdate,
    owner: str = Depends(get_current_user),
):
    db = get_db()

    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=404, detail="Task not found")

    task = await db["tasks"].find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    project = await _require_project(task["project_id"], owner, required_roles=["admin", "member"])

    updates: dict = {}

    if payload.title is not None:
        title = payload.title.strip().replace("\\n", "\n")
        if not title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        updates["title"] = title
    if payload.description is not None:
        updates["description"] = payload.description.strip()
    if payload.assignee is not None:
        _validate_member_for_assignment(project, payload.assignee)
        updates["assignee"] = payload.assignee.strip()
    if payload.assigned_to is not None:
        _validate_member_for_assignment(project, payload.assigned_to)
        updates["assigned_to"] = payload.assigned_to.strip()
    if payload.priority is not None:
        updates["priority"] = await _valid_priority(db, project["owner"], payload.priority)
    if payload.status is not None:
        updates["status"] = await _valid_status(db, project["owner"], payload.status)
    if payload.due_date is not None:
        updates["due_date"] = payload.due_date or None
    if payload.subtasks is not None:
        updates["subtasks"] = [
            {"id": item.id or str(ObjectId()), "title": item.title, "done": item.done}
            for item in payload.subtasks
        ]

    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    updates["updated_at"] = datetime.now(timezone.utc)

    doc = await db["tasks"].find_one_and_update(
        {"_id": ObjectId(task_id)},
        {"$set": updates},
        return_document=True,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Task not found")

    await db["projects"].update_one(
        {"_id": ObjectId(doc["project_id"])},
        {"$set": {"updated_at": updates["updated_at"]}},
    )

    return _task_to_response(doc)


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, owner: str = Depends(get_current_user)):
    db = get_db()

    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=404, detail="Task not found")

    task = await db["tasks"].find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    project = await _require_project(task["project_id"], owner, required_roles=["admin", "member"])

    if project.get("_role") == "member":
        creator = task.get("created_by") or task.get("owner", "")
        if creator.strip().lower() != owner.strip().lower():
            raise HTTPException(
                status_code=403, detail="Members can only delete tasks they created"
            )

    result = await db["tasks"].delete_one({"_id": ObjectId(task_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")

    return {"detail": "Task deleted"}


# ---------------------------------------------------------------------------
# Resources (files and links)
# ---------------------------------------------------------------------------


@router.get("/projects/{project_id}/resources", response_model=list[ResourceResponse])
async def list_resources(project_id: str, owner: str = Depends(get_current_user)):
    await _require_project(project_id, owner)

    db = get_db()
    cursor = db["resources"].find({"project_id": project_id}).sort(
        "created_at", -1
    )

    resources = []
    async for doc in cursor:
        resources.append(_resource_to_response(doc))

    return resources


@router.post(
    "/projects/{project_id}/resources",
    response_model=ResourceResponse,
    status_code=201,
)
async def create_resource(
    project_id: str,
    payload: ResourceCreate,
    owner: str = Depends(get_current_user),
):
    project = await _require_project(project_id, owner, required_roles=["admin", "member"])

    db = get_db()
    kind = _validate_enum(payload.kind, RESOURCE_KINDS, "kind")

    now = datetime.now(timezone.utc)
    doc = {
        "project_id": project_id,
        "space_id": project["space_id"],
        "owner": project["owner"],
        "created_by": owner,
        "name": payload.name.strip(),
        "kind": kind,
        "url": payload.url.strip(),
        "created_at": now,
    }

    result = await db["resources"].insert_one(doc)
    doc["_id"] = result.inserted_id

    await db["projects"].update_one(
        {"_id": ObjectId(project_id)}, {"$set": {"updated_at": now}}
    )

    return _resource_to_response(doc)


@router.post(
    "/projects/{project_id}/resources/upload",
    response_model=ResourceResponse,
    status_code=201,
)
async def upload_resource(
    project_id: str,
    file: UploadFile = File(...),
    name: str | None = None,
    owner: str = Depends(get_current_user),
):
    project = await _require_project(project_id, owner, required_roles=["admin", "member"])

    db = get_db()
    original_name = file.filename or "uploaded_file"
    safe_name = (name or original_name).strip() or original_name

    project_dir = _ensure_upload_dir(project_id)
    stored_name = f"{uuid.uuid4().hex}_{os.path.basename(original_name)}"
    stored_path = os.path.join(project_dir, stored_name)

    size = 0
    try:
        with open(stored_path, "wb") as out:
            shutil.copyfileobj(file.file, out, length=1024 * 1024)
            size = out.tell()
    finally:
        file.file.close()

    if size > MAX_UPLOAD_SIZE:
        os.remove(stored_path)
        raise HTTPException(status_code=413, detail="File too large")

    now = datetime.now(timezone.utc)
    resource_id = str(uuid.uuid4())
    doc = {
        "_id": resource_id,
        "project_id": project_id,
        "space_id": project["space_id"],
        "owner": project["owner"],
        "created_by": owner,
        "name": safe_name,
        "kind": "file",
        "url": f"/files/{resource_id}",
        "stored_path": stored_path,
        "stored_name": original_name,
        "size": size,
        "created_at": now,
    }

    result = await db["resources"].insert_one(doc)
    doc["_id"] = result.inserted_id

    await db["projects"].update_one(
        {"_id": ObjectId(project_id)}, {"$set": {"updated_at": now}}
    )

    return _resource_to_response(doc)


@router.get("/files/{resource_id}")
async def serve_file(resource_id: str, owner: str = Depends(get_current_user)):
    db = get_db()

    query: dict = {"kind": "file"}
    try:
        oid = ObjectId(resource_id)
        query["_id"] = {"$in": [resource_id, oid]}
    except Exception:
        query["_id"] = resource_id

    resource = await db["resources"].find_one(query)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    await _require_project(resource["project_id"], owner)

    stored_path = resource.get("stored_path")
    if not stored_path or not os.path.exists(stored_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    media_type, _ = mimetypes.guess_type(stored_path)
    ext = os.path.splitext(stored_path)[1].lower()
    is_image = ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"}
    return FileResponse(
        stored_path,
        media_type=media_type or "application/octet-stream",
        content_disposition_type="inline" if is_image else "attachment",
        filename=resource.get("stored_name") or os.path.basename(stored_path),
    )


@router.delete("/resources/{resource_id}")
async def delete_resource(resource_id: str, owner: str = Depends(get_current_user)):
    db = get_db()

    query: dict = {}
    try:
        oid = ObjectId(resource_id)
        query["_id"] = {"$in": [resource_id, oid]}
    except Exception:
        query["_id"] = resource_id

    resource = await db["resources"].find_one(query)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    project = await _require_project(resource["project_id"], owner, required_roles=["admin", "member"])
    if project.get("_role") == "member":
        creator = resource.get("created_by") or resource.get("owner", "")
        if creator.strip().lower() != owner.strip().lower():
            raise HTTPException(
                status_code=403,
                detail="Members can only delete resources they uploaded",
            )

    result = await db["resources"].delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Resource not found")

    stored_path = resource.get("stored_path")
    if stored_path and os.path.exists(stored_path):
        try:
            os.remove(stored_path)
        except OSError:
            pass

    return {"detail": "Resource deleted"}
