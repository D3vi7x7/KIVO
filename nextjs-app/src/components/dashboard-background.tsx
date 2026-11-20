"use client";

import { usePathname } from "next/navigation";
import SunlitCuttingMat from "@/components/ui/sunlit-cutting-mat";

export function DashboardBackground() {
  const pathname = usePathname() || "";

  // 1. On board canvas workspace (/dashboard/boards/[boardId]), omit cutting mat so the infinite canvas stays pure
  if (pathname.startsWith("/dashboard/boards/") && pathname !== "/dashboard/boards/") {
    return null;
  }

  // 2. On boards homepage (/dashboard/boards), render sunlit cutting mat fitted to viewport (100vh)
  // Behind the sidebar at z-0 so sidebar and content are fully visible with no extra vertical scrollbar
  if (pathname === "/dashboard/boards" || pathname === "/dashboard/boards/") {
    return (
      <SunlitCuttingMat
        className="fixed inset-0 z-0 pointer-events-none"
        height="100vh"
      />
    );
  }

  // 3. Other dashboard views
  return (
    <SunlitCuttingMat
      className="absolute inset-0 z-0 pointer-events-none h-screen"
      height="250svh"
    />
  );
}
