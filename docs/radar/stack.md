# Radar · stack (al 2026-11-13)

Alcance: lo salido o anunciado en ~12 meses (nov-2025 → nov-2026) para Next.js, React, PostgreSQL, Supabase, Vercel, herramientas, plataforma web e IA, filtrado por lo que le sirve a un ERP de 3 tiendas + 1 taller (Next.js 16.4.1 + Supabase con RLS/RPC + Vercel).
Anillos (ThoughtWorks): **ADOPTAR** · **PROBAR** · **EVALUAR** · **ESPERAR**.

Contexto que cambia el anillo de varias entradas, medido en el repo el 2026-11-13 (solo lectura):
- Ya en uso: `proxy.ts` (no `middleware.ts`), `getClaims()` (5 archivos; quedan 7 con `auth.getUser`), llaves `PUBLISHABLE_KEY`, `useEffectEvent` (4 archivos), `document.startViewTransition` a mano (3 archivos), `BarcodeDetector` (`EscanerCamara.tsx`), Tailwind 4.3.2 (lockfile), pnpm 12.4.1.
- Versiones del repo frente a lo último en npm (2026-11-13): next 16.4.1 → **16.4.6**; react 19.2.4 → 19.3.1; @supabase/supabase-js ^2.45 → 2.119.0; @sentry/nextjs 10.76.2 → 11.12.0; zod 3.25.76 → 4.6.7; typescript ^5 → 7.0.2; vitest 4.1.10 → 5.1.0; turbo 2.5 → 2.11.11.
- Postgres de producción: el proyecto Supabase sigue en Postgres 15/17. **Postgres 18 todavía no está en Supabase hospedado**, así que todo lo de PG18/PG19 queda en EVALUAR o ESPERAR.

## Tabla resumen

| Novedad | Tecnología | Anillo |
|---|---|---|
| Parche de seguridad 16.4.5 (noviembre 2026) | Next.js | ADOPTAR |
| Cache Components + Partial Prefetching («Instant Navigations») | Next.js | PROBAR |
| Barreras de error con `catchError` y `retry()` | Next.js | PROBAR |
| Resiliencia de red `experimental.useOffline` | Next.js | EVALUAR |
| React Compiler 1.0 (y su versión en Rust) | Next.js / React | PROBAR |
| `next upgrade --agent` y aviso `agentUpgrade: 'security'` | Next.js | ADOPTAR |
| `ensureStatic` para la tienda online | Next.js | EVALUAR |
| `useEffectEvent` | React 19.2 | ADOPTAR |
| `<Activity>` | React 19.2 | PROBAR |
| `<ViewTransition>` estable (React 19.3) | React 19.3 | PROBAR |
| Postgres 18 en Supabase (AIO, skip scan, EXPLAIN) | PostgreSQL / Supabase | EVALUAR |
| `uuidv7()` | PostgreSQL 18 | EVALUAR |
| `OLD`/`NEW` en `RETURNING` | PostgreSQL 18 | EVALUAR |
| Columnas generadas virtuales | PostgreSQL 18 | EVALUAR |
| Restricciones temporales `WITHOUT OVERLAPS` | PostgreSQL 18 | EVALUAR |
| PostgreSQL 19 (RC2) | PostgreSQL 19 | ESPERAR |
| Apagar las llaves heredadas `anon`/`service_role` | Supabase | ADOPTAR |
| Llaves de firma JWT asimétricas + `getClaims()` en todo | Supabase | ADOPTAR |
| La Data API ya no expone tablas nuevas sola | Supabase | ADOPTAR |
| supabase-js 2.45 → 2.119 | Supabase | ADOPTAR |
| Branching 2.0 (ramas sin Git) | Supabase | PROBAR |
| Declarative Schemas 2.0 y desarrollo local sin Docker | Supabase | EVALUAR |
| Advisors de salud, Database Connections y `query_logs` | Supabase | ADOPTAR |
| Supabase Queues (pgmq) + Cron | Supabase | PROBAR |
| Realtime Broadcast from Database | Supabase | PROBAR |
| Passkeys en Supabase Auth (beta) | Supabase | EVALUAR |
| Servidor MCP propio de la app | Supabase | EVALUAR |
| OrioleDB, Multigres y Pipelines | Supabase | ESPERAR |
| Fluid compute + precio por CPU activa | Vercel | ADOPTAR |
| Rolling Releases | Vercel | PROBAR |
| Vercel Workflows (ejecución durable) | Vercel | PROBAR |
| Vercel Queues (beta pública) | Vercel | EVALUAR |
| BotID | Vercel | PROBAR |
| AI Gateway con presupuestos | Vercel | EVALUAR |
| TypeScript 6.0 (el puente) | TypeScript | ADOPTAR |
| TypeScript 7.0 (compilador nativo en Go) | TypeScript | PROBAR |
| Zod 4 | Zod | PROBAR |
| Tailwind v4.2/v4.3 (scrollbar, gutter, logical, `font-features`) | Tailwind | ADOPTAR |
| Vitest 5 (y Browser Mode con capturas) | Vitest | PROBAR |
| Oxlint con análisis por tipos estable (vs. Biome 2) | Lint | PROBAR |
| Almacén virtual global de pnpm + raíces extra de Next 16.4 | pnpm / Next.js | PROBAR |
| Turborepo 2.9–2.11 (`--affected` componible, caché) | Turborepo | PROBAR |
| Sentry SDK v11 (y Logs GA) | Sentry | EVALUAR |
| CSS Anchor Positioning (Baseline) | Web | PROBAR |
| Navigation API (Baseline) | Web | EVALUAR |
| `field-sizing: content` (Baseline 2026) | Web | ADOPTAR |
| View Transitions entre documentos | Web | ESPERAR |
| Animaciones guiadas por scroll | Web | EVALUAR |
| `<select>` personalizable (`appearance: base-select`) | Web | ESPERAR |
| Temporal (fechas y zonas horarias) | Web / JS | EVALUAR |
| WebUSB / Web Serial para la impresora térmica | Web | PROBAR |
| Barcode Detection API | Web | EVALUAR |
| Local-first: Zero 1.0, Electric 1.0, PowerSync | Sync | ESPERAR |
| Salidas estructuradas de Claude (GA) | IA | ADOPTAR |
| PDF + Files API GA + visión de alta resolución (facturas) | IA | PROBAR |
| Caché de prompt automática | IA | ADOPTAR |
| Claude Agent SDK | IA | EVALUAR |
| Especificación MCP 2026-07-28 y MCP Apps | IA | EVALUAR |
| AI SDK 7 | IA | EVALUAR |

Conteo: ADOPTAR 14 · PROBAR 20 · EVALUAR 20 · ESPERAR 5 — **59 entradas**.

---

## 1. Next.js

### Parche de seguridad 16.4.5 (noviembre 2026)
- **Qué es:** publicación programada que corrige 7 avisos: fugas entre «inquilinos» del caché `use cache` (las siete de severidad media según los avisos de GitHub de `vercel/next.js`, verificado el 2026-11-13), una cookie `HttpOnly` filtrada por la cabecera interna `x-middleware-set-cookie` en rutas Edge y un bypass de SVG en el optimizador de imágenes.
- **Versión / fecha:** estable; 16.4.5 (Active LTS) publicado el 2026-11-03; en npm ya hay 16.4.6.
- **Anillo:** ADOPTAR. El repo está en 16.4.1, anterior a este parche y al del 2026-10-14; además Next ahora tiene un ciclo mensual formal de seguridad (desde 2026-07-13).
- **Dónde le serviría a este ERP:** toda la web y la tienda. El optimizador de imágenes (`ImagenDePrenda`, ADR-0168) es parte del alcance del aviso de SVG; los avisos de caché importan el día que se encienda Cache Components.
- **Costo o riesgo:** bajo (versión de parche). Fijar `next@16.4.6` en `apps/web` y `apps/tienda` y correr el CI.
- **Fuente:** https://nextjs.org/blog/november-2026-security-release (2026-11-03); https://nextjs.org/blog/next-security-release-program (2026-07-13) — consultado 2026-11-13.

