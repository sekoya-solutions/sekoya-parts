// The logo (owner decision, issue #83): a wordmark only, in Manrope. Its own
// module, with no imports, so the 404 page's browser script can use it too.

/** "Sekoya Parts", with the o of Sekoya in leaf green (owner decision, issue #83). */
export function Wordmark() {
  return (
    <span className="text-xl font-bold tracking-wide">
      Sek<span className="text-leaf">o</span>ya{" "}
      <span className="font-normal text-mist">Parts</span>
    </span>
  );
}
