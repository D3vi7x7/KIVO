"use client";

import {
  Add01Icon,
  Delete02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as Sentry from "@sentry/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/color-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTaskOptions } from "@/hooks/use-task-options";
import { SWATCHES } from "@/components/color-picker";
import type { ProjectMember, Subtask, Task } from "@/lib/projects";

let subtaskSeq = 0;

function newSubtask(title = ""): Subtask {
  subtaskSeq += 1;
  return { id: `new-${Date.now()}-${subtaskSeq}`, title, done: false };
}

const NEW_OPTION_VALUE = "__new__";

export interface TaskDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  projectMembers?: ProjectMember[];
  onSaved: (task: Task) => void;
  onDeleted?: (taskId: string) => void;
}

export function TaskDetailsDialog({
  open,
  onOpenChange,
  task,
  projectMembers,
  onSaved,
  onDeleted,
}: TaskDetailsDialogProps) {
  const { options, byKind, create } = useTaskOptions();

  const priorityOptions = byKind("priority");
  const statusOptions = byKind("status");

  const [members, setMembers] = useState<ProjectMember[]>(projectMembers || []);

  useEffect(() => {
    if (open && task?.project_id) {
      if (projectMembers && projectMembers.length > 0) {
        setMembers(projectMembers);
      } else {
        void fetch(`/api/projects/${task.project_id}/members`, {
          cache: "no-store",
        })
          .then((res) => res.json())
          .then((data) => {
            if (Array.isArray(data)) setMembers(data);
          })
          .catch(() => {});
      }
    }
  }, [open, task?.project_id, projectMembers]);

  const assignableMembers = members.filter((m) => m.status === "accepted");

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [assignee, setAssignee] = useState(task?.assignee ?? "");
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to ?? "");
  const [priority, setPriority] = useState<string>(task?.priority ?? "medium");
  const [status, setStatus] = useState<string>(task?.status ?? "todo");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? []);

  const [creatingPriority, setCreatingPriority] = useState(false);
  const [newPriorityName, setNewPriorityName] = useState("");
  const [newPriorityColor, setNewPriorityColor] = useState("#1971c2");

  const [creatingStatus, setCreatingStatus] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#1971c2");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = subtasks.filter((item) => item.done).length;
  const progress = subtasks.length
    ? Math.round((done / subtasks.length) * 100)
    : 0;

  const save = async () => {
    if (!title.trim()) {
      setError("Give the task a title");
      return;
    }
    if (!task) {
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      title: title.trim(),
      description,
      assignee,
      assigned_to: assignedTo,
      priority,
      status,
      due_date: dueDate || null,
      subtasks: subtasks.map((item) => ({
        id: item.id,
        title: item.title,
        done: item.done,
      })),
    };

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || "Failed to save the task");
      }

      onSaved(data as Task);
      onOpenChange(false);
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Failed to save the task");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!task) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || "Failed to delete the task");
      }

      onDeleted?.(task.id);
      onOpenChange(false);
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Failed to delete the task");
    } finally {
      setSaving(false);
    }
  };

  const createPriority = async () => {
    if (!newPriorityName.trim()) return;
    const created = await create(
      "priority",
      newPriorityName.trim(),
      newPriorityColor,
    );
    if (created) {
      setPriority(created.value);
      setNewPriorityName("");
      setCreatingPriority(false);
    }
  };

  const createStatus = async () => {
    if (!newStatusName.trim()) return;
    const created = await create("status", newStatusName.trim(), newStatusColor);
    if (created) {
      setStatus(created.value);
      setNewStatusName("");
      setCreatingStatus(false);
    }
  };

  const priorityColor = (value: string) =>
    options.find((o) => o.kind === "priority" && o.value === value)?.color ??
    "#868e96";
  const statusColor = (value: string) =>
    options.find((o) => o.kind === "status" && o.value === value)?.color ??
    "#868e96";

  const optionSelect = ({
    value,
    onValueChange,
    optionsList,
    creating,
    setCreating,
    setValue,
    createOption,
    newName,
    setNewName,
    newColor,
    setNewColor,
    label,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    optionsList: typeof priorityOptions;
    creating: boolean;
    setCreating: (v: boolean) => void;
    setValue: (v: string) => void;
    createOption: () => Promise<void>;
    newName: string;
    setNewName: (v: string) => void;
    newColor: string;
    setNewColor: (v: string) => void;
    label: "priority" | "status";
  }) => {
    const color =
      label === "priority"
        ? priorityColor(value)
        : statusColor(value);
    const name =
      label === "priority"
        ? priorityOptions.find((o) => o.value === value)?.name ?? value
        : statusOptions.find((o) => o.value === value)?.name ?? value;

    return (
      <div className="space-y-2">
        <Label>{label === "priority" ? "Priority" : "Status"}</Label>
        <Select
          value={value}
          onValueChange={(next) => {
            if (!next) return;
            if (next === NEW_OPTION_VALUE) {
              setCreating(true);
            } else {
              setValue(next);
              onValueChange(next);
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              <span className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {name}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {optionsList.map((option) => (
              <SelectItem key={option.id} value={option.value}>
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: option.color }}
                  />
                  {option.name}
                </span>
              </SelectItem>
            ))}
            <SelectItem value={NEW_OPTION_VALUE}>
              <span className="flex items-center gap-2 text-muted-foreground">
                <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
                Add custom {label}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {creating ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <Input
              placeholder={`${label} name`}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              autoFocus
            />
            <ColorPicker
              value={newColor}
              onChange={setNewColor}
              label="Colour"
              swatches={SWATCHES}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={createOption}
                disabled={!newName.trim()}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Task details</DialogTitle>
          <DialogDescription>
            View and edit the task.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-4">
          <div className="space-y-2">
            <Label htmlFor="task-details-title">Title</Label>
            <Input
              id="task-details-title"
              placeholder="What needs doing?"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-details-description">Description</Label>
            <Textarea
              id="task-details-description"
              placeholder="Add more detail"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Assignee (Who is doing it)</Label>
              <Select
                value={assignee || "__unassigned__"}
                onValueChange={(val) =>
                  setAssignee(val === "__unassigned__" || !val ? "" : val)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">
                    <span className="text-muted-foreground">Unassigned</span>
                  </SelectItem>
                  {assignableMembers.map((m) => (
                    <SelectItem key={m.email} value={m.email}>
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{m.email}</span>
                        <span className="text-[10px] text-muted-foreground capitalize">
                          ({m.role})
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                  {assignee &&
                    !assignableMembers.some((m) => m.email === assignee) && (
                      <SelectItem value={assignee}>
                        <span className="truncate">{assignee}</span>
                      </SelectItem>
                    )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assigned to (Who it is waiting on)</Label>
              <Select
                value={assignedTo || "__unassigned__"}
                onValueChange={(val) =>
                  setAssignedTo(val === "__unassigned__" || !val ? "" : val)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">
                    <span className="text-muted-foreground">Unassigned</span>
                  </SelectItem>
                  {assignableMembers.map((m) => (
                    <SelectItem key={m.email} value={m.email}>
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{m.email}</span>
                        <span className="text-[10px] text-muted-foreground capitalize">
                          ({m.role})
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                  {assignedTo &&
                    !assignableMembers.some((m) => m.email === assignedTo) && (
                      <SelectItem value={assignedTo}>
                        <span className="truncate">{assignedTo}</span>
                      </SelectItem>
                    )}
                </SelectContent>
              </Select>
            </div>

            {optionSelect({
              value: priority,
              onValueChange: setPriority,
              optionsList: priorityOptions,
              creating: creatingPriority,
              setCreating: setCreatingPriority,
              setValue: setPriority,
              createOption: createPriority,
              newName: newPriorityName,
              setNewName: setNewPriorityName,
              newColor: newPriorityColor,
              setNewColor: setNewPriorityColor,
              label: "priority",
            })}

            {optionSelect({
              value: status,
              onValueChange: setStatus,
              optionsList: statusOptions,
              creating: creatingStatus,
              setCreating: setCreatingStatus,
              setValue: setStatus,
              createOption: createStatus,
              newName: newStatusName,
              setNewName: setNewStatusName,
              newColor: newStatusColor,
              setNewColor: setNewStatusColor,
              label: "status",
            })}

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="task-details-due">Due date</Label>
              <Input
                id="task-details-due"
                type="date"
                value={dueDate ? dueDate.slice(0, 10) : ""}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Checklist</Label>
              <span className="text-xs text-muted-foreground">
                {done}/{subtasks.length} done · {progress}%
              </span>
            </div>

            <Progress value={progress} className="h-1.5" />

            <ul className="space-y-2">
              {subtasks.map((item, index) => (
                <li key={item.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={item.done}
                    aria-label={item.title}
                    onCheckedChange={(checked) => {
                      setSubtasks((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, done: Boolean(checked) } : entry,
                        ),
                      );
                    }}
                  />
                  <Input
                    value={item.title}
                    onChange={(event) => {
                      const next = event.target.value;
                      setSubtasks((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, title: next } : entry,
                        ),
                      );
                    }}
                    className="h-8"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Remove checklist item"
                    className="size-8 p-0 text-muted-foreground"
                    onClick={() =>
                      setSubtasks((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSubtasks((current) => [...current, newSubtask()])}
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              Add checklist item
            </Button>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <div className="border-t border-border flex gap-3 justify-end p-4">
          <Button
            type="button"
            variant="destructive"
            onClick={remove}
            disabled={saving}
            className="mr-auto"
          >
            Delete
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
