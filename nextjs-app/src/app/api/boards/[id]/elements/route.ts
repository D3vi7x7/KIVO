import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") || "";

  try {
    const res = await fetch(`${API_URL}/boards/${id}/elements`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ detail: "Failed to fetch board elements" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") || "";
  const body = await req.json();

  try {
    const res = await fetch(`${API_URL}/boards/${id}/elements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ detail: "Failed to create board element" }, { status: 500 });
  }
}
