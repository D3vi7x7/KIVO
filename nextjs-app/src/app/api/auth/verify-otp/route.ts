import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function POST(req: Request) {
  const { email, otp, flow } = await req.json();

  const res = await fetch(`${API_URL}/auth/${flow}/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  });

  const data = await res.json();
  const response = NextResponse.json(data, { status: res.status });

  // Forward httpOnly cookies set by the backend
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    response.headers.append("set-cookie", setCookie);
  }

  return response;
}
