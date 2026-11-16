// A fit check's answer (issue #161), the same markup on the result page,
// rendered on the server, and under the product page's form, rendered by the
// browser component (site/fit-check.tsx). No directive: it runs in both.
import type { FitResponse } from "./fit.ts";

/** The labels an answer uses, passed down so the browser loads no dictionary. */
export type FitLabels = {
  fitYes: string;
  fitNo: string;
  fitNoModel: string;
  fitInvalid: string;
  fitNoProduct: string;
};

const fillIn = (template: string, name: string, value: string) =>
  template.replace(`{${name}}`, value);

/** Yes or no for each model with the reference, or why there is no answer. */
export function FitAnswerView({
  answer,
  query,
  labels,
}: {
  answer: FitResponse;
  query: string;
  labels: FitLabels;
}) {
  if (answer.status !== "checked")
    return answer.status === "invalid" ? (
      <p data-fit="invalid">{labels.fitInvalid}</p>
    ) : (
      <p data-fit="no-product">{labels.fitNoProduct}</p>
    );
  if (answer.models.length === 0)
    return (
      <p data-fit="no-model">{fillIn(labels.fitNoModel, "query", query)}</p>
    );
  return (
    <ul data-list="fit" className="fit-answers">
      {answer.models.map((model) => {
        const [before, after] = (
          model.fits ? labels.fitYes : labels.fitNo
        ).split("{model}");
        return (
          <li
            key={model.path}
            data-fit={model.fits ? "yes" : "no"}
            className={model.fits ? "fit-yes" : "fit-no"}
          >
            {before}
            <a href={model.path}>
              {model.brand} {model.reference}
            </a>
            {after}
          </li>
        );
      })}
    </ul>
  );
}