### Cache Components + Partial Prefetching («Instant Navigations»)
- **Qué es:** el nuevo modelo de Next: nada se cachea solo; con `'use cache'` + `cacheLife` se marca qué parte de la pantalla puede guardarse (en el navegador y en el servidor), y Partial Prefetching precarga la «cáscara» de la ruta para que el clic en un enlace pinte al instante. Trae herramientas de desarrollo: *Instant Insights* (avisa qué navegación no es instantánea), *Navigation Inspector* y el ayudante `instant()` para Playwright.
- **Versión / fecha:** estable con dos banderas (`cacheComponents`, `partialPrefetching`); recomendado para toda app desde 16.4 (2026-10-06); **será el modelo por defecto en Next 17** (anunciado, sin fecha).
- **Anillo:** PROBAR. Es el futuro obligatorio del framework, pero el repo no lo usa (0 archivos con `cacheComponents`) y los avisos de noviembre muestran que el caché por inquilino aún tiene aristas.
- **Dónde le serviría a este ERP:** las pantallas de lectura que cambian poco entre clics (Catálogo ▸ Productos, Análisis, Estados financieros): navegar entre ellas sin esqueleto. La sede va en la URL (`?sede=`) en Finanzas, lo que encaja con caché por parámetro. Piloto acotado: un módulo de solo lectura.
- **Costo o riesgo:** cambia cómo se escribe cada página (Suspense obligatorio alrededor de lo dinámico). Riesgo de negocio: cachear algo que depende de la sesión/RLS y servirlo a otra cuenta; el caché nunca debe guardar resultados de RPC con permisos. Choca con el loader global (ADR-0149) y las reglas de espera; hay que medir.
- **Fuente:** https://nextjs.org/blog/next-16-4 (2026-10-06); https://nextjs.org/blog/next-16-3 (2026-08-03) — consultado 2026-11-13.

### Barreras de error con `catchError` y `retry()`
- **Qué es:** una barrera de error propia (`catchError` de `next/error`) que no rompe `notFound`/`redirect` y trae `retry()` para volver a pedir los Server Components que fallaron, sin recargar la página.
- **Versión / fecha:** estable en 16.3 (2026-08-03).
- **Anillo:** PROBAR. Bajo costo y encaja con el principio 9 (degradarse con gracia).
- **Dónde le serviría a este ERP:** las barreras de error con Aventurero y `/sin-base` (ADR-0450): un «Reintentar» que rehace solo la sección caída (p. ej. una tarjeta de cifras de Inicio) en vez de toda la pantalla.
- **Costo o riesgo:** bajo; convivir con `error.tsx` existentes y con `<RefrescoTrasCorte />` (ADR-0411).
- **Fuente:** https://nextjs.org/blog/next-16-3 (2026-08-03) — consultado 2026-11-13.

### Resiliencia de red `experimental.useOffline`
- **Qué es:** con la bandera, una navegación, fetch o Server Action que pierde la red queda pendiente y se reintenta al volver la conexión; el hook `useOffline()` dice si se está sin red.
- **Versión / fecha:** experimental desde 16.3 (2026-08-03).
- **Anillo:** EVALUAR. Experimental, y el repo ya resolvió el problema a su manera (ADR-0411, «Sin conexión»).
- **Dónde le serviría a este ERP:** reemplazar código propio de `<RefrescoTrasCorte />` y la píldora «Sin conexión» por la pieza del framework, el día que sea estable.
- **Costo o riesgo:** reintentar una Server Action que guarda (cobrar, ajustar stock) es peligroso si la RPC no es idempotente: hay que comprobar que la llamada no se duplique antes de encenderlo.
- **Fuente:** https://nextjs.org/blog/next-16-3 (2026-08-03) — consultado 2026-11-13.

### React Compiler 1.0 (y su versión en Rust)
- **Qué es:** el compilador que memoiza componentes solo (menos `useMemo`/`useCallback` a mano). 1.0 es estable; Next 16.3/16.4 agregan una versión experimental en Rust dentro de Turbopack (34–46 % menos tiempo hasta la primera pantalla en `next dev` en v0).
- **Versión / fecha:** compilador estable 1.0 (2025-10-07); opción `reactCompiler: true` en Next 16; Rust experimental (`turbopackRustReactCompiler`) desde 16.3, mejorado en 16.4.
- **Anillo:** PROBAR. Estable, pero el repo tiene pantallas con mucho movimiento y efectos (`useEffect` que dependen de identidad); la propia nota de React advierte que la memoización puede cambiar cuándo corre un efecto.
- **Dónde le serviría a este ERP:** pantallas pesadas en el cliente: el ticket de Vender, la planilla de «Ajustar stock», la vista rápida de Productos, Análisis. Las reglas nuevas de `eslint-plugin-react-hooks` (`set-state-in-effect`, `refs`) sirven aunque no se encienda el compilador.
- **Costo o riesgo:** encender por carpeta y fijar versión exacta; medir con las pruebas de movimiento (`*-movimiento.test.ts`) y el recorredor de guías.
- **Fuente:** https://react.dev/blog/2025/10/07/react-compiler-1 (2025-10-07); https://nextjs.org/blog/next-16-4 (2026-10-06) — consultado 2026-11-13.

### `next upgrade --agent` y aviso `agentUpgrade: 'security'`
- **Qué es:** un comando que prepara para el agente de código las guías de migración, codemods y pasos de verificación de una versión a otra; y una opción que, al correr `next dev`/`next build`, avisa cuando hay una versión que corrige vulnerabilidades de la instalada.
- **Versión / fecha:** 16.4 (2026-10-06); `agentUpgrade` es experimental, por defecto `'security'`.
- **Anillo:** ADOPTAR. Costo casi cero y el repo se trabaja con Claude Code; habría avisado del 16.4.1 desactualizado.
- **Dónde le serviría a este ERP:** el ritual de sesión: el aviso sale solo en `next dev`. Para pasos grandes (Next 17), `npx next@canary upgrade --agent=latest`.
- **Costo o riesgo:** ninguno con `'security'`. No encender `agentFeedback` (requiere telemetría y envía reportes; el repo es público).
- **Fuente:** https://nextjs.org/blog/next-16-4 (2026-10-06) — consultado 2026-11-13.

### `ensureStatic` para la tienda online
- **Qué es:** `export const ensureStatic = 'navigation' | 'prefetch' | 'shell'` hace fallar el build si un componente dinámico se cuela en una ruta que debía ser estática.
- **Versión / fecha:** 16.4 (2026-10-06), dentro de Cache Components.
- **Anillo:** EVALUAR. Requiere Cache Components; sirve más a `apps/tienda` que al ERP.
- **Dónde le serviría a este ERP:** las vitrinas y fichas de producto de `apps/tienda`: garantizar que sigan siendo estáticas (menos cómputo en la factura de Vercel, ADR-0648).
- **Costo o riesgo:** pasa primero por adoptar Cache Components en la tienda.
- **Fuente:** https://nextjs.org/blog/next-16-4 (2026-10-06) — consultado 2026-11-13.

## 2. React

### `useEffectEvent`
- **Qué es:** un hook para que un efecto lea siempre el valor más reciente de props/estado sin tener que reiniciarse cuando ese valor cambia.
- **Versión / fecha:** estable en React 19.2 (2025-10-01).
- **Anillo:** ADOPTAR. Ya está en 4 archivos del repo; falta volverlo la forma estándar.
- **Dónde le serviría a este ERP:** suscripciones y temporizadores que leen estado: la pregunta cada 5 min de «Hay una versión nueva», el aviso de cierre de caja, `useEscapeLibre`, los atajos de teclado de las hojas. Evita dependencias falsas en `useEffect`.
- **Costo o riesgo:** bajo. Funciona con `eslint-plugin-react-hooks` reciente.
- **Fuente:** https://react.dev/blog/2025/10/01/react-19-2 (2025-10-01) — consultado 2026-11-13.

### `<Activity>`
- **Qué es:** un componente que oculta una parte de la pantalla sin desmontarla (modo `hidden`/`visible`): conserva su estado y puede pre-renderizar en segundo plano.
- **Versión / fecha:** estable en React 19.2 (2025-10-01).
- **Anillo:** PROBAR. No se usa en el repo; tiene encaje claro en pestañas con estado caro.
- **Dónde le serviría a este ERP:** pestañas que hoy pierden lo escrito o se vuelven a cargar al cambiar (pestañas de Análisis, de Configuración, pasos de Nuevo producto, «Contar» de Recibir): volver a la pestaña con todo como estaba.
- **Costo o riesgo:** lo oculto sigue ocupando memoria; los efectos se pausan al ocultar (revisar temporizadores y animaciones de ADR-0136).
- **Fuente:** https://react.dev/blog/2025/10/01/react-19-2 (2025-10-01) — consultado 2026-11-13.

