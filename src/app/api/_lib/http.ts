import { NextResponse, type NextRequest } from "next/server";

export function requestId(request: NextRequest): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function apiError(
  request: NextRequest,
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
) {
  return NextResponse.json(
    { error: { code, message }, requestId: requestId(request) },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

export function apiJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init?.headers },
  });
}

export function assertSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite === "cross-site") return false;

  const candidate = origin ?? referer;
  if (!candidate) return process.env.NODE_ENV === "test";

  try {
    const candidateUrl = new URL(candidate);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const expectedHost = forwardedHost ?? request.headers.get("host");
    const expectedProtocol =
      request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.slice(0, -1);

    return (
      candidateUrl.host === expectedHost && candidateUrl.protocol === `${expectedProtocol}:`
    );
  } catch {
    return false;
  }
}
