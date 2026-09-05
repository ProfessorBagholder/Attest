"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-next";
import { normalizeUsername, validateUsername } from "@/lib/auth";
import { snaptradeConfigured } from "@/lib/env";
import { buildPortalUrl, discoverConnections, rebuildTrades, snaptradeCredentials, syncUser } from "@/lib/sync";
import { refreshAuthorization, removeAuthorization } from "@/lib/snaptrade";

export type ActionState = { error?: string; message?: string } | undefined;

const TIME_ZONES = new Set(Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : ["America/Toronto"]);

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const username = normalizeUsername(String(formData.get("username") ?? user.username));
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 280);
  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };
  if (username !== user.username) {
    const taken = await prisma.user.findUnique({ where: { username } });
    if (taken) return { error: "That username is taken." };
  }
  await prisma.user.update({ where: { id: user.id }, data: { displayName: displayName || user.displayName, username, bio: bio || null } });
  revalidatePath("/settings");
  return { message: "Profile saved." };
}

export async function updatePrivacyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      isPublic: formData.get("isPublic") === "on",
      showDollars: formData.get("showDollars") === "on",
      hideOpenTrades: formData.get("hideOpenTrades") === "on",
    },
  });
  revalidatePath("/settings");
  return { message: "Sharing preferences saved." };
}

export async function updateReportingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const matchingMethod = formData.get("matchingMethod") === "FIFO" ? "FIFO" : "AVERAGE_COST";
  const baseCurrency = String(formData.get("baseCurrency") ?? "CAD").toUpperCase() === "USD" ? "USD" : "CAD";
  const timeZone = String(formData.get("timeZone") ?? user.timeZone);
  if (!TIME_ZONES.has(timeZone)) return { error: "Unknown time zone." };
  const changed = matchingMethod !== user.matchingMethod || baseCurrency !== user.baseCurrency || timeZone !== user.timeZone;
  await prisma.user.update({ where: { id: user.id }, data: { matchingMethod, baseCurrency, timeZone } });
  if (changed) await rebuildTrades(user.id);
  revalidatePath("/", "layout");
  return { message: changed ? "Saved. Trades were rebuilt with the new settings." : "Saved." };
}

export async function saveTradeJournalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const tradeId = String(formData.get("tradeId") ?? "");
  const trade = await prisma.trade.findFirst({ where: { id: tradeId, userId: user.id }, select: { id: true } });
  if (!trade) return { error: "Trade not found." };
  const ratingRaw = String(formData.get("rating") ?? "");
  const rating = ratingRaw ? Math.min(5, Math.max(1, Number(ratingRaw))) : null;
  const tagNames = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 32)
    .slice(0, 12);
  await prisma.$transaction(async (tx) => {
    await tx.trade.update({
      where: { id: trade.id },
      data: {
        notes: String(formData.get("notes") ?? "").trim().slice(0, 5000) || null,
        setup: String(formData.get("setup") ?? "").trim().slice(0, 120) || null,
        mistakes: String(formData.get("mistakes") ?? "").trim().slice(0, 1000) || null,
        rating,
      },
    });
    await tx.tradeTag.deleteMany({ where: { tradeId: trade.id } });
    for (const name of tagNames) {
      const tag = await tx.tag.upsert({ where: { userId_name: { userId: user.id, name } }, create: { userId: user.id, name }, update: {} });
      await tx.tradeTag.create({ data: { tradeId: trade.id, tagId: tag.id } });
    }
  });
  revalidatePath(`/trades/${trade.id}`);
  return { message: "Journal saved." };
}

export async function connectBrokerAction(): Promise<void> {
  const user = await requireUser();
  if (!snaptradeConfigured()) redirect("/accounts?error=snaptrade-not-configured");
  let url: string;
  try {
    url = await buildPortalUrl(user.id);
  } catch (error) {
    redirect(`/accounts?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not start the connection")}`);
  }
  redirect(url);
}

export async function reconnectBrokerAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const authorizationId = String(formData.get("authorizationId") ?? "");
  const connection = await prisma.brokerConnection.findFirst({ where: { userId: user.id, snaptradeAuthorizationId: authorizationId } });
  if (!connection) redirect("/accounts?error=connection-not-found");
  let url: string;
  try {
    url = await buildPortalUrl(user.id, { reconnectAuthorizationId: authorizationId });
  } catch (error) {
    redirect(`/accounts?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not start the reconnection")}`);
  }
  redirect(url);
}

export async function syncNowAction(): Promise<void> {
  const user = await requireUser();
  const result = await syncUser(user.id, "manual").catch((error: unknown) => ({ accounts: 0, errors: [error instanceof Error ? error.message : String(error)] }));
  revalidatePath("/", "layout");
  redirect(result.errors.length ? `/accounts?error=${encodeURIComponent(result.errors.join("; "))}` : "/accounts?synced=1");
}

export async function refreshFromBrokerAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const authorizationId = String(formData.get("authorizationId") ?? "");
  const credentials = await snaptradeCredentials(user.id);
  const connection = await prisma.brokerConnection.findFirst({ where: { userId: user.id, snaptradeAuthorizationId: authorizationId } });
  if (!credentials || !connection) redirect("/accounts?error=connection-not-found");
  try {
    await refreshAuthorization(credentials, authorizationId);
  } catch (error) {
    redirect(`/accounts?error=${encodeURIComponent(error instanceof Error ? error.message : "Refresh failed")}`);
  }
  redirect("/accounts?refreshed=1");
}

export async function disconnectBrokerAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const authorizationId = String(formData.get("authorizationId") ?? "");
  const connection = await prisma.brokerConnection.findFirst({ where: { userId: user.id, snaptradeAuthorizationId: authorizationId } });
  if (!connection) redirect("/accounts?error=connection-not-found");
  const credentials = await snaptradeCredentials(user.id);
  if (credentials && !authorizationId.startsWith("demo-")) {
    await removeAuthorization(credentials, authorizationId).catch(() => undefined);
  }
  await prisma.brokerConnection.update({ where: { id: connection.id }, data: { status: "REMOVED" } });
  await discoverConnections(user.id).catch(() => undefined);
  revalidatePath("/", "layout");
  redirect("/accounts?disconnected=1");
}
