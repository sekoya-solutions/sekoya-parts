// The legal notice's details (issue #143), filled into the placeholders of
// its texts in site/info: the publisher's, supplied by the owner, and the
// host's, as Vercel's privacy policy gives them (checked on 2026-11-15, at
// https://vercel.com/legal/privacy-policy). tests/info-pages.test.ts fails
// while a publisher detail is empty, so the notice never ships incomplete.

export const PUBLISHER = {
  name: "",
  address: "",
  director: "",
  contact: "",
};

export const HOST = {
  name: "Vercel Inc.",
  address: "440 N Barranca Avenue #4133, Covina, CA 91723, United States",
};

/** The values of the legal notice's placeholders. */
export const legalValues = (): Record<string, string> => ({
  publisherName: PUBLISHER.name,
  publisherAddress: PUBLISHER.address,
  publicationDirector: PUBLISHER.director,
  publisherContact: PUBLISHER.contact,
  hostName: HOST.name,
  hostAddress: HOST.address,
});
