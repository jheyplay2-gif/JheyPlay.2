import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  if (context.url.pathname.startsWith('/admin')) {
    const auth = context.request.headers.get('authorization');

    if (!auth || !auth.startsWith('Basic ')) {
      return new Response('Necesitas autenticarte', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Zona de Administración"',
        },
      });
    }

    const validUser = import.meta.env.ADMIN_USER;
    const validPass = import.meta.env.ADMIN_PASS;

    try {
      const encodedCredentials = auth.slice(6).trim();
      const decodedCredentials = atob(encodedCredentials);
      const separatorIndex = decodedCredentials.indexOf(':');

      if (separatorIndex <= 0) {
        throw new Error('Invalid basic auth format');
      }

      const user = decodedCredentials.slice(0, separatorIndex);
      const pass = decodedCredentials.slice(separatorIndex + 1);

      if (user !== validUser || pass !== validPass) {
        return new Response('Credenciales incorrectas', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Zona de Administración"',
          },
        });
      }
    } catch {
      return new Response('Necesitas autenticarte', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Zona de Administración"',
        },
      });
    }
  }

  return next();
});