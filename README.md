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
pnpm dev
```
