// The 404 page of every address under a language (issue #83): the site
// layout, a message in the address's language and a link to its home page.
// Next.js answers it with status 404 and a noindex robots tag.
import { NotFoundPage } from "../../../site/not-found-content.tsx";

export default function NotFound() {
  return <NotFoundPage />;
}
