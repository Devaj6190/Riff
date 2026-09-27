import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/HomeScreen";
import { botPhoto, seedPhoto, STOCK_BOTS } from "@/components/photos";
import { PERSONAS } from "@/lib/engine/personas";

const people = [
  ...PERSONAS.map((p) => ({ file: seedPhoto(p.id)!, name: p.name, about: `${p.school} · ${p.bio}` })),
  ...STOCK_BOTS.map((b) => ({ file: botPhoto(b)!, name: b.name, about: `stock bot · ${b.interests.join(", ")}` })),
];

/** Dev: every AI person's photo (scripts/seed-photos.ts) on one sheet, as the app crops it, to catch bad ones. */
export default function PhotosPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center gap-2">
        <Link href="/dev" aria-label="Back" className="-ml-2 flex size-11 items-center justify-center text-primary">
          <ChevronLeft className="size-7" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Dev: photos</h1>
          <p className="text-sm opacity-60">A letter means the file is missing. To redo one, delete public/images/people/&lt;file&gt; and rerun the script.</p>
        </div>
      </header>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
        {people.map((p) => (
          <li key={p.file} className="flex flex-col items-center gap-1 text-center">
            <Avatar name={p.name} photo={p.file} className="size-28 text-4xl" />
            <p className="font-semibold">{p.name}</p>
            <p className="line-clamp-2 text-xs text-foreground/60">{p.about}</p>
            <code className="text-xs text-foreground/45">{p.file.split("/").pop()}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
