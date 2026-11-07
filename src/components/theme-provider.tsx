"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Dünner Wrapper um next-themes. Das Theme wird als Klasse "dark" am <html>
// gesetzt (siehe @custom-variant dark in globals.css). Standard ist das
// System-Theme; die Wahl des Benutzers merkt next-themes im localStorage.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
