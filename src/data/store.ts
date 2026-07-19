import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDatabaseConfigured, queryDatabase, withDatabaseTransaction } from '../lib/db';

export interface ProductOverride {
  gameSlug: string;
  productLabel: string;
  usd: number;
  stock?: number;
  active: boolean;
  deleted?: boolean;
  bs?: number;
}

export interface GameOverride {
  gameSlug: string;
  image?: string;
  name?: string;
  description?: string;
  custom?: boolean;
  deleted?: boolean;
}

export interface OrderRecord {
  id: string;
  createdAt: string;
  gameSlug: string;
  gameName: string;
  playerId: string;
  paymentMethod: string;
  receiptUrl: string;
  status: string;
  product: {
    label: string;
    usd: number;
    bs: number;
    active: boolean;
  };
}

export const DEFAULT_EXCHANGE_RATE = 700;

const dataDirPath = join(process.cwd(), 'data');
const ordersFilePath = join(dataDirPath, 'orders.json');
const productsOverrideFilePath = join(dataDirPath, 'products-override.json');
const gamesOverrideFilePath = join(dataDirPath, 'games-override.json');
const exchangeRateFilePath = join(dataDirPath, 'exchange-rate.json');

const readJsonFile = async <T>(filePath: string, fallbackValue: T): Promise<T> => {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return fallbackValue;
  }
};

const writeJsonFile = async (filePath: string, value: unknown) => {
  await mkdir(dataDirPath, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
};

const asNumber = (value: unknown, fallbackValue = 0) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
};

const asBoolean = (value: unknown, fallbackValue = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallbackValue;
};

const normalizeProductOverride = (item: unknown): ProductOverride | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const value = item as Record<string, unknown>;
  if (typeof value.gameSlug !== 'string' || typeof value.productLabel !== 'string') {
    return null;
  }

  if (!Number.isFinite(asNumber(value.usd, Number.NaN))) {
    return null;
  }

  return {
    gameSlug: value.gameSlug.trim(),
    productLabel: value.productLabel.trim(),
    usd: asNumber(value.usd),
    stock: typeof value.stock === 'undefined' ? undefined : Math.trunc(asNumber(value.stock)),
    active: asBoolean(value.active, false),
    deleted: typeof value.deleted === 'undefined' ? undefined : asBoolean(value.deleted),
    bs: typeof value.bs === 'undefined' ? undefined : asNumber(value.bs),
  };
};

const normalizeGameOverride = (item: unknown): GameOverride | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const value = item as Record<string, unknown>;
  if (typeof value.gameSlug !== 'string' || value.gameSlug.trim().length === 0) {
    return null;
  }

  return {
    gameSlug: value.gameSlug.trim(),
    image: typeof value.image === 'string' && value.image.trim().length > 0 ? value.image.trim() : undefined,
    name: typeof value.name === 'string' && value.name.trim().length > 0 ? value.name.trim() : undefined,
    description: typeof value.description === 'string' && value.description.trim().length > 0 ? value.description.trim() : undefined,
    custom: typeof value.custom === 'undefined' ? undefined : asBoolean(value.custom),
    deleted: typeof value.deleted === 'undefined' ? undefined : asBoolean(value.deleted),
  };
};

const normalizeOrderFromJson = (item: unknown): OrderRecord | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const value = item as Record<string, unknown>;
  const productValue = value.product && typeof value.product === 'object' ? (value.product as Record<string, unknown>) : null;

  const productLabel = typeof value.productLabel === 'string'
    ? value.productLabel.trim()
    : typeof productValue?.label === 'string'
      ? productValue.label.trim()
      : '';

  if (
    typeof value.id !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.gameSlug !== 'string' ||
    typeof value.gameName !== 'string' ||
    typeof value.playerId !== 'string' ||
    typeof value.paymentMethod !== 'string' ||
    typeof value.receiptUrl !== 'string' ||
    typeof value.status !== 'string' ||
    !productLabel
  ) {
    return null;
  }

  const usd = typeof value.productUsd === 'number' ? value.productUsd : asNumber(productValue?.usd, 0);
  const bs = typeof value.productBs === 'number' ? value.productBs : asNumber(productValue?.bs, 0);
  const active = typeof value.productActive === 'boolean' ? value.productActive : asBoolean(productValue?.active, true);

  return {
    id: value.id.trim(),
    createdAt: value.createdAt,
    gameSlug: value.gameSlug.trim(),
    gameName: value.gameName.trim(),
    playerId: value.playerId.trim(),
    paymentMethod: value.paymentMethod.trim(),
    receiptUrl: value.receiptUrl.trim(),
    status: value.status.trim(),
    product: {
      label: productLabel,
      usd,
      bs,
      active,
    },
  };
};

