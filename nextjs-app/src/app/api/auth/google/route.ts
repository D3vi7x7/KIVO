import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function GET() {
  const res = await fetch(`${API_URL}/auth/google`, { cache: "no-store" });
  const data = await res.json();

  if (!res.ok || !data?.url) {
    return NextResponse.json(
      { detail: data?.detail || "Google sign-in is not configured" },
      { status: res.ok ? 500 : res.status },
    );
  }

  // Return the URL as JSON. The client performs the navigation with
  // `window.location.href`; a redirect here would make the browser's
  // `fetch` follow it cross-origin and fail with a CORS error.
  return NextResponse.json({ url: data.url });
}
