-- Migration to update spatial index and tech filtering
ALTER TABLE devs ADD COLUMN IF NOT EXISTS geometry_location GEOMETRY(POINT, 3857);
CREATE INDEX IF NOT EXISTS devs_techs_gin_idx ON devs USING GIN (techs);
UPDATE devs SET geometry_location = ST_Transform(location::geometry, 3857);
CREATE INDEX IF NOT EXISTS devs_geometry_gist_idx ON devs USING GIST (geometry_location);
ALTER TABLE devs ALTER COLUMN geometry_location SET NOT NULL;
