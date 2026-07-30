const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');
require('dotenv').config();

/**
 * Configuration optimisée pour Neon Serverless
 * Le driver @neondatabase/serverless permet des connexions via WebSockets,
 * ce qui est idéal pour les environnements serverless comme Vercel.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  webSocketConstructor: ws,
});

pool.on('error', (err) => {
  console.error('Erreur inattendue du pool Neon', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
