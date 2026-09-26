"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProfileForm } from "@/components/ProfileForm";
import { ensureSignedIn, supabase } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");

  async function createRiff(name: string, interests: string[]) {
    await ensureSignedIn();
    const { data, error } = await supabase().rpc("create_riff", { p_name: name, p_interests: interests });
    if (error) throw new Error(error.message);
    router.push(`/r/${data}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-10 px-4 py-10">
      <header>
        <h1 className="text-4xl font-bold">Riff</h1>
        <p className="opacity-70">For everything after hello.</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Start a riff</h2>
        <ProfileForm submitLabel="Create riff" onSubmit={createRiff} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Have a code?</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/r/${code}`);
          }}
          className="flex gap-2"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            maxLength={4}
            placeholder="ABCD"
            autoCapitalize="characters"
            className="h-11 flex-1 rounded-lg border border-current/20 bg-transparent px-3 font-mono tracking-widest"
          />
          <button type="submit" disabled={code.length !== 4} className="h-11 rounded-lg border border-current/20 px-5 disabled:opacity-40">
            Join
          </button>
        </form>
      </section>
    </main>
  );
}
