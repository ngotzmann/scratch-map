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
  // Named maps
  await client.query(`
    CREATE TABLE IF NOT EXISTS maps (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(255)  NOT NULL,
      created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`ALTER TABLE maps DROP COLUMN IF EXISTS map_type`);

  // Drop any legacy scratched table that has a 'year' column
  await client.query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'scratched' AND column_name = 'year'
      ) THEN
        DROP TABLE scratched CASCADE;
      END IF;
    END $$
  `);

  // Lean scratched table — just marks a location as visited
  await client.query(`
    CREATE TABLE IF NOT EXISTS scratched (
      id         SERIAL PRIMARY KEY,
      map_id     UUID          NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
      map_type   VARCHAR(50)   NOT NULL,
      code       VARCHAR(10)   NOT NULL,
      created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_map_code UNIQUE (map_id, map_type, code)
    )
  `);

  // Migrate from previous schema where visit data lived on scratched
  await client.query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'scratched' AND column_name = 'trip_name'
      ) THEN
        CREATE TABLE IF NOT EXISTS visits (
          id            SERIAL PRIMARY KEY,
          scratched_id  INT           NOT NULL REFERENCES scratched(id) ON DELETE CASCADE,
          trip_name     VARCHAR(255)  NOT NULL DEFAULT '',
          description   TEXT          NOT NULL DEFAULT '',
          visit_start   DATE,
          visit_end     DATE,
          photo_urls    TEXT[]        NOT NULL DEFAULT '{}',
          documents_url VARCHAR(1024) NOT NULL DEFAULT '',
          created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
        );
        INSERT INTO visits (scratched_id, trip_name, description, visit_start, visit_end, photo_urls, documents_url)
          SELECT id, trip_name, description, visit_start, visit_end, photo_urls, documents_url FROM scratched;
        ALTER TABLE scratched
          DROP COLUMN IF EXISTS trip_name,
          DROP COLUMN IF EXISTS description,
          DROP COLUMN IF EXISTS visit_start,
          DROP COLUMN IF EXISTS visit_end,
          DROP COLUMN IF EXISTS photo_urls,
          DROP COLUMN IF EXISTS documents_url,
          DROP COLUMN IF EXISTS updated_at,
          DROP COLUMN IF EXISTS url;
      END IF;
    END $$
  `);

  // Visits table (created here for fresh installs)
  await client.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id            SERIAL PRIMARY KEY,
      scratched_id  INT           NOT NULL REFERENCES scratched(id) ON DELETE CASCADE,
      trip_name     VARCHAR(255)  NOT NULL DEFAULT '',
      description   TEXT          NOT NULL DEFAULT '',
      visit_start   DATE,
      visit_end     DATE,
      photo_urls    TEXT[]        NOT NULL DEFAULT '{}',
      documents_url VARCHAR(1024) NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  if (global.LOG_LEVEL === 'DEBUG') console.debug('DB migration complete');
}

export const getMapCodes = (type) =>
  JSON.parse(fs.readFileSync(path.join(global.__rootDir, `/utils/codes/${type}.json`)));

// ── Maps ──────────────────────────────────────────────────────────────────────

export const createMap = async (name) => {
  const result = await pool.query(
    `INSERT INTO maps (name) VALUES ($1) RETURNING *`, [name]
  );
  return result.rows[0];
};

export const getMaps = async () => {
  const result = await pool.query(`
    SELECT m.id, m.name, m.created_at, COUNT(v.id)::int AS scratched_count
    FROM maps m
    LEFT JOIN scratched s ON s.map_id = m.id
    LEFT JOIN visits v ON v.scratched_id = s.id
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `);
  return result.rows;
};

export const getMapById = async (mapId) => {
  const result = await pool.query(`SELECT * FROM maps WHERE id = $1`, [mapId]);
  return result.rows[0] || null;
};

export const deleteMap = async (mapId) => {
  const result = await pool.query(`DELETE FROM maps WHERE id = $1`, [mapId]);
  return result.rowCount;
};

// ── Scratched + Visits ────────────────────────────────────────────────────────

export const getScratchedCountsByMapId = async (mapId) => {
  const result = await pool.query(`
    SELECT s.map_type, COUNT(DISTINCT s.id)::int AS count
    FROM scratched s
    WHERE s.map_id = $1
    GROUP BY s.map_type
  `, [mapId]);
  return Object.fromEntries(result.rows.map(r => [r.map_type, r.count]));
};

// Returns [{code, visits:[{id, trip_name, ...}]}] for a map+type
export const getScratchedByMapAndType = async (mapId, mapType) => {
  const result = await pool.query(`
    SELECT s.code,
           json_agg(json_build_object(
             'id',            v.id,
             'trip_name',     v.trip_name,
             'description',   v.description,
             'visit_start',   TO_CHAR(v.visit_start, 'YYYY-MM-DD'),
             'visit_end',     TO_CHAR(v.visit_end,   'YYYY-MM-DD'),
             'photo_urls',    v.photo_urls,
             'documents_url', v.documents_url
           ) ORDER BY v.visit_start NULLS LAST, v.id) AS visits
    FROM scratched s
    JOIN visits v ON v.scratched_id = s.id
    WHERE s.map_id = $1 AND s.map_type = $2
    GROUP BY s.id, s.code
    ORDER BY s.code
  `, [mapId, mapType]);
  return result.rows;
};

// Add a visit; creates the scratched marker if first visit
export const addVisit = async (mapId, mapType, code, visitData) => {
  const scratchResult = await pool.query(`
    INSERT INTO scratched (map_id, map_type, code)
    VALUES ($1, $2, $3)
    ON CONFLICT (map_id, map_type, code) DO UPDATE SET map_id = EXCLUDED.map_id
    RETURNING id
  `, [mapId, mapType, code.toUpperCase()]);

  const scratchedId = scratchResult.rows[0].id;

  await pool.query(`
    INSERT INTO visits (scratched_id, trip_name, description, visit_start, visit_end, photo_urls, documents_url)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    scratchedId,
    visitData.tripName,
    visitData.description,
    visitData.visitStart || null,
    visitData.visitEnd   || null,
    visitData.photoUrls,
    visitData.documentsUrl,
  ]);

  return getScratchedByMapAndType(mapId, mapType);
};

