import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { FriendInvites } from "@/components/FriendInvites";
import "./globals.css";

// Aspekta (OFL-1.1, see app/fonts/OFL.txt): one variable file covers every weight.
const aspekta = localFont({
  src: "./fonts/AspektaVF.woff2",
  variable: "--font-aspekta",
  weight: "50 1000",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Riff",
  description: "For everything after hello.",
};

// Shrink the layout (and dvh) when the mobile keyboard opens, so the input bar stays visible.
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${aspekta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Every page sits on the landing's navy and moving grain. */}
        <div aria-hidden className="riff-grain pointer-events-none fixed inset-0 -z-10 overflow-hidden" />
        {children}
        <FriendInvites />
      </body>
    </html>
  );
}
