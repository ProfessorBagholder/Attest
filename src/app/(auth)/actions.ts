"use server";

import { redirect } from "next/navigation";
import { authenticate, createUser } from "@/lib/auth";
import { endSession, startSession } from "@/lib/auth-next";

export type AuthState = { error?: string } | undefined;

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  try {
    const user = await createUser({
      email: String(formData.get("email") ?? ""),
      username: String(formData.get("username") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    await startSession(user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create your account." };
  }
  redirect("/accounts?welcome=1");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const user = await authenticate(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!user) return { error: "That email and password combination does not match." };
  await startSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}
