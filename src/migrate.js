const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', '001_init.sql'), 'utf8');
  console.log('Application du schéma sur la base de données...');
  await pool.query(sql);
  console.log('✓ Migration terminée avec succès.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('✗ Échec de la migration :', err);
  process.exit(1);
});
