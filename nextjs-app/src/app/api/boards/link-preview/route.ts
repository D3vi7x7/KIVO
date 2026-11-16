import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ detail: "Missing url parameter" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/boards/link-preview?url=${encodeURIComponent(targetUrl)}`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ detail: "Failed to scrape link preview" }, { status: 500 });
  }
}
