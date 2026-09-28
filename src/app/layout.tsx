import type { Metadata } from "next";
import { JetBrains_Mono, Rajdhani } from "next/font/google";
import Script from "next/script";
import { themeBootScript } from "@/components/shell/ThemeToggle";
import "./globals.css";

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexus Ops",
  description: "Real-time operations dashboard for 10,000 devices",
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    // suppressHydrationWarning: the boot script sets data-theme on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${rajdhani.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Script id="theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
