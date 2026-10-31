import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  const { resourceId } = await params;
  const cookieHeader = req.headers.get("cookie") || "";

  const res = await fetch(`${API_URL}/resources/${resourceId}`, {
    method: "DELETE",
    headers: { Cookie: cookieHeader },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
