import type { APIRoute } from 'astro';
import { getMergedGames } from '../../data/catalog';
import { saveProductOverrides, type ProductOverride } from '../../data/store';

interface UpdateProductInput {
  gameSlug?: unknown;
  productLabel?: unknown;
  usd?: unknown;
  active?: unknown;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });

const parseOverrideBody = async (request: Request): Promise<UpdateProductInput | null> => {
  try {
    return (await request.json()) as UpdateProductInput;
  } catch {
    return null;
  }
};

const getStringField = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const getBooleanField = (value: unknown) => (typeof value === 'boolean' ? value : null);
const getNumberField = (value: unknown) => (typeof value === 'number' ? value : null);

const normalizeLookupText = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

const isSameProduct = (left: { gameSlug: string; productLabel: string }, right: { gameSlug: string; productLabel: string }) =>
  normalizeLookupText(left.gameSlug) === normalizeLookupText(right.gameSlug)
  && normalizeLookupText(left.productLabel) === normalizeLookupText(right.productLabel);

export const GET: APIRoute = async () => {
  const { mergedGames, exchangeRate } = await getMergedGames();

  return jsonResponse(
    {
      success: true,
      games: mergedGames,
      exchangeRate,
    },
    200,
  );
};

export const POST: APIRoute = async ({ request }) => {
  const payload = await parseOverrideBody(request);
  if (!payload) {
    return jsonResponse({ success: false, message: 'Body JSON invalido.' }, 400);
  }

  const gameSlug = getStringField(payload.gameSlug);
  const productLabel = getStringField(payload.productLabel);
  const usd = getNumberField(payload.usd);
  const active = getBooleanField(payload.active);

  if (!gameSlug || !productLabel || usd === null || active === null || !Number.isFinite(usd) || usd < 0) {
    return jsonResponse({ success: false, message: 'Datos invalidos para crear producto.' }, 400);
  }

  const { mergedGames, overrides } = await getMergedGames();
  const game = mergedGames.find((item) => item.slug === gameSlug);
  if (!game) {
    return jsonResponse({ success: false, message: 'Juego no encontrado.' }, 404);
  }

  const incomingKey = { gameSlug, productLabel };
  const exists = game.products.some((product) =>
    normalizeLookupText(product.label) === normalizeLookupText(productLabel),
  );

  if (exists) {
    return jsonResponse({ success: false, message: 'Ya existe un producto con ese nombre en este juego.' }, 409);
  }

  const nextOverrides = overrides.filter((item) => !isSameProduct(item, incomingKey));
  const newOverride: ProductOverride = {
    gameSlug,
    productLabel,
    usd,
    stock: 0,
    active,
    deleted: false,
  };

  nextOverrides.push(newOverride);
  await saveProductOverrides(nextOverrides);

  return jsonResponse({ success: true, message: 'Producto creado.', product: newOverride }, 201);
};

export const PUT: APIRoute = async ({ request }) => {
  const payload = await parseOverrideBody(request);
  if (!payload) {
    return jsonResponse({ success: false, message: 'Body JSON invalido.' }, 400);
  }

  const gameSlug = getStringField(payload.gameSlug);
  const productLabel = getStringField(payload.productLabel);
  const usd = getNumberField(payload.usd);
  const active = getBooleanField(payload.active);

  if (!gameSlug || !productLabel || usd === null || active === null || !Number.isFinite(usd) || usd < 0) {
    return jsonResponse({ success: false, message: 'Datos invalidos para actualizar producto.' }, 400);
  }

  const { mergedGames, overrides } = await getMergedGames();
  const game = mergedGames.find((item) => item.slug === gameSlug);
  if (!game) {
    return jsonResponse({ success: false, message: 'Juego no encontrado.' }, 404);
  }

  const existingProduct = game.products.find((item) => normalizeLookupText(item.label) === normalizeLookupText(productLabel));
  if (!existingProduct) {
    return jsonResponse({ success: false, message: 'Producto no encontrado.' }, 404);
  }

  const incomingKey = { gameSlug, productLabel };
  const nextOverrides = overrides.filter((item) => !isSameProduct(item, incomingKey));

  const updatedOverride: ProductOverride = {
    gameSlug,
    productLabel,
    usd,
    stock: existingProduct.stock,
    active,
    deleted: false,
  };

  nextOverrides.push(updatedOverride);
  await saveProductOverrides(nextOverrides);

  return jsonResponse({ success: true, message: 'Producto actualizado.', product: updatedOverride }, 200);
};

export const DELETE: APIRoute = async ({ request }) => {
  const payload = await parseOverrideBody(request);
  if (!payload) {
    return jsonResponse({ success: false, message: 'Body JSON invalido.' }, 400);
  }

  const gameSlug = getStringField(payload.gameSlug);
  const productLabel = getStringField(payload.productLabel);

  if (!gameSlug || !productLabel) {
    return jsonResponse({ success: false, message: 'Datos invalidos para eliminar producto.' }, 400);
  }

  const { mergedGames, overrides } = await getMergedGames();
  const game = mergedGames.find((item) => item.slug === gameSlug);
  if (!game) {
    return jsonResponse({ success: false, message: 'Juego no encontrado.' }, 404);
  }

  const existingProduct = game.products.find((item) => normalizeLookupText(item.label) === normalizeLookupText(productLabel));
  if (!existingProduct) {
    return jsonResponse({ success: false, message: 'Producto no encontrado.' }, 404);
  }

  const incomingKey = { gameSlug, productLabel };
  const nextOverrides = overrides.filter((item) => !isSameProduct(item, incomingKey));

  nextOverrides.push({
    gameSlug,
    productLabel,
    usd: existingProduct.usd,
    stock: existingProduct.stock,
    active: false,
    deleted: true,
  });

  await saveProductOverrides(nextOverrides);

  return jsonResponse({ success: true, message: 'Producto eliminado.' }, 200);
};
