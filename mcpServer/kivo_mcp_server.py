import os
import httpx
from mcp.server.mcpserver import MCPServer

KIVO_API = os.getenv("KIVO_API_URL", "http://localhost:5000")
KIVO_KEY = os.getenv("KIVO_API_KEY", "")

mcp = MCPServer("kivo")

def _headers():
    return {"Authorization": f"Bearer {KIVO_KEY}"}

@mcp.tool()
async def list_spaces() -> str:
    """List all KIVO spaces for the authenticated user."""
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{KIVO_API}/integrations/spaces", headers=_headers())
        return r.text

@mcp.tool()
async def list_projects(space_id: str) -> str:
    """List projects in a KIVO space."""
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{KIVO_API}/integrations/spaces/{space_id}/projects", headers=_headers())
        return r.text

@mcp.tool()
async def list_tasks(project_id: str) -> str:
    """List tasks in a KIVO project."""
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{KIVO_API}/integrations/projects/{project_id}/tasks", headers=_headers())
        return r.text

@mcp.tool()
async def propose_task(project_id: str, title: str, description: str = "", priority: str = "medium", status: str = "todo", due_date: str | None = None) -> str:
    """Propose creating a new task (requires user approval in KIVO UI)."""
    payload = {"project_id": project_id, "title": title, "description": description, "priority": priority, "status": status, "due_date": due_date, "subtasks": []}
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{KIVO_API}/integrations/actions", headers=_headers(), json={"kind": "task", "payload": payload, "description": f"Create task: {title}"})
        return r.text

@mcp.tool()
async def propose_note(space_id: str, title: str, content: str, project_id: str | None = None) -> str:
    """Propose creating a note/doc (requires user approval in KIVO UI)."""
    payload = {"space_id": space_id, "project_id": project_id, "title": title, "content": content}
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{KIVO_API}/integrations/actions", headers=_headers(), json={"kind": "note", "payload": payload, "description": f"Create note: {title}"})
        return r.text

@mcp.tool()
async def propose_link_resource(project_id: str, space_id: str, name: str, url: str) -> str:
    """Propose adding a link resource (requires user approval in KIVO UI)."""
    payload = {"project_id": project_id, "space_id": space_id, "name": name, "url": url}
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{KIVO_API}/integrations/actions", headers=_headers(), json={"kind": "resource", "payload": payload, "description": f"Add link: {name}"})
        return r.text

if __name__ == "__main__":
    mcp.run()
