import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function POST(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";

  const res = await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookieHeader },
  });

  const data = await res.json();
  const response = NextResponse.json(data, { status: res.status });

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    response.headers.append("set-cookie", setCookie);
  }

  return response;
}
