import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") || "";

  try {
    const res = await fetch(`${API_URL}/boards/${id}`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ detail: "Failed to fetch board" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") || "";
  const body = await req.json();

  try {
    const res = await fetch(`${API_URL}/boards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ detail: "Failed to update board" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") || "";

  try {
    const res = await fetch(`${API_URL}/boards/${id}`, {
      method: "DELETE",
      headers: { Cookie: cookieHeader },
    });

    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ detail: "Failed to delete board" }, { status: 500 });
  }
}
