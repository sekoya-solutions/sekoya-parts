import * as migration_20261111_231404_initial from "./20261111_231404_initial";
import * as migration_20261111_231500_project_tables from "./20261111_231500_project_tables";

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
];
