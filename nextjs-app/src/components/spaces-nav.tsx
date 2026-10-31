"use client";

import {
  AddCircleIcon,
  ChevronDownIcon,
  LayoutGridIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as Sentry from "@sentry/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import type { Project } from "@/lib/projects";
import type { Space } from "@/lib/spaces";

export interface SpacesNavProps {
  initialSpaces?: Space[];
  initialProjects?: Project[];
}

export function SpacesNav({
  initialSpaces = [],
  initialProjects = [],
}: SpacesNavProps) {
  const pathname = usePathname();
  const [spaces, setSpaces] = useState<Space[]>(initialSpaces);
  const projects = initialProjects;

  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreateDialog = () => {
    setName("");
    setFormError(null);
    setDialogOpen(true);
  };

  const createSpace = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Give your space a name");
      return;
    }

    setCreating(true);
    setFormError(null);

    try {
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || "Failed to create space");
      }

      setSpaces((current) => [...current, data]);
      setName("");
      setDialogOpen(false);
      setOpen(true);
    } catch (err) {
      Sentry.captureException(err);
      setFormError(err instanceof Error ? err.message : "Failed to create space");
    } finally {
      setCreating(false);
    }
  };

  const projectsBySpace = (spaceId: string) =>
    projects.filter((project) => project.space_id === spaceId);

  return (
    <>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="group/collapsible w-full"
      >
        <SidebarMenuItem>
          <CollapsibleTrigger
            render={<SidebarMenuButton className="w-full" />}
          >
            <HugeiconsIcon icon={LayoutGridIcon} className="size-4" />
            <span>Spaces</span>
            <HugeiconsIcon
              icon={ChevronDownIcon}
              className="ml-auto size-4 shrink-0 transition-transform group-data-open/collapsible:rotate-180"
            />
          </CollapsibleTrigger>

          <CollapsibleContent>
            <SidebarMenuSub>
              {spaces.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuSubButton
                    render={<button type="button" className="w-full" />}
                    onClick={openCreateDialog}
                  >
                    Create your first space
                  </SidebarMenuSubButton>
                </SidebarMenuItem>
              ) : (
                spaces.map((space) => {
                  const children = projectsBySpace(space.id);

                  return (
                    <SidebarMenuItem key={space.id}>
                      <SidebarMenuSubButton
                        render={<Link href={`/dashboard/spaces/${space.id}`} />}
                        isActive={pathname === `/dashboard/spaces/${space.id}`}
                      >
                        {space.name}
                      </SidebarMenuSubButton>

                      {children.map((project) => (
                        <SidebarMenuItem key={project.id}>
                          <SidebarMenuSubButton
                            render={
                              <Link
                                href={`/dashboard/spaces/${space.id}/projects/${project.id}`}
                              />
                            }
                            isActive={
                              pathname ===
                              `/dashboard/spaces/${space.id}/projects/${project.id}`
                            }
                            className="pl-6"
                          >
                            {project.name}
                          </SidebarMenuSubButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenuItem>
                  );
                })
              )}

              <SidebarMenuItem>
                <SidebarMenuSubButton
                  render={<button type="button" className="w-full" />}
                  onClick={openCreateDialog}
                >
                  <HugeiconsIcon icon={AddCircleIcon} className="size-4" />
                  New space
                </SidebarMenuSubButton>
              </SidebarMenuItem>
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) {
            setFormError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a space</DialogTitle>
            <DialogDescription>
              Spaces group your work — boards, docs, files and deadlines.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={createSpace} className="space-y-4">
            <Input
              placeholder="Space name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
            />

            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create space"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
