import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "SmartKorp HubChat",
  description: "Multi-channel team inbox and lead management system",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans">{children}</body>
    </html>
  );
}
