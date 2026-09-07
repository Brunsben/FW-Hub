import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FW-Hub",
  description: "Konsolidierte Feuerwehr-Verwaltung",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
