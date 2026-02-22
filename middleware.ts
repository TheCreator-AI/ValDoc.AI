import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequestAllowed } from "@/server/security/csrf";
import { getSecurityHeaders } from "@/server/security/headers";

const isProduction = process.env.NODE_ENV === "production";

const applySecurityHeaders = (response: NextResponse) => {
  const headers = getSecurityHeaders(isProduction);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
};

export function middleware(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  const hasSessionCookie = Boolean(request.cookies.get("valdoc_token")?.value);

  if (isApiRoute && hasSessionCookie) {
    const allowed = isSameOriginRequestAllowed({
      method: request.method,
      host: request.headers.get("host"),
      origin: request.headers.get("origin"),
      referer: request.headers.get("referer")
    });

    if (!allowed) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: "Request blocked by CSRF protection."
          },
          { status: 403 }
        )
      );
    }
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
