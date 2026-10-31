from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user, get_db
from app.colors import sanitize_color

router = APIRouter(prefix="/task-options", tags=["task-options"])

OPTION_KINDS = ["priority", "status"]

# The options every account starts with. They are not stored in the database;
# they are merged with the caller's own custom options on the way out.
#
# `value` is what a task stores, `name` is what the user sees. They differ for
# the built-ins ("in_progress" reads as "In progress").
BUILTIN_OPTIONS = [
    {
        "id": "priority:low",
        "kind": "priority",
        "value": "low",
        "name": "Low",
        "color": "#868e96",
    },
    {
        "id": "priority:medium",
        "kind": "priority",
        "value": "medium",
        "name": "Medium",
        "color": "#1971c2",
    },
    {
        "id": "priority:high",
        "kind": "priority",
        "value": "high",
        "name": "High",
        "color": "#f08c00",
    },
    {
        "id": "priority:urgent",
        "kind": "priority",
        "value": "urgent",
        "name": "Urgent",
        "color": "#e03131",
    },
    {
        "id": "status:todo",
        "kind": "status",
        "value": "todo",
        "name": "To do",
        "color": "#868e96",
    },
    {
        "id": "status:in_progress",
        "kind": "status",
        "value": "in_progress",
        "name": "In progress",
        "color": "#1971c2",
    },
    {
        "id": "status:review",
        "kind": "status",
        "value": "review",
        "name": "Review",
        "color": "#9c36b5",
    },
    {
        "id": "status:done",
        "kind": "status",
        "value": "done",
        "name": "Done",
        "color": "#2f9e44",
    },
]


class TaskOptionCreate(BaseModel):
    kind: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=40)
    color: str = Field(default="#868e96", max_length=32)


class TaskOptionResponse(BaseModel):
    id: str
    kind: str
    value: str
    name: str
    color: str
    builtin: bool = False


@router.get("", response_model=list[TaskOptionResponse])
async def list_task_options(owner: str = Depends(get_current_user)):
    db = get_db()
    cursor = db["task_options"].find({"owner": owner}).sort("created_at", 1)

    options = [
        TaskOptionResponse(
            id=item["id"],
            kind=item["kind"],
            value=item["value"],
            name=item["name"],
            color=item["color"],
            builtin=True,
        )
        for item in BUILTIN_OPTIONS
    ]

    async for doc in cursor:
        options.append(
            TaskOptionResponse(
                id=str(doc["_id"]),
                kind=doc["kind"],
                value=doc.get("value", doc["name"]),
                name=doc["name"],
                color=doc.get("color", "#868e96"),
                builtin=False,
            )
        )

    return options


@router.post("", response_model=TaskOptionResponse, status_code=201)
async def create_task_option(
    payload: TaskOptionCreate,
    owner: str = Depends(get_current_user),
):
    db = get_db()

    kind = payload.kind.strip()
    if kind not in OPTION_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"kind must be one of: {', '.join(OPTION_KINDS)}",
        )

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    # A custom option may share a name with a built-in one; it just shadows it.
    existing = await db["task_options"].find_one(
        {"owner": owner, "kind": kind, "name": name}
    )
    if existing:
        raise HTTPException(
            status_code=409, detail=f"A {kind} named '{name}' already exists"
        )

    doc = {
        "owner": owner,
        "kind": kind,
        "value": name,
        "name": name,
        "color": sanitize_color(payload.color, "#868e96"),
        "created_at": datetime.now(timezone.utc),
    }

    result = await db["task_options"].insert_one(doc)

    return TaskOptionResponse(
        id=str(result.inserted_id),
        kind=kind,
        value=doc["value"],
        name=name,
        color=doc["color"],
        builtin=False,
    )


@router.delete("/{option_id}")
async def delete_task_option(option_id: str, owner: str = Depends(get_current_user)):
    db = get_db()

    if not ObjectId.is_valid(option_id):
        # Built-in options cannot be removed.
        raise HTTPException(status_code=400, detail="Built-in options cannot be removed")

    result = await db["task_options"].delete_one(
        {"_id": ObjectId(option_id), "owner": owner}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Option not found")

    return {"detail": "Option deleted"}
