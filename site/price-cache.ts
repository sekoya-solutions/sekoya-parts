// Sets a cached part's lifetime from the sales it shows (ADR 0008, issue
// #151): "max" when no sale date is coming, else until the next one. Called
// once, inside a "use cache" scope, after the products are read.
import { cacheLife } from "next/cache";
import { lifetimeUntil, priceLifetime, type Sale } from "./merchandising.ts";

export function setPriceLifetime(products: Iterable<Sale>, now: number) {
  const lifetime = priceLifetime(products, now);
  if (lifetime === "max") cacheLife("max");
  else cacheLife(lifetime);
}

/** Sets a cached part's lifetime up to a moment it must change at. */
export function setLifetimeUntil(next: number | null, now: number) {
  const lifetime = lifetimeUntil(next, now);
  if (lifetime === "max") cacheLife("max");
  else cacheLife(lifetime);
}
