import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import SunlitCuttingMat from "@/components/ui/sunlit-cutting-mat";
import GlobalSearch from "@/components/global-search";
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
      <SidebarProvider className="z-10">
        <AppSidebar email={user.email} spaces={spaces} projects={projects} />
        <SidebarInset className="bg-transparent absolute z-20 md:left-64 md:w-[89vw] pointer-events-auto">
          {children}
          <PendingActionsPill />
          <div className="fixed top-17.5 right-20 z-50"><GlobalSearch /></div>
        </SidebarInset>
        <SunlitCuttingMat className="absolute inset-0 z-0 pointer-events-none h-screen" height="250svh" />
      </SidebarProvider>
    </>
  );
}
