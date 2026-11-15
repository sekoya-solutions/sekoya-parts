// The legal notice's details (issue #143), filled into the placeholders of
// its texts in site/info: the publisher's, supplied by the owner, and the
// host's, as Vercel's privacy policy gives them (checked on 2026-11-15, at
// https://vercel.com/legal/privacy-policy).
import { placeholders } from "./dictionary.ts";

export type Publisher = {
  name: string;
  address: string;
  director: string;
  contact: string;
};

/**
 * The publisher's details, or null while the owner has not supplied them
 * (owner decision, 2026-11-15): the legal notice then says they will be
 * published soon, in place of its publisher section.
 */
export const PUBLISHER: Publisher | null = null;

export const HOST = {
  name: "Vercel Inc.",
  address: "440 N Barranca Avenue #4133, Covina, CA 91723, United States",
};

const PUBLISHER_PLACEHOLDERS = [
  "publisherName",
  "publisherAddress",
  "publicationDirector",
  "publisherContact",
];

/** Whether a paragraph shows a publisher detail. */
export const usesPublisher = (paragraph: string): boolean =>
  placeholders(paragraph).some((name) => PUBLISHER_PLACEHOLDERS.includes(name));

/** The values of the legal notice's placeholders. */
export const legalValues = (
  publisher: Publisher | null = PUBLISHER,
): Record<string, string> => ({
  hostName: HOST.name,
  hostAddress: HOST.address,
  ...(publisher && {
    publisherName: publisher.name,
    publisherAddress: publisher.address,
    publicationDirector: publisher.director,
    publisherContact: publisher.contact,
  }),
});
