import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Visual Tutor",
  description: "Learn technical concepts with synchronized code, visuals, animation and explanation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
