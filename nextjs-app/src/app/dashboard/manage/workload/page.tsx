"use client";

import { useEffect, useState } from "react";
import {
  UsersIcon,
  Task01Icon,
  Timer01Icon,
  CheckCircle,
  AlertTriangle,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { SectionCard, EmptyRow } from "@/components/space-section-card";
import { useToast } from "@/components/ui/toast";

interface WorkloadData {
  stats: { total: number; inProgress: number; completed: number; overdue: number };
  members: Array<{
    email: string;
    name: string;
    role: string;
    assigned: number;
    inProgress: number;
    completed: number;
    overdue: number;
    workload: number;
    avatar: string;
  }>;
  unassigned: Array<{
    id: string;
    title: string;
    priority: string;
    status?: string;
    tag: string;
    date: string;
    projectName?: string;
    project_id?: string;
    due_date?: string | null;
    created_at?: string;
    assigned_to?: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    created_at: string;
    projectName?: string;
    project_id?: string;
    assigned_to?: string;
    assignee?: string;
  }>;
  projects?: Array<{ id: string; name: string; space_id: string }>;
  capacityPct?: number;
  updatedAt?: string;
}

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};
const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function StatCard({
  value,
  label,
  icon,
}: {
  value: string | number;
  label: string;
  icon: IconSvgElement;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 transition-all hover:bg-white/10">
      <div className="flex items-center gap-2 mb-2">
        <div className="size-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
          <HugeiconsIcon icon={icon} className="size-4" />
        </div>
        <span className="text-white/80 text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const normalized = (priority || "Medium").toLowerCase();
  const styles: Record<string, string> = {
    high: "bg-red-500/20 text-red-400 border border-red-500/30",
    urgent: "bg-red-500/20 text-red-400 border border-red-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    low: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${styles[normalized] || styles.medium}`}
    >
      {PRIORITY_LABELS[normalized] || priority || "Medium"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = (status || "todo").toLowerCase();
  const styles: Record<string, string> = {
    todo: "bg-gray-100 text-gray-600 border border-gray-200",
    in_progress: "bg-blue-100 text-blue-600 border border-blue-200",
    review: "bg-purple-100 text-purple-600 border border-purple-200",
    done: "bg-emerald-100 text-emerald-600 border border-emerald-200",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${styles[normalized]}`}
    >
      {STATUS_LABELS[normalized] || status}
    </span>
  );
}

export default function WorkloadPage() {
  const [data, setData] = useState<WorkloadData | null>(null);
  const [timeFilter, setTimeFilter] = useState("All");
  const [projectFilter, setProjectFilter] = useState("All Projects");
  const [assigneeFilter, setAssigneeFilter] = useState("All Members");
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [myEmail, setMyEmail] = useState("");
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dRes, meRes] = await Promise.all([
          fetch("/api/workload", { cache: "no-store" }),
          fetch("/api/auth/me", { cache: "no-store" }),
        ]);
        if (dRes.ok && !cancelled) setData((await dRes.json()) as WorkloadData);
        if (meRes.ok && !cancelled) {
          const me = (await meRes.json()) as { email: string };
          setMyEmail(me.email || "");
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div className="p-4 lg:p-6 min-h-screen">
        <SectionCard
          title="Workload"
          description="Loading…"
          icon={Task01Icon}
          className="lg:col-span-6"
        >
          <EmptyRow label="Loading workload data…" />
        </SectionCard>
      </div>
    );
  }

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);

  interface TaskItem {
    id: string;
    title: string;
    status?: string;
    priority: string;
    due_date?: string | null;
    created_at?: string;
    projectName?: string;
    project_id?: string;
    assigned_to?: string;
    assignee?: string;
  }

  const taskDate = (t: TaskItem) => new Date(t.due_date || t.created_at || new Date().toISOString()).getTime();
  const inRange = (t: TaskItem) => {
    const d = taskDate(t);
    if (timeFilter === "This Week") return d >= startOfWeek.getTime() && d <= endOfWeek.getTime();
    if (timeFilter === "This Month") return d >= startOfMonth.getTime() && d <= endOfMonth.getTime();
    return true;
  };
  const matchesProject = (t: TaskItem) =>
    projectFilter === "All Projects" || t.projectName === projectFilter;
  const matchesAssignee = (t: TaskItem) => {
    const a = (t.assigned_to || t.assignee || "").toLowerCase();
    if (assigneeFilter === "All Members") return true;
    return a === assigneeFilter.toLowerCase();
  };
  const mineOnly = (t: TaskItem) => {
    if (!myTasksOnly) return true;
    return (t.assigned_to || t.assignee || "").toLowerCase() === myEmail.toLowerCase();
  };

  const filteredTasks = data.tasks.filter(
    (t) => inRange(t) && matchesProject(t) && matchesAssignee(t) && mineOnly(t),
  );

  const allProjectNames = Array.from(
    new Set([
      ...(data.projects?.map((p) => p.name) || []),
      ...data.tasks.map((t) => t.projectName).filter(Boolean),
    ]),
  ).sort();

  // Recompute members with dynamic counts under active filters
  const members = data.members
    .map((m) => {
      const mtasks = data.tasks.filter(
        (t) =>
          ((t.assigned_to || t.assignee || "").toLowerCase() === m.email.toLowerCase()) &&
          inRange(t) &&
          matchesProject(t) &&
          mineOnly(t),
      );
      const completed = mtasks.filter((t) => t.status === "done").length;
      const inProgress = mtasks.filter((t) => t.status === "in_progress").length;
      const overdue = mtasks.filter((t) => {
        if (!t.due_date) return false;
        const due = new Date(t.due_date);
        due.setHours(0, 0, 0, 0);
        const todayZero = new Date();
        todayZero.setHours(0, 0, 0, 0);
        return due < todayZero && t.status !== "done";
      }).length;
      // Workload %: share of team's assigned tasks this member carries
      const pct = data.stats.total ? Math.round((mtasks.length / data.stats.total) * 100) : 0;
      return { ...m, assigned: mtasks.length, inProgress, completed, overdue, workload: pct };
    })
    .sort((a, b) => b.workload - a.workload);

  const filteredUnassigned = data.unassigned.filter(
    (t) => inRange(t) && matchesProject(t) && matchesAssignee(t) && mineOnly(t),
  );

  // Chart: weekly task distribution (Mon..Sun)
  const weekly: Record<string, number> = {};
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((d) => (weekly[d] = 0));
  for (const t of filteredTasks) {
    weekly[taskWeekday(t)] = (weekly[taskWeekday(t)] ?? 0) + 1;
  }
  const maxWeekly = Math.max(...Object.values(weekly), 1);

  function taskWeekday(t: TaskItem): string {
    const d = new Date(t.due_date || t.created_at || new Date().toISOString());
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  }

  // Bulk assign
  const handleBulkAssign = async () => {
    if (!assignTo || bulkSelected.size === 0) return;
    try {
      await Promise.all(
        Array.from(bulkSelected).map((id) =>
          fetch(`/api/tasks/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assigned_to: assignTo }),
          }),
        ),
      );
      toast({ title: "Tasks assigned", description: `${bulkSelected.size} task(s) assigned to ${assignTo}` });
      setBulkSelected(new Set());
      setAssignTo("");
      const fres = await fetch("/api/workload", { cache: "no-store" });
      if (fres.ok) setData((await fres.json()) as WorkloadData);
    } catch {
      toast({ title: "Assign failed", description: "Could not assign tasks" });
    }
  };

  const toggleBulk = (id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-4 lg:p-6 md:mt-10 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:col-span-6">
        <div className="flex items-center gap-2 mb-2 lg:mb-0">
          <h1 className="text-2xl font-bold text-white">Workload</h1>
        </div>
      </div>

      {/* Stat cards row (dynamic) */}
      <SectionCard
        title="Overview"
        description="Key workload metrics at a glance"
        icon={Task01Icon}
        className="lg:col-span-6"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-2">
          <StatCard value={data.stats.total} label="Total tasks" icon={Task01Icon} />
          <StatCard value={data.stats.inProgress} label="In progress" icon={Timer01Icon} />
          <StatCard value={data.stats.completed} label="Completed" icon={CheckCircle} />
          <StatCard value={data.stats.overdue} label="Overdue" icon={AlertTriangle} />
          <StatCard value={data.members.length} label="Team members" icon={UsersIcon} />
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-6">
        {/* Team Workload */}
        <SectionCard
          title="Team Workload"
          description="Workload share per member"
          icon={UsersIcon}
          className="lg:col-span-6 text-white"
          action={
            <div className="flex items-center gap-2">
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="rounded-lg bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400 px-3 py-2 w-[120px]"
              >
                <option className="bg-zinc-900 text-white">All</option>
                <option className="bg-zinc-900 text-white">This Week</option>
                <option className="bg-zinc-900 text-white">This Month</option>
              </select>
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="rounded-lg bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400 px-3 py-2 w-[110px]"
              >
                <option className="bg-zinc-900 text-white">All Projects</option>
                {allProjectNames.map((p) => (
                  <option className="bg-zinc-900 text-white" key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse mt-2 table-fixed">
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[20%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[6%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead>
                <tr className="text-white/50 text-[10px] uppercase border-b border-white/10">
                  <th className="pb-2 pl-2 font-medium">Member</th>
                  <th className="pb-2 font-medium">Workload</th>
                  <th className="pb-2 font-medium text-center">Tasks</th>
                  <th className="pb-2 font-medium text-center">In&nbsp;Prog</th>
                  <th className="pb-2 font-medium text-center">Done</th>
                  <th className="pb-2 font-medium text-center">Overdue</th>
                  <th className="pb-2 font-medium pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isMyTasks = myTasksOnly && m.email.toLowerCase() !== myEmail.toLowerCase();
                  if (isMyTasks) return null;
                  return (
                    <tr
                      key={m.email}
                      className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => setSelectedMember(selectedMember === m.email ? null : m.email)}
                    >
                      <td className="py-2.5 pl-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center font-bold text-[10px] text-white border border-white/20 bg-white/10">{m.avatar}</div>
                          <div className="min-w-0">
                            <p className="text-white text-xs font-medium leading-tight truncate">{m.name}</p>
                            <p className="text-white/40 text-[10px] truncate">{m.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-white/10 min-w-0">
                            <div
                              className="h-1.5 rounded-full bg-emerald-400 transition-all"
                              style={{ width: `${Math.min(m.workload, 100)}%` }}
                            />
                          </div>
                          <span className="text-white/60 text-[10px] shrink-0 w-7 text-right">{m.workload}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-white text-sm text-center">{m.assigned}</td>
                      <td className="py-2.5 text-white text-sm text-center">{m.inProgress}</td>
                      <td className="py-2.5 text-white text-sm text-center">{m.completed}</td>
                      <td className="py-2.5 text-center">
                        {m.overdue > 0 ? (
                          <span className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[10px] font-medium">
                            {m.overdue}
                          </span>
                        ) : (
                          <span className="text-white/30 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMember(m.email);
                          }}
                          className="text-white/50 hover:text-emerald-400 transition-colors text-[10px] font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selectedMember && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white font-semibold text-sm">Tasks for {members.find((m) => m.email === selectedMember)?.name}</p>
                <button
                  onClick={() => setSelectedMember(null)}
                  className="text-emerald-400 text-[10px] hover:text-emerald-300"
                >
                  Close
                </button>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {data.tasks
                  .filter(
                    (t) =>
                      (t.assigned_to || t.assignee || "").toLowerCase() ===
                      selectedMember!.toLowerCase(),
                  )
                  .map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 p-2 rounded border border-white/10 hover:bg-white/5">
                      <p className="text-white text-sm truncate">{t.title}</p>
                      <StatusBadge status={t.status} />
                      <span className="text-white/50 text-[10px]">{t.due_date || "No due date"}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Unassigned Tasks */}
        <SectionCard
          title="Unassigned Tasks"
          description={`Tasks without an owner (${filteredUnassigned.length})`}
          icon={Task01Icon}
          className="lg:col-span-4 text-white"
        >
          <div className="space-y-2 mt-2">
            {filteredUnassigned.length === 0 ? (
              <EmptyRow label="No unassigned tasks" />
            ) : (
              filteredUnassigned.map((task, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-xl border border-white/10 hover:bg-white/5 transition-colors group">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={bulkSelected.has(task.id)}
                      onChange={() => toggleBulk(task.id)}
                      className="rounded border-white/30 text-emerald-400 focus:ring-emerald-400 bg-transparent"
                    />
                    <p className="text-white text-sm leading-tight">{task.title}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={task.priority} />
                    <span className="bg-white/10 text-white/80 border border-white/20 text-[10px] px-2 py-1">{task.tag}</span>
                    <span className="text-white/50 text-[10px]">{task.date}</span>
                    <button className="p-1 text-white/40 hover:text-white transition-colors" aria-label="More options">
                      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" /></svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        {/* Quick Assign */}
        <SectionCard
          title="Quick Assign"
          description="Assign a task to a teammate"
          icon={CheckCircle}
          className="lg:col-span-2 text-white"
        >
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-white/60 text-[10px] font-medium block mb-1">Task</label>
              <select
                id="assign-task-select"
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                className="w-full rounded-lg bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400 px-3 py-2"
              >
                <option className="bg-zinc-900 text-white" value="">Select task…</option>
                {filteredUnassigned.map((t) => (
                  <option className="bg-zinc-900 text-white" key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-[10px] font-medium block mb-1">Assign to</label>
              <select
                id="assign-assignee-select"
                className="w-full rounded-lg bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400 px-3 py-2"
              >
                <option className="bg-zinc-900 text-white" value="">Select member…</option>
                {members.map((m) => (
                  <option className="bg-zinc-900 text-white" key={m.email} value={m.email}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/50 text-[10px]">{bulkSelected.size} selected</span>
              {bulkSelected.size > 0 && (
                <button
                  onClick={handleBulkAssign}
                  disabled={!assignTo}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white text-black font-bold text-sm hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Assign
                </button>
              )}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