### `<ViewTransition>` estable (React 19.3)
- **Qué es:** un componente que anima entradas, salidas, movimientos y cambios de tamaño usando la View Transition API del navegador, con tipos de transición (`addTransitionType`) y animación del paso de Suspense a contenido. 19.3 también trae Fragment refs, `browser()` (sacar un componente del render en servidor) y soporte de Trusted Types.
- **Versión / fecha:** estable en React 19.3 (2026-09-09); Next 16.4 la incluye.
- **Anillo:** PROBAR. El repo llama a `document.startViewTransition` a mano en 3 lugares (Observatorio, tema, Inicio de almacén).
- **Dónde le serviría a este ERP:** reemplazar esos tres usos manuales por la pieza de React; animar el cambio de vista GRILLA/TABLA o una fila que se abre, sin escribir `flushSync`.
- **Costo o riesgo:** subir `react`/`react-dom` de 19.2.4 a 19.3.1. Debe respetar «Las animaciones arrancan apagadas» (ADR-0625): envolver con `useQuieto()` y pasar por ADR-0136 antes de cualquier animación nueva.
- **Fuente:** https://react.dev/blog/2026/09/09/react-19-3 (2026-09-09) — consultado 2026-11-13.

## 3. PostgreSQL

### Postgres 18 en Supabase (AIO, skip scan, EXPLAIN con buffers)
- **Qué es:** PG18 trae E/S asíncrona (hasta 3× en lecturas), *skip scan* en índices B-tree de varias columnas (usa el índice aunque la consulta no filtre la primera columna), `EXPLAIN ANALYZE` con buffers por defecto y `pg_upgrade` que conserva estadísticas.
- **Versión / fecha:** PG18 estable el 2025-09-25 (última menor 18.7, 2026-11-12). **En Supabase hospedado aún no está**: el último comentario del personal (2026-05-04) habla de «eventualmente en 2026».
- **Anillo:** EVALUAR. Es la puerta de todas las entradas de PG18 de abajo; no depende de nosotros.
- **Dónde le serviría a este ERP:** las RPC de listado y Análisis que filtran por `(ubicacion_id, variante_id, …)` sin la primera columna (skip scan); el vigía `/api/salud` se beneficia de lecturas más rápidas.
- **Costo o riesgo:** la subida la decide Supabase y afecta al proyecto de Dynamic entero (retail vive en su schema). Reindexar `pg_trgm` y FTS tras el upgrade; `md5` deprecado.
- **Fuente:** https://www.postgresql.org/about/news/postgresql-18-released-3142/ (2025-09-25); https://github.com/orgs/supabase/discussions/42681 (comentario 2026-05-04) — consultado 2026-11-13.

### `uuidv7()`
- **Qué es:** función nativa que genera UUID ordenados por tiempo: mejor localidad en índices que `gen_random_uuid()` en tablas que solo crecen.
- **Versión / fecha:** PG18 (2025-09-25).
- **Anillo:** EVALUAR. Espera PG18 en Supabase; no justifica migrar ids existentes.
- **Dónde le serviría a este ERP:** las tablas append-only de alto volumen: `movimientos`, líneas de venta, logs de comprobantes SUNAT. Solo para tablas nuevas.
- **Costo o riesgo:** el UUIDv7 deja ver la hora de creación en el id (no usar en ids que salgan en URLs públicas de la tienda si eso importa). Zod 4 ya trae `z.uuidv7()`.
- **Fuente:** https://www.postgresql.org/about/news/postgresql-18-released-3142/ (2025-09-25) — consultado 2026-11-13.

### `OLD`/`NEW` en `RETURNING`
- **Qué es:** `UPDATE … RETURNING old.cantidad, new.cantidad` devuelve el valor de antes y el de después en la misma sentencia (también en `INSERT`, `DELETE`, `MERGE`).
- **Versión / fecha:** PG18 (2025-09-25).
- **Anillo:** EVALUAR. Espera PG18 en Supabase.
- **Dónde le serviría a este ERP:** las RPC que actualizan el snapshot `stock` y escriben el `movimiento`: obtener «antes/después» sin un `SELECT … FOR UPDATE` previo, y el «Deshacer» de los avisos sin otra lectura.
- **Costo o riesgo:** reescribir RPC `security definer` delicadas (stock y caja son decisión de Felipe).
- **Fuente:** https://www.postgresql.org/about/news/postgresql-18-released-3142/ (2025-09-25) — consultado 2026-11-13.

### Columnas generadas virtuales
- **Qué es:** columnas calculadas al leer (no ocupan disco) y ahora el tipo por defecto de `GENERATED ALWAYS AS`.
- **Versión / fecha:** PG18 (2025-09-25).
- **Anillo:** EVALUAR. Espera PG18; ojo con el cambio de valor por defecto.
- **Dónde le serviría a este ERP:** derivados simples que hoy se repiten en vistas o en `lib/*.ts`: margen = precio − costo, nombre visible de la variante (modelo + color + talla).
- **Costo o riesgo:** un `GENERATED … ` escrito sin `STORED` cambia de comportamiento entre versiones; las migraciones nuevas deben decir `STORED` o `VIRTUAL` explícito.
- **Fuente:** https://www.postgresql.org/about/news/postgresql-18-released-3142/ (2025-09-25) — consultado 2026-11-13.

### Restricciones temporales `WITHOUT OVERLAPS`
- **Qué es:** `PRIMARY KEY (sede_id, vigencia WITHOUT OVERLAPS)` impide en la base que dos rangos de fechas se pisen; `PERIOD` hace lo mismo en llaves foráneas.
- **Versión / fecha:** PG18 (2025-09-25); PG19 suma `UPDATE/DELETE … FOR PORTION OF`.
- **Anillo:** EVALUAR. Encaja con el principio 2 (estado imposible = esquema mal), pero espera PG18.
- **Dónde le serviría a este ERP:** campañas y precios con vigencia (dos campañas en la misma categoría y fechas), turnos/asistencia, metas por mes: hoy se cuidan con validación en RPC; esto lo vuelve un candado de la base.
- **Costo o riesgo:** requiere `btree_gist`; Supabase avisó que índices `btree_gist` pueden requerir reindexado tras sus parches (2026-09-25).
- **Fuente:** https://www.postgresql.org/about/news/postgresql-18-released-3142/ (2025-09-25); https://supabase.com/changelog (entrada 2026-09-25) — consultado 2026-11-13.

### PostgreSQL 19 (RC2)
- **Qué es:** `INSERT … ON CONFLICT DO SELECT … RETURNING` (devuelve la fila que chocó), `GROUP BY ALL`, `FOR PORTION OF`, inserciones con FK hasta 2× más rápidas, `REPACK CONCURRENTLY`, `WAIT FOR LSN`, autovacuum paralelo; JIT apagado y `lz4` por defecto.
- **Versión / fecha:** Beta 1 el 2026-06-04; **RC2 el 2026-11-12** (aún no GA).
- **Anillo:** ESPERAR. Ni GA ni PG18 en Supabase.
- **Dónde le serviría a este ERP:** `ON CONFLICT DO SELECT` simplifica RPC idempotentes (doble clic en «Cobrar», ADR-0356); inserts con FK más rápidos ayudan a `movimientos`.
- **Costo o riesgo:** ninguno hoy; vigilar.
- **Fuente:** https://www.postgresql.org/about/news/postgresql-19-beta-1-released-3313/ (2026-06-04); https://www.postgresql.org/about/newsarchive/ (2026-11-12) — consultado 2026-11-13.

## 4. Supabase

### Apagar las llaves heredadas `anon`/`service_role`
- **Qué es:** Supabase reemplaza las llaves JWT de larga vida por `sb_publishable_…` (respeta RLS) y `sb_secret_…` (salta RLS, bloqueada en navegadores). Las heredadas siguen vivas hasta que se apagan a mano en *Settings ▸ API Keys*.
- **Versión / fecha:** nuevas llaves disponibles desde 2025; Supabase retira las heredadas «a fines de 2026» (sin fecha exacta publicada).
- **Anillo:** ADOPTAR. Fecha límite en ~7 semanas.
- **Dónde le serviría a este ERP:** el repo ya usa `PUBLISHABLE_KEY` (7 archivos); falta confirmar que `lib/supabase-admin.ts` use una `sb_secret_` y no el JWT `service_role`, revisar Vercel, CI, scripts y vigías, y luego **apagar las heredadas**. Ojo: el proyecto es el de Dynamic, así que apagar afecta a Dynamic también.
- **Costo o riesgo:** decisión que toca dos sistemas (regla de «más de un módulo»): coordinar con Dynamic antes de apagar.
- **Fuente:** https://supabase.com/docs/guides/api/api-keys ; https://supabase.com/blog/jwt-signing-keys (2025-07-14) — consultado 2026-11-13.

