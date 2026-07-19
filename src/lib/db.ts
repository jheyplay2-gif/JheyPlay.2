import { Pool, type PoolClient } from 'pg';

declare global {
  // Reuse the same pool across hot reloads during development.
  // eslint-disable-next-line no-var
  var __astroWebPgPool: Pool | undefined;
}

const connectionString = import.meta.env.DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || '';
const hasDatabaseUrl = connectionString.length > 0;

const createPool = () =>
  new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

export const isDatabaseConfigured = () => hasDatabaseUrl;

export const getPool = () => {
  if (!hasDatabaseUrl) {
    throw new Error('DATABASE_URL no esta configurada.');
  }

  globalThis.__astroWebPgPool ??= createPool();
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