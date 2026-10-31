"use client";

import {
  BoldIcon,
  BulletIcon,
  CodeIcon,
  ColorPickerIcon,
  ItalicIcon,
  LeftToRightListNumberIcon,
  PaintBucketIcon,
  QuoteIcon,
  RedoIcon,
  StrikethroughIcon,
  UnderlineIcon,
  UndoIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import * as Sentry from "@sentry/react";
import { HexColorPicker } from "react-colorful";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import type { Note } from "@/lib/notes";

const TEXT_COLORS = [
  "#000000",
  "#5b5b5b",
  "#e03131",
  "#2f9e44",
  "#1971c2",
  "#f08c00",
  "#9c36b5",
];

const NOTE_BACKGROUNDS = [
  "#ffffff",
  "#f8f9fa",
  "#fff3bf",
  "#d3f9d8",
  "#c5f6fa",
  "#e5dbff",
  "#ffe3e3",
  "#f1f3f5",
];

export interface NoteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  projectId?: string | null;
  note?: Note | null;
  onSaved: (note: Note) => void;
  onDeleted?: (noteId: string) => void;
}

function ToolbarButton({
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      aria-label={label}
      title={label}
      pressed={active}
      disabled={disabled}
      onPressedChange={onClick}
    >
      <HugeiconsIcon icon={icon} className="size-4" />
    </Toggle>
  );
}

function ColorPickerButton({
  label,
  icon,
  value,
  onChange,
  colors,
}: {
  label: string;
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  value: string;
  onChange: (color: string) => void;
  colors: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={label}
            title={label}
            className="h-7 w-7 p-0"
          />
        }
      >
        <HugeiconsIcon icon={icon} className="size-4" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto gap-3">
        <div className="flex flex-wrap gap-1.5">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
              className="size-6 rounded-md border border-black/15 transition-transform hover:scale-110"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        <HexColorPicker
          color={value}
          onChange={onChange}
          className="!h-32 !w-56"
        />
      </PopoverContent>
    </Popover>
  );
}

export function NoteEditor({
  open,
  onOpenChange,
  spaceId,
  projectId,
  note,
  onSaved,
  onDeleted,
}: NoteEditorProps) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [background, setBackground] = useState(note?.background ?? "#ffffff");
  const [textColor, setTextColor] = useState(note?.color ?? "#000000");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: "Start writing…",
        }),
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
      ],
      content: note?.content ?? "",
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "note-content focus:outline-none",
        },
      },
    },
    [],
  );

  const save = async () => {
    if (!editor) {
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      title: title.trim(),
      content: editor.getHTML(),
      background,
      color: textColor,
      ...(projectId ? { project_id: projectId } : {}),
    };

    try {
      const res = await fetch(
        note ? `/api/notes/${note.id}` : `/api/spaces/${spaceId}/notes`,
        {
          method: note ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || "Failed to save the note");
      }

      onSaved(data as Note);
      onOpenChange(false);
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Failed to save the note");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!note) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || "Failed to delete the note");
      }

      onDeleted?.(note.id);
      onOpenChange(false);
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Failed to delete the note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl gap-0 p-4 sm:max-w-6xl">
        <DialogHeader className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <DialogTitle>
                {note ? "Edit note" : "Create a note/doc"}
              </DialogTitle>
              <DialogDescription>
                Format with bold, italic and lists, then give it a background.
              </DialogDescription>
            </div>

          </div>

          <Input
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 h-10 border-0 px-0 text-lg font-medium shadow-none focus-visible:ring-0"
          />
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
          <ToolbarButton
            label="Bold"
            icon={BoldIcon}
            active={editor?.isActive("bold")}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            label="Italic"
            icon={ItalicIcon}
            active={editor?.isActive("italic")}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            label="Underline"
            icon={UnderlineIcon}
            active={editor?.isActive("underline")}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          />
          <ToolbarButton
            label="Strikethrough"
            icon={StrikethroughIcon}
            active={editor?.isActive("strike")}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          />

          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            aria-pressed={editor?.isActive("heading", { level: 1 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            aria-pressed={editor?.isActive("heading", { level: 2 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            aria-pressed={editor?.isActive("heading", { level: 3 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </Button>

          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

          <ToolbarButton
            label="Bullet list"
            icon={BulletIcon}
            active={editor?.isActive("bulletList")}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="Numbered list"
            icon={LeftToRightListNumberIcon}
            active={editor?.isActive("orderedList")}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            label="Blockquote"
            icon={QuoteIcon}
            active={editor?.isActive("blockquote")}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarButton
            label="Code block"
            icon={CodeIcon}
            active={editor?.isActive("codeBlock")}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          />

          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

          <ColorPickerButton
            label="Text color"
            icon={ColorPickerIcon}
            value={textColor}
            onChange={(color) => {
              setTextColor(color);
              editor?.chain().focus().setColor(color).run();
            }}
            colors={TEXT_COLORS}
          />

          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

          <ToolbarButton
            label="Undo"
            icon={UndoIcon}
            disabled={!editor?.can().undo()}
            onClick={() => editor?.chain().focus().undo().run()}
          />
          <ToolbarButton
            label="Redo"
            icon={RedoIcon}
            disabled={!editor?.can().redo()}
            onClick={() => editor?.chain().focus().redo().run()}
          />

          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

          <ColorPickerButton
            label="Note background"
            icon={PaintBucketIcon}
            value={background}
            onChange={setBackground}
            colors={NOTE_BACKGROUNDS}

          />
        </div>

        <div
          className="min-h-[50vh] overflow-y-auto p-4"
          style={{ backgroundColor: background, color: textColor }}
        >
          <EditorContent editor={editor} />
        </div>

        {error ? (
          <p className="border-t border-border px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="border-t border-border p-4">
          {note ? (
            <Button
              type="button"
              variant="destructive"
              onClick={remove}
              disabled={saving}
              className="mr-auto"
            >
              Delete
            </Button>
          ) : null}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
