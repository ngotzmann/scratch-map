import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

let pool;

export const validTypes = [
  'world', 'united-states-of-america', 'canada', 'australia', 'france',
  'mexico', 'japan', 'spain', 'united-kingdom', 'germany',
  'new-zealand', 'brazil', 'china', 'india'
];

export const createConnection = async () => {
  pool = new Pool({
    host:     global.PG_HOST,
    port:     global.PG_PORT,
    database: global.PG_DATABASE,
    user:     global.PG_USER,
    password: global.PG_PASSWORD,
  });

  // retry loop — gives postgres time to be reachable after container start
  const maxAttempts = 10;
  const retryDelayMs = 2000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect();
      try {
        await runMigrations(client);
      } finally {
        client.release();
      }
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.info(`DB not ready (attempt ${attempt}/${maxAttempts}): ${err.message} — retrying in ${retryDelayMs / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
};

export const getConnection = () => pool;

async function runMigrations(client) {
  // Named maps table
  await client.query(`
    CREATE TABLE IF NOT EXISTS maps (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(255)  NOT NULL,
      map_type   VARCHAR(50)   NOT NULL,
      created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  // Drop old scratched table if it has the legacy map_type column
  await client.query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'scratched' AND column_name = 'map_type'
      ) THEN
        DROP TABLE scratched;
      END IF;
    END $$
  `);

  // Scratched regions, now scoped to a named map instance
  await client.query(`
    CREATE TABLE IF NOT EXISTS scratched (
      id         SERIAL PRIMARY KEY,
      map_id     UUID          NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
      code       VARCHAR(10)   NOT NULL,
      year       VARCHAR(10)   NOT NULL DEFAULT '',
      url        VARCHAR(1024) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_map_code UNIQUE (map_id, code)
    )
  `);

  if (global.LOG_LEVEL === 'DEBUG') console.debug('DB migration complete');
}

export const getMapCodes = (type) =>
  JSON.parse(fs.readFileSync(path.join(global.__rootDir, `/utils/codes/${type}.json`)));

export const createMap = async (name, mapType) => {
  const result = await pool.query(
    `INSERT INTO maps (name, map_type) VALUES ($1, $2) RETURNING *`,
    [name, mapType]
  );
  return result.rows[0];
};

export const getMaps = async () => {
  const result = await pool.query(`
    SELECT m.id, m.name, m.map_type, m.created_at,
           COUNT(s.id)::int AS scratched_count
    FROM maps m
    LEFT JOIN scratched s ON s.map_id = m.id
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `);
  return result.rows;
};

export const getMapById = async (mapId) => {
  const result = await pool.query(
    `SELECT * FROM maps WHERE id = $1`,
    [mapId]
  );
  return result.rows[0] || null;
};

export const deleteMap = async (mapId) => {
  const result = await pool.query(
    `DELETE FROM maps WHERE id = $1`,
    [mapId]
  );
  return result.rowCount;
};

export const getScratchedByMapId = async (mapId) => {
  const result = await pool.query(
    `SELECT code, year, url FROM scratched WHERE map_id = $1 ORDER BY code`,
    [mapId]
  );
  return result.rows;
};

export const upsertScratch = async (mapId, code, year, url) => {
  await pool.query(
    `INSERT INTO scratched (map_id, code, year, url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (map_id, code)
     DO UPDATE SET year = EXCLUDED.year, url = EXCLUDED.url, updated_at = NOW()`,
    [mapId, code.toUpperCase(), year, url]
  );
};

export const deleteScratch = async (mapId, code) => {
  const result = await pool.query(
    `DELETE FROM scratched WHERE map_id = $1 AND code = $2`,
    [mapId, code.toUpperCase()]
  );
  return result.rowCount;
};
