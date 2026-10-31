import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import router as auth_router, close_clients, get_redis, init_clients
from app.integrations import router as integrations_router
from app.notes import router as notes_router
from app.pending_actions import router as pending_actions_router
from app.projects import router as projects_router
from app.spaces import router as spaces_router
from app.task_options import router as task_options_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_clients()
    try:
        yield
    finally:
        await close_clients()


app = FastAPI(title="KIVO FastAPI Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(spaces_router)
app.include_router(notes_router)
app.include_router(projects_router)
app.include_router(task_options_router)
app.include_router(integrations_router)
app.include_router(pending_actions_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/cache/{key}")
async def get_cache(key: str):
    value = await get_redis().get(key)
    return {"key": key, "value": value}


@app.post("/cache/{key}")
async def set_cache(key: str, value: str):
    await get_redis().set(key, value)
    return {"key": key, "value": value, "set": True}
