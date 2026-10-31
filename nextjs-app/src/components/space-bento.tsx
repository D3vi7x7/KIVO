import {
  Attachment01Icon,
  Calendar03Icon,
  Clock01Icon,
  Folder01Icon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { DocsNotesSection } from "@/components/docs-notes-section"; import { ProjectsSection } from "@/components/projects-section";
import { EmptyRow, SectionCard } from "@/components/space-section-card";
import type { Note } from "@/lib/notes";
import type { Project } from "@/lib/projects";

export interface RecentItem {
  id: string;
  title: string;
  kind: "doc" | "board" | "task" | "file";
  updatedAt: string;
}

export interface Deadline {
  id: string;
  title: string;
  dueAt: string;
  urgency: "today" | "soon" | "later";
}

export interface DocNote {
  id: string;
  title: string;
  excerpt: string;
  updatedAt: string;
}

export interface ProjectFolder {
  id: string;
  name: string;
  itemCount: number;
  kind: "folder" | "project";
}

export interface WorkloadBucket {
  status: string;
  count: number;
  total: number;
}

export interface Attachment {
  id: string;
  name: string;
  size: string;
  type: "pdf" | "doc" | "sheet" | "image" | "other";
}

export interface SpaceBentoData {
  recents: RecentItem[];
  deadlines: Deadline[];
  docs: DocNote[];
  folders: ProjectFolder[];
  workload: WorkloadBucket[];
  attachments: Attachment[];
}

export const EMPTY_SPACE_DATA: SpaceBentoData = {
  recents: [],
  deadlines: [],
  docs: [],
  folders: [],
  workload: [],
  attachments: [],
};

const URGENCY_CLASS: Record<Deadline["urgency"], string> = {
  today: "text-red-600 dark:text-red-400",
  soon: "text-amber-600 dark:text-amber-400",
  later: "text-muted-foreground",
};

export interface SpaceBentoProps {
  spaceId: string;
  data: SpaceBentoData;
  notes?: Note[];
  projects?: Project[];
}

export function SpaceBento({
  spaceId,
  data,
  notes = [],
  projects = [],
}: SpaceBentoProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <SectionCard
        title="Recents"
        description="Latest activity across the space"
        icon={Clock01Icon}
        className="min-h-[350px] lg:col-span-2 text-white"
      >
        {data.recents.length === 0 ? (
          <EmptyRow label="Nothing recent yet" />
        ) : (
          <ul className="space-y-2">
            {data.recents.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <span className="truncate text-sm">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.updatedAt}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Upcoming deadlines"
        description="What is due next"
        icon={Calendar03Icon}
        className="min-h-[350px] lg:col-span-2 text-white"
      >
        {data.deadlines.length === 0 ? (
          <EmptyRow label="No deadlines scheduled" />
        ) : (
          <ul className="space-y-2">
            {data.deadlines.map((deadline) => (
              <li
                key={deadline.id}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <span className="truncate text-sm">{deadline.title}</span>
                <span
                  className={`shrink-0 text-xs ${URGENCY_CLASS[deadline.urgency]}`}
                >
                  {deadline.dueAt}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <DocsNotesSection spaceId={spaceId} initialNotes={notes} />

      <SectionCard
        title="Folders & projects"
        description="Browse the structure of this space"
        icon={Folder01Icon}
        className="lg:col-span-6 text-white"
      >
        <ProjectsSection spaceId={spaceId} initialProjects={projects} />
      </SectionCard>

      <SectionCard
        title="Workload by status"
        description="How work is distributed"
        icon={Task01Icon}
        className="lg:col-span-3 text-white"
      >
        {data.workload.length === 0 ? (
          <EmptyRow label="No work tracked yet" />
        ) : (
          <div className="space-y-3">
            {data.workload.map((bucket) => {
              const percent = bucket.total
                ? Math.round((bucket.count / bucket.total) * 100)
                : 0;

              return (
                <div key={bucket.status} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span>{bucket.status}</span>
                    <span className="text-muted-foreground">
                      {bucket.count}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-sidebar-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Attachments"
        description="Files linked to this space"
        icon={Attachment01Icon}
        className="lg:col-span-3 text-white"
      >
        {data.attachments.length === 0 ? (
          <EmptyRow label="No attachments yet" />
        ) : (
          <ul className="space-y-2">
            {data.attachments.map((file) => (
              <li key={file.id}>
                <a
                  href="#"
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <span className="truncate text-sm">{file.name}</span>
                  <span className="shrink-0 text-xs uppercase text-muted-foreground">
                    {file.type} · {file.size}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
