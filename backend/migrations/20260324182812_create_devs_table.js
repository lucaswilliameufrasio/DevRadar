/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS postgis');
  return knex.schema.createTable('devs', table => {
    table.increments('id').primary();
    table.string('github_username').unique().notNullable();
    table.string('name');
    table.text('avatar_url');
    table.text('bio');
    table.specificType('techs', 'text[]');
    table.specificType('location', 'geography(point, 4326)').notNullable();
    table.index('location', 'devs_location_gist_idx', 'gist');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('devs');
};