### Llaves de firma JWT asimétricas + `getClaims()` en todo
- **Qué es:** con llaves asimétricas, `getClaims()` verifica el token localmente con Web Crypto (llave pública en caché) en vez de llamar a Auth como `getUser()`.
- **Versión / fecha:** lanzado el 2025-07-14; proyectos existentes migrados el 2025-10-01.
- **Anillo:** ADOPTAR. Ya en 5 archivos; quedan 7 con `auth.getUser`.
- **Dónde le serviría a este ERP:** `proxy.ts`, `exigirModulo` y los layouts: una llamada de red menos por pantalla, y la sesión se valida aunque Auth no responda (principio 9, ADR-0450).
- **Costo o riesgo:** `getClaims()` no detecta una cuenta suspendida hasta que expire el token; donde importe (suspender a alguien al instante) mantener `getUser` o verificar contra `colaboradores`.
- **Fuente:** https://supabase.com/blog/jwt-signing-keys (2025-07-14) — consultado 2026-11-13.

### La Data API ya no expone tablas nuevas sola
- **Qué es:** las tablas nuevas del schema `public` ya no quedan expuestas automáticamente a la Data API/GraphQL: requieren `grant` explícito. Por defecto en proyectos nuevos desde 2026-05-30 y **aplicado a todos desde 2026-10-30**. También: `pg_graphql` deja de activarse solo y el OpenAPI no se entrega a la llave anónima.
- **Versión / fecha:** anunciado 2026-04-28; vigente 2026-10-30.
- **Anillo:** ADOPTAR (como regla de migraciones).
- **Dónde le serviría a este ERP:** una tabla nueva leída desde el navegador o con `.from()` necesita su `grant` en la migración. Las que solo se leen por RPC `security definer` siguen igual (y es lo más seguro, ya es la convención del repo).
- **Costo o riesgo:** «la tabla no aparece» parecerá un bug de RLS; documentarlo en CLAUDE.md junto a las reglas del SQL Editor.
- **Fuente:** https://supabase.com/changelog (entradas 2026-04-28, 2026-01-26, 2026-02-17) — consultado 2026-11-13.

### supabase-js 2.45 → 2.119
- **Qué es:** 2.119.0 (2026-11-04) reintenta solo los GET/HEAD a PostgREST ante errores transitorios (desde 2026-04-20), infiere tipos de funciones `SETOF` en `.select()`, y PostgREST v14 da ~20 % más rendimiento en GET.
- **Versión / fecha:** estable; las librerías dejaron Node 20 el 2026-06-30 y exigirán TypeScript ≥ 5.0 desde 2027-01-31.
- **Anillo:** ADOPTAR. El repo declara `^2.45.0`, muy atrás.
- **Dónde le serviría a este ERP:** las RPC de listado y búsquedas: menos errores visibles por un corte breve; tipos mejores en `packages/database`.
- **Costo o riesgo:** bajo (misma versión mayor). Revisar que el reintento no aplique a nada que escriba (solo GET/HEAD, según Supabase) y que `datos:comparar` siga verde.
- **Fuente:** https://supabase.com/changelog (entradas 2026-04-20, 2025-12-11, 2025-10-22, 2026-05-08, 2026-07-10) — consultado 2026-11-13.

### Branching 2.0 (ramas sin Git)
- **Qué es:** ramas de base creadas desde el panel, CLI o API, sin conectar GitHub: copian schema, funciones y configuración (no los datos) y se fusionan a producción desde el panel con revisión de cambios.
- **Versión / fecha:** anunciado 2025-07-16 (vista previa); desde 2026-05-07 las ramas funcionan sin Git por defecto; 2026-10-15 migraciones y funciones más rápidas en ramas.
- **Anillo:** PROBAR. Ataca el dolor más caro del repo: pegar migraciones en el SQL Editor de producción (deadlocks, prefijo `retail.`, líneas agregadas).
- **Dónde le serviría a este ERP:** ensayar una migración «partida en partes» (ADR-0195) en una rama idéntica a producción antes de pegarla; probar la segunda llave que tumbó Existencias (memoria del 2026-11-10).
- **Costo o riesgo:** la rama copia el proyecto de Dynamic entero; roles creados en el panel no se copian; costo por rama (no publicado en el anuncio; ver precios). Requiere coordinación con Dynamic.
- **Fuente:** https://supabase.com/blog/branching-2-0 (2025-07-16); https://supabase.com/changelog (2026-05-07) — consultado 2026-11-13.

### Declarative Schemas 2.0 y desarrollo local sin Docker
- **Qué es:** el schema vive como archivos SQL en el repo y `pg-delta` genera la migración por diferencia; y una pila local que corre como procesos nativos (sin Docker), varias por carpeta.
- **Versión / fecha:** anunciados en Supabase Select 2026 (2026-10-02); local sin Docker en alfa (apagado por defecto).
- **Anillo:** EVALUAR. Muy nuevo y choca con la forma actual (migraciones con reservas `pnpm reservar migracion`, reemplazos anclados).
- **Dónde le serviría a este ERP:** las pilas locales compartidas entre sesiones (puertos 54621…, «base local con huecos»): una pila por worktree sin Docker reduciría choques.
- **Costo o riesgo:** alfa; cambiar el flujo de migraciones toca ADR-0381 y los candados del CI.
- **Fuente:** https://supabase.com/blog/supabase-select-2026-recap (2026-10-02) — consultado 2026-11-13.

### Advisors de salud, Database Connections y `query_logs`
- **Qué es:** avisos automáticos de tasa de error en Data API, Auth, Storage y Edge Functions; una vista de sesiones, consultas largas o bloqueadas (con cancelar/terminar); y una herramienta MCP `query_logs` para leer logs desde el agente.
- **Versión / fecha:** health checks 2026-09-18; resto en Select 2026 (2026-10-02), activos por defecto.
- **Anillo:** ADOPTAR. Costo cero y encajan con ADR-0450 (la base caída) y la skill de observabilidad.
- **Dónde le serviría a este ERP:** ver en el panel la consulta que se queda colgada (deadlocks del SQL Editor, `40P01`); el CLAUDE.md ya usa `query_logs` para diagnosticar pegados raros.
- **Costo o riesgo:** ninguno; respetar «acceso de lectura a producción» (transacción de solo lectura).
- **Fuente:** https://supabase.com/blog/supabase-select-2026-recap (2026-10-02); https://supabase.com/changelog (2026-09-18) — consultado 2026-11-13.

### Supabase Queues (pgmq) + Cron
- **Qué es:** colas durables dentro de Postgres (`pgmq`) y tareas programadas (`pg_cron`) administradas desde el panel.
- **Versión / fecha:** lanzadas en Launch Week 13 (2024-12-10; anterior a la ventana de 12 meses, se incluye por encaje); `pgmq` 1.5.1 cambió `delay` (2025-10-08).
- **Anillo:** PROBAR. Mantiene la cola junto a los datos, con la misma transacción que la venta.
- **Dónde le serviría a este ERP:** la cola de comprobantes a transmitir a SUNAT vía Lucode: la venta encola en la misma transacción y un trabajador reintenta con espera creciente; avisos programados (cierre de caja, apartados vencidos).
- **Costo o riesgo:** decidir dónde corre el trabajador (Edge Function, Vercel Cron o Workflows). Todo lo que da validez legal a un comprobante requiere OK de Felipe.
- **Fuente:** https://supabase.com/changelog (entradas 2024-12-10 y 2025-10-08) — consultado 2026-11-13.

### Realtime Broadcast from Database
- **Qué es:** emitir mensajes de Realtime desde un disparador de Postgres (con autorización RLS sobre `realtime.messages`), en vez de escuchar cambios de tablas enteras; desde junio 2026 acepta cargas binarias.
- **Versión / fecha:** anunciado en el resumen de marzo 2025 (2025-04-08; anterior a la ventana); binario 2026-06-11; el schema `realtime` quedó bloqueado a cambios el 2026-07-14.
- **Anillo:** PROBAR.
- **Dónde le serviría a este ERP:** avisos de stock y traslados en camino entre sedes, el Observatorio y «N mirando ahora» sin consultar cada X segundos; la caja que otra pantalla cerró.
- **Costo o riesgo:** cada mensaje cuenta en el plan; RLS de `realtime.messages` debe calzar con `fn_ve_modulo`.
- **Fuente:** https://supabase.com/changelog (entradas 2025-04-08, 2026-06-11, 2026-07-14) — consultado 2026-11-13.

