// Whether a form's POST comes from a page of this site (issues #168 and
// #177): the cart and account routes refuse any other, so no other site can
// fill a visitor's cart or sign them in or out. Browsers send Origin with
// every POST; Sec-Fetch-Site covers one that would not.
export function sameOrigin(request: { headers: Headers }): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin) {
    try {
      return host !== null && new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}
