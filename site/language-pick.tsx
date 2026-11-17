"use client";
// Remembers the language a visitor picks in the language switch or the phone
// menu (issue #191, docs/adr/0011-languages-and-seo.md): following one of
// their links, marked with the LANGUAGE_PICK attribute, writes the lang_v1
// cookie, which the bare domain reads to open that language's home page on
// the next visit. One listener on the document, added once the page's
// scripts run, so the links stay plain links to the translated pages and
// the pages stay static output. The cookie is written before the browser
// follows the link, a click's default action. Before the scripts run, or
// without JavaScript, the language still changes but is not remembered.
import { useEffect } from "react";
import {
  isLocale,
  LANGUAGE_PICK,
  LANGUAGE_PICK_READY,
  languageCookie,
} from "./language-choice.ts";

export function LanguagePick() {
  useEffect(() => {
    const remember = (event: MouseEvent) => {
      // A click, Enter on a focused link, or a middle click (auxclick).
      if (event.type === "auxclick" && event.button !== 1) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const locale = target
        .closest(`a[${LANGUAGE_PICK}]`)
        ?.getAttribute(LANGUAGE_PICK);
      if (!locale || !isLocale(locale)) return;
      // biome-ignore lint/suspicious/noDocumentCookie: one cookie, written as the bare domain's route reads it; the Cookie Store API is missing from older Safari.
      document.cookie = languageCookie(
        locale,
        window.location.protocol === "https:",
      );
    };
    document.addEventListener("click", remember, { capture: true });
    document.addEventListener("auxclick", remember, { capture: true });
    document.documentElement.setAttribute(LANGUAGE_PICK_READY, "");
    return () => {
      document.documentElement.removeAttribute(LANGUAGE_PICK_READY);
      document.removeEventListener("click", remember, { capture: true });
      document.removeEventListener("auxclick", remember, { capture: true });
    };
  }, []);
  return null;
}
