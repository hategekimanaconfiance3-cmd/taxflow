import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { LanguageRuntime } from '@/components/providers/language-runtime';

export const metadata: Metadata = {
  title: "TaxFlow",
  description:
    "TaxFlow is a comprehensive tax management platform designed to simplify tax preparation and compliance for individuals and businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <LanguageRuntime>{children}</LanguageRuntime>
      </body>
    </html>
  );
}
