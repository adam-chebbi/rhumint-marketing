import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Rhumint Admin",
  description: "Rhumint product-owner admin panel",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
