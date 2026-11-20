import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { DashboardBackground } from "@/components/dashboard-background";
import { PendingActionsPill } from "@/components/pending-actions-pill";
import { getCurrentUser, getProjects, getSpaces } from "@/lib/session";

export const instant = false;

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  // The sidebar renders overlay components that read the clock, so the
  // layout must be produced at request time rather than prerendered.
  await connection();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth");
  }

  const [spaces, projects] = await Promise.all([getSpaces(), getProjects()]);

  return (
    <>
      <ToastProvider>
        <SidebarProvider className="z-10">
          <AppSidebar email={user.email} spaces={spaces} projects={projects} />
          <SidebarInset className="bg-transparent absolute z-20 md:left-64 md:w-[89vw] pointer-events-auto">
            {children}
            <PendingActionsPill />
          </SidebarInset>
          <DashboardBackground />
        </SidebarProvider>
      </ToastProvider>
    </>
  );
}
