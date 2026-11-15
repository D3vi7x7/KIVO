"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Comment01Icon,
  Send,
  Task01Icon,
  UsersIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { SectionCard, EmptyRow } from "@/components/space-section-card";
import { useToast } from "@/components/ui/toast";

type Comment = {
  id: string;
  task_id: string | null;
  project_id: string | null;
  parent_id: string | null;
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
  status: string;
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

function renderContent(content: string): React.ReactNode {
  // Highlight @mentions
  const parts = content.split(/(@\S+)/);
  return (
    <span className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.startsWith("@") && part.length > 1 ? (
          <span key={i} className="text-emerald-400 font-semibold underline underline-offset-2">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
}

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [content, setContent] = useState("");
  const [selectedFilterProjectId, setSelectedFilterProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [formProjectId, setFormProjectId] = useState<string>("");
  const [formTaskId, setFormTaskId] = useState<string>("");
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [myEmail, setMyEmail] = useState("");
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const PAGE_SIZE = 20;

  const loadComments = useCallback(
    async (pageNum = 1, append = false) => {
      try {
        const query = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String((pageNum - 1) * PAGE_SIZE),
        });
        if (selectedTaskId) query.set("task_id", selectedTaskId);
        if (selectedFilterProjectId) query.set("project_id", selectedFilterProjectId);

        const res = await fetch(`/api/comments?${query}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as Comment[];
          if (append) {
            setComments((prev) => [...prev, ...data]);
          } else {
            setComments(data);
          }
          setHasMore(data.length === PAGE_SIZE);
          if (pageNum === 1) setPage(1);
        }
      } catch {
        // ignore
      }
    },
    [selectedTaskId, selectedFilterProjectId],
  );

  // Effect 1: Load user and projects
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const [meRes, pRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/projects", { cache: "no-store" }),
        ]);
        if (meRes.ok && !cancelled) {
          const me = (await meRes.json()) as { email: string };
          setMyEmail(me.email || "");
        }
        if (pRes.ok && !cancelled) {
          const pList = (await pRes.json()) as Project[];
          setProjects(pList);
          if (pList.length > 0) {
            setFormProjectId(pList[0].id);
          }
        }
      } catch {
        // ignore
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Effect 2: Load tasks when projects change
  useEffect(() => {
    let cancelled = false;
    const loadTasks = async () => {
      try {
        const allTasks: TaskWithProject[] = [];
        for (const p of projects) {
          try {
            const tr = await fetch(`/api/projects/${p.id}/tasks`, {
              cache: "no-store",
            });
            if (tr.ok) {
              const ts = (await tr.json()) as Array<{
                id: string;
                title: string;
                project_id: string;
                status: string;
              }>;
              for (const t of ts) {
                allTasks.push({ ...t, project_name: p.name });
              }
            }
          } catch {
            // ignore
          }
        }
        allTasks.sort((a, b) => {
          const aDone = a.status === "done";
          const bDone = b.status === "done";
          if (aDone && !bDone) return 1;
          if (!aDone && bDone) return -1;
          return 0;
        });
        if (!cancelled) setTasks(allTasks);
      } catch {
        // ignore
      }
    };
    if (projects.length > 0) {
      loadTasks();
    }
    return () => {
      cancelled = true;
    };
  }, [projects]);

  // Effect 3: Reload comments when filter changes
  useEffect(() => {
    const reload = async () => {
      setLoading(true);
      await loadComments(1, false);
      setLoading(false);
    };
    reload();
  }, [loadComments]);

  const topLevelComments = comments.filter((c) => !c.parent_id);
  const repliesByParent = comments.reduce<Record<string, Comment[]>>(
    (acc, c) => {
      if (c.parent_id) {
        (acc[c.parent_id] ??= []).push(c);
      }
      return acc;
    },
    {},
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const taskObj = tasks.find((t) => t.id === formTaskId);
      const chosenProjectId = taskObj ? taskObj.project_id : (formProjectId || projects[0]?.id || undefined);

      const res = await fetch("/api/comments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          task_id: formTaskId || undefined,
          project_id: chosenProjectId,
        }),
      });

      if (res.ok) {
        setContent("");
        if (textareaRef.current) textareaRef.current.value = "";
        await loadComments(1, false);
        toast({ title: "Comment posted", description: "Your comment was added" });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Post failed",
          description: err.detail || "Could not post comment",
        });
      }
    } catch {
      toast({ title: "Post failed", description: "Could not post comment" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = async (parentId: string, parentTaskId: string | null) => {
    const text = replyContent[parentId];
    if (!text?.trim()) return;

    try {
      const parentComment = comments.find((c) => c.id === parentId);
      const replyTaskId = parentTaskId || parentComment?.task_id || undefined;
      const taskObj = tasks.find((t) => t.id === replyTaskId);
      const replyProjectId = parentComment?.project_id || taskObj?.project_id || projects[0]?.id || undefined;

      const res = await fetch("/api/comments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text.trim(),
          task_id: replyTaskId,
          project_id: replyProjectId,
          parent_id: parentId,
        }),
      });

      if (res.ok) {
        setReplyContent((prev) => ({ ...prev, [parentId]: "" }));
        setReplyingTo(null);
        await loadComments(1, false);
        toast({ title: "Reply posted", description: "Your reply was added" });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Reply failed",
          description: err.detail || "Could not post reply",
        });
      }
    } catch {
      toast({ title: "Reply failed", description: "Could not post reply" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setComments((prev) => prev.filter((c) => c.id !== id && c.parent_id !== id));
        setReplyingTo(null);
        toast({ title: "Comment deleted" });
      } else {
        toast({ title: "Delete failed", description: "Could not delete comment" });
      }
    } catch {
      toast({ title: "Delete failed", description: "Could not delete comment" });
    }
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    setPage((p) => p + 1);
    loadComments(page + 1, true);
  };

  // Filter tasks based on selected form project
  const formTaskOptions = tasks
    .filter((t) => !formProjectId || t.project_id === formProjectId)
    .map((t) => ({
      value: t.id,
      label: `${t.title} ${t.status === "done" ? "(done)" : ""}`,
    }));

  return (
    <div className="p-4 lg:p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:col-span-6">
        <div className="flex items-center gap-2 mb-2 lg:mb-0">
          <h1 className="text-2xl font-bold text-white">Comments</h1>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-6">
        {/* Comments list */}
        <SectionCard
          title="Comments"
          description={`Task discussion (${topLevelComments.length})`}
          icon={Comment01Icon}
          className="lg:col-span-4 text-white"
          action={
            <div className="flex items-center gap-2">
              <select
                value={selectedFilterProjectId ?? "all"}
                onChange={(e) => {
                  const val = e.target.value === "all" ? null : e.target.value;
                  setSelectedFilterProjectId(val);
                  setSelectedTaskId(null);
                }}
                className="rounded-lg bg-black/40 border border-white/20 text-white text-xs focus:outline-none focus:border-emerald-400 px-2.5 py-1.5 w-[140px]"
              >
                <option className="bg-zinc-900 text-white" value="all">All Projects</option>
                {projects.map((p) => (
                  <option className="bg-zinc-900 text-white" key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedTaskId ?? "all"}
                onChange={(e) =>
                  setSelectedTaskId(e.target.value === "all" ? null : e.target.value)
                }
                className="rounded-lg bg-black/40 border border-white/20 text-white text-xs focus:outline-none focus:border-emerald-400 px-2.5 py-1.5 w-[180px]"
              >
                <option className="bg-zinc-900 text-white" value="all">All tasks</option>
                {tasks
                  .filter((t) => !selectedFilterProjectId || t.project_id === selectedFilterProjectId)
                  .map((o) => (
                    <option className="bg-zinc-900 text-white" key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
              </select>
            </div>
          }
        >
          {loading ? (
            <EmptyRow label="Loading comments…" />
          ) : topLevelComments.length === 0 ? (
            <EmptyRow label="No comments found. Post one below!" />
          ) : (
            <div className="space-y-3 mt-2">
              {topLevelComments.map((c) => {
                const isMine = c.author_email === myEmail;
                const isReplying = replyingTo === c.id;
                const task = tasks.find((t) => t.id === c.task_id);
                const project = projects.find((p) => p.id === c.project_id);

                return (
                  <div
                    key={c.id}
                    className="flex gap-3 p-4 rounded-xl bg-white/5 text-white border border-white/10 hover:bg-white/10 transition-colors group"
                  >
                    <div className={`flex items-center justify-center size-9 rounded-full ${isMine ? "bg-emerald-500 text-white" : "bg-white/10 text-white/80"} flex-shrink-0`}>
                      <span className="text-[11px] font-bold">
                        {avatarInitials(c.author_email)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                        <span className="text-white/90 text-sm font-medium truncate">
                          {c.author_email.split("@")[0]}
                        </span>
                        <span className="text-white/40 text-[10px]">
                          {relativeTime(c.created_at)}
                        </span>
                        {task ? (
                          <span className="bg-white/10 text-white/80 border border-white/15 text-[10px] px-1.5 py-0.5 rounded">
                            {task.title}
                          </span>
                        ) : project ? (
                          <span className="bg-white/10 text-white/60 border border-white/15 text-[10px] px-1.5 py-0.5 rounded">
                            {project.name}
                          </span>
                        ) : null}
                        {task && task.status === "done" && (
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-1.5 py-0.5 rounded">
                            done
                          </span>
                        )}
                        {isMine ? (
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="text-white/30 hover:text-red-400 transition-colors p-1 ml-auto"
                            aria-label="Delete comment"
                          >
                            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        ) : null}
                      </div>

                      <div className="mb-2">
                        {renderContent(c.content)}
                      </div>

                      {/* Replies */}
                      {repliesByParent[c.id]?.map((r) => (
                        <div
                          key={r.id}
                          className="ml-6 sm:ml-10 mt-2 pl-3 sm:pl-4 border-l-2 border-white/10 space-y-1"
                        >
                          <div className="flex gap-2">
                            <div className="flex items-center justify-center size-7 rounded-full bg-white/10 text-white/80 flex-shrink-0">
                              <span className="text-[10px] font-bold">
                                {avatarInitials(r.author_email)}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-1 mb-0.5">
                                <span className="text-white/80 text-xs font-medium">
                                  {r.author_email.split("@")[0]}
                                </span>
                                <span className="text-white/40 text-[9px]">
                                  {relativeTime(r.created_at)}
                                </span>
                                {r.author_email === myEmail ? (
                                  <button
                                    onClick={() => handleDelete(r.id)}
                                    className="text-white/30 hover:text-red-400 transition-colors p-1 ml-auto text-[10px]"
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                              <div className="text-[13px]">
                                {renderContent(r.content)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

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
                              className="flex-1 rounded border border-white/20 bg-black/40 text-white text-[12px] px-2 py-1.5 focus:outline-none focus:border-emerald-500 placeholder:text-white/40"
                              placeholder="Write a reply…"
                            ></textarea>
                            <button
                              onClick={() => handleReply(c.id, c.task_id)}
                              disabled={!(replyContent[c.id] ?? "").trim()}
                              className="px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap self-end"
                            >
                              Reply
                            </button>
                            <button
                              onClick={() => setReplyingTo(null)}
                              className="px-3 py-1.5 text-white/50 text-[11px] hover:text-white self-end"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setReplyingTo(c.id)}
                            className="text-emerald-400 text-[11px] font-medium hover:text-emerald-300 underline whitespace-nowrap"
                          >
                            Reply
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {hasMore && (
                <button
                  onClick={loadMore}
                  className="w-full py-2 text-center text-emerald-400 text-xs font-medium hover:bg-white/10 rounded-lg transition-colors"
                >
                  Load more comments
                </button>
              )}
            </div>
          )}
        </SectionCard>

        {/* Add comment form */}
        <SectionCard
          title="Add comment"
          description="Comment on a task or project"
          icon={Comment01Icon}
          className="lg:col-span-2 text-white"
        >
          <form onSubmit={handleSubmit} className="space-y-3 mt-2">
            <div>
              <label className="text-white/60 text-[10px] font-medium block mb-1">
                Project
              </label>
              <select
                value={formProjectId}
                onChange={(e) => {
                  setFormProjectId(e.target.value);
                  setFormTaskId("");
                }}
                className="w-full rounded-lg bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400 px-3 py-2"
              >
                {projects.map((p) => (
                  <option className="bg-zinc-900 text-white" key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-white/60 text-[10px] font-medium block mb-1">
                Task (optional)
              </label>
              <select
                value={formTaskId}
                onChange={(e) => setFormTaskId(e.target.value)}
                className="w-full rounded-lg bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400 px-3 py-2"
              >
                <option className="bg-zinc-900 text-white" value="">General project comment</option>
                {formTaskOptions.map((o) => (
                  <option className="bg-zinc-900 text-white" key={o.value} value={o.value}>{o.label}</option>
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
                className="w-full rounded-lg bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400 px-3 py-2 placeholder:text-white/30"
                placeholder="Write a comment…"
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={!content.trim() || isSubmitting}
              className="w-full bg-white text-black px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <HugeiconsIcon icon={Send} className="size-4" />
              {isSubmitting ? "Posting…" : "Add comment"}
            </button>
          </form>

          <div className="mt-4 p-3 rounded-lg border border-white/10 bg-white/5 text-white/70 text-[11px]">
            <p className="mb-1 font-semibold text-white/90">Tip:</p>
            <p className="mb-0">
              Use <span className="text-emerald-400 font-mono">@name</span> to mention a teammate in your comment.
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
