import { Crimson_Pro } from "next/font/google";

const serif = Crimson_Pro({ subsets: ["latin"] });

/** The Riff wordmark in Crimson Pro; it doubles as the logo. Size it from the parent. */
export function Logo() {
  return <span className={`${serif.className} font-medium tracking-tight`}>Riff</span>;
}
