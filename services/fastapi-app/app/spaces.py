import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user, get_db

router = APIRouter(prefix="/spaces", tags=["spaces"])


class SpaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=280)


class SpaceResponse(BaseModel):
    id: str
    name: str
    description: str
    owner: str
    created_at: datetime
    item_count: int = 0


def _to_response(doc: dict, item_count: int = 0) -> SpaceResponse:
    return SpaceResponse(
        id=str(doc["_id"]),
        name=doc["name"],
        description=doc.get("description", ""),
        owner=doc["owner"],
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
        item_count=item_count,
    )


@router.get("", response_model=list[SpaceResponse])
async def list_spaces(owner: str = Depends(get_current_user)):
    db = get_db()
    owner_clean = owner.strip().lower()

    # Find project space_ids where user is an accepted member
    member_projects = await db["projects"].find(
        {
            "members": {
                "$elemMatch": {
                    "email": {"$regex": f"^{re.escape(owner_clean)}$", "$options": "i"},
                    "status": "accepted",
                }
            }
        },
        {"space_id": 1},
    ).to_list(100)

    member_space_ids = [
        ObjectId(p["space_id"])
        for p in member_projects
        if ObjectId.is_valid(p.get("space_id", ""))
    ]

    query: dict = {
        "$or": [
            {"owner": {"$regex": f"^{re.escape(owner_clean)}$", "$options": "i"}},
            {"_id": {"$in": member_space_ids}},
        ]
    } if member_space_ids else {"owner": {"$regex": f"^{re.escape(owner_clean)}$", "$options": "i"}}

    cursor = db["spaces"].find(query).sort("created_at", 1)

    spaces = []
    async for doc in cursor:
        count = await db["space_items"].count_documents({"space_id": str(doc["_id"])})
        spaces.append(_to_response(doc, count))

    return spaces


@router.post("", response_model=SpaceResponse, status_code=201)
async def create_space(payload: SpaceCreate, owner: str = Depends(get_current_user)):
    db = get_db()
    name = payload.name.strip().replace("\\n", "\n")

    if not name:
        raise HTTPException(status_code=400, detail="Space name cannot be empty")

    existing = await db["spaces"].find_one({"owner": owner, "name": name})
    if existing:
        raise HTTPException(status_code=409, detail="A space with that name already exists")

    doc = {
        "name": name,
        "description": payload.description.strip(),
        "owner": owner,
        "created_at": datetime.now(timezone.utc),
    }

    result = await db["spaces"].insert_one(doc)
    doc["_id"] = result.inserted_id

    return _to_response(doc)


@router.get("/{space_id}", response_model=SpaceResponse)
async def get_space(space_id: str, owner: str = Depends(get_current_user)):
    db = get_db()

    if not ObjectId.is_valid(space_id):
        raise HTTPException(status_code=404, detail="Space not found")

    owner_clean = owner.strip().lower()
    doc = await db["spaces"].find_one({
        "_id": ObjectId(space_id),
        "owner": {"$regex": f"^{re.escape(owner_clean)}$", "$options": "i"},
    })
    if not doc:
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
            doc = await db["spaces"].find_one({"_id": ObjectId(space_id)})

    if not doc:
        raise HTTPException(status_code=404, detail="Space not found")

    count = await db["space_items"].count_documents({"space_id": space_id})
    return _to_response(doc, count)


@router.delete("/{space_id}")
async def delete_space(space_id: str, owner: str = Depends(get_current_user)):
    db = get_db()

    if not ObjectId.is_valid(space_id):
        raise HTTPException(status_code=404, detail="Space not found")

    result = await db["spaces"].delete_one({"_id": ObjectId(space_id), "owner": owner})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Space not found")

    await db["space_items"].delete_many({"space_id": space_id})
    return {"detail": "Space deleted"}
