// The demo's pickup points (issue #187): five fictitious points per country
// an address may be in (site/saved-addresses.ts), each named after its city
// in the page's language ("Sekoya pickup point, Lyon"). No point exists:
// nothing is ever delivered (AGENTS.md, section 1). A fixed list in the code
// rather than a map or a third-party service, so the checkout sends no
// request anywhere and works without JavaScript.
import { COUNTRIES, type Country } from "./saved-addresses.ts";

export type PickupPoint = {
  /** "<country>-<n>", as the checkout form sends it. */
  id: string;
  country: Country;
  city: string;
  postalCode: string;
};

const CITIES: Record<Country, readonly [city: string, postalCode: string][]> = {
  AT: [
    ["Wien", "1010"],
    ["Graz", "8010"],
    ["Linz", "4020"],
    ["Salzburg", "5020"],
    ["Innsbruck", "6020"],
  ],
  BE: [
    ["Bruxelles", "1000"],
    ["Antwerpen", "2000"],
    ["Gent", "9000"],
    ["Liège", "4000"],
    ["Namur", "5000"],
  ],
  CH: [
    ["Zürich", "8001"],
    ["Genève", "1201"],
    ["Basel", "4051"],
    ["Bern", "3011"],
    ["Lausanne", "1003"],
  ],
  DE: [
    ["Berlin", "10115"],
    ["Hamburg", "20095"],
    ["München", "80331"],
    ["Köln", "50667"],
    ["Frankfurt am Main", "60311"],
  ],
  DK: [
    ["København", "1050"],
    ["Aarhus", "8000"],
    ["Odense", "5000"],
    ["Aalborg", "9000"],
    ["Esbjerg", "6700"],
  ],
  ES: [
    ["Madrid", "28013"],
    ["Barcelona", "08002"],
    ["Valencia", "46002"],
    ["Sevilla", "41004"],
    ["Bilbao", "48005"],
  ],
  FR: [
    ["Paris", "75001"],
    ["Lyon", "69002"],
    ["Marseille", "13001"],
    ["Toulouse", "31000"],
    ["Lille", "59000"],
  ],
  GB: [
    ["London", "EC1A"],
    ["Manchester", "M1"],
    ["Birmingham", "B1"],
    ["Glasgow", "G1"],
    ["Leeds", "LS1"],
  ],
  IE: [
    ["Dublin", "D01"],
    ["Cork", "T12"],
    ["Galway", "H91"],
    ["Limerick", "V94"],
    ["Waterford", "X91"],
  ],
  IT: [
    ["Roma", "00184"],
    ["Milano", "20121"],
    ["Napoli", "80133"],
    ["Torino", "10121"],
    ["Bologna", "40121"],
  ],
  LU: [
    ["Luxembourg", "1009"],
    ["Esch-sur-Alzette", "4001"],
    ["Differdange", "4501"],
    ["Dudelange", "3401"],
    ["Ettelbruck", "9001"],
  ],
  NL: [
    ["Amsterdam", "1012"],
    ["Rotterdam", "3011"],
    ["Den Haag", "2511"],
    ["Utrecht", "3511"],
    ["Eindhoven", "5611"],
  ],
  PL: [
    ["Warszawa", "00-001"],
    ["Kraków", "31-001"],
    ["Łódź", "90-001"],
    ["Wrocław", "50-001"],
    ["Gdańsk", "80-001"],
  ],
  PT: [
    ["Lisboa", "1100-148"],
    ["Porto", "4000-322"],
    ["Braga", "4700-001"],
    ["Coimbra", "3000-001"],
    ["Faro", "8000-001"],
  ],
  SE: [
    ["Stockholm", "111 20"],
    ["Göteborg", "411 01"],
    ["Malmö", "211 20"],
    ["Uppsala", "753 20"],
    ["Västerås", "722 10"],
  ],
};

/** Every point, by country in COUNTRIES' order, then in the list's order. */
export const PICKUP_POINTS: readonly PickupPoint[] = COUNTRIES.flatMap(
  (country) =>
    CITIES[country].map(([city, postalCode], index) => ({
      id: `${country}-${index + 1}`,
      country,
      city,
      postalCode,
    })),
);

const byId = new Map(PICKUP_POINTS.map((point) => [point.id, point]));

/** The point a form's value names, or null. */
export const pickupPoint = (id: unknown): PickupPoint | null =>
  typeof id === "string" ? (byId.get(id) ?? null) : null;

/** A country's points. */
export const pickupPointsIn = (country: Country): PickupPoint[] =>
  PICKUP_POINTS.filter((point) => point.country === country);
