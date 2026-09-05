# CAYLA Retail

Sistema de inventario multi-sede, producción y compras para CAYLA — proyecto nuevo y
separado de `cayla-dynamic` (asistencia/planilla). Reemplaza, cuando esté probado, a
CAYLA Inventario (Google Sheets/Apps Script).

## Sedes reales
TRU (Trujillo, tienda) · AQP (Arequipa, tienda) · LIM (Lima, tienda) · Taller (Lima, fábrica)
"Online" es un canal de venta, no una sede — despacha desde el stock real de alguna sede.

## Estructura
- `apps/web` — Next.js: catálogo, stock por sede, movimientos (Fase 1).
- `packages/shared` — Zod schemas, enums (sedes, roles, tipos de movimiento).
- `packages/database` — cliente Supabase tipado.
- `supabase/` — migraciones.

## Desarrollo

```bash
pnpm install
```

### Levantar el entorno local completo

Hasta el 2026-09-05 la app **no podía** correr contra el Supabase local (ver
ADR-0010). Ya sí. Desde cero:

```bash
npx supabase start
```

Eso levanta Postgres, la API, Auth y Studio; aplica las 34 migraciones; y corre
`supabase/seed.sql`, que mueve las tablas al schema `retail` (igual que
producción) y siembra lo mínimo para entrar: un usuario, su persona Líder y las
series de comprobantes de AQP.

Copia las claves que imprime a `apps/web/.env.local` (plantilla en
`apps/web/.env.example`):

```bash
cp apps/web/.env.example apps/web/.env.local   # y pega API_URL y PUBLISHABLE_KEY
```

```bash
pnpm dev
```

Entra en http://localhost:3000 con **felipe@cayla.local** / **cayla-local**.

Para volver la base a cero (rehace migraciones + seed):

```bash
npx supabase db reset
```

**Qué NO funciona en local:** subir fotos de producto — el servicio de Storage
está apagado a propósito en `supabase/config.toml` porque es el único que queda
"unhealthy" y hacía abortar `supabase start` entero. Todo lo demás (catálogo,
ventas, finanzas, facturación, producción) funciona igual que en producción.

**El catálogo no se siembra**: son SKUs reales que se cargan por la pantalla de
Recibir mercadería (`docs/GUIA-CARGA-CATALOGO.md`). Un catálogo de juguete haría
que el módulo de Inteligencia mienta.
