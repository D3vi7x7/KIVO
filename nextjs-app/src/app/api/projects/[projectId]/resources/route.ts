import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const cookieHeader = req.headers.get("cookie") || "";

  const res = await fetch(`${API_URL}/projects/${projectId}/resources`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const cookieHeader = req.headers.get("cookie") || "";

  const contentType = req.headers.get("content-type") || "";

  // Handle multipart file uploads
  if (contentType.startsWith("multipart/form-data")) {
    const formData = await req.formData();
    const res = await fetch(
      `${API_URL}/projects/${projectId}/resources/upload`,
      {
        method: "POST",
        headers: { Cookie: cookieHeader },
        body: formData,
      },
    );

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }

  const body = await req.json();

  const res = await fetch(`${API_URL}/projects/${projectId}/resources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
