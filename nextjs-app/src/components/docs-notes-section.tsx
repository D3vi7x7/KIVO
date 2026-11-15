"use client";

import {
  Add01Icon,
  Delete02Icon,
  Note01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { NoteEditor } from "@/components/note-editor";
import { EmptyRow, SectionCard } from "@/components/space-section-card";
import { Button } from "@/components/ui/button";
import { normalizeNewlines } from "@/lib/utils";
import type { Note } from "@/lib/notes";

export interface DocsNotesPanelProps {
  spaceId: string;
  projectId?: string | null;
  initialNotes?: Note[];
}

/**
 * The notes list and its editor, without the surrounding card. Use this when
 * the section is already wrapped in a card of its own.
 */
export function DocsNotesPanel({
  spaceId,
  projectId,
  initialNotes = [],
}: DocsNotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (note: Note) => {
    setEditing(note);
    setEditorOpen(true);
  };

  const handleSaved = (note: Note) => {
    setNotes((current) => {
      const existing = current.some((item) => item.id === note.id);
      return existing
        ? current.map((item) => (item.id === note.id ? note : item))
        : [note, ...current];
    });
  };

  const handleDeleted = (noteId: string) => {
    setNotes((current) => current.filter((item) => item.id !== noteId));
    setSelected((current) => current.filter((id) => id !== noteId));
  };

  const toggleSelected = (noteId: string) => {
    setSelected((current) =>
      current.includes(noteId)
        ? current.filter((id) => id !== noteId)
        : [...current, noteId],
    );
  };

  const stopSelecting = () => {
    setSelecting(false);
    setSelected([]);
  };

  const deleteSelected = async () => {
    if (selected.length === 0) {
      return;
    }

    setBusy(true);

    try {
      const results = await Promise.all(
        selected.map((id) =>
          fetch(`/api/notes/${id}`, { method: "DELETE" }).then((res) =>
            res.ok ? id : null,
          ),
        ),
      );

      const deleted = results.filter(Boolean) as string[];
      setNotes((current) => current.filter((item) => !deleted.includes(item.id)));
      stopSelecting();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        {selecting ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={deleteSelected}
              disabled={busy || selected.length === 0}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              Delete
            </Button>
            <span className="text-xs text-muted-foreground">
              {selected.length} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={stopSelecting}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              className="h-7 rounded-md bg-black px-2.5 text-xs font-medium text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85"
              onClick={openCreate}
            >
              <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
              Create a note/doc
            </Button>
            {notes.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setSelecting(true)}
              >
                Select
              </Button>
            ) : null}
          </>
        )}
      </div>

      {notes.length === 0 ? (
        <EmptyRow label="No docs yet" />
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => {
            const isSelected = selected.includes(note.id);

            return (
              <li key={note.id} className="flex items-start gap-2">
                {selecting ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Select ${note.title || "Untitled"}`}
                    onClick={() => toggleSelected(note.id)}
                    className="mt-1.5 flex size-4 shrink-0 items-center justify-center rounded-[3px] border border-black/25 bg-white data-[checked=true]:border-black data-[checked=true]:bg-black dark:border-white/30 dark:bg-white/5"
                  >
                    {isSelected ? (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        className="size-3 text-white dark:text-black"
                      />
                    ) : null}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() =>
                    selecting ? toggleSelected(note.id) : openEdit(note)
                  }
                  className="w-full rounded-md border border-border px-3 py-2 text-left transition-all hover:brightness-105 hover:border-white/30"
                  style={{
                    backgroundColor: note.background,
                    color: note.color,
                  }}
                >
                    <p className="truncate text-sm font-medium">
                      {normalizeNewlines(note.title) || "Untitled"}
                    </p>
                    <p
                      className="line-clamp-2 text-xs opacity-70"
                      dangerouslySetInnerHTML={{ __html: note.content.replace(/\\n/g, "<br>") }}
                    />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <NoteEditor
        key={editing?.id ?? "new"}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        spaceId={spaceId}
        projectId={projectId}
        note={editing}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </>
  );
}

export interface DocsNotesSectionProps {
  spaceId: string;
  projectId?: string | null;
  initialNotes?: Note[];
  title?: string;
  description?: string;
  className?: string;
}

export function DocsNotesSection({
  spaceId,
  projectId,
  initialNotes = [],
  title = "Docs & notes",
  description = "Documents shared in this space",
  className = "min-h-[350px] lg:col-span-2",
}: DocsNotesSectionProps) {
  return (
    <SectionCard
      title={title}
      description={description}
      icon={Note01Icon}
      className={className}
    >
      <DocsNotesPanel
        spaceId={spaceId}
        projectId={projectId}
        initialNotes={initialNotes}
      />
    </SectionCard>
  );
}