### Passkeys en Supabase Auth (beta)
- **Qué es:** inicio de sesión sin contraseña con WebAuthn (huella, Face ID, llave del equipo).
- **Versión / fecha:** beta desde 2026-05-28.
- **Anillo:** EVALUAR. Beta, y el login lo comparte Dynamic.
- **Dónde le serviría a este ERP:** colaboradores en el Mac mini de la sede: entrar con la huella en vez de escribir contraseña, más seguro en un equipo compartido.
- **Costo o riesgo:** coordinar con Dynamic (mismo Auth); terminales sin persona necesitan otro camino.
- **Fuente:** https://supabase.com/changelog (2026-05-28) — consultado 2026-11-13.

### Servidor MCP propio de la app
- **Qué es:** exponer un servidor MCP de la propia aplicación para que los usuarios conecten su agente (Claude, etc.), limitado por el Auth y las políticas RLS de la app; con autorización administrada por empresa (Okta primero).
- **Versión / fecha:** anunciado en Select 2026 (2026-10-02); autorización empresarial GA para Team/Enterprise.
- **Anillo:** EVALUAR.
- **Dónde le serviría a este ERP:** que Felipe o un encargado pregunte desde Claude «¿cuánto vendió AQP esta semana?» y la respuesta pase por las mismas RPC y RLS que la pantalla.
- **Costo o riesgo:** superficie nueva de acceso a datos; cualquier herramienta que escriba queda fuera hasta decidirlo.
- **Fuente:** https://supabase.com/blog/supabase-select-2026-recap (2026-10-02) — consultado 2026-11-13.

### OrioleDB, Multigres y Pipelines
- **Qué es:** OrioleDB, motor de almacenamiento sin «bloat» para tablas muy actualizadas; Multigres, Postgres en varios nodos con conmutación automática; Pipelines, réplica casi en tiempo real hacia BigQuery/ClickHouse/Snowflake.
- **Versión / fecha:** OrioleDB beta pública y Multigres alfa privada (2026-10-01); Pipelines alfa pública (2026-07-21).
- **Anillo:** ESPERAR. Inmaduros y pensados para un volumen que 3 tiendas + 1 taller no tienen (principio 5).
- **Dónde le serviría a este ERP:** quizá el snapshot `stock` (muy actualizado) con OrioleDB, el día que el vacuum sea un problema medido.
- **Costo o riesgo:** OrioleDB se elige al crear el proyecto; no aplica al proyecto compartido con Dynamic.
- **Fuente:** https://supabase.com/changelog (2026-10-01, 2026-07-21); https://supabase.com/blog/supabase-select-2026-recap (2026-10-02) — consultado 2026-11-13.

## 5. Vercel

### Fluid compute + precio por CPU activa
- **Qué es:** las funciones atienden varias peticiones a la vez y solo se cobra la CPU mientras el código corre (no mientras espera a la base), desde US$0,128/h de CPU activa más memoria aprovisionada.
- **Versión / fecha:** estable; precio por CPU activa por defecto en Hobby/Pro desde 2025-06-25; Fluid es el modo por defecto de proyectos nuevos.
- **Anillo:** ADOPTAR. Encaja con ADR-0648 (costos de Vercel): las RPC pasan casi todo el tiempo esperando a Postgres.
- **Dónde le serviría a este ERP:** las Server Actions y rutas que llaman RPC, Lucode y apis.net.pe: esa espera no se cobra como CPU.
- **Costo o riesgo:** verificar en el panel que ambos proyectos estén en Fluid; vigilar la memoria aprovisionada.
- **Fuente:** https://vercel.com/blog/introducing-active-cpu-pricing-for-fluid-compute (2025-06-25) — consultado 2026-11-13.

### Rolling Releases
- **Qué es:** publicar una versión nueva a un porcentaje del tráfico por etapas, comparando errores y Web Vitals contra la versión anterior antes de pasarla a todos.
- **Versión / fecha:** GA el 2025-06-25; Pro: un proyecto sin costo extra.
- **Anillo:** PROBAR. Útil, pero con ~6 publicaciones por hora el escalonado se superpone; mejor para cambios de riesgo.
- **Dónde le serviría a este ERP:** publicar una versión que cambia Vender o Caja a una sede primero; convive con «Hay una versión nueva» (ADR-0422) y la protección de versiones.
- **Costo o riesgo:** la regla de no mezclar versiones viejas/nuevas en una pestaña debe revisarse con dos versiones en producción a la vez.
- **Fuente:** https://vercel.com/changelog/rolling-releases-are-now-generally-available (2025-06-25) — consultado 2026-11-13.

### Vercel Workflows (ejecución durable)
- **Qué es:** funciones de larga duración escritas como código normal (`"use workflow"` / `"use step"`) donde cada paso terminado se guarda y se reintenta solo; pueden dormir minutos o meses o esperar un evento externo.
- **Versión / fecha:** GA el 2026-04-17 (TypeScript); SDK de Python en beta; el kit abierto (Workflow DevKit) es la base.
- **Anillo:** PROBAR. Primer encaje fuerte con el principio 9 sin montar infraestructura.
- **Dónde le serviría a este ERP:** la transmisión a SUNAT por Lucode: emitir → esperar respuesta → reintentar con espera → marcar aceptado/rechazado, sobreviviendo a cortes y publicaciones; el cierre de mes de Finanzas.
- **Costo o riesgo:** amarra el flujo a Vercel (choca con el principio 6 si no se aísla la regla en `lib/`); precio por pasos/colas. Cualquier cosa que dé validez legal a un comprobante: OK de Felipe.
- **Fuente:** https://community.vercel.com/t/a-new-programming-model-for-durable-execution/38569 (2026-04-17); https://vercel.com/docs/workflows — consultado 2026-11-13.

### Vercel Queues (beta pública)
- **Qué es:** colas durables con grupos de consumidores, entrega «al menos una vez» y reintentos; es la pieza sobre la que corre Workflows.
- **Versión / fecha:** beta pública el 2026-02-27; TTL y retraso hasta 7 días después.
- **Anillo:** EVALUAR. Beta; para este volumen, `pgmq` en la misma base es más simple.
- **Dónde le serviría a este ERP:** solo si se adopta Workflows; si no, la cola de SUNAT va mejor en Supabase Queues (misma transacción que la venta).
- **Costo o riesgo:** desde US$0,60 por millón de operaciones; entrega duplicada posible: la RPC consumidora debe ser idempotente.
- **Fuente:** https://vercel.com/changelog/vercel-queues-now-in-public-beta (2026-02-27) — consultado 2026-11-13.

### BotID
- **Qué es:** un CAPTCHA invisible (Kasada) que separa humanos de bots en rutas valiosas, con un componente cliente y `checkBotId()` en el servidor.
- **Versión / fecha:** GA el 2025-06-25; luego para todos los frameworks y con directorio de bots verificados.
- **Anillo:** PROBAR, en la tienda online; en el ERP no hace falta (todo está detrás de sesión).
- **Dónde le serviría a este ERP:** `apps/tienda`: el pedido, el registro al club y la consulta DNI/RUC (ADR-0008, de pago en apis.net.pe): evita que un bot gaste la consulta.
- **Costo o riesgo:** el precio por verificación no aparece en el anuncio; verificar en la documentación.
- **Fuente:** https://vercel.com/changelog/vercel-botid-is-now-generally-available (2025-06-25) — consultado 2026-11-13.

### AI Gateway con presupuestos
- **Qué es:** una sola API para cientos de modelos con conmutación entre proveedores, sin recargo al precio de lista; en Ship 2026 sumó presupuestos por llave, proyecto, usuario o equipo, inferencia solo en EE. UU. y retención cero.
- **Versión / fecha:** GA en agosto de 2025 (2025-08-21 según Vercel); presupuestos anunciados el 2026-10-15.
- **Anillo:** EVALUAR. El repo llama a Claude directo con `@anthropic-ai/sdk`.
- **Dónde le serviría a este ERP:** el «precio propuesto con IA» tiene un tope de US$20/mes: un presupuesto de AI Gateway lo haría cumplir afuera del código y daría respaldo si la API de Anthropic no responde.
- **Costo o riesgo:** otra dependencia en el camino de la IA; los datos pasan por Vercel.
- **Fuente:** https://vercel.com/changelog/ai-gateway-is-now-generally-available ; https://vercel.com/blog/vercel-ship-2026-recap (2026-10-15) — consultado 2026-11-13.

