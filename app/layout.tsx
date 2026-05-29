import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "MovieWall",
  description: "Smart TV digital movie poster display system."
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-ink-950">
      <body className="min-h-screen bg-ink-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
