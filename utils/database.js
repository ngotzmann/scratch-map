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
  await client.query(`
    CREATE TABLE IF NOT EXISTS scratched (
      id         SERIAL PRIMARY KEY,
      map_type   VARCHAR(50)   NOT NULL,
      code       VARCHAR(10)   NOT NULL,
      year       VARCHAR(10)   NOT NULL DEFAULT '',
      url        VARCHAR(1024) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_map_code UNIQUE (map_type, code)
    )
  `);

  if (global.LOG_LEVEL === 'DEBUG') console.debug('DB migration complete');
}

export const getMapCodes = (type) =>
  JSON.parse(fs.readFileSync(path.join(global.__rootDir, `/utils/codes/${type}.json`)));

export const getAllScratched = async () => {
  const result = await pool.query(
    'SELECT map_type, code, year, url FROM scratched ORDER BY map_type, code'
  );

  const scratched = Object.fromEntries(validTypes.map(t => [t, []]));

  for (const row of result.rows) {
    if (scratched[row.map_type] !== undefined) {
      scratched[row.map_type].push({ code: row.code, year: row.year, url: row.url });
    }
  }

  return scratched;
};

export const getScratchedByType = async (type) => {
  const result = await pool.query(
    'SELECT code, year, url FROM scratched WHERE map_type = $1 ORDER BY code',
    [type]
  );
  return result.rows;
};

export const upsertScratch = async (type, code, year, url) => {
  await pool.query(
    `INSERT INTO scratched (map_type, code, year, url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (map_type, code)
     DO UPDATE SET year = EXCLUDED.year, url = EXCLUDED.url, updated_at = NOW()`,
    [type, code.toUpperCase(), year, url]
  );
};

export const deleteScratch = async (type, code) => {
  const result = await pool.query(
    'DELETE FROM scratched WHERE map_type = $1 AND code = $2',
    [type, code.toUpperCase()]
  );
  return result.rowCount;
};