## 6. Herramientas: TypeScript, Zod, Tailwind, pruebas, lint, monorepo, Sentry

### TypeScript 6.0 (el puente)
- **Qué es:** la última versión sobre el compilador en JavaScript: cambia valores por defecto (`strict: true`, `module: esnext`, `types: []`) y depreca `baseUrl`, `moduleResolution: node` y otros, para preparar 7.0.
- **Versión / fecha:** estable el 2026-03-23.
- **Anillo:** ADOPTAR. Es el paso obligatorio antes de 7.0 y el repo sigue en `^5`.
- **Dónde le serviría a este ERP:** todo el monorepo (`apps/web`, `apps/tienda`, `packages/*`): dejar los `tsconfig` listos para el compilador nativo.
- **Costo o riesgo:** declarar `types` explícitos (`["node", …]`), quitar `baseUrl` si existe; Knip y typescript-eslint deben aceptar 6.0.
- **Fuente:** https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ (2026-03-23) — consultado 2026-11-13.

### TypeScript 7.0 (compilador nativo en Go)
- **Qué es:** el compilador portado a Go, ~10× más rápido (VS Code: 125,7 s → 10,6 s) y con menos memoria; Next 16.3 ya puede usarlo para revisar tipos en `next build`.
- **Versión / fecha:** estable el 2026-07-08 (npm 7.0.2); **sin API programática** hasta 7.1, por eso existe `@typescript/typescript6` (`tsc6`) para herramientas.
- **Anillo:** PROBAR. El CI hace `pnpm typecheck` en cada PR de la cola de fusión (ADR-0648): es donde más se gana.
- **Dónde le serviría a este ERP:** `pnpm typecheck` del CI y del editor; acelera el ciclo de cada PR.
- **Costo o riesgo:** typescript-eslint y Knip usan la API de TypeScript: deben seguir con 6.0 vía `tsc6`. Cambio de inferencia de *template literals* con emojis (rompe utilidades que cuentan unidades UTF-16; revisar `lib/emojis-del-mensaje.ts`).
- **Fuente:** https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ (2026-07-08); https://nextjs.org/blog/next-16-3 (2026-08-03) — consultado 2026-11-13.

### Zod 4
- **Qué es:** reescritura 6–14× más rápida al validar y con ~100× menos trabajo para el chequeo de tipos; trae `z.toJSONSchema()`, metadatos (`.meta()`), un solo parámetro `error`, formatos de primer nivel (`z.iso.date()`, `z.email()`, `z.uuidv7()`), `z.stringbool()` y Zod Mini.
- **Versión / fecha:** estable desde 2025-07-08 (raíz `"zod"` = v4); hoy 4.6.7.
- **Anillo:** PROBAR. El repo está en 3.25.76, que **ya incluye `zod/v4` como subruta**: se puede migrar esquema por esquema sin cambiar la dependencia.
- **Dónde le serviría a este ERP:** `packages/shared` (enums y esquemas compartidos); generar el JSON Schema de las salidas estructuradas de Claude desde el mismo esquema Zod; validaciones de montos y fechas.
- **Costo o riesgo:** `message` → `error`, cambios en `.default()` y en errores; `apps/tienda` y `packages/shared` están en `^3.23` y deben subir a ≥3.25 primero.
- **Fuente:** https://zod.dev/v4 ; https://zod.dev/v4/versioning (actualización 2025-07-08) — consultado 2026-11-13.

### Tailwind v4.2/v4.3 (scrollbar, gutter, logical, `font-features`)
- **Qué es:** 4.2 trajo propiedades lógicas, `font-features-*`, el plugin de webpack y las paletas `mauve/olive/mist/taupe`; 4.3 trae utilidades de scrollbar (`scrollbar-thin`, `scrollbar-thumb-*`, `scrollbar-gutter-stable`), `@container-size`, `zoom-*` y `@variant` compuesto.
- **Versión / fecha:** 4.3 el 2026-05-08 (el lockfile ya tiene 4.3.2; npm 4.3.5).
- **Anillo:** ADOPTAR. Ya instalado: es usar lo que hay.
- **Dónde le serviría a este ERP:** `scrollbar-gutter-stable` en hojas y tablas que scrollean, para que las columnas no salten cuando aparece la barra (ADR-0185 «la página no se encoge»); `tabular-nums` en cifras de caja y finanzas; `@container-size` para tarjetas de gráficos.
- **Costo o riesgo:** la paleta nueva `taupe-50…950` de Tailwind convive con el token del repo `--color-taupe`: `bg-taupe-200` sería un color fuera de la paleta CAYLA; conviene que `lib/tema-colores.test.ts` lo atrape. `start-*`/`end-*` quedan deprecados por `inset-s-*`/`inset-e-*`.
- **Fuente:** https://tailwindcss.com/blog/tailwindcss-v4-3 (2026-05-08) — consultado 2026-11-13.

### Vitest 5 (y Browser Mode con capturas)
- **Qué es:** 5.0 se enfoca en velocidad (hasta 53 % más rápido), *Trace View* en Browser Mode, `vi.when` y `vitest doctor`; desde 4.0 el Browser Mode es estable y trae `toMatchScreenshot` (regresión visual) y `expect.schemaMatching` (valida contra Zod).
- **Versión / fecha:** 4.0 el 2025-10-22; 5.0 el 2026-09-03; 5.1 el 2026-11-02.
- **Anillo:** PROBAR. El repo tiene cientos de `*.test.ts`; el salto es de versión mayor.
- **Dónde le serviría a este ERP:** CI más rápido; regresión visual de piezas del sistema (`<Chip>`, `<TarjetaCifra>`, hoja Serena) en claro y oscuro, hoy revisadas a ojo con `tema:auditar`.
- **Costo o riesgo:** requiere Node ≥ 22.12 y Vite ≥ 6.4; `clearMocks` pasa a `true` por defecto y las aserciones `resolves`/`rejects` sin `await` fallan (puede destapar pruebas que pasaban sin probar nada).
- **Fuente:** https://vitest.dev/blog/vitest-5 (2026-09-03); https://vitest.dev/blog/vitest-4 (2025-10-22) — consultado 2026-11-13.

### Oxlint con análisis por tipos estable (vs. Biome 2)
- **Qué es:** linter en Rust 50–100× más rápido que ESLint; desde julio 2026 su análisis por tipos (motor `tsgolint` sobre TS 7) es estable y cubre 59 de las 61 reglas con tipos de typescript-eslint. Biome 2 también suma reglas con tipos, pero con menos cobertura.
- **Versión / fecha:** Oxlint 1.0 (2025-06-10); análisis por tipos estable (2026-07-22); hoy 1.93.0. Biome 2.6.7.
- **Anillo:** PROBAR Oxlint como primer paso rápido en el CI; Biome no (formateador y linter a la vez es un cambio mayor sin ganancia clara aquí).
- **Dónde le serviría a este ERP:** `pnpm lint` en el CI y antes de cada PR (`/abrir-pr`): segundos en vez de minutos.
- **Costo o riesgo:** reglas propias de `eslint-config-next` que Oxlint no tenga; correr los dos un tiempo.
- **Fuente:** https://oxc.rs/blog/2026-07-22-type-aware-linting-stable (2026-07-22); https://oxc.rs/blog/2025-06-10-oxlint-stable (2025-06-10) — consultado 2026-11-13.

### Almacén virtual global de pnpm + raíces extra de Next 16.4
- **Qué es:** pnpm puede compartir las dependencias instaladas entre proyectos y worktrees (almacén virtual global); Next 16.4 agrega `turbopackAdditionalRoots` para seguir esos enlaces fuera de la raíz del proyecto.
- **Versión / fecha:** pnpm 12 (12.0 en ~agosto 2026; hoy 12.20.0, 2026-11-12); raíces extra experimentales en Next 16.4 (2026-10-06); integración automática anunciada para más adelante.
- **Anillo:** PROBAR. El repo trabaja con muchos worktrees en paralelo (`.claude/worktrees/*`), cada uno con su `node_modules`.
- **Dónde le serviría a este ERP:** abrir un worktree nuevo sin reinstalar todo: menos disco y minutos por sesión de Claude Code.
- **Costo o riesgo:** experimental del lado de Next; el CI y Vercel no lo necesitan.
- **Fuente:** https://pnpm.io/blog/releases/12.0 ; https://pnpm.io/global-virtual-store ; https://nextjs.org/blog/next-16-4 (2026-10-06) — consultado 2026-11-13.

