import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chromatic Shift — Color Puzzle Adventure",
  description: "A polished, responsive match-3 puzzle game.",
  viewport: {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover"
  },
  themeColor: "#070914"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
