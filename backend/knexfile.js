require('dotenv').config({ path: './.env' });

module.exports = {
  development: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/devradar',
    migrations: {
      directory: './migrations'
    }
  },
  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: './migrations'
    }
  }
};
