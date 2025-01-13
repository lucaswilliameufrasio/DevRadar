import { Knex } from "knex";

export const knexConfig: Knex.Config = {
  client: "better-sqlite3",
  useNullAsDefault: true,
  connection: {
    filename: "./devradar-db.sqlite",
  },
  migrations: {
    tableName: "knex_migrations",
    directory: ["./database/migrations"],
  },
  seeds: {
    timestampFilenamePrefix: true,
    directory: ["./database/seeders"],
  },
};

export default knexConfig;
