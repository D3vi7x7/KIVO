"use client";

import { CheckmarkCircle01Icon, Copy01Icon, Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface IntegrationKey {
  id: string;
  name: string;
  scopes: string[];
  revoked: boolean;
  created_at: string;
  last_used: string | null;
  key?: string;
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [keys, setKeys] = useState<IntegrationKey[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/integrations/keys", { cache: "no-store" });
      const data = await res.json();
      setKeys(Array.isArray(data) ? data : []);
    } catch {
      setKeys([]);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const create = async () => {
    if (!name.trim()) {
      setError("Give the key a name");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Failed to create key");
      setNewKey(data.key);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    await fetch(`/api/integrations/keys/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage integration API keys for ChatGPT / Claude MCP.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key-name">New key name</Label>
            <div className="flex gap-2">
              <Input
                id="key-name"
                placeholder="ChatGPT"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button onClick={create} disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {newKey ? (
              <div className="rounded-md border border-border bg-muted p-3 text-xs break-all">
                <p className="font-medium">Copy this key (shown once):</p>
                <p className="mt-1 font-mono">{newKey}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => navigator.clipboard.writeText(newKey)}
                >
                  <HugeiconsIcon icon={Copy01Icon} className="size-4" />
                  Copy
                </Button>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Existing keys</Label>
            <ul className="space-y-1.5">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{k.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {k.revoked ? "Revoked" : "Active"} · {k.scopes.join(", ")}
                    </p>
                  </div>
                  {!k.revoked ? (
                    <Button size="sm" variant="ghost" onClick={() => revoke(k.id)}>
                      <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
