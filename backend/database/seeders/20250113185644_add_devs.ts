import { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
    await knex.raw(`
        INSERT INTO devs (name, github_username, bio, avatar_url, techs, longitude, latitude)
        VALUES ('John Doe', 'johndoe', 'Software Developer', 'https://avatar.url', 'JavaScript,NodeJS', -34.8949, -8.0861);
            
        INSERT INTO devs (name, github_username, bio, avatar_url, techs, longitude, latitude)
        VALUES ('Jane Smith', 'janesmith', 'Backend Engineer', 'https://avatar.url', 'Python,Django', -34.8910, -8.0861);        
    `)
};