// Update an existing visit; verifies ownership via mapId
export const updateVisit = async (visitId, mapId, visitData) => {
  const check = await pool.query(`
    SELECT s.map_id, s.map_type, s.code
    FROM visits v JOIN scratched s ON s.id = v.scratched_id
    WHERE v.id = $1 AND s.map_id = $2
  `, [visitId, mapId]);

  if (check.rowCount === 0) return null;
  const { map_id, map_type, code } = check.rows[0];

  await pool.query(`
    UPDATE visits
    SET trip_name = $1, description = $2, visit_start = $3, visit_end = $4,
        photo_urls = $5, documents_url = $6, updated_at = NOW()
    WHERE id = $7
  `, [
    visitData.tripName,
    visitData.description,
    visitData.visitStart || null,
    visitData.visitEnd   || null,
    visitData.photoUrls,
    visitData.documentsUrl,
    visitId,
  ]);

  return getScratchedByMapAndType(map_id, map_type);
};

// Delete a visit; also removes scratched marker if last visit
export const deleteVisit = async (visitId, mapId) => {
  const check = await pool.query(`
    SELECT s.id AS scratched_id, s.map_id, s.map_type, s.code
    FROM visits v JOIN scratched s ON s.id = v.scratched_id
    WHERE v.id = $1 AND s.map_id = $2
  `, [visitId, mapId]);

  if (check.rowCount === 0) return null;
  const { scratched_id, map_id, map_type } = check.rows[0];

  await pool.query(`DELETE FROM visits WHERE id = $1`, [visitId]);

  const remaining = await pool.query(
    `SELECT id FROM visits WHERE scratched_id = $1`, [scratched_id]
  );

  if (remaining.rowCount === 0) {
    await pool.query(`DELETE FROM scratched WHERE id = $1`, [scratched_id]);
    return { unscratched: true, mapId: map_id, mapType: map_type };
  }

  const updated = await getScratchedByMapAndType(map_id, map_type);
  return { unscratched: false, mapId: map_id, mapType: map_type, allScratched: updated };
};
