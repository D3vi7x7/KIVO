import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const res = await fetch(`${API_URL}/integrations/me`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
