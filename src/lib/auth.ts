import { prisma } from "./db.ts";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto.ts";
import { defaultBaseCurrency, defaultTimeZone } from "./env.ts";

export const SESSION_COOKIE = "attest_session";
const SESSION_DAYS = 30;

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string): string | null {
  if (!USERNAME_PATTERN.test(value)) return "Usernames are 3–24 characters: lowercase letters, numbers and underscores.";
  if (["admin", "api", "login", "signup", "leaderboard", "settings", "u", "connect"].includes(value)) return "That username is reserved.";
  return null;
}

export async function createUser(input: { email: string; username: string; displayName: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const username = normalizeUsername(input.username);
  const usernameError = validateUsername(username);
  if (usernameError) throw new Error(usernameError);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (input.password.length < 10) throw new Error("Passwords need at least 10 characters.");
  const taken = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] }, select: { email: true } });
  if (taken) throw new Error(taken.email === email ? "An account with that email already exists." : "That username is taken.");
  return prisma.user.create({
    data: {
      email,
      username,
      displayName: input.displayName.trim() || username,
      passwordHash: await hashPassword(input.password),
      timeZone: defaultTimeZone(),
      baseCurrency: defaultBaseCurrency(),
    },
  });
}

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? user : null;
}

export async function createSession(userId: string, userAgent?: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: sha256(token), expiresAt, userAgent: userAgent ?? null } });
  return { token, expiresAt };
}

export async function userForSessionToken(token: string | undefined | null) {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}
