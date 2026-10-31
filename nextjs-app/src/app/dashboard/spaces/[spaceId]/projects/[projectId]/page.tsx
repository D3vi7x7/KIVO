import {
  ChevronLeftIcon,
  Clock01Icon,
  Link01Icon,
  Note01Icon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { DocsNotesPanel } from "@/components/docs-notes-section";
import { LiveRecentsProject } from "@/components/live-recents-project";
import { ProjectMembersDialog } from "@/components/project-members-dialog";
import { ResourcesSection } from "@/components/resources-section";
import { SectionCard } from "@/components/space-section-card";
import { TasksPanel } from "@/components/tasks-panel";
import { TaskOptionsProvider } from "@/hooks/use-task-options";
import {
  getCurrentUser,
  getNotes,
  getProject,
  getResources,
  getTasks,
} from "@/lib/session";

export const instant = false;

export default async function ProjectPage({
  params,
}: PageProps<"/dashboard/spaces/[spaceId]/projects/[projectId]">) {
  await connection();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth");
  }

  const { spaceId, projectId } = await params;
  const project = await getProject(projectId);

  if (!project || project.space_id !== spaceId) {
    notFound();
  }

  const [notes, tasks, resources] = await Promise.all([
    getNotes(spaceId, projectId),
    getTasks(projectId),
    getResources(projectId),
  ]);

  const recents = [
    ...tasks.map((task) => ({
      id: task.id,
      title: task.title,
      kind: "task" as const,
      at: task.updated_at,
    })),
    ...resources.map((resource) => ({
      id: resource.id,
      title: resource.name,
      kind: resource.kind === "url" ? ("link" as const) : ("file" as const),
      at: resource.created_at,
    })),
    ...notes.map((note) => ({
      id: note.id,
      title: note.title || "Untitled",
      kind: "doc" as const,
      at: note.updated_at,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  return (
    <div className="flex min-h-svh flex-col bg-transparent">
      <div className="relative z-10 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <Link
            href={`/dashboard/spaces/${spaceId}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={ChevronLeftIcon} className="size-4" />
            {project.name}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="truncate text-sm font-medium capitalize">
            {project.kind}
          </span>
        </header>

        <main className="flex-1 space-y-4 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between sm:w-[73vw] gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-medium tracking-[-0.04em]">
                  {project.name}
                </h1>
                {project.current_user_role ? (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground border border-border">
                    {project.current_user_role}
                  </span>
                ) : null}
              </div>
              {project.description ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {project.description}
                </p>
              ) : null}
            </div>

            <ProjectMembersDialog
              projectId={projectId}
              projectName={project.name}
              projectOwner={project.owner}
              currentUserEmail={user.email}
              currentUserRole={project.current_user_role}
              initialMembers={project.members}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-6">
            <SectionCard
              title="Recents"
              description="Latest activity in this project"
              icon={Clock01Icon}
              className="lg:col-span-2"
            >
              <LiveRecentsProject projectId={projectId} spaceId={spaceId} initial={recents} />
            </SectionCard>

            <SectionCard
              title="Resources"
              description="Files and links attached to this project"
              icon={Link01Icon}
              className="lg:col-span-2"
            >
              <ResourcesSection projectId={projectId} initialResources={resources} />
            </SectionCard>

            <SectionCard
              title="Notes & docs"
              description="Documents in this project"
              icon={Note01Icon}
              className="lg:col-span-2"
            >
              <DocsNotesPanel
                spaceId={spaceId}
                projectId={projectId}
                initialNotes={notes}
              />
            </SectionCard>

            <SectionCard
              title="Tasks"
              description="List, board and calendar views"
              icon={Task01Icon}
              className="lg:col-span-6"
            >
              <TaskOptionsProvider>
                <TasksPanel projectId={projectId} initialTasks={tasks} />
              </TaskOptionsProvider>
            </SectionCard>
          </div>
        </main>
      </div>
    </div>
  );
}
