import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") || "";
  const body = await req.json();
  const res = await fetch(`${API_URL}/integrations/actions/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
