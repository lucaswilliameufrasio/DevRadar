const cluster = require('node:cluster');
const os = require('node:os');
const fastify = require('fastify')({ logger: false });
const cors = require('@fastify/cors');
const websocket = require('@fastify/websocket');
const RBush = require('rbush');
const { Pool } = require('pg');
const axios = require('axios');
const env = require('./config/env');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/devradar',
});

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) cluster.fork();
} else {
  startWorker();
}

async function startWorker() {
  const tree = new RBush();
  fastify.register(cors);
  fastify.register(websocket);

  // V1 API VERSIONING
  fastify.register(async function (v1) {
    v1.get('/ws', { websocket: true }, (connection, req) => {
      const { latitude, longitude, techs } = req.query;
      const item = {
        minX: Number(longitude), minY: Number(latitude), maxX: Number(longitude), maxY: Number(latitude),
        socket: connection.socket,
        techs: techs ? techs.split(',').map(t => t.trim()) : []
      };
      tree.insert(item);
      connection.socket.on('close', () => tree.remove(item));
    });

    v1.get('/devs', async () => (await pool.query('SELECT * FROM devs')).rows);

    v1.post('/devs', async (request) => {
      const { github_username, techs, latitude, longitude } = request.body;
      const githubRes = await axios.get(`https://api.github.com/users/${github_username}`);
      const { name, login, avatar_url, bio } = githubRes.data;
      const techsArray = techs.split(',').map(t => t.trim());

      const { rows } = await pool.query(
        `INSERT INTO devs (github_username, name, avatar_url, bio, techs, location) 
         VALUES ($1, $2, $3, $4, $5, ST_MakePoint($6, $7)::geography) 
         RETURNING *`,
        [github_username, name || login, avatar_url, bio, techsArray, longitude, latitude]
      );
      return rows[0];
    });

    v1.get('/search', async (request) => {
      const { latitude, longitude, techs } = request.query;
      const techsArray = techs.split(',').map(t => t.trim());
      const { rows } = await pool.query(
        `SELECT *, ST_Distance(location, ST_MakePoint($1, $2)::geography) as distance 
         FROM devs WHERE techs && $3 AND ST_DWithin(location, ST_MakePoint($1, $2)::geography, 10000)`,
        [longitude, latitude, techsArray]
      );
      return rows;
    });
  }, { prefix: '/v1' });

  // Global Error Handler
  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      message: error.message || 'Internal Server Error',
      error_code: error.code || 'INTERNAL_SERVER_ERROR',
      extra: error.extra || undefined
    });
  });

  fastify.listen({ port: 9988, host: '0.0.0.0' });
}
