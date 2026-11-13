import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "../../../site/fonts.ts";
import { SkipLink } from "../../../site/frame.tsx";
import { siteUrl } from "../../../site/site-url.ts";
import "../../../site/site.css";

export const metadata: Metadata = {
  metadataBase: siteUrl(process.env),
  title: "Sekoya Parts",
};

// The root layout of the bare domain, the page that lists the ten languages
// (docs/adr/0011-languages-and-seo.md). French is the source language and
// the x-default; each language's name carries its own lang attribute.
export default function LanguagesLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={fontVariables}>
      <body>
        <SkipLink locale="fr" />
        {children}
      </body>
    </html>
  );
}