### Turborepo 2.9–2.11 (`--affected` componible, caché)
- **Qué es:** 2.9 (2026-03-25) acelera hasta 96 % y deja `turbo query` estable; 2.10 (2026-06-24) permite combinar `--affected` con `--filter` y agrega hash diferido y limpieza de caché local; 2.11 (2026-09-18).
- **Versión / fecha:** estable; npm 2.11.11.
- **Anillo:** PROBAR. El repo declara `^2.5.0`.
- **Dónde le serviría a este ERP:** el CI: correr solo las pruebas de `apps/tienda` o `apps/web` que el PR toca (`--affected --filter=web`).
- **Costo o riesgo:** 2.9 trae deprecaciones previas a 3.0; revisar `turbo.json`.
- **Fuente:** https://turborepo.dev/blog (entradas 2026-03-25, 2026-06-24, 2026-09-18) — consultado 2026-11-13.

### Sentry SDK v11 (y Logs GA)
- **Qué es:** v11 envía los spans en streaming por defecto, instrumenta en el build (mejor en Vercel), y reemplaza `sendDefaultPii` por `dataCollection` **con valores por defecto más permisivos**; los Logs de Sentry son GA (5 GB/mes incluidos).
- **Versión / fecha:** v11.0 el 2026-09-23 (hoy 11.12.0); Logs GA el 2025-09-03.
- **Anillo:** EVALUAR. El repo está en 10.76.2 y su ADR-0424 prohíbe mandar sesión, búsquedas o DNI.
- **Dónde le serviría a este ERP:** trazas completas de una venta lenta; logs estructurados con ids (nunca nombres) de la integración con Lucode y apis.net.pe.
- **Costo o riesgo:** al subir, fijar `dataCollection` explícito y restrictivo, o la versión nueva mandará más datos de los permitidos; cambian nombres de spans (alertas y tableros).
- **Fuente:** https://sentry.io/changelog/javascript-sdk-v11/ (2026-09-23); https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v10-to-v11/ ; https://sentry.io/changelog/logs-are-generally-available/ (2025-09-03) — consultado 2026-11-13.

## 7. Plataforma web

### CSS Anchor Positioning (Baseline)
- **Qué es:** posicionar un elemento flotante (lista, globo, menú) pegado a otro solo con CSS, con cambio de lado automático si no cabe.
- **Versión / fecha:** Baseline «recién disponible» con Firefox 147 (enero 2026); Safari 27 ajustó valores por defecto; sigue en Interop 2026.
- **Anillo:** PROBAR, en una pieza chica.
- **Dónde le serviría a este ERP:** el globo de vidrio del «?» de `<AyudaCabecera>` o un tooltip, antes de tocar los combos (que hoy cuelgan su lista con `useDestinoFlotante`/`usePosicionLista` y las reglas de ADR-0211).
- **Costo o riesgo:** los cambios de Safari 27 muestran que aún se mueve; mantener respaldo para Safari viejo en las sedes.
- **Fuente:** https://web.dev/blog/web-platform-01-2026 (enero 2026); https://web.dev/blog/interop-2026 — consultado 2026-11-13.

### Navigation API (Baseline)
- **Qué es:** una API moderna para interceptar y manejar navegaciones y el historial (incluye el botón «atrás») en apps de una sola página.
- **Versión / fecha:** Baseline «recién disponible» a inicios de 2026 (Firefox 147, Safari 26.2).
- **Anillo:** EVALUAR. Next maneja el historial por su cuenta; mezclar es riesgoso.
- **Dónde le serviría a este ERP:** `useAtrasCierraLaHoja` (ADR-0528) hoy apila entradas de historial para que «atrás» cierre la hoja; la Navigation API permitiría interceptarlo sin entradas falsas.
- **Costo o riesgo:** posibles choques con el router de Next; probar solo bajo 640 px.
- **Fuente:** https://web.dev/blog/baseline-navigation-api ; https://web.dev/baseline/2026 — consultado 2026-11-13.

### `field-sizing: content` (Baseline 2026)
- **Qué es:** una propiedad CSS que hace que un `textarea` o `input` crezca con su contenido, sin JavaScript.
- **Versión / fecha:** Baseline en 2026 (listado por web.dev); Safari 27 corrigió un recorte en inputs numéricos.
- **Anillo:** ADOPTAR. Una línea de CSS con respaldo natural (si no se soporta, queda del tamaño fijo).
- **Dónde le serviría a este ERP:** las hojas que editan mensajes de WhatsApp (`<FilaEmojis>`), notas de una venta, descripciones de producto.
- **Costo o riesgo:** mínimo; ponerle `max-block-size` para que no empuje el pie (`pie-hoja-fijo`).
- **Fuente:** https://web.dev/baseline/2026 ; https://webkit.org/blog/18325/webkit-features-for-safari-27-0/ — consultado 2026-11-13.

### View Transitions entre documentos
- **Qué es:** animar el paso de una página a otra en navegaciones completas (multi-página), con solo CSS.
- **Versión / fecha:** en Chrome 126 y Safari 18.2; Firefox solo tiene las de una sola página (144, octubre 2025) y tipos SPA (147); foco de Interop 2026.
- **Anillo:** ESPERAR. El ERP navega como SPA (App Router); lo que aplica es `<ViewTransition>` de React.
- **Dónde le serviría a este ERP:** quizá en la tienda online (fichas de producto), cuando Firefox lo tenga.
- **Costo o riesgo:** ninguno hoy.
- **Fuente:** https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/147 ; https://web.dev/blog/interop-2026 — consultado 2026-11-13.

### Animaciones guiadas por scroll
- **Qué es:** `animation-timeline: scroll()/view()` anima según el desplazamiento, sin JavaScript y fuera del hilo principal.
- **Versión / fecha:** no figura en la lista Baseline 2026 de web.dev; es foco de Interop 2026.
- **Anillo:** EVALUAR.
- **Dónde le serviría a este ERP:** «Tienda web ▸ Tráfico» (estaciones que entran al verse) y las piezas que «entran una vez al verse» hoy con IntersectionObserver.
- **Costo o riesgo:** debe pasar por ADR-0136 y ADR-0625 (animaciones apagadas por defecto).
- **Fuente:** https://web.dev/blog/interop-2026 ; https://web.dev/baseline/2026 — consultado 2026-11-13.

### `<select>` personalizable (`appearance: base-select`)
- **Qué es:** un `<select>` nativo que se puede estilizar por completo (lista, ícono, marca de elegido) manteniendo accesibilidad y teclado del navegador.
- **Versión / fecha:** Chrome desde 2025; Safari 27 (septiembre 2026); Firefox solo tras bandera (149+).
- **Anillo:** ESPERAR. Sin Firefox, y el repo prohíbe el `<select>` nativo (ADR-0209) porque ya tiene `Desplegable`/`ComboBuscable` con buscador y paginado.
- **Dónde le serviría a este ERP:** podría volver a ser la base de `Desplegable` el día que sea Baseline, reduciendo código propio.
- **Costo o riesgo:** reabrir la regla de ADR-0209 es decisión de Felipe.
- **Fuente:** https://webkit.org/blog/18325/webkit-features-for-safari-27-0/ ; https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/149 — consultado 2026-11-13.

### Temporal (fechas y zonas horarias)
- **Qué es:** la API nueva de JavaScript para fechas, horas y zonas horarias, inmutable y sin las trampas de `Date`.
- **Versión / fecha:** Firefox 139 (2025), Chrome 144 (2026-01-13); **Safari estable aún no** (solo Technology Preview); MDN no lo marca Baseline.
- **Anillo:** EVALUAR.
- **Dónde le serviría a este ERP:** «el día de la tienda» en hora de Lima, cierres de caja, vencimiento de apartados, meses de Finanzas: hoy se arma con `Date` y desplazamientos a mano.
- **Costo o riesgo:** requiere polyfill para Safari; en el servidor depende de la versión de Node.
- **Fuente:** https://developer.chrome.com/release-notes/144 (2026-01-13); https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal — consultado 2026-11-13.

