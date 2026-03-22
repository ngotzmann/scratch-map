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
  // Named maps — just an id and a name
  await client.query(`
    CREATE TABLE IF NOT EXISTS maps (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(255)  NOT NULL,
      created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`ALTER TABLE maps DROP COLUMN IF EXISTS map_type`);

  // Drop scratched if it doesn't have the current schema (trip_name column)
  await client.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scratched')
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scratched' AND column_name = 'trip_name')
      THEN
        DROP TABLE scratched;
      END IF;
    END $$
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS scratched (
      id            SERIAL PRIMARY KEY,
      map_id        UUID          NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
      map_type      VARCHAR(50)   NOT NULL,
      code          VARCHAR(10)   NOT NULL,
      trip_name     VARCHAR(255)  NOT NULL DEFAULT '',
      description   TEXT          NOT NULL DEFAULT '',
      visit_start   DATE,
      visit_end     DATE,
      photo_urls    TEXT[]        NOT NULL DEFAULT '{}',
      documents_url VARCHAR(1024) NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_map_code UNIQUE (map_id, map_type, code)
    )
  `);

  if (global.LOG_LEVEL === 'DEBUG') console.debug('DB migration complete');
}

export const getMapCodes = (type) =>
  JSON.parse(fs.readFileSync(path.join(global.__rootDir, `/utils/codes/${type}.json`)));

export const createMap = async (name) => {
  const result = await pool.query(
    `INSERT INTO maps (name) VALUES ($1) RETURNING *`,
    [name]
  );
  return result.rows[0];
};

export const getMaps = async () => {
  const result = await pool.query(`
    SELECT m.id, m.name, m.created_at, COUNT(s.id)::int AS scratched_count
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

export const getScratchedCountsByMapId = async (mapId) => {
  const result = await pool.query(
    `SELECT map_type, COUNT(*)::int AS count FROM scratched WHERE map_id = $1 GROUP BY map_type`,
    [mapId]
  );
  return Object.fromEntries(result.rows.map(r => [r.map_type, r.count]));
};

export const getScratchedByMapAndType = async (mapId, mapType) => {
  const result = await pool.query(
    `SELECT code, trip_name, description,
            TO_CHAR(visit_start, 'YYYY-MM-DD') AS visit_start,
            TO_CHAR(visit_end,   'YYYY-MM-DD') AS visit_end,
            photo_urls, documents_url
     FROM scratched
     WHERE map_id = $1 AND map_type = $2
     ORDER BY code`,
    [mapId, mapType]
  );
  return result.rows;
};

export const upsertScratch = async (mapId, mapType, code, tripName, description, visitStart, visitEnd, photoUrls, documentsUrl) => {
  await pool.query(
    `INSERT INTO scratched (map_id, map_type, code, trip_name, description, visit_start, visit_end, photo_urls, documents_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (map_id, map_type, code)
     DO UPDATE SET trip_name = EXCLUDED.trip_name, description = EXCLUDED.description,
                   visit_start = EXCLUDED.visit_start, visit_end = EXCLUDED.visit_end,
                   photo_urls = EXCLUDED.photo_urls, documents_url = EXCLUDED.documents_url,
                   updated_at = NOW()`,
    [mapId, mapType, code.toUpperCase(), tripName, description,
     visitStart || null, visitEnd || null, photoUrls, documentsUrl]
  );
};

export const deleteScratch = async (mapId, mapType, code) => {
  const result = await pool.query(
    `DELETE FROM scratched WHERE map_id = $1 AND map_type = $2 AND code = $3`,
    [mapId, mapType, code.toUpperCase()]
  );
  return result.rowCount;
};
