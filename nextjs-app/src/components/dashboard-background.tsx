"use client";

import { usePathname } from "next/navigation";
import SunlitCuttingMat from "@/components/ui/sunlit-cutting-mat";

export function DashboardBackground() {
  const pathname = usePathname() || "";

  // Completely omit the sunlit cutting mat on boards pages to prevent awkward 250svh vertical scrollbar
  if (pathname.startsWith("/dashboard/boards")) {
    return null;
  }

  return (
    <SunlitCuttingMat
      className="absolute inset-0 z-0 pointer-events-none h-screen"
      height="250svh"
    />
  );
}
