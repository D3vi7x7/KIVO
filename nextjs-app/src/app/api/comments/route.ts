import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const { searchParams } = new URL(req.url);
  const query = new URLSearchParams();
  if (searchParams.get("task_id")) query.set("task_id", searchParams.get("task_id")!);
  if (searchParams.get("project_id"))
    query.set("project_id", searchParams.get("project_id")!);

  const res = await fetch(`${API_URL}/comments?${query.toString()}`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const body = await req.json();

  const res = await fetch(`${API_URL}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
