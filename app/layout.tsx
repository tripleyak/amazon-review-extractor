import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amazon Review Extractor",
  description: "Extract the maximum recoverable set of Amazon customer reviews for any ASIN — single or bulk, ordered oldest to newest.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
