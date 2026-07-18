import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabaseClient';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const archivoImagen = formData.get('imagen') as File;
    const gameSlug = formData.get('gameSlug') as string;
    const productLabel = formData.get('productLabel') as string;

    if (!archivoImagen || !gameSlug || !productLabel) {
      return new Response(JSON.stringify({ 
        error: 'Faltan datos: imagen, gameSlug o productLabel' 
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generar nombre único
    const extension = archivoImagen.name.split('.').pop();
    const nombreUnico = `${gameSlug}/${productLabel}-${Date.now()}.${extension}`;

    // 1. Subir a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('productos') // ← Nombre de tu bucket
        .upload(nombreUnico, archivoImagen, {
            cacheControl: '3600',
            upsert: true // Si existe, lo reemplaza
        });

    if (uploadError) {
      console.error('Error al subir imagen:', uploadError);
      return new Response(JSON.stringify({ 
        error: 'Error al subir la imagen' 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Obtener URL pública
    const { data: publicUrlData } = supabase.storage
        .from('productos')
        .getPublicUrl(nombreUnico);

    const imagenUrl = publicUrlData.publicUrl;

    // 3. Actualizar el producto con la URL de la imagen
    const { error: updateError } = await supabase
        .from('productos')
        .update({ imagen_url: imagenUrl })
        .eq('game_slug', gameSlug)
        .eq('product_label', productLabel);

    if (updateError) {
      console.error('Error al actualizar producto con imagen:', updateError);
      return new Response(JSON.stringify({ 
        error: 'Error al guardar la URL de la imagen' 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Imagen subida exitosamente',
      url: imagenUrl 
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Error interno del servidor' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};