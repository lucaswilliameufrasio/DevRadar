const cluster = require('node:cluster');
const os = require('node:os');
const fastify = require('fastify')({ logger: false });
const cors = require('@fastify/cors');
const websocket = require('@fastify/websocket');
const rateLimit = require('@fastify/rate-limit');
const Redis = require('ioredis');
const RBush = require('rbush');
const { Pool } = require('pg');
const axios = require('axios');
const env = require('./config/env');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/devradar',
});

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) cluster.fork();
} else {
  startWorker();
}

async function startWorker() {
  const tree = new RBush();
  
  // Security: CORS and Rate Limiting
  fastify.register(cors, { origin: '*' }); // Restrict in production
  fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });
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

    // Schema Validation for registration
    const registrationSchema = {
      body: {
        type: 'object',
        required: ['github_username', 'techs', 'latitude', 'longitude'],
        properties: {
          github_username: { type: 'string', minLength: 1 },
          techs: { type: 'string', minLength: 1 },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 }
        }
      }
    };

    v1.post('/devs', { schema: registrationSchema }, async (request) => {
      const { github_username, techs, latitude, longitude } = request.body;
      
      // Resilient GitHub Fetch with Token Support
      const githubRes = await axios.get(`https://api.github.com/users/${github_username}`, {
        headers: process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {}
      });
      
      const { name, login, avatar_url, bio } = githubRes.data;
      const techsArray = techs.split(',').map(t => t.trim());

      // Use geometry_location (3857) for max performance
      const { rows } = await pool.query(
        `INSERT INTO devs (github_username, name, avatar_url, bio, techs, location, geometry_location) 
         VALUES ($1, $2, $3, $4, $5, ST_MakePoint($6, $7)::geography, ST_Transform(ST_SetSRID(ST_MakePoint($6, $7), 4326), 3857)) 
         RETURNING *`,
        [github_username, name || login, avatar_url, bio, techsArray, longitude, latitude]
      );
      return rows[0];
    });

    // Caching for searches
    v1.get('/search', {
      schema: {
        query: {
          type: 'object',
          required: ['latitude', 'longitude', 'techs'],
          properties: {
            latitude: { type: 'string' }, // Query params are strings by default
            longitude: { type: 'string' },
            techs: { type: 'string' }
          }
        }
      }
    }, async (request) => {
      const { latitude, longitude, techs } = request.query;
      const cacheKey = `search:${latitude}:${longitude}:${techs}`;
      
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);

      const techsArray = techs.split(',').map(t => t.trim());
      
      // Optimized Spatial Search (Planar distance is much faster than Geography spherical)
      const { rows } = await pool.query(
        `SELECT *, ST_Distance(geometry_location, ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 3857)) as distance 
         FROM devs 
         WHERE techs && $3 
         AND ST_DWithin(geometry_location, ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 3857), 10000)
         ORDER BY distance`,
        [Number(longitude), Number(latitude), techsArray]
      );

      await redis.setex(cacheKey, 60, JSON.stringify(rows));
      return rows;
    });
  }, { prefix: '/v1' });

  // Global Error Handler
  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'INTERNAL_SERVER_ERROR';
    
    // Log for server-side debugging
    if (statusCode >= 500) console.error(error);

    reply.status(statusCode).send({
      message: error.message || 'Internal Server Error',
      error_code: errorCode,
      extra: error.extra || (error.validation ? { validation: error.validation } : undefined)
    });
  });

  fastify.listen({ port: 9988, host: '0.0.0.0' });
}
