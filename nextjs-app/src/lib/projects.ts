export type ProjectKind = "folder" | "project";
export type MemberRole = "admin" | "member" | "viewer";
export type MemberStatus = "pending" | "accepted" | "rejected";

export interface ProjectMember {
  email: string;
  role: MemberRole;
  status: MemberStatus;
  invited_by?: string | null;
  invited_at?: string | null;
  joined_at?: string | null;
}

export interface Project {
  id: string;
  space_id: string;
  name: string;
  kind: ProjectKind;
  description: string;
  color: string;
  owner: string;
  created_at: string;
  updated_at: string;
  members?: ProjectMember[];
  current_user_role?: MemberRole;
  task_count: number;
  open_task_count: number;
  resource_count: number;
  note_count: number;
}

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  project_id: string;
  space_id: string;
  title: string;
  description: string;
  assignee: string;
  assigned_to: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  subtasks: Subtask[];
  progress: number;
  order: number;
  owner: string;
  created_at: string;
  updated_at: string;
}

export type ResourceKind = "file" | "url";

export interface ProjectResource {
  id: string;
  project_id: string;
  space_id: string;
  name: string;
  kind: ResourceKind;
  url: string;
  owner: string;
  created_at: string;
}

export const TASK_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "done",
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

/**
 * Progress is the share of the completion checklist that is ticked off.
 * Mirrors the calculation the API does, so the UI can update optimistically.
 */
export function progressFromSubtasks(
  subtasks: { done: boolean }[] | undefined,
): number {
  if (!subtasks || subtasks.length === 0) {
    return 0;
  }

  const done = subtasks.filter((subtask) => subtask.done).length;
  return Math.round((done / subtasks.length) * 100);
}
