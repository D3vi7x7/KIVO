"use client";

import { CheckmarkCircle01Icon, CancelCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface PendingAction {
  id: string;
  kind: string;
  description: string | null;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export function PendingActionsInbox() {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/actions", { cache: "no-store" });
      const data = await res.json();
      setActions(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  const resolve = async (id: string, approve: boolean) => {
    await fetch(`/api/integrations/actions/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    await load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Pending actions</CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending actions.</p>
        ) : (
          <ul className="space-y-2">
            {actions.map((action) => (
              <li
                key={action.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{action.description || action.kind}</p>
                  <p className="text-xs text-muted-foreground">{action.kind}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolve(action.id, true)}
                  >
                    <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => resolve(action.id, false)}
                  >
                    <HugeiconsIcon icon={CancelCircleIcon} className="size-4" />
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
