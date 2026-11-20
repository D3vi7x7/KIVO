"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Add01Icon,
  Delete02Icon,
  KanbanIcon,
  Search01Icon,
  SparklesIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type Board = {
  id: string;
  name: string;
  description: string;
  space_id: string | null;
  project_id: string | null;
  owner: string;
  members: Array<{ email: string; role: string }>;
  background: string;
  element_count: number;
  created_at: string;
  updated_at: string;
};

type Space = { id: string; name: string };
type Project = { id: string; name: string };

export default function BoardsPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New board form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [background, setBackground] = useState("sunlit");

  const { toast } = useToast();

  const loadBoards = async () => {
    try {
      setLoading(true);
      const [bRes, sRes, pRes] = await Promise.all([
        fetch("/api/boards", { cache: "no-store" }),
        fetch("/api/spaces", { cache: "no-store" }),
        fetch("/api/projects", { cache: "no-store" }),
      ]);

      if (bRes.ok) setBoards(await bRes.json());
      if (sRes.ok) setSpaces(await sRes.json());
      if (pRes.ok) setProjects(await pRes.json());
    } catch {
      toast({ title: "Error", description: "Failed to load boards" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoards();
  }, []);

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          space_id: spaceId || undefined,
          project_id: projectId || undefined,
          background,
        }),
      });

      if (res.ok) {
        const newBoard = await res.json();
        setBoards((prev) => [newBoard, ...prev]);
        setIsCreateOpen(false);
        setName("");
        setDescription("");
        setSpaceId("");
        setProjectId("");
        toast({ title: "Board created", description: `"${newBoard.name}" is ready!` });
      } else {
        toast({ title: "Creation failed", description: "Could not create board" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBoard = async (id: string, boardName: string) => {
    if (!confirm(`Delete board "${boardName}"? This action cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/boards/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setBoards((prev) => prev.filter((b) => b.id !== id));
        toast({ title: "Board deleted" });
      } else {
        toast({ title: "Delete failed", description: "Could not delete board" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete board" });
    }
  };

  const filteredBoards = boards.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 lg:p-8 space-y-6 mt-0 md:mt-7 min-h-screen text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">Boards</h1>
          </div>
          <p className="text-white/60 text-sm">
            Infinite collaborative moodboards for brainstorms, links, media, and notes.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="md:mr-11 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-emerald-400 transition-colors shadow-lg shadow-white/5 shrink-0"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          New Board
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="w-1/2 flex flex-col sm:flex-row gap-3 items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-3 backdrop-blur-md">
        <div className="relative w-full sm:w-100">
          <HugeiconsIcon icon={Search01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/40" />
          <input
            type="text"
            placeholder="Search boards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400 placeholder:text-white/30"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-white/60 self-end sm:self-auto">
          <span>{filteredBoards.length} {filteredBoards.length === 1 ? "board" : "boards"}</span>
        </div>
      </div>

      {/* Boards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-52 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
          ))}
        </div>
      ) : filteredBoards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 rounded-3xl border border-dashed border-white/15 bg-white/5 text-center">
          <div className="size-12 rounded-2xl bg-white/10 flex items-center justify-center text-white/80 mb-3">
            <HugeiconsIcon icon={KanbanIcon} className="size-6" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No boards found</h3>
          <p className="text-white/50 text-sm max-w-sm mb-5">
            Create an infinite canvas moodboard to collect links, photos, videos, and collaborative sticky notes.
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black font-semibold text-sm hover:bg-emerald-400 transition-colors"
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Create Your First Board
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredBoards.map((board) => {
            const space = spaces.find((s) => s.id === board.space_id);
            const project = projects.find((p) => p.id === board.project_id);

            return (
              <div
                key={board.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all duration-200 overflow-hidden shadow-lg backdrop-blur-md"
              >
                {/* Visual Canvas Thumbnail Preview */}
                <Link
                  href={`/dashboard/boards/${board.id}`}
                  className="block h-32 w-full relative border-b border-white/10 overflow-hidden cursor-pointer"
                  style={{
                    backgroundColor: board.background === "sunlit" || !board.background ? "#1c3829" : "#18181b",
                  }}
                >
                  {/* Grid background simulation */}
                  <div
                    className="absolute inset-0 opacity-40"
                    style={{
                      backgroundImage:
                        board.background === "dots"
                          ? "radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)"
                          : board.background === "plain"
                            ? "none"
                            : "linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)",
                      backgroundSize: "20px 20px",
                    }}
                  />

                  {/* Miniature moodboard mock chips */}
                  <div className="absolute inset-0 p-4 flex items-center justify-center gap-2 pointer-events-none">
                    <div className="w-16 h-12 rounded-lg bg-emerald-500/20 border border-emerald-500/40 transform -rotate-3 flex items-center justify-center text-[10px] text-emerald-300 font-medium shadow-md">
                      Note
                    </div>
                    <div className="w-20 h-16 rounded-lg bg-sky-500/20 border border-sky-500/40 transform rotate-2 flex items-center justify-center text-[10px] text-sky-300 font-medium shadow-md">
                      Media
                    </div>
                    <div className="w-14 h-14 rounded-lg bg-purple-500/20 border border-purple-500/40 transform -rotate-6 flex items-center justify-center text-[10px] text-purple-300 font-medium shadow-md">
                      Link
                    </div>
                  </div>

                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/15 text-[10px] text-white/80">
                    <HugeiconsIcon icon={ViewIcon} className="size-3" />
                    <span>{board.element_count} items</span>
                  </div>
                </Link>

                {/* Board Info Content */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Link
                        href={`/dashboard/boards/${board.id}`}
                        className="text-base font-semibold text-white hover:text-emerald-400 transition-colors line-clamp-1"
                      >
                        {board.name}
                      </Link>

                      <button
                        onClick={() => handleDeleteBoard(board.id, board.name)}
                        className="text-white/30 hover:text-red-400 transition-colors p-1"
                        title="Delete board"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                      </button>
                    </div>

                    <p className="text-white/50 text-xs line-clamp-2 mb-3">
                      {board.description || "No description provided."}
                    </p>
                  </div>

                  {/* Badges / Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[11px] text-white/40">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {space && (
                        <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/80 border border-white/15">
                          {space.name}
                        </span>
                      )}
                      {project && (
                        <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/70 border border-white/15">
                          {project.name}
                        </span>
                      )}
                    </div>

                    <span>{new Date(board.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Board Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Moodboard</DialogTitle>
            <DialogDescription>
              Create an infinite multiplayer canvas for your team's visual assets and ideas.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateBoard} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-white/70 block mb-1">Board Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Brand Redesign Moodboard"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400 placeholder:text-white/30"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-white/70 block mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of what this canvas is for…"
                rows={2}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400 placeholder:text-white/30 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-white/70 block mb-1">Space (Optional)</label>
                <select
                  value={spaceId}
                  onChange={(e) => setSpaceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400"
                >
                  <option className="bg-zinc-900 text-white" value="">None (Standalone)</option>
                  {spaces.map((s) => (
                    <option className="bg-zinc-900 text-white" key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-white/70 block mb-1">Project (Optional)</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400"
                >
                  <option className="bg-zinc-900 text-white" value="">None</option>
                  {projects.map((p) => (
                    <option className="bg-zinc-900 text-white" key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-white/70 block mb-1">Canvas Background Surface</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "sunlit", label: "🌿 Sunlit Cutting Mat (Default)" },
                  { id: "dots", label: "Dot Matrix" },
                  { id: "grid", label: "Square Grid" },
                  { id: "plain", label: "Clean Plain" },
                ].map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setBackground(bg.id)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${background === bg.id
                      ? "bg-emerald-500/20 border-emerald-400 text-white"
                      : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                      }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 rounded-xl border border-white/20 text-white/70 text-sm hover:text-white hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isSubmitting}
                className="px-4 py-2 rounded-xl bg-white text-black font-semibold text-sm hover:bg-emerald-400 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Creating…" : "Create Board"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
