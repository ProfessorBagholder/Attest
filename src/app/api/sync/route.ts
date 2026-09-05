import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth-next";
import { syncUser } from "@/lib/sync";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await syncUser(user.id, "api");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status: 502 });
  }
}
