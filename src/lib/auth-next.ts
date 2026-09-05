import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@prisma/client";
import { SESSION_COOKIE, createSession, destroySession, userForSessionToken } from "./auth.ts";

export const currentUser = cache(async (): Promise<User | null> => {
  const store = await cookies();
  return userForSessionToken(store.get(SESSION_COOKIE)?.value);
});

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const ua = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(userId, ua);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  await destroySession(store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
}
