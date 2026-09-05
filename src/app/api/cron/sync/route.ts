import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { syncUser } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.nextUrl.searchParams.get("secret");
  if (!secret || provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const users = await prisma.user.findMany({ where: { snaptradeUserId: { not: null } }, select: { id: true } });
  const results: Array<{ userId: string; accounts: number; errors: string[] }> = [];
  for (const user of users) {
    try {
      const result = await syncUser(user.id, "cron");
      results.push({ userId: user.id, ...result });
    } catch (error) {
      results.push({ userId: user.id, accounts: 0, errors: [error instanceof Error ? error.message : String(error)] });
    }
  }
  return NextResponse.json({ synced: results.length, results });
}
