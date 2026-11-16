// The labels the fit check's browser component receives (issue #161): only
// these, so a page's HTML carries no more of the dictionary than it shows.
import type { Dictionary } from "./dictionary.ts";
import type { FitCheckLabels } from "./fit-check.tsx";

export const fitCheckLabels = (dictionary: Dictionary): FitCheckLabels => ({
  fitTitle: dictionary.fitTitle,
  fitIntro: dictionary.fitIntro,
  fitLabel: dictionary.fitLabel,
  fitSubmit: dictionary.fitSubmit,
  fitChecking: dictionary.fitChecking,
  fitError: dictionary.fitError,
  fitYes: dictionary.fitYes,
  fitNo: dictionary.fitNo,
  fitNoModel: dictionary.fitNoModel,
  fitInvalid: dictionary.fitInvalid,
  fitNoProduct: dictionary.fitNoProduct,
});
