import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('DATABASE_URL no esta configurada.');
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const gameOverridesPath = resolve(projectRoot, 'data', 'games-override.json');

const readJson = async (filePath, fallbackValue) => {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return fallbackValue;
  }
};

const rows = await readJson(gameOverridesPath, []);
if (!Array.isArray(rows) || rows.length === 0) {
  console.log('No hay filas en data/games-override.json para sincronizar.');
  process.exit(0);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

const client = await pool.connect();

try {
  await client.query('BEGIN');

  let synced = 0;
  for (const item of rows) {
    if (!item || typeof item !== 'object' || typeof item.gameSlug !== 'string' || item.gameSlug.trim().length === 0) {
      continue;
    }

    await client.query(
      `
        INSERT INTO game_overrides (game_slug, image, name, description, custom, deleted, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (game_slug)
        DO UPDATE SET
          image = EXCLUDED.image,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          custom = EXCLUDED.custom,
          deleted = EXCLUDED.deleted,
          updated_at = NOW()
      `,
      [
        item.gameSlug.trim(),
        typeof item.image === 'string' && item.image.trim().length > 0 ? item.image.trim() : null,
        typeof item.name === 'string' && item.name.trim().length > 0 ? item.name.trim() : null,
        typeof item.description === 'string' && item.description.trim().length > 0 ? item.description.trim() : null,
        Boolean(item.custom),
        Boolean(item.deleted),
      ],
    );

    synced += 1;
  }

  await client.query('COMMIT');
  console.log(`Sincronizacion completada: ${synced} fila(s) de game_overrides upserted.`);
} catch (error) {
  await client.query('ROLLBACK');
  console.error('No se pudo sincronizar game_overrides a PostgreSQL.');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
