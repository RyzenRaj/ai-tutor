import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Handwriting face for the tutor's board notes (Caveat, SIL OFL — bundled so builds need no network).
const hand = localFont({
  src: [
    { path: "./fonts/caveat-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/caveat-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Visual Tutor",
  description: "Learn technical concepts on a teaching canvas with synchronized visuals, explanation and code.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${hand.variable} h-full antialiased`}>
      <body className="flex h-full flex-col">{children}</body>
    </html>
  );
}
