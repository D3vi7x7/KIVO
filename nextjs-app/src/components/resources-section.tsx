"use client";

import {
  Add01Icon,
  Delete02Icon,
  File01Icon,
  Link01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as Sentry from "@sentry/react";
import { cn } from "cn";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectResource, ResourceKind } from "@/lib/projects";
import { ResourceViewDialog } from "@/components/resource-view-dialog";

export interface ResourcesSectionProps {
  projectId: string;
  initialResources?: ProjectResource[];
}

export function ResourcesSection({
  projectId,
  initialResources = [],
}: ResourcesSectionProps) {
  const [resources, setResources] = useState<ProjectResource[]>(initialResources);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<ProjectResource | null>(null);
  const [kind, setKind] = useState<ResourceKind>("file");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();

    if (kind === "url") {
      if (!name.trim()) {
        setError("Give the link a name");
        return;
      }
      if (!url.trim()) {
        setError("Provide the link URL");
        return;
      }
    } else {
      if (!name.trim()) {
        setError("Give the file a name");
        return;
      }
      if (!file) {
        setError("Choose a file to upload");
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      if (kind === "url") {
        const res = await fetch(`/api/projects/${projectId}/resources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            kind,
            url: url.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.detail || "Failed to add the link");
        }
        setResources((current) => [data, ...current]);
      } else {
        const formData = new FormData();
        const uploadFile = file;
        if (!uploadFile) {
          throw new Error("Choose a file to upload");
        }
        formData.append("file", uploadFile);
        formData.append("name", name.trim());
        const res = await fetch(`/api/projects/${projectId}/resources`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.detail || "Failed to upload the file");
        }
        setResources((current) => [data, ...current]);
      }

      setName("");
      setUrl("");
      setFile(null);
      setKind("file");
      setError(null);
      setDialogOpen(false);
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Failed to add the resource");
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const f = event.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) setName(f.name);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    const f = event.dataTransfer.files[0] ?? null;
    if (f) {
      setFile(f);
      if (!name) setName(f.name);
    }
  };

  const remove = async (resourceId: string) => {
    setResources((current) => current.filter((item) => item.id !== resourceId));

    try {
      await fetch(`/api/resources/${resourceId}`, { method: "DELETE" });
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  const acceptTypes =
    ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.gif,.webp,.svg,.zip,.html,.css,.js,.ts";

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          size="sm"
          className="h-7 rounded-md bg-black px-2.5 text-xs font-medium text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85"
          onClick={() => {
            setName("");
            setUrl("");
            setFile(null);
            setKind("file");
            setError(null);
            setDialogOpen(true);
          }}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
          Add resource
        </Button>
      </div>

      {resources.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No resources yet — add a file or a link.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {resources.map((resource) => (
            <li
              key={resource.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white backdrop-blur-sm cursor-pointer hover:bg-white/15 hover:border-white/20 transition-all"
              onClick={() => {
                setViewing(resource);
                setViewOpen(true);
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <HugeiconsIcon
                  icon={resource.kind === "url" ? Link01Icon : File01Icon}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0">
                  {resource.url ? (
                    <div className="block truncate text-sm font-medium">
                      {resource.name}
                    </div>
                  ) : (
                    <div className="block truncate text-sm font-medium">
                      {resource.name}
                    </div>
                  )}
                  {resource.url ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {resource.url}
                    </span>
                  ) : null}
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${resource.name}`}
                className="size-8 shrink-0 p-0 text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(resource.id);
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a resource</DialogTitle>
            <DialogDescription>
              Attach a file or link to this project.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={kind}
                onValueChange={(value) => {
                  setKind(value as ResourceKind);
                  if (value === "file") setFile(null);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="file">File</SelectItem>
                  <SelectItem value="url">Link</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resource-name">Name</Label>
              <Input
                id="resource-name"
                placeholder="Design brief.pdf"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </div>

            {kind === "url" ? (
              <div className="space-y-2">
                <Label htmlFor="resource-url">Link</Label>
                <Input
                  id="resource-url"
                  placeholder="https://…"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Choose a file</Label>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
                      dragActive
                        ? "border-primary bg-primary/5"
                        : "border-foreground/10 hover:border-foreground/30",
                    )}
                  >
                    <input
                      id="resource-file"
                      type="file"
                      accept={acceptTypes}
                      className="sr-only"
                      onChange={handleFileChange}
                    />
                    <label
                      htmlFor="resource-file"
                      className="flex flex-col items-center gap-2 cursor-pointer"
                    >
                      <HugeiconsIcon
                        icon={Upload01Icon}
                        className="size-6 text-muted-foreground"
                      />
                      {file
                        ? `Selected: ${file.name}`
                        : "Click to browse or drag and drop a file here"}
                    </label>
                  </div>
                </div>
              </>
            )}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Adding…" : kind === "url" ? "Add link" : "Upload file"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ResourceViewDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        resource={viewing}
      />
    </>
  );
}