const mapGameOverrideRow = (row: Record<string, unknown>): GameOverride => ({
  gameSlug: String(row.game_slug ?? ''),
  image: typeof row.image === 'string' ? row.image : undefined,
  name: typeof row.name === 'string' ? row.name : undefined,
  description: typeof row.description === 'string' ? row.description : undefined,
  custom: row.custom === null || typeof row.custom === 'undefined' ? undefined : Boolean(row.custom),
  deleted: row.deleted === null || typeof row.deleted === 'undefined' ? undefined : Boolean(row.deleted),
});

const mapProductOverrideRow = (row: Record<string, unknown>): ProductOverride => ({
  gameSlug: String(row.game_slug ?? ''),
  productLabel: String(row.product_label ?? ''),
  usd: asNumber(row.usd, 0),
  stock: typeof row.stock === 'undefined' || row.stock === null ? undefined : Math.trunc(asNumber(row.stock)),
  active: Boolean(row.active),
  deleted: typeof row.deleted === 'undefined' || row.deleted === null ? undefined : Boolean(row.deleted),
  bs: typeof row.bs === 'undefined' || row.bs === null ? undefined : asNumber(row.bs),
});

const mapOrderRow = (row: Record<string, unknown>): OrderRecord => ({
  id: String(row.id ?? ''),
  createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  gameSlug: String(row.game_slug ?? ''),
  gameName: String(row.game_name ?? ''),
  playerId: String(row.player_id ?? ''),
  paymentMethod: String(row.payment_method ?? ''),
  receiptUrl: String(row.receipt_url ?? ''),
  status: String(row.status ?? ''),
  product: {
    label: String(row.product_label ?? ''),
    usd: asNumber(row.product_usd, 0),
    bs: asNumber(row.product_bs, 0),
    active: Boolean(row.product_active),
  },
});

const replaceRows = async (
  tableName: 'game_overrides' | 'product_overrides',
  rows: Array<GameOverride | ProductOverride>,
) => {
  await withDatabaseTransaction(async (client) => {
    await client.query(`DELETE FROM ${tableName}`);

    for (const row of rows) {
      if (tableName === 'game_overrides') {
        const gameOverride = row as GameOverride;
        await client.query(
          `
            INSERT INTO game_overrides (game_slug, image, name, description, custom, deleted, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
          `,
          [
            gameOverride.gameSlug,
            gameOverride.image ?? null,
            gameOverride.name ?? null,
            gameOverride.description ?? null,
            gameOverride.custom ?? false,
            gameOverride.deleted ?? false,
          ],
        );
        continue;
      }

      const productOverride = row as ProductOverride;
      await client.query(
        `
          INSERT INTO product_overrides (game_slug, product_label, usd, stock, active, deleted, bs, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `,
        [
          productOverride.gameSlug,
          productOverride.productLabel,
          productOverride.usd,
          productOverride.stock ?? 0,
          productOverride.active,
          productOverride.deleted ?? false,
          productOverride.bs ?? null,
        ],
      );
    }
  });
};

export const listGameOverrides = async (): Promise<GameOverride[]> => {
  if (!isDatabaseConfigured()) {
    const content = await readJsonFile<unknown[]>(gamesOverrideFilePath, []);
    return content.map(normalizeGameOverride).filter((item): item is GameOverride => item !== null);
  }

  const result = await queryDatabase<Record<string, unknown>>(
    `
      SELECT game_slug, image, name, description, custom, deleted
      FROM game_overrides
      ORDER BY game_slug ASC
    `,
  );

  return result.rows.map(mapGameOverrideRow);
};

export const saveGameOverrides = async (rows: GameOverride[]) => {
  if (!isDatabaseConfigured()) {
    await writeJsonFile(gamesOverrideFilePath, rows);
    return;
  }

  await replaceRows('game_overrides', rows);
};

