"use client";

import {
  KanbanIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { SpacesNav } from "@/components/spaces-nav";
import { SettingsDialog } from "@/components/settings-dialog";
import type { Project } from "@/lib/projects";
import type { Space } from "@/lib/spaces";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export interface AppSidebarProps {
  email?: string;
  name?: string;
  avatarUrl?: string;
  spaces?: Space[];
  projects?: Project[];
}

function initialsFromEmail(email?: string) {
  if (!email) return "K";

  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return (local.slice(0, 2) || "K").toUpperCase();
}

export function AppSidebar({
  email,
  name,
  avatarUrl,
  spaces = [],
  projects = [],
}: AppSidebarProps) {
  const accountLabel = name || email || "Account";
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                <span className="text-sm font-semibold">K</span>
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">KIVO</span>
                <span className="truncate text-[0.8125rem] text-sidebar-foreground/60">
                  Workspace
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Work</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SpacesNav initialSpaces={spaces} initialProjects={projects} />

              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Boards">
                  <HugeiconsIcon icon={KanbanIcon} className="size-4" />
                  <span>Boards</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>App</SidebarGroupLabel>
          <SidebarGroupContent />
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size="lg" className="w-full">
                    <Avatar className="size-8 rounded-lg">
                      {avatarUrl ? (
                        <AvatarImage src={avatarUrl} alt={accountLabel} />
                      ) : null}
                      <AvatarFallback className="rounded-lg">
                        {initialsFromEmail(email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{accountLabel}</span>
                      {name && email ? (
                        <span className="truncate text-[0.8125rem] text-sidebar-foreground/60">
                          {email}
                        </span>
                      ) : null}
                    </div>
                  </SidebarMenuButton>
                }
              />

              <DropdownMenuContent
                side="right"
                align="end"
                className="w-56 rounded-lg"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">
                    {email}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <HugeiconsIcon icon={Settings02Icon} className="size-4" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Sidebar>
  );
}
