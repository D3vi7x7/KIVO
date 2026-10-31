"use client";

import {
  Download02Icon,
  ExternalLinkIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ProjectResource } from "@/lib/projects";

export interface ResourceViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ProjectResource | null;
}

function extOf(url: string) {
  const base = url.split("?")[0];
  const dot = base.lastIndexOf(".");
  if (dot === -1) return "";
  return base.slice(dot).toLowerCase();
}

function isImage(ext: string) {
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"].includes(
    ext,
  );
}

export function ResourceViewDialog({
  open,
  onOpenChange,
  resource,
}: ResourceViewDialogProps) {
  const fileUrl = resource ? `/api/files/${resource.id}` : "";
  const ext = resource ? extOf(resource.name || resource.url) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-7xl max-h-[85vh] flex flex-col gap-0 p-0 max-w-4xl">
        <DialogHeader className="border-b border-border p-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <DialogTitle>{resource?.name || "Resource"}</DialogTitle>
            <DialogDescription>
              {resource?.kind === "url" ? resource.url : fileUrl}
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (resource?.url) {
                window.open(resource.url, "_blank");
              } else if (fileUrl) {
                window.open(fileUrl, "_blank");
              }
            }}
          >
            <HugeiconsIcon icon={ExternalLinkIcon} className="size-4" />
          </Button>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-background p-4 overflow-auto">
          {resource?.kind === "url" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted p-4">
                <p className="text-sm text-muted-foreground">Link resource</p>
                <p className="text-sm truncate">{resource.url}</p>
              </div>
              <div className="rounded-lg border border-dashed border-border bg-white/50 p-6 flex items-center justify-center min-h-75">
                <Button type="button" onClick={() => window.open(resource.url, "_blank")}>
                  Open link in new tab
                </Button>
              </div>
            </div>
          ) : (
            <>
              {isImage(ext) ? (
                <img
                  src={fileUrl}
                  alt={resource?.name || "file"}
                  className="max-w-full max-h-full rounded-lg border border-border object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground">
                  <p>File preview not available.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(fileUrl, "_blank")}
                  >
                    Download file
                  </Button>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {ext.toUpperCase() || "FILE"} · {resource?.kind}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(fileUrl, "_blank")}
                >
                  <HugeiconsIcon icon={Download02Icon} className="size-4" />
                  Download
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-border flex gap-3 justify-end p-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
