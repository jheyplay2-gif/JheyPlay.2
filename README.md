# Jhey Play

Sitio web en Astro para catálogo de juegos, pedidos por WhatsApp y panel de administración.

## Estructura

- `src/pages/index.astro`: home con el catálogo.
- `src/pages/juegos/[slug].astro`: página de compra por juego.
- `src/pages/admin/index.astro`: panel de administración.
- `src/pages/api/*`: endpoints para juegos, productos, tasa y órdenes.
- `src/data/store.ts`: capa de persistencia con fallback a JSON cuando no hay PostgreSQL.
- `database/postgres-schema.sql`: esquema base de la base de datos.

## Comandos

- `npm run dev`: arranca el servidor de desarrollo.
- `npm run build`: compila la app para producción.
- `npm run preview`: previsualiza la build localmente.
- `npm run db:setup`: aplica esquema e importa datos iniciales si hay `DATABASE_URL`.

## Notas

- El proyecto usa salida `server` con `@astrojs/node`.
- Si PowerShell bloquea `npm`, usa `cmd /c npm run build`.
