import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth-next";
import { snaptradeConfigured } from "@/lib/env";
import { buildPortalUrl } from "@/lib/sync";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!snaptradeConfigured()) return NextResponse.json({ error: "SnapTrade is not configured" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { reconnect?: string };
  try {
    const url = await buildPortalUrl(user.id, { reconnectAuthorizationId: body.reconnect });
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create a connection link" }, { status: 502 });
  }
}
