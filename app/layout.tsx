import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Inferlytic — Know your AI margins",
  description:
    "Customer profitability, feature economics, and pricing decisions for AI businesses.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
