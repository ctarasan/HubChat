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
