"use client";

import {
  BellIcon,
  CheckmarkCircle01Icon,
  CancelCircleIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface PendingAction {
  id: string;
  kind: string;
  description: string | null;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export function PendingActionsPill() {
  const router = useRouter();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [open, setOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/integrations/actions", { cache: "no-store" });
      const data = await res.json();
      setActions(Array.isArray(data) ? data : []);
    } catch {
      setActions([]);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 4000);
    return () => clearInterval(interval);
  }, []);

  const resolve = async (id: string, approve: boolean, isInvite: boolean = false) => {
    setResolvingId(id);
    try {
      await fetch(`/api/integrations/actions/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      await load();
      if (isInvite && approve) {
        router.refresh();
      }
    } finally {
      setResolvingId(null);
    }
  };

  const pending = actions.filter((a) => a.status === "pending");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Pending approvals and notifications"
        className="fixed top-16.5 right-5 z-50 flex items-center gap-1.5 rounded-full border border-border bg-white/10 px-3 py-3 text-xs font-medium shadow-sm backdrop-blur-md hover:bg-white/30 transition-colors"
      >
        <HugeiconsIcon icon={BellIcon} className="size-4" />
        {pending.length > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white animate-pulse">
            {pending.length}
          </span>
        ) : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Pending Approvals & Notifications</DialogTitle>
            <DialogDescription>
              Review and act on project invitations and system requests.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No pending actions or notifications.
              </p>
            ) : (
              pending.map((action) => {
                const isInvite = action.kind === "project_invite";
                const isResolving = resolvingId === action.id;

                return (
                  <div
                    key={action.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border p-3.5 bg-card"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {isInvite ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            <HugeiconsIcon icon={UserGroupIcon} className="size-3" />
                            Project Invitation
                          </span>
                        ) : (
                          <span className="inline-flex text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full capitalize">
                            {action.kind}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium leading-snug">
                        {action.description || action.kind}
                      </p>
                      {isInvite && action.payload?.project_name ? (
                        <p className="text-xs text-muted-foreground">
                          Project: <span className="font-semibold text-foreground">{String(action.payload.project_name)}</span> • Role: <span className="capitalize">{String(action.payload.role || "member")}</span>
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        size="sm"
                        disabled={isResolving}
                        onClick={() => resolve(action.id, true, isInvite)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-4" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isResolving}
                        onClick={() => resolve(action.id, false, isInvite)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <HugeiconsIcon icon={CancelCircleIcon} className="size-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
