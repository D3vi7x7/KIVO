"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { TaskOption, TaskOptionKind } from "@/lib/task-options";
import { BUILTIN_OPTION_COLORS, BUILTIN_OPTION_NAMES } from "@/lib/task-options";

const BUILTIN_OPTIONS: TaskOption[] = [
  { id: "priority:low", kind: "priority", value: "low", name: "Low", color: BUILTIN_OPTION_COLORS.low, builtin: true },
  { id: "priority:medium", kind: "priority", value: "medium", name: "Medium", color: BUILTIN_OPTION_COLORS.medium, builtin: true },
  { id: "priority:high", kind: "priority", value: "high", name: "High", color: BUILTIN_OPTION_COLORS.high, builtin: true },
  { id: "priority:urgent", kind: "priority", value: "urgent", name: "Urgent", color: BUILTIN_OPTION_COLORS.urgent, builtin: true },
  { id: "status:todo", kind: "status", value: "todo", name: "To do", color: BUILTIN_OPTION_COLORS.todo, builtin: true },
  { id: "status:in_progress", kind: "status", value: "in_progress", name: "In progress", color: BUILTIN_OPTION_COLORS.in_progress, builtin: true },
  { id: "status:review", kind: "status", value: "review", name: "Review", color: BUILTIN_OPTION_COLORS.review, builtin: true },
  { id: "status:done", kind: "status", value: "done", name: "Done", color: BUILTIN_OPTION_COLORS.done, builtin: true },
];

interface TaskOptionsContextValue {
  options: TaskOption[];
  loading: boolean;
  byKind: (kind: TaskOptionKind) => TaskOption[];
  findOption: (kind: TaskOptionKind, value: string) => TaskOption | undefined;
  create: (kind: TaskOptionKind, name: string, color: string) => Promise<TaskOption | null>;
  remove: (id: string) => Promise<boolean>;
  reload: () => Promise<void>;
}

const TaskOptionsContext = createContext<TaskOptionsContextValue | null>(null);

export function TaskOptionsProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<TaskOption[]>(BUILTIN_OPTIONS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/task-options", { cache: "no-store" });
      if (!res || !res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        // Merge: keep built-ins, add custom ones
        setOptions([...BUILTIN_OPTIONS, ...data.filter((d: TaskOption) => !d.builtin)]);
      }
    } catch {
      // Fall back to built-ins
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(id);
  }, [load]);

  const byKind = useCallback(
    (kind: TaskOptionKind) => options.filter((option) => option.kind === kind),
    [options],
  );

  const findOption = useCallback(
    (kind: TaskOptionKind, value: string) =>
      options.find((option) => option.kind === kind && option.value === value),
    [options],
  );

  const create = useCallback(
    async (kind: TaskOptionKind, name: string, color: string) => {
      const res = await fetch("/api/task-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name, color }),
      });

      if (!res || !res.ok) {
        return null;
      }

      const created = (await res.json()) as TaskOption;
      setOptions((current) => [...current, created]);
      return created;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/task-options/${id}`, { method: "DELETE" });
    if (res && res.ok) {
      setOptions((current) => current.filter((option) => option.id !== id));
      return true;
    }
    return false;
  }, []);

  const value: TaskOptionsContextValue = {
    options,
    loading,
    byKind,
    findOption,
    create,
    remove,
    reload: load,
  };

  return (
    <TaskOptionsContext.Provider value={value}>
      {children}
    </TaskOptionsContext.Provider>
  );
}

export function useTaskOptions() {
  const ctx = useContext(TaskOptionsContext);
  if (!ctx) {
    throw new Error("useTaskOptions must be used within a TaskOptionsProvider");
  }
  return ctx;
}