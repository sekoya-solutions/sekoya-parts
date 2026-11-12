// A placeholder home page in each language, so the language list's links
// lead somewhere; the home template replaces it later in phase 3.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { homePath, isLocale } from "../../../site/addresses.ts";
import { getDictionary } from "../../../site/dictionary.ts";
import { homeAlternates } from "../../../site/home.ts";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return { alternates: homeAlternates(homePath(lang)) };
}

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <main>
      <h1>Sekoya Parts</h1>
      <p>{getDictionary(lang).homeTagline}</p>
    </main>
  );
}
