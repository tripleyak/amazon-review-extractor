import type { Metadata } from "next";
import { Noto_Sans } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  variable: "--font-noto-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Amazon Review Extractor — Right Side Up",
  description:
    "Pull the deepest recoverable set of Amazon customer reviews for any ASIN — single or bulk, ordered oldest to newest. A Right Side Up research tool.",
  openGraph: {
    title: "Amazon Review Extractor",
    description:
      "Every recoverable Amazon review for any ASIN, oldest to newest — for voice-of-customer research.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={notoSans.variable}>
      <body>{children}</body>
    </html>
  );
}
