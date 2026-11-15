// Sets a cached part's lifetime from the sales it shows (ADR 0008, issue
// #151): "max" when no sale date is coming, else until the next one. Called
// once, inside a "use cache" scope, after the products are read.
import { cacheLife } from "next/cache";
import { priceLifetime, type Sale } from "./merchandising.ts";

export function setPriceLifetime(products: Iterable<Sale>, now: number) {
  const lifetime = priceLifetime(products, now);
  if (lifetime === "max") cacheLife("max");
  else cacheLife(lifetime);
}