export const upsertGameOverride = async (row: GameOverride) => {
  if (!isDatabaseConfigured()) {
    const rows = await listGameOverrides();
    const nextRows = rows.filter((item) => item.gameSlug !== row.gameSlug);
    nextRows.push(row);
    await writeJsonFile(gamesOverrideFilePath, nextRows);
    return;
  }

  await queryDatabase(
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
      row.gameSlug,
      row.image ?? null,
      row.name ?? null,
      row.description ?? null,
      row.custom ?? false,
      row.deleted ?? false,
    ],
  );
};

export const listProductOverrides = async (): Promise<ProductOverride[]> => {
  if (!isDatabaseConfigured()) {
    const content = await readJsonFile<unknown[]>(productsOverrideFilePath, []);
    return content.map(normalizeProductOverride).filter((item): item is ProductOverride => item !== null);
  }

  const result = await queryDatabase<Record<string, unknown>>(
    `
      SELECT game_slug, product_label, usd, stock, active, deleted, bs
      FROM product_overrides
      ORDER BY game_slug ASC, product_label ASC
    `,
  );

  return result.rows.map(mapProductOverrideRow);
};

export const saveProductOverrides = async (rows: ProductOverride[]) => {
  if (!isDatabaseConfigured()) {
    await writeJsonFile(productsOverrideFilePath, rows);
    return;
  }

  await replaceRows('product_overrides', rows);
};

export const getExchangeRate = async (): Promise<number> => {
  if (!isDatabaseConfigured()) {
    try {
      const content = await readJsonFile<{ rate?: unknown }>(exchangeRateFilePath, { rate: DEFAULT_EXCHANGE_RATE });
      const parsedRate = asNumber(content.rate, DEFAULT_EXCHANGE_RATE);
      return parsedRate > 0 ? parsedRate : DEFAULT_EXCHANGE_RATE;
    } catch {
      return DEFAULT_EXCHANGE_RATE;
    }
  }

  const result = await queryDatabase<Record<string, unknown>>(
    `
      SELECT rate
      FROM exchange_rates
      WHERE id = 1
      LIMIT 1
    `,
  );

  if (result.rows.length === 0) {
    return DEFAULT_EXCHANGE_RATE;
  }

  const rate = asNumber(result.rows[0].rate, DEFAULT_EXCHANGE_RATE);
  return rate > 0 ? rate : DEFAULT_EXCHANGE_RATE;
};

export const saveExchangeRate = async (rate: number) => {
  if (!isDatabaseConfigured()) {
    await writeJsonFile(exchangeRateFilePath, { rate });
    return;
  }

  await queryDatabase(
    `
      INSERT INTO exchange_rates (id, rate, updated_at)
      VALUES (1, $1, NOW())
      ON CONFLICT (id)
      DO UPDATE SET rate = EXCLUDED.rate, updated_at = NOW()
    `,
    [rate],
  );
};

export const listOrders = async (): Promise<OrderRecord[]> => {
  if (!isDatabaseConfigured()) {
    const content = await readJsonFile<unknown[]>(ordersFilePath, []);
    return content.map(normalizeOrderFromJson).filter((item): item is OrderRecord => item !== null);
  }

  const result = await queryDatabase<Record<string, unknown>>(
    `
      SELECT
        id,
        created_at,
        game_slug,
        game_name,
        player_id,
        payment_method,
        receipt_url,
        status,
        product_label,
        product_usd,
        product_bs,
        product_active
      FROM orders
      ORDER BY created_at ASC, id ASC
    `,
  );

  return result.rows.map(mapOrderRow);
};

export const appendOrder = async (order: OrderRecord) => {
  if (!isDatabaseConfigured()) {
    const currentOrders = await readJsonFile<OrderRecord[]>(ordersFilePath, []);
    currentOrders.push(order);
    await writeJsonFile(ordersFilePath, currentOrders);
    return;
  }

  await queryDatabase(
    `
      INSERT INTO orders (
        id,
        created_at,
        game_slug,
        game_name,
        player_id,
        payment_method,
        receipt_url,
        status,
        product_label,
        product_usd,
        product_bs,
        product_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
    [
      order.id,
      order.createdAt,
      order.gameSlug,
      order.gameName,
      order.playerId,
      order.paymentMethod,
      order.receiptUrl,
      order.status,
      order.product.label,
      order.product.usd,
      order.product.bs,
      order.product.active,
    ],
  );
};

export const ordersAreStoredInDatabase = () => isDatabaseConfigured();