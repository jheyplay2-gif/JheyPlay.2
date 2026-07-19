import { Pool, type PoolClient } from 'pg';

declare global {
  // Reuse the same pool across hot reloads during development.
  // eslint-disable-next-line no-var
  var __astroWebPgPool: Pool | undefined;
  // Track which connection string initialized the pool.
  // eslint-disable-next-line no-var
  var __astroWebPgPoolConnectionString: string | undefined;
}

const getConnectionString = () => {
  const fromAstro = import.meta.env.DATABASE_URL?.trim() ?? '';
  if (fromAstro.length > 0) {
    return fromAstro;
  }

  const fromProcess = process.env.DATABASE_URL?.trim() ?? '';
  return fromProcess;
};

const createPool = (connectionString: string) =>
  new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

export const isDatabaseConfigured = () => getConnectionString().length > 0;

export const getPool = () => {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error('DATABASE_URL no esta configurada.');
  }

  const poolNeedsRefresh = !globalThis.__astroWebPgPool
    || globalThis.__astroWebPgPoolConnectionString !== connectionString;

  if (poolNeedsRefresh) {
    globalThis.__astroWebPgPool = createPool(connectionString);
    globalThis.__astroWebPgPoolConnectionString = connectionString;
  }

  return globalThis.__astroWebPgPool;
};

export const queryDatabase = async <T>(text: string, params: readonly unknown[] = []) => {
  const pool = getPool();
  return pool.query<T>(text, params as unknown[]);
};

export const withDatabaseTransaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};