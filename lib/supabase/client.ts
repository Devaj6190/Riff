import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Browser client. Created lazily so builds don't need env vars. */
export function supabase(): SupabaseClient {
  return (client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!));
}

/** Every player is a Supabase anonymous user; the session persists in localStorage. */
export async function ensureSignedIn(): Promise<User> {
  const db = supabase();
  const { data } = await db.auth.getSession();
  if (data.session) return data.session.user;
  const { data: signedIn, error } = await db.auth.signInAnonymously();
  if (error || !signedIn.user) throw error ?? new Error("Anonymous sign-in failed");
  return signedIn.user;
}
