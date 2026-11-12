"use client";

import { useCallback, useEffect, useState } from "react";
import {
  UsersIcon,
  Task01Icon,
  Timer01Icon,
  CheckCircle,
  AlertTriangle,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SectionCard, EmptyRow } from "@/components/space-section-card";

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

function StatCard({ value, label, icon }: { value: string; label: string; icon: any }) {
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
      className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
        styles[normalized] || styles.medium
      }`}
    >
      {priority || "Medium"}
    </span>
  );
}

export default function WorkloadPage() {
  const [data, setData] = useState<WorkloadData | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartTab, setChartTab] = useState<"Week" | "Month" | "Capacity">("Week");
  const [timeFilter, setTimeFilter] = useState("This Week");
  const [projectFilter, setProjectFilter] = useState("All Projects");
  const [assignTaskId, setAssignTaskId] = useState("");
  const [assignAssignee, setAssignAssignee] = useState("");
  const [assignDueDate, setAssignDueDate] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await fetch("/api/workload", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const d = (await res.json()) as WorkloadData;
        setData(d);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      if (!isBackground) setData(null);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  // Initial fetch + real-time interval polling across all projects
  useEffect(() => {
    void loadData();
    const interval = setInterval(() => {
      void loadData(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (!data) {
    return (
      <div className="p-4 lg:p-6 min-h-screen">
        <SectionCard
          title="Workload"
          description="Connecting to all projects…"
          icon={Task01Icon}
          className="lg:col-span-6"
        >
          <EmptyRow label="Loading live workload data across all projects…" />
        </SectionCard>
      </div>
    );
  }

  // Filter calculations
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = now.getDay();
  // Monday as start of week
  const diffToMonday = day === 0 ? -6 : 1 - day;
  startOfWeek.setDate(now.getDate() + diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const taskDate = (t: any) => new Date(t.due_date || t.created_at).getTime();

  const inRange = (t: any) => {
    const d = taskDate(t);
    if (timeFilter === "This Week") {
      return d >= startOfWeek.getTime() && d <= endOfWeek.getTime();
    }
    if (timeFilter === "This Month") {
      return d >= startOfMonth.getTime() && d <= endOfMonth.getTime();
    }
    return true;
  };

  const matchesProject = (t: any) =>
    projectFilter === "All Projects" || t.projectName === projectFilter;

  const filteredTasks = data.tasks.filter((t) => inRange(t) && matchesProject(t));

  // Dynamic project options collected from tasks and projects array
  const allProjectNames = Array.from(
    new Set([
      ...(data.projects?.map((p) => p.name) || []),
      ...data.tasks.map((t) => t.projectName).filter(Boolean),
    ]),
  ).sort() as string[];

  // Filtered members with dynamic live workload
  const members = data.members
    .map((m) => {
      const mtasks = data.tasks.filter(
        (t) =>
          ((t.assigned_to || t.assignee || "").toLowerCase() === m.email.toLowerCase()) &&
          inRange(t) &&
          matchesProject(t),
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
      const pct = mtasks.length ? Math.round((inProgress / mtasks.length) * 100) : 0;
      return { ...m, assigned: mtasks.length, inProgress, completed, overdue, workload: pct };
    })
    .sort((a, b) => b.assigned - a.assigned);

  const filteredUnassigned = data.unassigned.filter((t) => inRange(t) && matchesProject(t));

  // --- Dynamic Chart Trend Calculations ---
  // 1. Weekly breakdown (Mon -> Sun)
  const lineDays = [
    { key: "Mon", label: "Mon", full: "Monday" },
    { key: "Tue", label: "Tue", full: "Tuesday" },
    { key: "Wed", label: "Wed", full: "Wednesday" },
    { key: "Thu", label: "Thu", full: "Thursday" },
    { key: "Fri", label: "Fri", full: "Friday" },
    { key: "Sat", label: "Sat", full: "Saturday" },
    { key: "Sun", label: "Sun", full: "Sunday" },
  ];

  const weeklyCounts: Record<string, number> = {
    Mon: 0,
    Tue: 0,
    Wed: 0,
    Thu: 0,
    Fri: 0,
    Sat: 0,
    Sun: 0,
  };

  const dayNamesOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (const t of filteredTasks) {
    const rawDate = t.due_date || t.created_at;
    if (!rawDate) continue;
    const d = new Date(rawDate);
    const dayName = dayNamesOrder[d.getDay()];
    if (dayName && weeklyCounts[dayName] !== undefined) {
      weeklyCounts[dayName] += 1;
    }
  }

  // 2. Monthly breakdown (W1 -> W4)
  const monthlyCounts: Record<string, number> = { W1: 0, W2: 0, W3: 0, W4: 0 };
  for (const t of filteredTasks) {
    const rawDate = t.due_date || t.created_at;
    if (!rawDate) continue;
    const d = new Date(rawDate);
    const dayOfMonth = d.getDate();
    if (dayOfMonth <= 7) monthlyCounts.W1 += 1;
    else if (dayOfMonth <= 14) monthlyCounts.W2 += 1;
    else if (dayOfMonth <= 21) monthlyCounts.W3 += 1;
    else monthlyCounts.W4 += 1;
  }

  // 3. Dynamic chart points based on active tab
  let chartItems: Array<{ label: string; full: string; value: number }> = [];
  if (chartTab === "Week") {
    chartItems = lineDays.map((d) => ({
      label: d.label,
      full: d.full,
      value: weeklyCounts[d.key] ?? 0,
    }));
  } else if (chartTab === "Month") {
    chartItems = [
      { label: "W1", full: "Week 1 (1st - 7th)", value: monthlyCounts.W1 },
      { label: "W2", full: "Week 2 (8th - 14th)", value: monthlyCounts.W2 },
      { label: "W3", full: "Week 3 (15th - 21st)", value: monthlyCounts.W3 },
      { label: "W4", full: "Week 4 (22nd - End)", value: monthlyCounts.W4 },
    ];
  }

  const rawMax = Math.max(...chartItems.map((i) => i.value), 0);
  // Ensure the top tick is always clean and non-repeating (minimum 4 so mid is 2 and 0)
  const chartMax = Math.max(rawMax, 4);
  const midTick = Math.ceil(chartMax / 2);

  // Dynamic capacity metric
  const activeTasksTotal = filteredTasks.filter((t) => t.status === "in_progress").length;
  const totalTasksCount = filteredTasks.length;
  const dynamicCapacity =
    totalTasksCount > 0
      ? Math.min(100, Math.round((activeTasksTotal / totalTasksCount) * 100))
      : 0;

  const capacityStatus = (() => {
    if (dynamicCapacity === 0 && totalTasksCount === 0) {
      return {
        label: "Ready",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dotClass: "bg-emerald-400",
        description: "No pending or bottleneck tasks across projects.",
      };
    }
    if (dynamicCapacity <= 40) {
      return {
        label: "Light",
        badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        dotClass: "bg-blue-400",
        description: `Workload is light across ${members.length || 1} team member(s).`,
      };
    }
    if (dynamicCapacity <= 75) {
      return {
        label: "Balanced",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        dotClass: "bg-emerald-400",
        description: `Workload is within recommended range across ${members.length || 1} team member(s).`,
      };
    }
    return {
      label: "Heavy",
      badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      dotClass: "bg-amber-400",
      description: "High volume of active work. Consider rebalancing assignments.",
    };
  })();

  // Quick Assign Handler
  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveTaskId = assignTaskId || filteredUnassigned[0]?.id;
    const effectiveAssignee = assignAssignee || members[0]?.email;
    if (!effectiveTaskId || !effectiveAssignee) return;

    setAssigning(true);
    try {
      const res = await fetch(`/api/tasks/${effectiveTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_to: effectiveAssignee,
          assignee: effectiveAssignee,
          due_date: assignDueDate || undefined,
        }),
      });
      if (res.ok) {
        setAssignTaskId("");
        setAssignDueDate("");
        await loadData();
      }
    } catch (err) {
      console.error("Assign failed", err);
    } finally {
      setAssigning(false);
    }
  };

  // Toggle Task Status
  const handleToggleDone = async (taskId: string, currentStatus?: string) => {
    const nextStatus = currentStatus === "done" ? "todo" : "done";
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      console.error("Status update failed", err);
    }
  };

  const selectClasses =
    "w-full rounded-lg bg-black/40 border border-white/20 text-white text-xs sm:text-sm focus:outline-none focus:border-emerald-400 px-3 py-2 transition-colors";

  return (
    <div className="p-4 lg:p-6 space-y-6 md:mt-11 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 lg:col-span-6">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold text-white tracking-tight">Workload</h1>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 text-white border border-white/10 text-xs font-medium">
            Overview
          </span>
        </div>

        {/* Real-time Indicator & Refresh */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live · Realtime</span>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            title={lastRefreshed ? `Updated at ${lastRefreshed.toLocaleTimeString()}` : "Refresh"}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/10 transition-colors"
          >
            <HugeiconsIcon
              icon={Clock01Icon}
              className={`size-3.5 text-white/80 ${loading ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <SectionCard
        title="Overview"
        description="Key workload metrics across all active projects"
        icon={Task01Icon}
        className="lg:col-span-6"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
          <StatCard value={String(filteredTasks.length)} label="Total tasks" icon={Task01Icon} />
          <StatCard value={String(activeTasksTotal)} label="In progress" icon={Timer01Icon} />
          <StatCard
            value={String(filteredTasks.filter((t) => t.status === "done").length)}
            label="Completed"
            icon={CheckCircle}
          />
          <StatCard
            value={String(
              filteredTasks.filter((t) => {
                if (!t.due_date) return false;
                const due = new Date(t.due_date);
                due.setHours(0, 0, 0, 0);
                const todayZero = new Date();
                todayZero.setHours(0, 0, 0, 0);
                return due < todayZero && t.status !== "done";
              }).length,
            )}
            label="Overdue"
            icon={AlertTriangle}
          />
          <StatCard value={String(members.length)} label="Team members" icon={UsersIcon} />
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-6">
        {/* Team Workload Table */}
        <SectionCard
          title="Team Workload"
          description="Task distribution by member"
          icon={UsersIcon}
          className="lg:col-span-4 text-white"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="rounded-lg bg-black/40 border border-white/20 text-white text-xs px-2.5 py-1.5 focus:outline-none focus:border-emerald-400"
              >
                <option className="bg-slate-900 text-white" value="This Week">
                  This Week
                </option>
                <option className="bg-slate-900 text-white" value="This Month">
                  This Month
                </option>
                <option className="bg-slate-900 text-white" value="All Time">
                  All Time
                </option>
              </select>

              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="rounded-lg bg-black/40 border border-white/20 text-white text-xs px-2.5 py-1.5 focus:outline-none focus:border-emerald-400"
              >
                <option className="bg-slate-900 text-white" value="All Projects">
                  All Projects
                </option>
                {allProjectNames.map((p) => (
                  <option key={p} className="bg-slate-900 text-white" value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse mt-2">
              <thead>
                <tr className="text-white/50 text-[10px] uppercase border-b border-white/10 tracking-wider">
                  <th className="pb-2.5 pl-2 font-medium">Member</th>
                  <th className="pb-2.5 font-medium">Assigned</th>
                  <th className="pb-2.5 font-medium">In Progress</th>
                  <th className="pb-2.5 font-medium">Completed</th>
                  <th className="pb-2.5 font-medium">Overdue</th>
                  <th className="pb-2.5 font-medium pr-2">Workload</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-white/50 text-xs">
                      No team members with assigned tasks in this filter.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => {
                    const overdueNode =
                      m.overdue > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-medium">
                          <span className="size-1.5 rounded-full bg-red-400" />
                          {m.overdue}
                        </span>
                      ) : (
                        <span className="text-white/40 text-[11px]">{m.overdue}</span>
                      );

                    return (
                      <tr
                        key={m.email}
                        className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 pl-2">
                          <div className="flex items-center gap-2.5">
                            <div className="size-7 rounded-full bg-white/10 flex items-center justify-center font-bold text-[10px] text-white border border-white/20">
                              {m.avatar}
                            </div>
                            <div className="min-w-0">
                              <p className="text-white text-xs sm:text-sm font-medium leading-tight truncate">
                                {m.name}
                              </p>
                              <p className="text-white/40 text-[10px] truncate capitalize">{m.role}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-white text-xs sm:text-sm">{m.assigned}</td>
                        <td className="py-3 text-white text-xs sm:text-sm">{m.inProgress}</td>
                        <td className="py-3 text-white text-xs sm:text-sm">{m.completed}</td>
                        <td className="py-3">{overdueNode}</td>
                        <td className="py-3 pr-2 min-w-[100px]">
                          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                              style={{ width: `${m.workload}%` }}
                            />
                          </div>
                          <div className="flex justify-end mt-1">
                            <span className="text-white/60 text-[10px] font-mono">{m.workload}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Workload Overview Chart (FIXED & RESPONSIVE) */}
        <SectionCard
          title="Workload Overview"
          description={
            chartTab === "Week"
              ? "Weekly task workload trend"
              : chartTab === "Month"
                ? "Monthly task distribution by week"
                : "Team capacity breakdown"
          }
          icon={Timer01Icon}
          className="lg:col-span-2 text-white"
          action={
            <div className="flex bg-white/10 rounded-lg p-0.5 border border-white/10">
              {(["Week", "Month", "Capacity"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setChartTab(t)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    chartTab === t
                      ? "bg-white text-slate-950 font-semibold shadow-sm"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          }
        >
          {chartTab === "Capacity" ? (
            /* Capacity View */
            <div className="h-48 w-full flex flex-col justify-between py-2 overflow-y-auto space-y-2.5 pr-1">
              {members.length === 0 ? (
                <div className="h-full flex items-center justify-center text-white/50 text-xs">
                  No active team workload yet.
                </div>
              ) : (
                members.slice(0, 5).map((m) => (
                  <div key={m.email} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate text-white/90 font-medium">{m.name}</span>
                      <span className="text-white/60 font-mono text-[11px]">
                        {m.assigned} task{m.assigned === 1 ? "" : "s"} · {m.workload}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          m.workload > 80
                            ? "bg-amber-400"
                            : m.workload > 0
                              ? "bg-emerald-400"
                              : "bg-white/30"
                        }`}
                        style={{ width: `${Math.max(m.workload, 6)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Clean Responsive Bar Chart for Week / Month */
            <div className="h-48 w-full flex flex-col justify-between pt-2">
              <div className="flex-1 flex gap-2.5 relative">
                {/* Clean Y-axis non-repeating labels */}
                <div className="flex flex-col justify-between text-[11px] text-white/40 font-mono select-none w-4 text-right">
                  <span>{chartMax}</span>
                  <span>{midTick}</span>
                  <span>0</span>
                </div>

                {/* Chart body with gridlines */}
                <div className="flex-1 relative flex items-end">
                  {/* Grid lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    <div className="w-full border-b border-white/10" />
                    <div className="w-full border-b border-white/10" />
                    <div className="w-full border-b border-white/10" />
                  </div>

                  {/* Bars container */}
                  <div className="relative z-10 w-full h-full flex items-end justify-around px-1 gap-1.5 sm:gap-2">
                    {chartItems.map((item) => {
                      const heightPercent =
                        chartMax > 0 ? Math.min(100, Math.round((item.value / chartMax) * 100)) : 0;
                      return (
                        <div
                          key={item.label}
                          className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer"
                        >
                          {/* Hover Tooltip */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-950/95 text-white text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-30 border border-white/20">
                            {item.full}: {item.value} task{item.value === 1 ? "" : "s"}
                          </div>

                          {/* Bar track column */}
                          <div className="w-full max-w-[26px] h-full flex items-end rounded-t-md overflow-hidden bg-white/5 hover:bg-white/10 transition-colors">
                            <div
                              className="w-full bg-white hover:bg-emerald-400 transition-all duration-300 rounded-t-sm"
                              style={{
                                height: `${heightPercent}%`,
                                minHeight: item.value > 0 ? "5px" : "0px",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Crisp X-axis labels below bars */}
              <div className="flex pl-6 pr-1 justify-around text-center mt-2">
                {chartItems.map((item) => (
                  <span
                    key={item.label}
                    className="flex-1 text-[11px] font-medium text-white/60 hover:text-white transition-colors"
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic Team Capacity Summary Card */}
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-[10px] uppercase tracking-wider font-semibold">
                  Team Capacity
                </p>
                <p className="text-xl font-bold text-white tracking-tight">{dynamicCapacity}%</p>
                <p className="text-white/50 text-[10px]">Average workload ratio</p>
              </div>
              <span
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border ${capacityStatus.badgeClass}`}
              >
                <span className={`size-1.5 rounded-full ${capacityStatus.dotClass}`} />
                {capacityStatus.label}
              </span>
            </div>
            <p className="text-white/60 text-[11px] mt-1.5 leading-snug">
              {capacityStatus.description}
            </p>
          </div>
        </SectionCard>

        {/* Unassigned Tasks Section */}
        <SectionCard
          title="Unassigned Tasks"
          description={`Tasks ready for assignment (${filteredUnassigned.length})`}
          icon={Task01Icon}
          className="lg:col-span-4 text-white"
        >
          <div className="space-y-2 mt-2 max-h-[300px] overflow-y-auto pr-1">
            {filteredUnassigned.length === 0 ? (
              <EmptyRow label="All tasks are assigned! No unassigned tasks found." />
            ) : (
              filteredUnassigned.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={task.status === "done"}
                      onChange={() => void handleToggleDone(task.id, task.status)}
                      title="Mark as completed"
                      className="size-4 rounded border-white/30 text-emerald-500 focus:ring-emerald-400 bg-transparent cursor-pointer"
                    />
                    <div className="min-w-0">
                      <p className="text-white text-xs sm:text-sm font-medium leading-snug truncate">
                        {task.title}
                      </p>
                      {task.projectName && (
                        <p className="text-[10px] text-white/50 truncate">Project: {task.projectName}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <PriorityBadge priority={task.priority} />
                    <span className="bg-white/10 text-white/80 border border-white/20 text-[10px] px-2 py-0.5 rounded">
                      {task.tag}
                    </span>
                    <span className="text-white/50 text-[11px] font-mono">{task.date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        {/* Quick Assign Section */}
        <SectionCard
          title="Quick Assign"
          description="Directly assign an unassigned task"
          icon={CheckCircle}
          className="lg:col-span-2 text-white"
        >
          <form onSubmit={handleAssign} className="space-y-3 mt-2">
            <div>
              <label htmlFor="assign-task-select" className="text-white/60 text-[11px] font-medium block mb-1">
                Select Task
              </label>
              <select
                id="assign-task-select"
                value={assignTaskId}
                onChange={(e) => setAssignTaskId(e.target.value)}
                disabled={filteredUnassigned.length === 0}
                className={selectClasses}
              >
                {filteredUnassigned.length === 0 ? (
                  <option className="bg-slate-900 text-white">No unassigned tasks</option>
                ) : (
                  filteredUnassigned.map((t) => (
                    <option key={t.id} className="bg-slate-900 text-white" value={t.id}>
                      {t.title} {t.projectName ? `(${t.projectName})` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label htmlFor="assign-assignee-select" className="text-white/60 text-[11px] font-medium block mb-1">
                Assign to Teammate
              </label>
              <select
                id="assign-assignee-select"
                value={assignAssignee}
                onChange={(e) => setAssignAssignee(e.target.value)}
                disabled={members.length === 0}
                className={selectClasses}
              >
                {members.length === 0 ? (
                  <option className="bg-slate-900 text-white">No team members</option>
                ) : (
                  members.map((m) => (
                    <option key={m.email} className="bg-slate-900 text-white" value={m.email}>
                      {m.name} ({m.assigned} tasks)
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label htmlFor="assign-due-date" className="text-white/60 text-[11px] font-medium block mb-1">
                Due date (Optional)
              </label>
              <input
                id="assign-due-date"
                type="date"
                value={assignDueDate}
                onChange={(e) => setAssignDueDate(e.target.value)}
                className={selectClasses}
              />
            </div>

            <button
              type="submit"
              disabled={assigning || filteredUnassigned.length === 0 || members.length === 0}
              className="w-full bg-white text-slate-950 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>{assigning ? "Assigning..." : "Assign Task"}</span>
            </button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
