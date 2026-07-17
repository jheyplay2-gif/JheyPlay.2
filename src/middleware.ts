// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  // Solo protegemos las rutas que empiezan con /admin
  if (context.url.pathname.startsWith('/admin')) {
    const auth = context.request.headers.get('authorization');
    
    if (!auth) {
      return new Response('Necesitas autenticarte', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Zona de Administración"'
        }
      });
    }
    
    // Decodificamos el usuario y contraseña
    const [user, pass] = atob(auth.split(' ')[1]).split(':');
    const validUser = import.meta.env.ADMIN_USER;
    const validPass = import.meta.env.ADMIN_PASS;
    
    if (user !== validUser || pass !== validPass) {
      return new Response('Credenciales incorrectas', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Zona de Administración"'
        }
      });
    }
  }
  
  return next();
});