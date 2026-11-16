import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; elementId: string }> },
) {
  const { id, elementId } = await params;
  const cookieHeader = req.headers.get("cookie") || "";
  const body = await req.json();

  try {
    const res = await fetch(`${API_URL}/boards/${id}/elements/${elementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ detail: "Failed to update element" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; elementId: string }> },
) {
  const { id, elementId } = await params;
  const cookieHeader = req.headers.get("cookie") || "";

  try {
    const res = await fetch(`${API_URL}/boards/${id}/elements/${elementId}`, {
      method: "DELETE",
      headers: { Cookie: cookieHeader },
    });

    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ detail: "Failed to delete element" }, { status: 500 });
  }
}
