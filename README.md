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

Somos varias personas con acceso de escritura — el flujo completo (ramas, PR,
convención de migraciones) vive en [CONTRIBUTING.md](CONTRIBUTING.md). Esta sección es
solo cómo levantar tu entorno local.

```bash
pnpm install
```

### Antes que nada: en esta máquina hay DOS Supabase locales

No es un error, y **no apagues ninguno**. Son dos repos distintos, cada uno con su
stack:

| Repo | API | DB | Studio |
|---|---|---|---|
| **`cayla-retail` — este** | **54421** | **54422** | **54423** |
| `cayla-dynamic` (asistencia/planilla, `~/cayla-dynamic`) | 54321 | 54322 | 54323 |

**54321 es el default de Supabase, y NO es el nuestro.** Apuntar ahí no explota: la
base local de Dynamic es la foto de la producción unificada, así que también tiene un
schema `retail`, pero con menos tablas y más atrasado. Catálogo, stock y ventas responden
normal; lo que falta son las tablas posteriores a la unificación (`comprobantes`,
`conteos`, `colores`, `stock_almacen`…). O sea que Facturación y Conteo fallan
mientras el resto anda, y eso se diagnostica como bug del repo. Costó una hora, cuatro
veces distintas (BITACORA 2026-09-09).

Antes de creerle a cualquier síntoma raro en local, pregunta con qué base estás
hablando:

```bash
pnpm local:donde
```

Contesta en un segundo qué stacks corren, cuál declara este repo, cuál va a leer la
app —incluyendo el caso feo: una `NEXT_PUBLIC_SUPABASE_URL` exportada en tu terminal
le gana al archivo— y qué puerto trae de verdad el bundle que sirve el `:3000` que ya
tengas corriendo, que es el único testigo que no opina.

### Levantar el entorno local completo

Hasta el 2026-09-05 la app **no podía** correr contra el Supabase local (ver
ADR-0010). Ya sí. Desde cero, primero el stub local de Dynamic (una sola vez, ver
[ADR-0033](docs/adr/0033-stub-local-de-dynamic-para-poder-desarrollar-sin-red.md) —
el archivo destino queda fuera de git a propósito, así que cada quien lo genera
localmente desde la plantilla):

```bash
cp supabase/0000_local_stub_dynamic.sql.example supabase/migrations/0000_local_stub_dynamic.sql
```

Y ahora sí, el entorno completo:

```bash
npx supabase start
```

Eso levanta Postgres, la API, Auth y Studio; aplica todas las migraciones de
`supabase/migrations/` (con el stub de arriba ya adentro); y corre `supabase/seed.sql`,
que siembra lo mínimo para entrar: dos personas (Felipe, líder en LIM; Micaela,
integrante en TRU — para poder probar que RLS de verdad acota por ubicación) y un
catálogo de prueba con movimiento real.

Copia las claves que imprime a `apps/web/.env.local` (plantilla en
`apps/web/.env.example`):

```bash
cp apps/web/.env.example apps/web/.env.local   # y pega API_URL y PUBLISHABLE_KEY
```

```bash
pnpm dev
```

Entra en http://localhost:3000 con **felipe@cayla.local** / **cayla-local** (líder) o
**micaela@cayla.local** / **cayla-local** (integrante).

Para volver la base a cero (rehace migraciones + seed):

```bash
npx supabase db reset
```

**Qué NO funciona en local:** subir fotos de producto — el servicio de Storage
está apagado a propósito en `supabase/config.toml` porque es el único que queda
"unhealthy" y hacía abortar `supabase start` entero. Todo lo demás que existe hoy en V2
(catálogo, ventas, caja/pagos múltiples, cambios de talla/color, facturación) funciona
igual que en producción. **Comercial, Finanzas, Producción y Taxonomía universal
quedaron fuera del corte V1→V2** (`0af2f1b`, 2026-09-12) — no tenían pantalla propia en
V2 y su data en retail era de prueba, no de operación real. Vuelven en una fase futura
si se decide reconstruirlos sobre V2.

**El catálogo no se siembra**: son SKUs reales que se cargan por la pantalla de
Recibir mercadería (`docs/GUIA-CARGA-CATALOGO.md`). Un catálogo de juguete haría
que el módulo de Inteligencia mienta.
