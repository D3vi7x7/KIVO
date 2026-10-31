"use client";

import {
  Add01Icon,
  Calendar03Icon,
  ListChecksIcon,
  LayoutGridIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as Sentry from "@sentry/react";
import { Fragment, useState } from "react";

import { CreateTaskFormDialog } from "@/components/create-task-form-dialog";
import { TaskDetailsDialog } from "@/components/task-details-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/color-picker";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "cn";
import { normalizeNewlines } from "@/lib/utils";
import { progressFromSubtasks, type Task } from "@/lib/projects";
import { TaskOptionsProvider, useTaskOptions } from "@/hooks/use-task-options";
import { BUILTIN_OPTION_COLORS } from "@/lib/task-options";
import { SWATCHES } from "@/components/color-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TaskView = "list" | "board" | "calendar";

const VIEWS: { id: TaskView; label: string; icon: typeof ListChecksIcon }[] = [
  { id: "list", label: "List", icon: ListChecksIcon },
  { id: "board", label: "Board", icon: LayoutGridIcon },
  { id: "calendar", label: "Calendar", icon: Calendar03Icon },
];

function formatDue(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export interface TasksPanelProps {
  projectId: string;
  initialTasks?: Task[];
}

async function patchTask(taskId: string, payload: Record<string, unknown>) {
  const res = await fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res || !res.ok) {
    throw new Error("Failed to update the task");
  }
  return (await res.json()) as Task;
}

const GROUP_OPTIONS = [
  { value: "none", label: "No grouping" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "assigned_to", label: "Assigned to" },
  { value: "due_date", label: "Due date" },
];

const SortHeader = ({
  field,
  label,
  sortBy,
  sortDir,
  onSort,
}: {
  field: string;
  label: string;
  sortBy: string | null;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
}) => (
  <th
    className="px-3 py-2 font-medium cursor-pointer select-none"
    onClick={() => onSort(field)}
  >
    {label}
    {sortBy === field ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
  </th>
);

export function TasksPanel({ projectId, initialTasks = [] }: TasksPanelProps) {
  const { byKind, create } = useTaskOptions();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [view, setView] = useState<TaskView>("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTask, setDetailsTask] = useState<Task | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupBy, setGroupBy] = useState<string>("none");

  const [newPriorityTaskId, setNewPriorityTaskId] = useState<string | null>(null);
  const [newPriorityName, setNewPriorityName] = useState("");
  const [newPriorityColor, setNewPriorityColor] = useState("#1971c2");
  const [newStatusTaskId, setNewStatusTaskId] = useState<string | null>(null);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#1971c2");

  const priorityColor = (value: string) =>
    byKind("priority").find((o) => o.value === value)?.color ??
    BUILTIN_OPTION_COLORS[value] ??
    "#868e96";

  const statusColor = (value: string) =>
    byKind("status").find((o) => o.value === value)?.color ??
    BUILTIN_OPTION_COLORS[value] ??
    "#868e96";

  const statusName = (value: string) =>
    byKind("status").find((o) => o.value === value)?.name ?? value;

  const priorityName = (value: string) =>
    byKind("priority").find((o) => o.value === value)?.name ?? value;

  const openCreate = () => {
    setDialogOpen(true);
  };

  const openDetails = (task: Task) => {
    setDetailsTask(task);
    setDetailsOpen(true);
  };

  const handleSaved = (task: Task) => {
    setTasks((current) => {
      const exists = current.some((item) => item.id === task.id);
      return exists
        ? current.map((item) => (item.id === task.id ? task : item))
        : [...current, task];
    });
  };

  const handleDeleted = (taskId: string) => {
    setTasks((current) => current.filter((item) => item.id !== taskId));
  };

  const toggleSubtask = async (
    task: Task,
    subtaskId: string,
    done: boolean,
  ) => {
    const subtasks = task.subtasks.map((subtask) =>
      subtask.id === subtaskId ? { ...subtask, done } : subtask,
    );

    const previous = tasks;
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, subtasks, progress: progressFromSubtasks(subtasks) }
          : item,
      ),
    );

    try {
      const data = await patchTask(task.id, { subtasks });
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? data : item)),
      );
    } catch (err) {
      Sentry.captureException(err);
      setTasks(previous);
    }
  };

  const updateField = async (task: Task, field: string, value: unknown) => {
    const previous = tasks;
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, [field]: value } : item,
      ),
    );
    try {
      const data = await patchTask(task.id, { [field]: value });
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? data : item)),
      );
    } catch (err) {
      Sentry.captureException(err);
      setTasks(previous);
    }
  };

  const byStatus = (status: string) =>
    tasks.filter((task) => task.status === status);

  const statusOptions = byKind("status");

  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOfGrid = new Date(firstOfMonth);
  startOfGrid.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  const daysInGrid = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startOfGrid);
    date.setDate(startOfGrid.getDate() + index);
    return date;
  });

  const tasksByDay = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.due_date) continue;
    const date = new Date(task.due_date);
    if (Number.isNaN(date.getTime())) continue;
    const key = monthKey(date);
    const list = tasksByDay.get(key) ?? [];
    list.push(task);
    tasksByDay.set(key, list);
  }

  // sorting
  const sortTasks = (list: Task[]) => {
    if (!sortBy) return list;
    const sorted = [...list].sort((a, b) => {
      let va: string | number | null = null;
      let vb: string | number | null = null;
      if (sortBy === "title") { va = a.title; vb = b.title; }
      else if (sortBy === "assignee") { va = a.assignee; vb = b.assignee; }
      else if (sortBy === "assigned_to") { va = a.assigned_to; vb = b.assigned_to; }
      else if (sortBy === "priority") { va = a.priority; vb = b.priority; }
      else if (sortBy === "status") { va = a.status; vb = b.status; }
      else if (sortBy === "due") { va = a.due_date; vb = b.due_date; }
      if (va == null) va = "";
      if (vb == null) vb = "";
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  // grouping
  const groupKey = (task: Task): string => {
    if (groupBy === "priority") return priorityName(task.priority);
    if (groupBy === "status") return statusName(task.status);
    if (groupBy === "assignee") return task.assignee || "—";
    if (groupBy === "assigned_to") return task.assigned_to || "—";
    if (groupBy === "due_date") return task.due_date ? task.due_date.slice(0, 10) : "No due date";
    return "";
  };

  const sortedTasks = sortTasks(tasks);
  let grouped: { key: string; items: Task[] }[] = [];
  if (groupBy === "none") {
    grouped = [{ key: "", items: sortedTasks }];
  } else {
    const map = new Map<string, Task[]>();
    for (const t of sortedTasks) {
      const k = groupKey(t);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    grouped = Array.from(map.entries()).map(([key, items]) => ({ key, items }));
  }

  const renderNewOptionForm = (kind: "priority" | "status", taskId: string) => {
    const isPriority = kind === "priority";
    const name = isPriority ? newPriorityName : newStatusName;
    const setName = isPriority ? setNewPriorityName : setNewStatusName;
    const color = isPriority ? newPriorityColor : newStatusColor;
    const setColor = isPriority ? setNewPriorityColor : setNewStatusColor;
    const close = () => {
      if (isPriority) setNewPriorityTaskId(null);
      else setNewStatusTaskId(null);
    };
    const submit = async () => {
      if (!name.trim()) return;
      const created = await create(kind, name.trim(), color);
      if (created) {
        await updateField(
          tasks.find((t) => t.id === taskId)!,
          kind === "priority" ? "priority" : "status",
          created.value,
        );
        close();
        if (isPriority) setNewPriorityName("");
        else setNewStatusName("");
      }
    };
    return (
      <div className="space-y-2 rounded-md border border-border p-2">
        <Input
          placeholder={`${kind} name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="h-8 text-xs"
        />
        <ColorPicker
          value={color}
          onChange={setColor}
          label="Colour"
          swatches={SWATCHES}
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={submit} disabled={!name.trim()}>
            Add
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  return (
    <TaskOptionsProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-foreground/10 bg-background/25 p-0.5 backdrop-blur-sm">
            {VIEWS.map((item) => (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={view === item.id ? "secondary" : "ghost"}
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={() => setView(item.id)}
              >
                <HugeiconsIcon icon={item.icon} className="size-3.5" />
                {item.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Select value={groupBy} onValueChange={(v) => v && setGroupBy(v)}>
              <SelectTrigger className="h-7 text-xs w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="sm"
              className="h-7 rounded-md bg-white px-2.5 text-xs font-medium text-black hover:bg-gray-100 cursor-pointer dark:bg-white dark:text-black dark:hover:bg-white/85"
              onClick={openCreate}
            >
              <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
              Add task
            </Button>
          </div>
        </div>
        {tasks.length === 0 ? (
          <p className="rounded-md border border-dashed border-foreground/15 px-3 py-8 text-center text-sm text-muted-foreground">
            No tasks yet — add the first one.
          </p>
        ) : view === "list" ? (
          <div className="overflow-x-auto bg-transparent rounded-lg p-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-foreground/10 text-left text-xs font-medium text-white rounded-lg">
                  <SortHeader field="title" label="Task" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="assignee" label="Assignee" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="assigned_to" label="Assigned to" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="priority" label="Priority" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="status" label="Status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="due" label="Due" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-2 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((group) => (
                  <Fragment key={group.key ?? 'ungrouped'}>
                    {group.key && groupBy !== "none" ? (
                      <tr key={`group-${group.key}`}>
                        <td
                          colSpan={7}
                          className="bg-muted/50 px-3 py-1.5 text-xs font-semibold"
                        >
                          {group.key} ({group.items.length})
                        </td>
                      </tr>
                    ) : null}
                    {group.items.map((task) => (
                      <tr
                        key={task.id}
                        className="border-b border-foreground/5 align-top transition-colors"
                      >
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            onClick={() => openDetails(task)}
                            className="text-left font-medium hover:underline whitespace-pre-line"
                          >
                            {normalizeNewlines(task.title)}
                          </button>

                          {task.subtasks.length > 0 ? (
                            <ul className="mt-6 space-y-1 pl-5">
                              {task.subtasks.map((subtask) => (
                                <li key={subtask.id} className="flex items-center gap-2">
                                  <Checkbox
                                    checked={subtask.done}
                                    aria-label={normalizeNewlines(subtask.title)}
                                    className="size-4 cursor-pointer"
                                    onCheckedChange={(checked) =>
                                      toggleSubtask(task, subtask.id, checked)
                                    }
                                  />
                                  <span
                                    className={cn(
                                      "text-xs",
                                      subtask.done
                                        ? "text-muted-foreground line-through"
                                        : "text-white",
                                    )}
                                  >
                                    {normalizeNewlines(subtask.title)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            value={task.assignee}
                            onChange={(e) => updateField(task, "assignee", e.target.value)}
                            className="h-8 text-xs"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            value={task.assigned_to}
                            onChange={(e) => updateField(task, "assigned_to", e.target.value)}
                            className="h-8 text-xs"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          {newPriorityTaskId === task.id ? (
                            renderNewOptionForm("priority", task.id)
                          ) : (
                            <Select
                              value={task.priority}
                              onValueChange={async (value) => {
                                if (!value) return;
                                if ((value as string) === "__new__") {
                                  setNewPriorityTaskId(task.id);
                                  setNewPriorityName("");
                                  setNewPriorityColor("#1971c2");
                                } else {
                                  await updateField(task, "priority", value);
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs w-full">
                                <SelectValue>
                                  <span className="flex items-center gap-2">
                                    <span
                                      className="size-2 rounded-full"
                                      style={{ backgroundColor: priorityColor(task.priority) }}
                                    />
                                    {priorityName(task.priority)}
                                  </span>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {byKind("priority").map((option) => (
                                  <SelectItem key={option.id} value={option.value}>
                                    <span className="flex items-center gap-2">
                                      <span
                                        className="size-2 rounded-full"
                                        style={{ backgroundColor: option.color }}
                                      />
                                      {option.name}
                                    </span>
                                  </SelectItem>
                                ))}
                                <SelectItem value="__new__">
                                  <span className="flex items-center gap-2 text-muted-foreground">
                                    <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                                    Add custom priority
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {newStatusTaskId === task.id ? (
                            renderNewOptionForm("status", task.id)
                          ) : (
                            <Select
                              value={task.status}
                              onValueChange={async (value) => {
                                if (!value) return;
                                if ((value as string) === "__new__") {
                                  setNewStatusTaskId(task.id);
                                  setNewStatusName("");
                                  setNewStatusColor("#1971c2");
                                } else {
                                  await updateField(task, "status", value);
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs w-full">
                                <SelectValue>
                                  <span className="flex items-center gap-2">
                                    <span
                                      className="size-2 rounded-full"
                                      style={{ backgroundColor: statusColor(task.status) }}
                                    />
                                    {statusName(task.status)}
                                  </span>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {byKind("status").map((option) => (
                                  <SelectItem key={option.id} value={option.value}>
                                    <span className="flex items-center gap-2">
                                      <span
                                        className="size-2 rounded-full"
                                        style={{ backgroundColor: option.color }}
                                      />
                                      {option.name}
                                    </span>
                                  </SelectItem>
                                ))}
                                <SelectItem value="__new__">
                                  <span className="flex items-center gap-2 text-muted-foreground">
                                    <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                                    Add custom status
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="date"
                            value={task.due_date ? task.due_date.slice(0, 10) : ""}
                            onChange={(e) => updateField(task, "due_date", e.target.value || null)}
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          {task.subtasks.length > 0 ? (
                            <div className="flex items-center gap-2">
                              <Progress value={task.progress} className="h-1.5 w-20" />
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {task.progress}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : view === "board" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statusOptions.map((statusOption) => {
              const status = statusOption.value;
              const column = byStatus(status);

              return (
                <div
                  key={status}
                  className="glass-subtle flex min-h-[200px] flex-col gap-2 rounded-md p-2"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    const t = tasks.find((x) => x.id === id);
                    if (t && t.status !== status) {
                      void updateField(t, "status", status);
                    }
                  }}
                >
                  <div className="flex items-center justify-between px-1">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: statusOption.color }}
                    >
                      {statusOption.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {column.length}
                    </span>
                  </div>

                  {column.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">Nothing here</p>
                  ) : (
                    column.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", task.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => openDetails(task)}
                        className="space-y-2 rounded-md border border-foreground/10 bg-background/30 p-2.5 text-left backdrop-blur-sm transition-colors hover:bg-accent"
                      >
                        <span className="block truncate text-sm font-medium">
                          {normalizeNewlines(task.title)}
                        </span>

                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="capitalize">{task.priority}</span>
                          {formatDue(task.due_date) ? (
                            <span>{formatDue(task.due_date)}</span>
                          ) : null}
                        </div>

                        {task.subtasks.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <Progress value={task.progress} className="h-1.5" />
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {task.progress}%
                            </span>
                          </div>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                Previous
              </Button>
              <span className="text-sm font-medium">
                {month.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
              >
                Next
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="py-1">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {daysInGrid.map((date) => {
                const key = monthKey(date);
                const dayTasks = tasksByDay.get(key) ?? [];
                const isCurrentMonth = date.getMonth() === month.getMonth();

                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-[92px] space-y-1 rounded-md border border-border p-1.5 text-left",
                      !isCurrentMonth && "opacity-40",
                    )}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      const t = tasks.find((x) => x.id === id);
                      if (t) {
                        const newDate = `${date.getFullYear()}-${String(
                          date.getMonth() + 1,
                        ).padStart(2, "0")}-${String(date.getDate()).padStart(
                          2,
                          "0",
                        )}`;
                        if (t.due_date?.slice(0, 10) !== newDate) {
                          void updateField(t, "due_date", newDate);
                        }
                      }
                    }}
                  >
                    <span className="text-xs text-muted-foreground">
                      {date.getDate()}
                    </span>

                    {dayTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", task.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => openDetails(task)}
                        className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-bold text-white"
                        style={{
                          backgroundColor: statusColor(task.status),
                        }}
                      >
                        {normalizeNewlines(task.title)}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <CreateTaskFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projectId={projectId}
          onSaved={handleSaved}
        />
        <TaskDetailsDialog
          key={detailsTask?.id ?? "details"}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          task={detailsTask}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      </div>
    </TaskOptionsProvider>
  );
}
