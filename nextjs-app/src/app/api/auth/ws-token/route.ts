import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "access_token";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ACCESS_COOKIE)?.value ?? null;
  return NextResponse.json({ token });
}
