import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
