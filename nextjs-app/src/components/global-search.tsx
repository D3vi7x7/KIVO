"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any>({ projects: [], tasks: [], resources: [] });
  const router = useRouter();
  useEffect(() => {
    if (!q.trim()) { setResults({ projects: [], tasks: [], resources: [] }); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const has = results.projects.length || results.tasks.length || results.resources.length;
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="glass h-9 w-64 rounded-md border border-border px-3 text-sm text-white dark:text-white placeholder:text-white/60 dark:placeholder:text-white/60" />
      {q && has ? (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/15 bg-zinc-950/95 backdrop-blur-xl p-2 shadow-2xl z-50 space-y-1">
          {results.projects.map((p: any) => (
            <button key={p.id} className="block w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-white/90 hover:bg-white/15 hover:text-white transition-colors cursor-pointer" onClick={() => { router.push(`/dashboard/spaces/${p.spaceId}/projects/${p.id}`); setQ(""); }}>
              Project: {p.name}
            </button>
          ))}
          {results.tasks.map((t: any) => (
            <button key={t.id} className="block w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-white/90 hover:bg-white/15 hover:text-white transition-colors cursor-pointer" onClick={() => { router.push(`/dashboard/spaces/${t.spaceId}/projects/${t.projectId}?task=${t.id}`); setQ(""); }}>
              Task: {t.title}
            </button>
          ))}
          {results.resources.map((r: any) => (
            <button key={r.id} className="block w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-white/90 hover:bg-white/15 hover:text-white transition-colors cursor-pointer" onClick={() => { router.push(`/dashboard/spaces/${r.spaceId}/projects/${r.projectId}?resource=${r.id}`); setQ(""); }}>
              Resource: {r.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
