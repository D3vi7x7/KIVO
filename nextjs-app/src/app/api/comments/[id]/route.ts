import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieHeader = req.headers.get("cookie") || "";

  const res = await fetch(`${API_URL}/comments/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookieHeader },
  });

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return new NextResponse(null, { status: res.status });
  }
}
