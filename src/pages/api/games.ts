import type { APIRoute } from 'astro';
import { games } from '../../data/games';
import { getMergedGames } from '../../data/catalog';
import { supabaseServer } from '../../lib/supabaseServer';
import {
  listGameOverrides,
  saveGameOverrides,
  saveProductOverrides,
  upsertGameOverride,
} from '../../data/store';

const jsonHeaders = { 'Content-Type': 'application/json' };

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_GAME_IMAGE = '/games/default-game-cover.svg';
const GAME_COVER_BUCKETS = ['game-covers', 'productos'];
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

interface CreateGamePayload {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  image?: unknown;
}

interface DeleteGamePayload {
  gameSlug?: unknown;
}

const getStringField = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

export const GET: APIRoute = async () => {
  const { mergedGames, exchangeRate } = await getMergedGames();

  return jsonResponse({ success: true, games: mergedGames, exchangeRate }, 200);
};

const handleCoverUpdate = async (request: Request) => {
  const formData = await request.formData();
  const gameSlugField = formData.get('gameSlug');
  const imageField = formData.get('coverImage');

  const gameSlug = typeof gameSlugField === 'string' ? gameSlugField.trim() : '';
  if (!gameSlug) {
    return jsonResponse({ success: false, message: 'Debes indicar el juego.' }, 400);
  }

  if (!(imageField instanceof File) || imageField.size <= 0) {
    return jsonResponse({ success: false, message: 'Debes subir una imagen valida.' }, 400);
  }

  if (imageField.size > MAX_IMAGE_SIZE_BYTES) {
    return jsonResponse({ success: false, message: 'La imagen supera el limite de 5 MB.' }, 413);
  }

  const extension = MIME_TO_EXTENSION[imageField.type];
  if (!extension) {
    return jsonResponse({ success: false, message: 'Formato no permitido. Usa JPG, PNG, WEBP o GIF.' }, 415);
  }

  const [{ mergedGames }, gameOverrides] = await Promise.all([getMergedGames(), listGameOverrides()]);
  const game = mergedGames.find((item) => item.slug === gameSlug);
  if (!game) {
    return jsonResponse({ success: false, message: 'Juego no encontrado.' }, 404);
  }

  const safeSlug = gameSlug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const fileName = `${safeSlug}/${Date.now()}.${extension}`;

  let uploadBucket = '';
  let uploadError: Error | null = null;

  for (const bucketName of GAME_COVER_BUCKETS) {
    const { error } = await supabaseServer.storage
      .from(bucketName)
      .upload(fileName, imageField, {
        cacheControl: '3600',
        upsert: true,
        contentType: imageField.type,
      });

    if (!error) {
      uploadBucket = bucketName;
      uploadError = null;
      break;
    }

    uploadError = error;
  }

  if (uploadError || !uploadBucket) {
    return jsonResponse(
      {
        success: false,
        message: 'No se pudo subir la portada a Supabase.',
        details: {
          bucketsAttempted: GAME_COVER_BUCKETS,
          path: fileName,
          code: uploadError?.name ?? null,
          error: uploadError?.message ?? String(uploadError),
        },
      },
      500,
    );
  }

  const { data: publicUrlData } = supabaseServer.storage.from(uploadBucket).getPublicUrl(fileName);
  const image = publicUrlData.publicUrl;

  if (!image) {
    return jsonResponse({ success: false, message: 'No se pudo obtener la URL de la portada.' }, 500);
  }

  const previousOverride = gameOverrides.find((item) => item.gameSlug === gameSlug);
  const nextOverride = {
    ...previousOverride,
    gameSlug,
    image,
    deleted: false,
  };

  try {
    await upsertGameOverride(nextOverride);
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: 'La portada se subio, pero no se pudo guardar en base de datos.',
        details: {
          gameSlug,
          image,
          error: error instanceof Error ? error.message : String(error),
        },
      },
      500,
    );
  }

  return jsonResponse({ success: true, message: 'Portada actualizada.', gameSlug, image, bucket: uploadBucket }, 200);
};

export const PUT: APIRoute = async ({ request }) => handleCoverUpdate(request);

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    return handleCoverUpdate(request);
  }

  let payload: CreateGamePayload;

  try {
    payload = (await request.json()) as CreateGamePayload;
  } catch {
    return jsonResponse({ success: false, message: 'Body JSON invalido.' }, 400);
  }

  const name = getStringField(payload.name);
  const description = getStringField(payload.description);
  const providedSlug = getStringField(payload.slug);
  const image = getStringField(payload.image) || DEFAULT_GAME_IMAGE;

  if (!name || !description) {
    return jsonResponse({ success: false, message: 'Debes indicar nombre y descripcion del juego.' }, 400);
  }

  const gameSlug = toSlug(providedSlug || name);
  if (!gameSlug) {
    return jsonResponse({ success: false, message: 'No se pudo generar un slug valido.' }, 400);
  }

  const { mergedGames, gameOverrides } = await getMergedGames();
  const exists = mergedGames.some((item) => item.slug === gameSlug);
  if (exists) {
    return jsonResponse({ success: false, message: 'Ya existe un juego con ese slug.' }, 409);
  }

  const nextOverrides = gameOverrides.filter((item) => item.gameSlug !== gameSlug);
  nextOverrides.push({
    gameSlug,
    name,
    description,
    image,
    custom: true,
    deleted: false,
  });

  await saveGameOverrides(nextOverrides);

  return jsonResponse(
    {
      success: true,
      message: 'Juego creado.',
      game: {
        slug: gameSlug,
        name,
        description,
        image,
      },
    },
    201,
  );
};

export const DELETE: APIRoute = async ({ request }) => {
  let payload: DeleteGamePayload;

  try {
    payload = (await request.json()) as DeleteGamePayload;
  } catch {
    return jsonResponse({ success: false, message: 'Body JSON invalido.' }, 400);
  }

  const gameSlug = getStringField(payload.gameSlug);
  if (!gameSlug) {
    return jsonResponse({ success: false, message: 'Debes indicar el slug del juego.' }, 400);
  }

  const { mergedGames, overrides, gameOverrides } = await getMergedGames();
  const gameExists = mergedGames.some((item) => item.slug === gameSlug);
  if (!gameExists) {
    return jsonResponse({ success: false, message: 'Juego no encontrado.' }, 404);
  }

  const baseGame = games.find((item) => item.slug === gameSlug);
  const previousOverride = gameOverrides.find((item) => item.gameSlug === gameSlug);
  const nextGameOverrides = gameOverrides.filter((item) => item.gameSlug !== gameSlug);

  if (baseGame) {
    nextGameOverrides.push({
      ...previousOverride,
      gameSlug,
      deleted: true,
      custom: false,
    });
  }

  const nextProductOverrides = overrides.filter((item) => item.gameSlug !== gameSlug);
  await saveProductOverrides(nextProductOverrides);

  await saveGameOverrides(nextGameOverrides);

  return jsonResponse({ success: true, message: 'Juego eliminado.' }, 200);
};
