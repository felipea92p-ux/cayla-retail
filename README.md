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

### Revisión antes de cada commit

`pnpm install` deja activado un hook de git (`.githooks/pre-commit`) que, antes de
cada commit, revisa **solo los archivos que estás commiteando**: tipos, tests y
lint. Tarda ~19 s cuando hay código en el commit y ~0,5 s cuando no lo hay
(documentación, SQL, configuración).

Se eligió revisar solo lo del commit por una razón medida: `eslint` sobre el
proyecto entero tarda **4 min 15 s** en la máquina de Felipe. Un hook de cuatro
minutos se saltea con `--no-verify` a la tercera vez, y entonces tampoco corren
los tests.

Los errores de tipos en archivos que **no** son de tu commit avisan pero no te
frenan — en este repo suele haber más de una sesión trabajando a la vez, y no
tiene sentido que el trabajo a medias de otra persona bloquee tu commit
terminado. El build de producción sí los va a rechazar, así que el aviso importa.

Para saltarlo en una emergencia real:

```bash
git commit --no-verify
```

Si el hook no corre, es que falta apuntar git a la carpeta (lo hace `pnpm install`):

```bash
git config core.hooksPath .githooks
```
