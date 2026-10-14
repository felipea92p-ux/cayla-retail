# Tienda online CAYLA (`apps/tienda`)

La tienda de los clientes: catálogo, «Separar» y recojo en tienda. Es una app aparte del ERP (`apps/web`), con su propio
dominio y su propio inicio de sesión. La arquitectura y el porqué: `docs/adr/0408-…`. Lo que se construye y en qué orden:
`docs/backlog/2026-10-14-customer-catalog-reservation-system-409dbc.md`. Cómo se ve: `docs/maquetas/tienda-online-2026-10/`.

## La única regla

La tienda habla con la base del ERP **solo** por funciones `retail.tienda_*`, con un usuario que hereda el rol `tienda_web`
(sin permiso sobre ninguna tabla). Nunca la llave de servicio ni las llaves públicas del ERP, y nunca un `import` de
`apps/web`. Todo pasa por `lib/base.ts`. Lo vigilan `lib/candados.test.ts` y, en la base, `pnpm pruebas:tienda-puerta`.
Una función nueva para la tienda nace `security definer`, con su `search_path` y cerrada a `public`, `anon` y `authenticated`.

## Levantarla en local

1. La base local del repo arriba (`npx supabase start`) con la migración `20261014220000_tienda_puerta_y_portada.sql`.
2. `pnpm --filter tienda rol-local` crea el usuario `tienda_web_local` (solo local).
3. `cp apps/tienda/.env.example apps/tienda/.env.local`
4. `pnpm --filter tienda dev` → http://localhost:3100 (o «tienda-dev» en `.claude/launch.json`).

Pruebas: `pnpm --filter tienda test`, `typecheck` y `lint`; la puerta en la base, `pnpm pruebas:tienda-puerta`.
