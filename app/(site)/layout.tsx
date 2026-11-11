import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sekoya Parts",
  description: "Catalogue de pièces détachées.",
};

// French is the source language. Language routing under app/[lang] comes with
// docs/adr/0011-languages-and-seo.md, in phase 3.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
