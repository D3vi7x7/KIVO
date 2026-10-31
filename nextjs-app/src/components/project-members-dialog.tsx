"use client";

import {
  Add01Icon,
  CancelCircleIcon,
  Clock01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  ShieldUserIcon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as Sentry from "@sentry/react";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import type { MemberRole, ProjectMember } from "@/lib/projects";

export interface ProjectMembersDialogProps {
  projectId: string;
  projectName: string;
  projectOwner: string;
  currentUserEmail?: string;
  currentUserRole?: MemberRole;
  initialMembers?: ProjectMember[];
  onMembersChange?: (members: ProjectMember[]) => void;
}

function initials(email: string) {
  const local = email.split("@")[0] || "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (local.slice(0, 2) || "U").toUpperCase();
}

export function ProjectMembersDialog({
  projectId,
  projectName,
  projectOwner,
  currentUserEmail,
  currentUserRole = "member",
  initialMembers = [],
  onMembersChange,
}: ProjectMembersDialogProps) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>(initialMembers);
  const [loading, setLoading] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("member");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAdmin =
    currentUserRole === "admin" ||
    (currentUserEmail &&
      projectOwner.trim().toLowerCase() === currentUserEmail.trim().toLowerCase());

  const loadMembers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setMembers(data);
          onMembersChange?.(data);
        }
      }
    } catch (err) {
      Sentry.captureException(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadMembers();
      setError(null);
      setSuccess(null);
    }
  }, [open, projectId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = inviteEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Please enter a valid user email");
      return;
    }

    setInviting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, role: inviteRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || "Failed to send invitation");
      }

      setSuccess(`Invitation sent to ${cleanEmail}`);
      setInviteEmail("");
      await loadMembers();
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (email: string, role: MemberRole) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/members/${encodeURIComponent(email)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || "Failed to update role");
      }
      await loadMembers();
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleRemove = async (email: string) => {
    if (
      !confirm(
        `Are you sure you want to remove ${email} from this project?`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/projects/${projectId}/members/${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.detail || "Failed to remove member");
      }
      await loadMembers();
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const acceptedMembers = members.filter((m) => m.status === "accepted");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-border glass px-3 py-2 text-xs font-medium text-foreground hover:bg-white/20 transition-colors"
          />
        }
      >
        <div className="flex -space-x-1.5 overflow-hidden">
          {acceptedMembers.slice(0, 3).map((m) => (
            <Avatar key={m.email} className="size-5 border border-background">
              <AvatarFallback className="text-[9px]">
                {initials(m.email)}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
        <span className="flex items-center gap-1">
          <HugeiconsIcon icon={UserGroupIcon} className="size-3.5 text-muted-foreground" />
          <span>Team ({members.length})</span>
        </span>
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={UserGroupIcon} className="size-5 text-primary" />
            Project Team & Collaborators
          </DialogTitle>
          <DialogDescription>
            Manage who can collaborate on <strong>{projectName}</strong>. Tasks can be
            assigned dynamically to any accepted team member.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* Admin Invite Form */}
          {isAdmin ? (
            <form
              onSubmit={handleInvite}
              className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-3"
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Invite Employee / Team Member
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Registered employee email..."
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="w-full sm:w-32">
                  <Select
                    value={inviteRole}
                    onValueChange={(val) => setInviteRole(val as MemberRole)}
                  >
                    <SelectTrigger className="h-9 text-xs w-full">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={inviting || !inviteEmail.trim()}
                  className="h-9 gap-1.5"
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                  {inviting ? "Sending..." : "Send Invite"}
                </Button>
              </div>

              {error ? (
                <p className="text-xs text-destructive font-medium">{error}</p>
              ) : null}
              {success ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  {success}
                </p>
              ) : null}
            </form>
          ) : (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-xs text-muted-foreground">
              You have <strong>{currentUserRole}</strong> access. Only project admins can invite new members.
            </div>
          )}

          {/* Members List */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Team Members ({members.length})
            </div>

            {loading && members.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">
                Loading members...
              </p>
            ) : members.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No members found.
              </p>
            ) : (
              members.map((member) => {
                const isOwner =
                  member.email.trim().toLowerCase() ===
                  projectOwner.trim().toLowerCase();
                const isSelf =
                  Boolean(currentUserEmail) &&
                  member.email.trim().toLowerCase() ===
                  currentUserEmail!.trim().toLowerCase();

                return (
                  <div
                    key={member.email}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 bg-card"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs font-medium">
                          {initials(member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium truncate">
                            {member.email}
                          </p>
                          {isSelf ? (
                            <span className="text-[10px] text-muted-foreground">
                              (You)
                            </span>
                          ) : null}
                          {isOwner ? (
                            <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                              Head / Creator
                            </span>
                          ) : null}
                        </div>

                        {/* Status indication */}
                        <div className="flex items-center gap-2 mt-0.5">
                          {member.status === "accepted" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                              <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-3" />
                              Accepted
                            </span>
                          ) : member.status === "pending" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                              <HugeiconsIcon icon={Clock01Icon} className="size-3" />
                              Invite Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-500">
                              <HugeiconsIcon icon={CancelCircleIcon} className="size-3" />
                              Rejected
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Role selection for admins, badge for non-admins */}
                      {isAdmin && !isOwner ? (
                        <Select
                          value={member.role}
                          onValueChange={(val) =>
                            handleRoleChange(member.email, val as MemberRole)
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground capitalize bg-muted px-2 py-0.5 rounded">
                          {member.role}
                        </span>
                      )}

                      {/* Remove button */}
                      {((isAdmin && !isOwner) || (isSelf && !isOwner)) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(member.email)}
                          title={isSelf ? "Leave project" : "Remove member"}
                        >
                          <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
