import * as migration_20261111_231404_initial from "./20261111_231404_initial";
import * as migration_20261111_231500_project_tables from "./20261111_231500_project_tables";
import * as migration_20261112_100026_api_keys from "./20261112_100026_api_keys";
import * as migration_20261113_121216_category_listing from "./20261113_121216_category_listing";
import * as migration_20261113_230000_translation_memory from "./20261113_230000_translation_memory";
import * as migration_20261114_120000_model_search from "./20261114_120000_model_search";
import * as migration_20261114_150000_search_index from "./20261114_150000_search_index";
import * as migration_20261114_200000_search_index_settings from "./20261114_200000_search_index_settings";
import * as migration_20261115_180000_brand_listing from "./20261115_180000_brand_listing";
import * as migration_20261115_210000_category_prices from "./20261115_210000_category_prices";
import * as migration_20261115_210953_merchandising from "./20261115_210953_merchandising";
import * as migration_20261115_232112_promotions from "./20261115_232112_promotions";
import * as migration_20261115_233000_model_pairs from "./20261115_233000_model_pairs";
import * as migration_20261116_000000_promotion_seed from "./20261116_000000_promotion_seed";
import * as migration_20261116_120000_related_products from "./20261116_120000_related_products";
import * as migration_20261116_175520_cart_pricing from "./20261116_175520_cart_pricing";
import * as migration_20261116_201311_customers from "./20261116_201311_customers";
import * as migration_20261116_225211_customer_addresses from "./20261116_225211_customer_addresses";
import * as migration_20261117_075041_orders from "./20261117_075041_orders";
import * as migration_20261117_120000_customer_orders from "./20261117_120000_customer_orders";
import * as migration_20261117_124829_home_finder_promotions from "./20261117_124829_home_finder_promotions";

export const migrations = [
  {
    up: migration_20261111_231404_initial.up,
    down: migration_20261111_231404_initial.down,
    name: "20261111_231404_initial",
  },
  {
    up: migration_20261111_231500_project_tables.up,
    down: migration_20261111_231500_project_tables.down,
    name: "20261111_231500_project_tables",
  },
  {
    up: migration_20261112_100026_api_keys.up,
    down: migration_20261112_100026_api_keys.down,
    name: "20261112_100026_api_keys",
  },
  {
    up: migration_20261113_121216_category_listing.up,
    down: migration_20261113_121216_category_listing.down,
    name: "20261113_121216_category_listing",
  },
  {
    up: migration_20261113_230000_translation_memory.up,
    down: migration_20261113_230000_translation_memory.down,
    name: "20261113_230000_translation_memory",
  },
  {
    up: migration_20261114_120000_model_search.up,
    down: migration_20261114_120000_model_search.down,
    name: "20261114_120000_model_search",
  },
  {
    up: migration_20261114_150000_search_index.up,
    down: migration_20261114_150000_search_index.down,
    name: "20261114_150000_search_index",
  },
  {
    up: migration_20261114_200000_search_index_settings.up,
    down: migration_20261114_200000_search_index_settings.down,
    name: "20261114_200000_search_index_settings",
  },
  {
    up: migration_20261115_180000_brand_listing.up,
    down: migration_20261115_180000_brand_listing.down,
    name: "20261115_180000_brand_listing",
  },
  {
    up: migration_20261115_210000_category_prices.up,
    down: migration_20261115_210000_category_prices.down,
    name: "20261115_210000_category_prices",
  },
  {
    up: migration_20261115_210953_merchandising.up,
    down: migration_20261115_210953_merchandising.down,
    name: "20261115_210953_merchandising",
  },
  {
    up: migration_20261115_232112_promotions.up,
    down: migration_20261115_232112_promotions.down,
    name: "20261115_232112_promotions",
  },
  {
    up: migration_20261115_233000_model_pairs.up,
    down: migration_20261115_233000_model_pairs.down,
    name: "20261115_233000_model_pairs",
  },
  {
    up: migration_20261116_000000_promotion_seed.up,
    down: migration_20261116_000000_promotion_seed.down,
    name: "20261116_000000_promotion_seed",
  },
  {
    up: migration_20261116_120000_related_products.up,
    down: migration_20261116_120000_related_products.down,
    name: "20261116_120000_related_products",
  },
  {
    up: migration_20261116_175520_cart_pricing.up,
    down: migration_20261116_175520_cart_pricing.down,
    name: "20261116_175520_cart_pricing",
  },
  {
    up: migration_20261116_201311_customers.up,
    down: migration_20261116_201311_customers.down,
    name: "20261116_201311_customers",
  },
  {
    up: migration_20261116_225211_customer_addresses.up,
    down: migration_20261116_225211_customer_addresses.down,
    name: "20261116_225211_customer_addresses",
  },
  {
    up: migration_20261117_075041_orders.up,
    down: migration_20261117_075041_orders.down,
    name: "20261117_075041_orders",
  },
  {
    up: migration_20261117_120000_customer_orders.up,
    down: migration_20261117_120000_customer_orders.down,
    name: "20261117_120000_customer_orders",
  },
  {
    up: migration_20261117_124829_home_finder_promotions.up,
    down: migration_20261117_124829_home_finder_promotions.down,
    name: "20261117_124829_home_finder_promotions",
  },
];
