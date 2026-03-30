/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  return knex.schema.alterTable('devs', table => {
    // 1. Add GIN index for technology filtering (O(log N))
    table.index('techs', 'devs_techs_gin_idx', 'gin');
    
    // 2. Add high-performance geometry column (planar meters)
    table.specificType('geometry_location', 'geometry(point, 3857)');
  }).then(() => {
    // 3. Migrate existing data to planar projection
    return knex.raw('UPDATE devs SET geometry_location = ST_Transform(location::geometry, 3857)');
  }).then(() => {
    return knex.schema.alterTable('devs', table => {
      // 4. Add spatial index to geometry column
      table.index('geometry_location', 'devs_geometry_gist_idx', 'gist');
      
      // 5. Enforce NOT NULL for performance
      table.setNullable('geometry_location', false);
    });
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('devs', table => {
    table.dropIndex('geometry_location', 'devs_geometry_gist_idx');
    table.dropIndex('techs', 'devs_techs_gin_idx');
    table.dropColumn('geometry_location');
  });
};
