import "./globals.css";
import type { ReactNode } from "react";
import { APPEARANCE_BOOTSTRAP_SCRIPT } from "../src/ui/appearancePreference.js";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
