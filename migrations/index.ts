import * as migration_20261111_231404_initial from "./20261111_231404_initial";
import * as migration_20261111_231500_project_tables from "./20261111_231500_project_tables";
import * as migration_20261112_100026_api_keys from "./20261112_100026_api_keys";
import * as migration_20261113_121216_category_listing from "./20261113_121216_category_listing";
import * as migration_20261113_230000_translation_memory from "./20261113_230000_translation_memory";
import * as migration_20261114_120000_model_search from "./20261114_120000_model_search";
import * as migration_20261114_150000_search_index from "./20261114_150000_search_index";
import * as migration_20261114_200000_search_index_settings from "./20261114_200000_search_index_settings";

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
];
