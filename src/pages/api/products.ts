import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabaseClient';

// ============================================
// INTERFACES
// ============================================
interface ProductOverride {
  gameSlug: string;
  productLabel: string;
  usd: number;
  stock: number;
  active: boolean;
  deleted?: boolean;
  imagen_url?: string; // 🆕 Para guardar la URL de la imagen
}

interface UpdateProductInput {
  gameSlug?: unknown;
  productLabel?: unknown;
  usd?: unknown;
  active?: unknown;
  imagen_url?: unknown; // 🆕 Para recibir la URL de la imagen
}

// ============================================
// HELPERS
// ============================================
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

// ============================================
// FUNCIONES DE SUPABASE
// ============================================

// Obtener todos los productos de Supabase
async function getProductosFromSupabase() {
  const { data, error } = await supabase
    .from('productos') // ← Cambia "productos" por el nombre de tu tabla
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al obtener productos:', error);
    return [];
  }

  return data || [];
}

// Guardar/actualizar producto en Supabase
async function saveProductToSupabase(product: ProductOverride) {
  // Primero, buscar si el producto ya existe
  const { data: existing } = await supabase
    .from('productos')
    .select('id')
    .eq('game_slug', product.gameSlug)
    .eq('product_label', product.productLabel)
    .single();

  if (existing) {
    // Actualizar producto existente
    const { error } = await supabase
      .from('productos')
      .update({
        usd: product.usd,
        stock: product.stock,
        active: product.active,
        deleted: product.deleted || false,
        imagen_url: product.imagen_url || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);

    if (error) throw error;
    return { success: true, message: 'Producto actualizado' };
  } else {
    // Crear nuevo producto
    const { error } = await supabase
      .from('productos')
      .insert([{
        game_slug: product.gameSlug,
        product_label: product.productLabel,
        usd: product.usd,
        stock: product.stock,
        active: product.active,
        deleted: product.deleted || false,
        imagen_url: product.imagen_url || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);

    if (error) throw error;
    return { success: true, message: 'Producto creado' };
  }
}

// Eliminar producto (soft delete) en Supabase
async function deleteProductFromSupabase(gameSlug: string, productLabel: string) {
  const { error } = await supabase
    .from('productos')
    .update({
      deleted: true,
      active: false,
      updated_at: new Date().toISOString()
    })
    .eq('game_slug', gameSlug)
    .eq('product_label', productLabel);

  if (error) throw error;
  return { success: true, message: 'Producto eliminado' };
}

// ============================================
// API ROUTES
// ============================================

// 🟢 GET - Obtener todos los productos
export const GET: APIRoute = async () => {
  try {
    const productos = await getProductosFromSupabase();
    return jsonResponse({ 
      success: true, 
      data: productos 
    }, 200);
  } catch (error) {
    console.error('Error en GET productos:', error);
    return jsonResponse({ 
      success: false, 
      message: 'Error al obtener productos' 
    }, 500);
  }
};

// 🟡 POST - Crear nuevo producto
export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await parseOverrideBody(request);
    if (!payload) {
      return jsonResponse({ success: false, message: 'Body JSON invalido.' }, 400);
    }

    const gameSlug = getStringField(payload.gameSlug);
    const productLabel = getStringField(payload.productLabel);
    const usd = getNumberField(payload.usd);
    const active = getBooleanField(payload.active);
    const imagen_url = getStringField(payload.imagen_url) || null;

    if (!gameSlug || !productLabel || usd === null || active === null) {
      return jsonResponse({ 
        success: false, 
        message: 'Datos invalidos para crear producto.' 
      }, 400);
    }

    // Verificar si ya existe
    const { data: existing } = await supabase
      .from('productos')
      .select('id')
      .eq('game_slug', gameSlug)
      .eq('product_label', productLabel)
      .single();

    if (existing) {
      return jsonResponse({ 
        success: false, 
        message: 'Ya existe un producto con ese nombre en este juego.' 
      }, 409);
    }

    const newProduct: ProductOverride = {
      gameSlug,
      productLabel,
      usd,
      stock: 0,
      active,
      imagen_url: imagen_url || undefined
    };

    await saveProductToSupabase(newProduct);
    return jsonResponse({ 
      success: true, 
      message: 'Producto creado.', 
      product: newProduct 
    }, 201);

  } catch (error) {
    console.error('Error en POST productos:', error);
    return jsonResponse({ 
      success: false, 
      message: 'Error interno al crear producto' 
    }, 500);
  }
};

// 🔵 PUT - Actualizar producto existente
export const PUT: APIRoute = async ({ request }) => {
  try {
    const payload = await parseOverrideBody(request);
    if (!payload) {
      return jsonResponse({ success: false, message: 'Body JSON invalido.' }, 400);
    }

    const gameSlug = getStringField(payload.gameSlug);
    const productLabel = getStringField(payload.productLabel);
    const usd = getNumberField(payload.usd);
    const active = getBooleanField(payload.active);
    const imagen_url = getStringField(payload.imagen_url) || null;

    if (!gameSlug || !productLabel || usd === null || active === null) {
      return jsonResponse({ 
        success: false, 
        message: 'Datos invalidos para actualizar producto.' 
      }, 400);
    }

    // Verificar si existe
    const { data: existing, error: findError } = await supabase
      .from('productos')
      .select('id')
      .eq('game_slug', gameSlug)
      .eq('product_label', productLabel)
      .single();

    if (findError || !existing) {
      return jsonResponse({ 
        success: false, 
        message: 'Producto no encontrado.' 
      }, 404);
    }

    const updatedProduct: ProductOverride = {
      gameSlug,
      productLabel,
      usd,
      stock: 0,
      active,
      imagen_url: imagen_url || undefined
    };

    await saveProductToSupabase(updatedProduct);
    return jsonResponse({ 
      success: true, 
      message: 'Producto actualizado.', 
      product: updatedProduct 
    }, 200);

  } catch (error) {
    console.error('Error en PUT productos:', error);
    return jsonResponse({ 
      success: false, 
      message: 'Error interno al actualizar producto' 
    }, 500);
  }
};

// 🔴 DELETE - Eliminar producto (soft delete)
export const DELETE: APIRoute = async ({ request }) => {
  try {
    const payload = await parseOverrideBody(request);
    if (!payload) {
      return jsonResponse({ success: false, message: 'Body JSON invalido.' }, 400);
    }

    const gameSlug = getStringField(payload.gameSlug);
    const productLabel = getStringField(payload.productLabel);

    if (!gameSlug || !productLabel) {
      return jsonResponse({ 
        success: false, 
        message: 'Datos invalidos para eliminar producto.' 
      }, 400);
    }

    // Verificar si existe
    const { data: existing, error: findError } = await supabase
      .from('productos')
      .select('id')
      .eq('game_slug', gameSlug)
      .eq('product_label', productLabel)
      .single();

    if (findError || !existing) {
      return jsonResponse({ 
        success: false, 
        message: 'Producto no encontrado.' 
      }, 404);
    }

    await deleteProductFromSupabase(gameSlug, productLabel);
    return jsonResponse({ 
      success: true, 
      message: 'Producto eliminado.' 
    }, 200);

  } catch (error) {
    console.error('Error en DELETE productos:', error);
    return jsonResponse({ 
      success: false, 
      message: 'Error interno al eliminar producto' 
    }, 500);
  }
};