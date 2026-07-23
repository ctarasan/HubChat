/**
 * Server-only: Supabase Auth Admin operations (service role).
 * Do not import from client components or src/ui.
 */

import { createServiceSupabaseClient } from "./client.js";
import { normalizeEmailForStorage } from "./emailIlike.js";

export async function createAuthUserWithPassword(email: string, password: string): Promise<string> {
  const admin = createServiceSupabaseClient();
  const normalizedEmail = normalizeEmailForStorage(email);
  const { data, error } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true
  });
  if (error) throw error;
  if (!data.user?.id) throw new Error("Auth user creation failed");
  return data.user.id;
}

export async function deleteAuthUserById(userId: string): Promise<void> {
  const admin = createServiceSupabaseClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

/** Resolve Supabase Auth user id by normalized email (server-only). */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = createServiceSupabaseClient();
  const normalizedEmail = normalizeEmailForStorage(email);
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const match = data.users.find((u) => u.email && normalizeEmailForStorage(u.email) === normalizedEmail);
  return match?.id ?? null;
}

/** Update password for an existing Auth user (server-only; never log password). */
export async function updateAuthUserPasswordById(userId: string, password: string): Promise<void> {
  const admin = createServiceSupabaseClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw error;
}
