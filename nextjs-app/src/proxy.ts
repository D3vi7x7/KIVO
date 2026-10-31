import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

const ACCESS_MAX_AGE = 7 * 24 * 60 * 60;
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60;

type Tokens = {
  access_token: string;
  refresh_token: string;
};

function decodeExpiry(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;

    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
    const payload = JSON.parse(json) as { exp?: number };

    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const exp = decodeExpiry(token);
  if (exp === null) {
    return true;
  }
  return Date.now() / 1000 >= exp;
}

async function tryRefresh(refreshToken: string): Promise<Tokens | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `${REFRESH_COOKIE}=${refreshToken}` },
    });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as Tokens;
  } catch {
    return null;
  }
}

function mergeCookieHeader(
  original: string | null,
  tokens: Tokens
): string {
  const kept = (original ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(
      (part) =>
        part &&
        !part.startsWith(`${ACCESS_COOKIE}=`) &&
        !part.startsWith(`${REFRESH_COOKIE}=`),
    );

  return [
    ...kept,
    `${ACCESS_COOKIE}=${tokens.access_token}`,
    `${REFRESH_COOKIE}=${tokens.refresh_token}`,
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let auth API routes manage their own cookies/redirects.
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  let sessionValid = accessToken ? !isExpired(accessToken) : false;
  let rotated: Tokens | null = null;

  // Silent refresh: an expired access token is exchanged for a fresh pair.
  if (!sessionValid && refreshToken) {
    const refreshed = await tryRefresh(refreshToken);
    rotated = refreshed;
    sessionValid = Boolean(refreshed);
  }

  const hasSession = sessionValid;

  let redirectTo: string | null = null;

  if (pathname === "/") {
    redirectTo = hasSession ? "/dashboard" : "/auth";
  } else if (pathname === "/auth" && hasSession) {
    redirectTo = "/dashboard";
  } else if (pathname.startsWith("/dashboard") && !hasSession) {
    redirectTo = "/auth";
  }

  let response: NextResponse;

  if (redirectTo) {
    response = NextResponse.redirect(new URL(redirectTo, request.url));
  } else {
    // Pass the rotated tokens downstream so server components see a valid session.
    const requestHeaders = new Headers(request.headers);

    if (rotated) {
      requestHeaders.set(
        "cookie",
        mergeCookieHeader(request.headers.get("cookie"), rotated),
      );
    }

    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (rotated) {
    response.cookies.set(ACCESS_COOKIE, rotated.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.SECURE_COOKIES === "true",
      path: "/",
      maxAge: ACCESS_MAX_AGE,
    });
    response.cookies.set(REFRESH_COOKIE, rotated.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.SECURE_COOKIES === "true",
      path: "/",
      maxAge: REFRESH_MAX_AGE,
    });
  }

  return response;
}

export const config = {
  matcher: ["/", "/auth", "/dashboard/:path*"],
};
