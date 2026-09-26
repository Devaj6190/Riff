import { supabase } from "./supabase/client";

/** POST JSON to one of our API routes as the signed-in player. Throws with the server's message on failure. */
export async function callApi<Res>(path: string, body: unknown): Promise<Res> {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json();
}
