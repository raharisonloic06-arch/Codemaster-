const { Pool } = require('pg');
require('dotenv').config();

/**
 * Configuration pour Neon (PostgreSQL)
 * Neon nécessite SSL. Pour le pooling, utilisez la connection string se terminant par -pooler
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Requis pour Neon si vous n'avez pas le certificat CA localement
  },
  // Optimisation pour serverless : limiter le nombre de connexions par fonction
  max: 1, 
});

pool.on('error', (err) => {
  console.error('Erreur inattendue du pool PostgreSQL', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
