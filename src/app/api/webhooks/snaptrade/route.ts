import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { discoverConnections, syncAccount, syncUser } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type WebhookBody = {
  webhookSecret?: string;
  eventType?: string;
  userId?: string;
  accountId?: string;
  brokerageAuthorizationId?: string;
  eventTimestamp?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as WebhookBody | null;
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const expected = process.env.SNAPTRADE_WEBHOOK_SECRET;
  if (expected && body.webhookSecret !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!body.userId) return NextResponse.json({ ok: true, ignored: "no userId" });

  const user = await prisma.user.findUnique({ where: { snaptradeUserId: body.userId }, select: { id: true } });
  if (!user) return NextResponse.json({ ok: true, ignored: "unknown user" });

  const event = (body.eventType ?? "").toUpperCase();
  try {
    if (event.startsWith("CONNECTION")) {
      await discoverConnections(user.id);
      if (event === "CONNECTION_ADDED" || event === "CONNECTION_FIXED") await syncUser(user.id, `webhook:${event}`);
    } else if (body.accountId) {
      const account = await prisma.account.findUnique({ where: { snaptradeAccountId: body.accountId }, select: { id: true } });
      if (account) await syncAccount(account.id, `webhook:${event || "ACCOUNT"}`);
      else await syncUser(user.id, `webhook:${event || "ACCOUNT"}`);
    } else {
      await syncUser(user.id, `webhook:${event || "UNKNOWN"}`);
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
