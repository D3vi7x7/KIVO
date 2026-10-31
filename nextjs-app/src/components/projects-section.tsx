"use client";

import {
  Add01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as Sentry from "@sentry/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ColorPicker } from "@/components/color-picker";
import GlassFolder, { type FolderFile } from "@/components/ui/glass-folder-cards";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project, ProjectKind } from "@/lib/projects";

/** Flat colours for the sheets inside a folder, one per kind of content. */
const SECTION_COLORS = {
  tasks: "#FFFFFF",
  resources: "#FFFFFF",
  notes: "#FFFFFF",
};

const BACK_COLOR = "#e4e4e9";

/** The colour a new folder starts with. */
const DEFAULT_COLOR = "#e4e4e9";

/** How long a single click waits for a second one before the folder opens. */
const DOUBLE_CLICK_DELAY = 250;

export interface ProjectsSectionProps {
  spaceId: string;
  initialProjects?: Project[];
}

export function ProjectsSection({
  spaceId,
  initialProjects = [],
}: ProjectsSectionProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const toggleTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // A pending open is held back briefly: a double click means "open the
  // project", so the folder should not start animating open first.
  useEffect(() => {
    const timers = toggleTimers.current;
    return () => {
      for (const timer of Object.values(timers)) {
        clearTimeout(timer);
      }
    };
  }, []);

  const handleOpenChange = (projectId: string, next: boolean) => {
    const pending = toggleTimers.current[projectId];
    if (pending) {
      clearTimeout(pending);
      delete toggleTimers.current[projectId];
    }

    if (!next) {
      setOpenFolders((current) => ({ ...current, [projectId]: false }));
      return;
    }

    toggleTimers.current[projectId] = setTimeout(() => {
      delete toggleTimers.current[projectId];
      setOpenFolders((current) => ({ ...current, [projectId]: true }));
    }, DOUBLE_CLICK_DELAY);
  };

  const openProject = (project: Project) => {
    const pending = toggleTimers.current[project.id];
    if (pending) {
      clearTimeout(pending);
      delete toggleTimers.current[project.id];
    }
    setOpenFolders((current) => ({ ...current, [project.id]: false }));
    router.push(`/dashboard/spaces/${spaceId}/projects/${project.id}`);
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProjectKind>("project");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      setError("Give it a name");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/spaces/${spaceId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), kind, color }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || "Failed to create the project");
      }

      setProjects((current) => [...current, data]);
      setName("");
      setKind("project");
      setColor(DEFAULT_COLOR);
      setDialogOpen(false);
      // Refresh the server components so the sidebar picks up the new project.
      router.refresh();
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Failed to create the project");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (project: Project) => {
    setProjects((current) => current.filter((item) => item.id !== project.id));

    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || "Failed to delete the project");
      }

      // Refresh the server components so the sidebar drops the project too.
      router.refresh();
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  const filesFor = (project: Project): FolderFile[] => [
    {
      name: "Tasks",
      meta: `${project.task_count} ${project.task_count === 1 ? "task" : "tasks"}`,
      color: SECTION_COLORS.tasks,
    },
    {
      name: "Resources",
      meta: `${project.resource_count} ${project.resource_count === 1 ? "file" : "files"}`,
      color: SECTION_COLORS.resources,
    },
    {
      name: "Notes & docs",
      meta: `${project.note_count} ${project.note_count === 1 ? "note" : "notes"}`,
      color: SECTION_COLORS.notes,
    },
  ];

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          size="sm"
          className="h-7 rounded-md bg-white px-2.5 text-xs font-medium text-black hover:bg-gray-300 dark:bg-white dark:text-black dark:hover:bg-white/85"
          onClick={() => {
            setName("");
            setKind("project");
            setError(null);
            setDialogOpen(true);
          }}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
          Add project/Folder
        </Button>
      </div>

      {projects.length === 0 ? (
        <p className="rounded-md border border-dashed border-foreground/15 px-3 py-6 text-center text-sm text-muted-foreground">
          No folders or projects yet
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-7 grid-cols-1">
          {projects.map((project, index) => (
            <div key={project.id} className="relative">
              <GlassFolder
                label={project.name}
                meta={`${project.open_task_count} open`}
                backColor={project.color || BACK_COLOR}
                art="none"
                files={filesFor(project)}
                action="more"
                width={250}
                appearDelay={index * 90}
                open={Boolean(openFolders[project.id])}
                onOpenChange={(next) => handleOpenChange(project.id, next)}
                onDoubleClick={() => openProject(project)}
                menu={[
                  {
                    label: "Delete",
                    danger: true,
                    onSelect: () => remove(project),
                  },
                ]}
              />

              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${project.name}`}
                className="absolute right-0 top-0 size-8 p-0 text-muted-foreground"
                onClick={() => remove(project)}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a project or folder</DialogTitle>
            <DialogDescription>
              Projects hold their own tasks, resources and documents.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as ProjectKind)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="folder">Folder</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                placeholder="Website redesign"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Colour</Label>
              <ColorPicker
                value={color}
                onChange={setColor}
                label="Folder colour"
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
