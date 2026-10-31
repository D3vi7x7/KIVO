import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ projectId: string; email: string }> },
) {
  const { projectId, email } = await params;
  const cookieHeader = req.headers.get("cookie") || "";

  const res = await fetch(
    `${API_URL}/projects/${projectId}/members/${encodeURIComponent(email)}`,
    {
      method: "DELETE",
      headers: { Cookie: cookieHeader },
    },
  );

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; email: string }> },
) {
  const { projectId, email } = await params;
  const cookieHeader = req.headers.get("cookie") || "";
  const body = await req.json();

  const res = await fetch(
    `${API_URL}/projects/${projectId}/members/${encodeURIComponent(email)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify(body),
    },
  );

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

