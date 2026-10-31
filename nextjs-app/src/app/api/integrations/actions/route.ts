import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const res = await fetch(`${API_URL}/integrations/actions`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const body = await req.json();
  const res = await fetch(`${API_URL}/integrations/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
