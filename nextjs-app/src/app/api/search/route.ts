import { NextResponse } from "next/server";
import { getProjects, getTasks, getResources, getCurrentUser } from "@/lib/session";
import { getSpaces } from "@/lib/session";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").toLowerCase();
  const spaces = await getSpaces();
  const projects: any[] = [];
  const tasks: any[] = [];
  const resources: any[] = [];
  for (const space of spaces) {
    const sp = await (await import("@/lib/session")).getSpaceProjects(space.id);
    for (const p of sp) {
      if (!q || p.name.toLowerCase().includes(q)) projects.push({ ...p, spaceId: space.id });
      const ts = await (await import("@/lib/session")).getTasks(p.id);
      for (const t of ts) {
        if (!q || t.title.toLowerCase().includes(q)) tasks.push({ ...t, projectId: p.id, projectName: p.name, spaceId: space.id });
      }
      const rs = await (await import("@/lib/session")).getResources(p.id);
      for (const r of rs) {
        if (!q || r.name.toLowerCase().includes(q)) resources.push({ ...r, projectId: p.id, projectName: p.name, spaceId: space.id });
      }
    }
  }
  return NextResponse.json({ projects, tasks, resources });
}
