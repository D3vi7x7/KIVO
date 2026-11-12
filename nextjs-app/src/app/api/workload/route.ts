import { NextResponse } from "next/server";
import {
  getProjects,
  getTasks,
  getCurrentUser,
} from "@/lib/session";
import type { Task } from "@/lib/projects";

function isOverdue(t: Task): boolean {
  if (!t.due_date) return false;
  const due = new Date(t.due_date);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today && t.status !== "done";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Read all projects the user owns or is a member of
  const projects = await getProjects();
  const projectMap = new Map<string, { name: string; space_id: string }>();
  projects.forEach((p) => {
    projectMap.set(p.id, { name: p.name, space_id: p.space_id });
  });

  // Fetch tasks across all projects in parallel
  const taskResults = await Promise.all(
    projects.map(async (p) => {
      try {
        const ts = await getTasks(p.id);
        return ts.map((t) => ({
          ...t,
          projectName: p.name,
          spaceId: p.space_id,
        }));
      } catch {
        return [];
      }
    }),
  );

  const tasks = taskResults.flat();

  const stats = {
    total: tasks.length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "done").length,
    overdue: tasks.filter(isOverdue).length,
  };

  // Group tasks by assignee
  const byAssignee = new Map<string, typeof tasks>();
  const unassignedTasks: typeof tasks = [];

  for (const t of tasks) {
    const assignee = (t.assigned_to || t.assignee || "").trim();
    if (!assignee) {
      unassignedTasks.push(t);
      continue;
    }
    if (!byAssignee.has(assignee)) byAssignee.set(assignee, []);
    byAssignee.get(assignee)!.push(t);
  }

  // Collect all accepted members across projects
  const memberEmails = new Set(byAssignee.keys());
  const projectMembers: { email: string; name: string; role: string }[] = [];

  for (const p of projects) {
    for (const m of p.members ?? []) {
      if (m.status === "accepted") {
        memberEmails.add(m.email);
      }
      projectMembers.push({ email: m.email, name: m.email, role: m.role });
    }
  }

  // Always include the current user in members if not already
  if (user.email) {
    memberEmails.add(user.email);
  }

  const members = Array.from(memberEmails).map((email) => {
    const ts = byAssignee.get(email) ?? [];
    const completed = ts.filter((t) => t.status === "done").length;
    const inProgress = ts.filter((t) => t.status === "in_progress").length;
    const overdue = ts.filter(isOverdue).length;
    // Workload percentage: proportion of in-progress tasks or completion
    const pct = ts.length ? Math.round((inProgress / ts.length) * 100) : 0;
    const known = projectMembers.find(
      (m) => m.email.toLowerCase() === email.toLowerCase(),
    );
    return {
      email,
      name: known?.name || email,
      role: known?.role || (email.toLowerCase() === user.email.toLowerCase() ? "admin" : "member"),
      assigned: ts.length,
      inProgress,
      completed,
      overdue,
      workload: pct,
      avatar: email.split("@")[0]?.slice(0, 2).toUpperCase() || "??",
    };
  });

  members.sort((a, b) => b.assigned - a.assigned);

  // Formatted unassigned tasks
  const unassigned = unassignedTasks.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    status: t.status,
    tag: t.projectName || "General",
    date: t.due_date
      ? new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "No due date",
    projectName: t.projectName,
    project_id: t.project_id,
    due_date: t.due_date,
    created_at: t.created_at,
  }));

  // Dynamic capacity calculation
  const totalTasks = tasks.length;
  const inProgressTotal = stats.inProgress;
  const capacityPct = totalTasks > 0
    ? Math.min(100, Math.round((inProgressTotal / totalTasks) * 100))
    : 0;

  return NextResponse.json(
    {
      tasks,
      stats,
      members,
      unassigned,
      projects: projects.map((p) => ({ id: p.id, name: p.name, space_id: p.space_id })),
      capacityPct,
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
