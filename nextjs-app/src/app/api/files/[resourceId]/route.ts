import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  const { resourceId } = await params;
  const cookieHeader = req.headers.get("cookie") || "";

  const res = await fetch(`${API_URL}/files/${resourceId}`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });

  const arrayBuffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const contentDisposition = res.headers.get("content-disposition");

  return new NextResponse(arrayBuffer, {
    status: res.status,
    headers: {
      "Content-Type": contentType,
      ...(contentDisposition ? { "Content-Disposition": contentDisposition } : {}),
    },
  });
}
