import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteUrl } from "../../../site/site-url.ts";

export const metadata: Metadata = {
  metadataBase: siteUrl(process.env),
  title: "Sekoya Parts",
};

// The root layout of the bare domain, the page that lists the ten languages
// (docs/adr/0011-languages-and-seo.md). French is the source language and
// the x-default; each language's name carries its own lang attribute.
export default function LanguagesLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
