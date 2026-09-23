import { NextResponse, type NextRequest } from "next/server";
import { getAppOrigin } from "@/lib/env";

export function GET(request: NextRequest) {
  const destination = new URL("/auth/confirm", getAppOrigin());
  request.nextUrl.searchParams.forEach((value, key) => destination.searchParams.set(key, value));
  return NextResponse.redirect(destination);
}
