import { ChevronLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { PendingActionsPill } from "@/components/pending-actions-pill";
import { EMPTY_SPACE_DATA, SpaceBento } from "@/components/space-bento";
import { getCurrentUser, getNotes, getSpace, getSpaceProjects, getTasks } from "@/lib/session";
import { normalizeNewlines } from "@/lib/utils";
import type { Task } from "@/lib/projects";
import SunlitCuttingMat from "@/components/ui/sunlit-cutting-mat";

export const instant = false;

export default async function SpacePage({
  params,
}: PageProps<"/dashboard/spaces/[spaceId]">) {
  await connection();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth");
  }

  const { spaceId } = await params;
  const space = await getSpace(spaceId);

  if (!space) {
    notFound();
  }

  const [notes, projects] = await Promise.all([
    getNotes(spaceId),
    getSpaceProjects(spaceId),
  ]);

  const projectTasks = await Promise.all(
    projects.map(async (p) => {
      const ts = await getTasks(p.id);
      return ts.map((t) => ({ ...t, projectName: p.name }));
    }),
  );
  const allTasks: (Task & { projectName: string })[] = projectTasks.flat();

  const now = new Date();
  const recents = allTasks
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8)
    .map((t) => ({
      id: t.id,
      title: t.title,
      kind: "task" as const,
      updatedAt: new Date(t.updated_at).toLocaleDateString(),
    }));

  const deadlines = allTasks
    .filter((t) => t.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 8)
    .map((t) => {
      const due = new Date(t.due_date!);
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const urgency: "today" | "soon" | "later" =
        diffDays <= 0 ? "today" : diffDays <= 3 ? "soon" : "later";
      return {
        id: t.id,
        title: t.title,
        dueAt: due.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        urgency,
      };
    });

  const data = { ...EMPTY_SPACE_DATA, recents, deadlines };

  return (
    <div className="flex min-h-svh flex-col bg-transparent">
      <PendingActionsPill />
      <div className="relative z-10 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={ChevronLeftIcon} className="size-4" />
            Dashboard
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="truncate text-sm font-medium">{normalizeNewlines(space.name)}</span>
        </header>

        <main className="flex-1 space-y-6 p-4">
          <div>
            <h1 className="text-2xl font-medium tracking-[-0.04em]">
              {normalizeNewlines(space.name)}
            </h1>
            {space.description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {space.description}
              </p>
            ) : null}
          </div>
          <SpaceBento
            spaceId={spaceId}
            data={data}
            notes={notes}
            projects={projects}
          />
        </main>
      </div>
    </div>
  );
}
