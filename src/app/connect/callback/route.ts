import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth-next";
import { appUrl } from "@/lib/env";
import { discoverConnections, syncUser } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/login`);
  const status = request.nextUrl.searchParams.get("status");
  const errorCode = request.nextUrl.searchParams.get("error_code") ?? request.nextUrl.searchParams.get("errorCode");
  if (status === "ERROR" || errorCode) {
    return NextResponse.redirect(`${appUrl()}/accounts?error=${encodeURIComponent(`Connection failed${errorCode ? ` (${errorCode})` : ""}`)}`);
  }
  try {
    await discoverConnections(user.id);
    void syncUser(user.id, "connect").catch(() => undefined);
  } catch (error) {
    return NextResponse.redirect(`${appUrl()}/accounts?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not read connections")}`);
  }
  return NextResponse.redirect(`${appUrl()}/accounts?connected=1`);
}
