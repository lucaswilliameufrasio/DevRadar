import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE TABLE devs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            github_username TEXT NOT NULL,
            bio TEXT,
            avatar_url TEXT,
            techs TEXT NOT NULL, -- Store this as a comma-separated string or JSON
            longitude REAL NOT NULL,
            latitude REAL NOT NULL
        );
        `)
}


export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP TABLE devs;')
}