### WebUSB / Web Serial para la impresora térmica
- **Qué es:** APIs para hablar directo desde la página con un dispositivo USB o serial (impresora de tickets ESC/POS, cajón de dinero, balanza), con permiso del usuario y sin drivers.
- **Versión / fecha:** experimentales y de disponibilidad limitada: solo navegadores Chromium (Chrome/Edge); Firefox y Safari no (MDN). Sin novedad mayor en la ventana: se incluye por pedido explícito.
- **Anillo:** PROBAR, en una sede con Chrome.
- **Dónde le serviría a este ERP:** imprimir el ticket de Vender en la térmica sin el diálogo de impresión del navegador, y abrir el cajón al cobrar.
- **Costo o riesgo:** amarra la sede a Chrome; cada modelo de impresora tiene su dialecto ESC/POS; dejar siempre el camino de impresión normal como respaldo (`<BotonImprimir>`).
- **Fuente:** https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API ; https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API — consultado 2026-11-13.

### Barcode Detection API
- **Qué es:** detectar códigos (EAN-13, Code 128, QR) en una imagen o video de la cámara, nativo del navegador.
- **Versión / fecha:** experimental, de disponibilidad limitada, no Baseline (MDN); el repo ya la usa con detección en `EscanerCamara.tsx`.
- **Anillo:** EVALUAR. No hay cambio de estado en la ventana; mantener el respaldo.
- **Dónde le serviría a este ERP:** el escáner de cámara de Vender, Recibir y Contar; confirmar con `getSupportedFormats()` en el equipo real de cada sede.
- **Costo o riesgo:** sin soporte en Firefox/Safari; el lector USB (que teclea) sigue siendo el camino principal.
- **Fuente:** https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API — consultado 2026-11-13.

### Local-first: Zero 1.0, Electric 1.0, PowerSync
- **Qué es:** motores que sincronizan una copia local de la base en el navegador para leer y escribir sin red y reconciliar después.
- **Versión / fecha:** Electric 1.0 GA (2025-03-17; luego se unió a Databricks, 2026-08-11); Zero 1.0 «primera versión estable» (fecha no indicada en su nota), hoy 1.12, con soporte de Supabase desde 0.20; PowerSync SDK web 2.6 (noviembre 2026) y migración de Sync Rules a Sync Streams.
- **Anillo:** ESPERAR. Escribir sin conexión en stock o caja abre conflictos que el principio 2 no tolera, y el RLS/RPC actual no se traslada solo.
- **Dónde le serviría a este ERP:** solo lectura sin red (consultar catálogo o precios en una sede caída).
- **Costo o riesgo:** reescritura de permisos fuera de RLS; otra pieza de infraestructura.
- **Fuente:** https://electric.ax/blog ; https://zero.rocicorp.dev/docs/release-notes/1.0 ; https://powersync.com/blog — consultado 2026-11-13.

## 8. IA en el desarrollo y dentro del producto

### Salidas estructuradas de Claude (GA)
- **Qué es:** Claude devuelve JSON que cumple un esquema garantizado por decodificación restringida (`output_config.format`) o herramientas «estrictas».
- **Versión / fecha:** beta 2025-11-14; **GA el 2026-01-29** en la API de Claude.
- **Anillo:** ADOPTAR. Encaja con lo ya construido (precio propuesto con IA) y evita parsear texto.
- **Dónde le serviría a este ERP:** «precio propuesto con IA», extracción de datos de una factura de proveedor, clasificación de gastos; el esquema puede salir de Zod 4 (`z.toJSONSchema()`).
- **Costo o riesgo:** bajo; el SDK del repo (`@anthropic-ai/sdk` ^1.3) ya es de la línea nueva.
- **Fuente:** https://platform.claude.com/docs/en/release-notes/overview (entradas 2025-11-14 y 2026-01-29) — consultado 2026-11-13.

### PDF + Files API GA + visión de alta resolución (facturas)
- **Qué es:** Claude lee PDF (texto e imagen) e imágenes; la Files API (subir una vez, referenciar) salió de beta; desde Opus 4.7 la visión acepta imágenes de hasta 2 576 px por lado, mejor para documentos.
- **Versión / fecha:** Files API y Skills sin beta el 2026-08-19; alta resolución desde 2026-04-16.
- **Anillo:** PROBAR, con un piloto acotado.
- **Dónde le serviría a este ERP:** «Recibir contra factura»: foto o PDF de la factura del proveedor → líneas propuestas (RUC, artículo, cantidad, costo) con salida estructurada, para que la persona confirme; no reemplaza la confirmación humana.
- **Costo o riesgo:** costo por página/token (fijar tope como el de US$20/mes); los datos del proveedor salen a la API; dinero y stock esperan el OK de Felipe.
- **Fuente:** https://platform.claude.com/docs/en/release-notes/overview (entradas 2026-04-16 y 2026-08-19) — consultado 2026-11-13.

### Caché de prompt automática
- **Qué es:** con un solo `cache_control` en la petición, la API guarda sola el último bloque cacheable y lo va moviendo; los aciertos de caché cuestan una fracción de la entrada.
- **Versión / fecha:** lanzada el 2026-02-19; bajadas de precio de lectura de caché en 2026-09 y 2026-10.
- **Anillo:** ADOPTAR. Una línea de cambio.
- **Dónde le serviría a este ERP:** el precio propuesto con IA repite las mismas instrucciones y el contexto de categoría en cada prenda: cachearlo baja el costo bajo el tope mensual. Para lotes grandes, la Message Batches API cuesta 50 % menos.
- **Costo o riesgo:** ninguno funcional.
- **Fuente:** https://platform.claude.com/docs/en/release-notes/overview (entradas 2026-02-19, 2026-09-01, 2026-10-07) — consultado 2026-11-13.

### Claude Agent SDK
- **Qué es:** la misma infraestructura de Claude Code empaquetada como SDK (TypeScript y Python) para construir agentes con herramientas, permisos y contexto.
- **Versión / fecha:** lanzado junto a Claude Sonnet 4.5 (2025-09-29); npm `@anthropic-ai/claude-agent-sdk` 0.3.323 (2026-11-12), aún en 0.x.
- **Anillo:** EVALUAR.
- **Dónde le serviría a este ERP:** dentro del desarrollo, automatizar skills del repo fuera de la sesión (p. ej. `/chaos` o `/revision` programados); dentro del producto, un asistente de búsqueda en lenguaje natural que llame solo RPC de lectura.
- **Costo o riesgo:** versión 0.x con cambios frecuentes; un agente que escribe en producción está fuera de discusión sin OK de Felipe.
- **Fuente:** https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk ; https://www.anthropic.com/news/claude-sonnet-4-5 — consultado 2026-11-13.

### Especificación MCP 2026-07-28 y MCP Apps
- **Qué es:** la nueva versión del protocolo MCP: núcleo sin estado, autorización endurecida, marco formal de extensiones; MCP Apps permite que un servidor muestre interfaz interactiva en el cliente.
- **Versión / fecha:** especificación final el 2026-07-28; MCP Apps 2026-01-26; autorización empresarial 2026-06-18; MCP pasó a la Agentic AI Foundation (2025-12-09).
- **Anillo:** EVALUAR.
- **Dónde le serviría a este ERP:** si se construye el servidor MCP propio de la app (entrada de Supabase), nacería sobre esta versión; el equipo ya usa MCP (Supabase) en el desarrollo.
- **Costo o riesgo:** el SDK MCP de TypeScript está en 1.32; seguir la versión que soporte cada cliente.
- **Fuente:** https://blog.modelcontextprotocol.io/ (entradas 2026-07-28, 2026-01-26, 2026-06-18) — consultado 2026-11-13.

### AI SDK 7
- **Qué es:** el SDK de Vercel para IA en TypeScript: `WorkflowAgent` (agente durable sobre Workflows), `HarnessAgent` (correr Claude Code u otros agentes por una sola API), telemetría nueva, timeouts finos; solo ESM y Node 22+.
- **Versión / fecha:** AI SDK 6 (fines de 2025) y AI SDK 7 estable en junio de 2026 (2026-06-25 según una página de Vercel); hoy 7.0.172.
- **Anillo:** EVALUAR. El repo usa `@anthropic-ai/sdk` directo, que basta para un solo proveedor.
- **Dónde le serviría a este ERP:** solo si se quiere cambiar de proveedor sin tocar código, o un agente durable sobre Vercel Workflows.
- **Costo o riesgo:** una capa más entre el ERP y el modelo; migración con codemod si se adopta.
- **Fuente:** https://vercel.com/blog/ai-sdk-7 ; https://vercel.com/blog/ai-sdk-6 — consultado 2026-11-13.
