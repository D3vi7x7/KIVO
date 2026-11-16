import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const { searchParams } = new URL(req.url);
  const query = new URLSearchParams();
  if (searchParams.get("space_id")) query.set("space_id", searchParams.get("space_id")!);
  if (searchParams.get("project_id")) query.set("project_id", searchParams.get("project_id")!);

  try {
    const res = await fetch(`${API_URL}/boards?${query.toString()}`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ detail: "Failed to fetch boards" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const body = await req.json();

  try {
    const res = await fetch(`${API_URL}/boards`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ detail: "Failed to create board" }, { status: 500 });
  }
}
