import { NextResponse } from "next/server";

import { API_URL } from "@/lib/api";

export async function POST(req: Request) {
  const { email, flow } = await req.json();

  const res = await fetch(`${API_URL}/auth/${flow}/request-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
