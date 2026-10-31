import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";

import LogoutButton from "./logout-button";

export default function DashboardPage() {
  return (
    <div className="flex min-h-svh flex-col bg-transparent">
      <div className="relative z-10 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
          <span className="truncate text-sm font-medium">Dashboard</span>
        </header>

        <main className="flex flex-1 flex-col gap-4 p-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl tracking-[-0.04em]">
                Welcome to KIVO
              </CardTitle>
              <CardDescription>
                Pick a space or board from the sidebar to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogoutButton />
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
