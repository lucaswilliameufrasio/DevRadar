-- Create the developers table with spatial data
-- Requires the postgis extension if using geography, but we'll use simple double columns for max raw speed if we index them.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS devs (
  id SERIAL PRIMARY KEY,
  github_username VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  techs TEXT[] NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL
);

-- Index for spatial queries in PG
CREATE INDEX IF NOT EXISTS devs_location_idx ON devs USING GIST (location);
