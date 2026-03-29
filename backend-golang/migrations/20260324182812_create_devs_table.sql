-- +goose Up
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
CREATE INDEX IF NOT EXISTS devs_location_gist_idx ON devs USING GIST (location);

-- +goose Down
DROP TABLE devs;
