"use client";

import { useEffect, useRef, useState } from "react";
import {
  Comment01Icon,
  Send,
  Task01Icon,
  UsersIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { SectionCard, EmptyRow } from "@/components/space-section-card";

type Comment = {
  id: string;
  task_id: string | null;
  project_id: string | null;
  content: string;
  author_email: string;
  created_at: string;
};

type Project = { id: string; name: string };

type TaskWithProject = {
  id: string;
  title: string;
  project_id: string;
  project_name: string;
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

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const secs = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function avatarInitials(email: string): string {
  const name = email.split("@")[0];
  return name
    .split(/[\s._-]+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [content, setContent] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [myEmail, setMyEmail] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, pRes, meRes] = await Promise.all([
          fetch("/api/comments", { cache: "no-store" }),
          fetch("/api/projects", { cache: "no-store" }),
          fetch("/api/auth/me", { cache: "no-store" }),
        ]);
        if (cRes.ok && !cancelled) setComments((await cRes.json()) as Comment[]);
        if (pRes.ok && !cancelled) setProjects((await pRes.json()) as Project[]);
        if (meRes.ok && !cancelled) {
          const me = (await meRes.json()) as { email: string };
          setMyEmail(me.email || "");
        }
        // Load all tasks across projects the user belongs to
        if (pRes.ok && !cancelled) {
          const ps = (await pRes.json()) as Project[];
          const allTasks: TaskWithProject[] = [];
          for (const p of ps) {
            try {
              const tr = await fetch(`/api/projects/${p.id}/tasks`, {
                cache: "no-store",
              });
              if (tr.ok) {
                const ts = (await tr.json()) as Array<{
                  id: string;
                  title: string;
                  project_id: string;
                }>;
                for (const t of ts) {
                  allTasks.push({ ...t, project_name: p.name });
                }
              }
            } catch {
              // ignore per-project failures
            }
          }
          setTasks(allTasks);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Comments visible to this user: only comments on tasks in projects they belong to
  const visibleComments = comments.filter((c) =>
    c.task_id ? tasks.some((t) => t.id === c.task_id) : true,
  );

  const commentsForTask = visibleComments.filter(
    (c) => c.task_id === selectedTaskId,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          task_id: selectedTaskId || undefined,
          project_id:
            tasks.find((t) => t.id === selectedTaskId)?.project_id || undefined,
        }),
      });
      if (res.ok) {
        setContent("");
        textareaRef.current!.value = "";
        setSelectedTaskId(null);
        const fres = await fetch("/api/comments", { cache: "no-store" });
        if (fres.ok) setComments((await fres.json()) as Comment[]);
      }
    } catch {
      // ignore
    }
  };

  const handleReply = async (taskId: string) => {
    const text = replyContent[taskId];
    if (!text?.trim()) return;
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text.trim(),
          task_id: taskId,
          project_id:
            tasks.find((t) => t.id === taskId)?.project_id || undefined,
        }),
      });
      if (res.ok) {
        setReplyContent({ ...replyContent, [taskId]: "" });
        const fres = await fetch("/api/comments", { cache: "no-store" });
        if (fres.ok) setComments((await fres.json()) as Comment[]);
      }
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== id));
        setReplyingTo(null);
      }
    } catch {
      // ignore
    }
  };

  const taskOptions = tasks.map((t) => ({
    value: t.id,
    label: `${t.title} — ${t.project_name}`,
  }));

  return (
    <div className="p-4 lg:p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:col-span-6">
        <div className="flex items-center gap-2 mb-2 lg:mb-0">
          <h1 className="text-2xl font-bold text-white">Comments</h1>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/20 text-white border border-white/10 text-xs">
            Discuss
          </span>
        </div>
        <p className="text-white/60 text-sm">
          Discuss tasks across projects you belong to.
        </p>
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          value={visibleComments.length}
          label="Comments"
          icon={Comment01Icon}
        />
        <StatCard
          value={visibleComments.filter((c) => c.author_email === myEmail).length}
          label="Yours"
          icon={Task01Icon}
        />
        <StatCard value={projects.length} label="Projects" icon={UsersIcon} />
        <StatCard value={tasks.length} label="Tasks" icon={Task01Icon} />
        <StatCard
          value={new Set(visibleComments.map((c) => c.author_email)).size}
          label="Contributors"
          icon={Comment01Icon}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-6">
        {/* Comments list */}
        <SectionCard
          title="Comments"
          description={`Task discussion (${commentsForTask.length})`}
          icon={Comment01Icon}
          className="lg:col-span-6 text-white"
          action={
            <select
              value={selectedTaskId ?? "all"}
              onChange={(e) =>
                setSelectedTaskId(e.target.value === "all" ? null : e.target.value)
              }
              className="rounded-lg bg-white/20 border border-white/30 text-black text-sm focus:outline-none focus:border-emerald-400 px-3 py-2 w-[260px]"
            >
              <option value="all">All tasks</option>
              {taskOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          }
        >
          {loading ? (
            <EmptyRow label="Loading comments…" />
          ) : commentsForTask.length === 0 ? (
            <EmptyRow label="No comments on this task yet" />
          ) : (
            <div className="space-y-3 mt-2">
              {commentsForTask.map((c) => {
                const isMine = c.author_email === myEmail;
                const isReplying = replyingTo === c.id;
                return (
                  <div
                    key={c.id}
                    className="flex gap-3 p-4 rounded-xl bg-white text-black border border-gray-200 shadow-sm transition-colors group"
                  >
                    <div className={`flex items-center justify-center size-9 rounded-full ${isMine ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600"} flex-shrink-0`}>
                      <span className="text-[11px] font-bold">
                        {avatarInitials(c.author_email)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-gray-800 text-sm font-medium truncate">
                          {c.author_email.split("@")[0]}
                        </span>
                        <span className="text-gray-500 text-[10px]">
                          {relativeTime(c.created_at)}
                        </span>
                        {isMine ? (
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="text-gray-400 hover:text-gray-700 transition-colors p-1"
                            aria-label="Delete comment"
                          >
                            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        ) : null}
                      </div>
                      <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap mb-2">
                        {c.content}
                      </p>
                      {/* Reply input */}
                      <div className="flex gap-2 mt-2">
                        {isReplying ? (
                          <>
                            <textarea
                              value={replyContent[c.id] ?? ""}
                              onChange={(e) =>
                                setReplyContent({
                                  ...replyContent,
                                  [c.id]: e.target.value,
                                })
                              }
                              rows={2}
                              className="flex-1 rounded border border-gray-300 bg-white text-black text-[11px] px-2 py-1.5 focus:outline-none focus:border-emerald-500 placeholder:text-gray-400"
                              placeholder="Write a reply…"
                            ></textarea>
                            <button
                              onClick={() => handleReply(c.task_id ?? "")}
                              disabled={!(replyContent[c.id] ?? "").trim()}
                              className="px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-medium rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              Reply
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setReplyingTo(c.id)}
                            className="text-emerald-500 text-[11px] font-medium hover:text-emerald-600 underline whitespace-nowrap"
                          >
                            Reply
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Add comment form */}
        <SectionCard
          title="Add comment"
          description="Comment on a task"
          icon={Comment01Icon}
          className="lg:col-span-2 text-white"
        >
          <form onSubmit={handleSubmit} className="space-y-3 mt-2">
            <div>
              <label className="text-white/60 text-[10px] font-medium block mb-1">
                Task
              </label>
              <select
                value={selectedTaskId ?? ""}
                onChange={(e) => setSelectedTaskId(e.target.value || null)}
                className="w-full rounded-lg bg-white/20 border border-white/30 text-black text-sm focus:outline-none focus:border-emerald-400 px-3 py-2"
              >
                <option value="">General comment</option>
                {taskOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-[10px] font-medium block mb-1">
                Comment
              </label>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="w-full rounded-lg bg-white/20 border border-white/30 text-black text-sm focus:outline-none focus:border-emerald-400 px-3 py-2"
                placeholder="Write a comment…"
              ></textarea>
            </div>
            <button
              type="submit"
              disabled={!content.trim()}
              className="w-full bg-white text-black px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <HugeiconsIcon icon={Send} className="size-4" />
              Add comment
            </button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
