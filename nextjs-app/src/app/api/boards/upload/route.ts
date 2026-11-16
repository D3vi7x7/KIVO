import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function POST(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";

  try {
    const formData = await req.formData();
    const res = await fetch(`${API_URL}/boards/upload`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
      body: formData,
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ detail: "Failed to upload file" }, { status: 500 });
  }
}
