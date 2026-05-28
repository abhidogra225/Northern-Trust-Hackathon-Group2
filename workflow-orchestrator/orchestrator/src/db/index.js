const { Pool } = require('pg');
require('dotenv').config();

/**
 * PG Pool configured from DATABASE_URL environment variable.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Run a parameterized query against the DB.
 * @param {string} text SQL query text
 * @param {Array} params Query parameters
 * @returns {Promise<import('pg').QueryResult>} query result
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Test DB connectivity on startup.
 * @returns {Promise<boolean>} resolves true when connection succeeds
 */
async function connect() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  connect,
};
