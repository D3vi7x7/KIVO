"use client";

import { useEffect, useState } from "react";

import type { Task } from "@/lib/projects";
import type { ProjectResource } from "@/lib/projects";
import type { Note } from "@/lib/notes";

interface RecentItem {
  id: string;
  title: string;
  kind: string;
  at: string;
}

export function LiveRecentsProject({
  projectId,
  spaceId,
  initial,
}: {
  projectId: string;
  spaceId: string;
  initial: RecentItem[];
}) {
  const [items, setItems] = useState<RecentItem[]>(initial);

  const load = async () => {
    try {
      const [tasksRes, resourcesRes, notesRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/tasks`, { cache: "no-store" }),
        fetch(`/api/projects/${projectId}/resources`, { cache: "no-store" }),
        fetch(`/api/spaces/${spaceId}/notes?project_id=${projectId}`, { cache: "no-store" }),
      ]);
      const tasks: Task[] = tasksRes.ok ? await tasksRes.json() : [];
      const resources: ProjectResource[] = resourcesRes.ok ? await resourcesRes.json() : [];
      const notes: Note[] = notesRes.ok ? await notesRes.json() : [];
      const recents = [
        ...tasks.map((t) => ({ id: t.id, title: t.title, kind: "task", at: t.updated_at })),
        ...resources.map((r) => ({ id: r.id, title: r.name, kind: r.kind === "url" ? "link" : "file", at: r.created_at })),
        ...notes.map((n) => ({ id: n.id, title: n.title || "Untitled", kind: "doc", at: n.updated_at })),
      ]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 8);
      setItems(recents);
    } catch {
      // keep previous
    }
  };

  useEffect(() => {
    const interval = setInterval(() => void load(), 8000);
    return () => clearInterval(interval);
  }, [projectId, spaceId]);

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
        Nothing recent yet
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-white/90 hover:bg-white/10 hover:text-white transition-colors cursor-pointer">
          <span className="truncate text-sm font-medium">{item.title}</span>
          <span className="shrink-0 text-xs capitalize text-white/60">{item.kind}</span>
        </li>
      ))}
    </ul>
  );
}
