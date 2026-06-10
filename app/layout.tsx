import type { Metadata, Viewport } from "next";
import { MobileNav } from "@/components/mobile-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "TerminalX.Trading",
  description: "Research-only Indian stock market focus reports and movement alerts.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TerminalX"
  },
  applicationName: "TerminalX.Trading",
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  themeColor: "#f8f7f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <MobileNav />
      </body>
    </html>
  );
}
