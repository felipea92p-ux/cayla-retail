# ADR-0152 — Ficha de clienta, v1: backend mínimo y no invasivo, y por qué se retira `retail.clientes`

**Fecha:** 2026-09-22
**Estado:** Aceptado e **implementado en local** (rama `feat/ficha-clienta-backend-d76-d77`). Verificado con un Postgres 17 desechable que corrió
las 195 migraciones del repo en orden (no un parche aislado), 16 pruebas de integración en verde (`pnpm pruebas:clientas`, con ROLLBACK), `tsc` y
`eslint` limpios, y una verificación visual real de `/clientas` en el navegador (arnés temporal bajo `/login`, borrado antes de cerrar). **Una
migración sin aplicar en producción** — la aplica Felipe o el arquitecto con el protocolo de ensayo aparte.
**Decide:** Felipe, en la ronda de 60 preguntas (D-76/D-77, `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`, PR #265 sin fusionar al
momento de escribir esto): no ser invasivos, DNI opcional en un solo campo, WhatsApp con permiso APARTE del teléfono (Ley 29733), meta modesta de
identificación (30-40% de las ventas) que nunca se paga ni se rankea.
**Afecta:** tabla nueva `retail.clientas`; RPC nuevas `retail.buscar_clienta`/`retail.registrar_clienta`; `retail.ventas.cliente_id` (repunta su FK);
`retail.fn_ventas_del_dia` (mismo cuerpo, cambia de dónde lee el nombre); `apps/web/lib/ventas-historial.ts` (un embed); `supabase/seed.sql`.
**Se retira** `retail.clientes` (la tabla vieja, ~0 filas en producción, sin RLS de UPDATE) — ver «El hallazgo» abajo.

## Contexto — lo que pidió el encargo y lo que había de verdad

El encargo (D-76/D-77) decía: «hoy NO existe ninguna tabla de clientas en el repo» y «`ventas.cliente_id` (uuid, nullable) ya existe pero sin tabla
a la que apuntar — reutilízala». Antes de tocar código se verificó esa premisa contra un Postgres que corrió las migraciones reales del repo en
orden (no solo `grep`), y contra `docs/datos/generado/DICCIONARIO-RETAIL.md` (que sale del volcado de producción, 2026-09-12).

**Las dos cosas eran ciertas a medias.** `ventas.cliente_id` sí existe — pero **no está suelta**: desde `0002_esquema.sql`/`benja-migracion.sql`
tiene una FK real y viva, `ventas_cliente_id_fkey`, contra una tabla `retail.clientes` que **sí existe** (7 columnas: `id`, `tipo_doc`, `num_doc`,
`nombre`, `telefono`, `email`, `created_at`; ~0 filas en producción — posible únicamente porque la FK impide un `cliente_id` no nulo sin una fila
real detrás). Y esa tabla, aunque vacía, **tiene dos lectores activos**:

1. `retail.fn_ventas_del_dia()` — la RPC que arman Caja, Vender y Facturación: `left join clientes cli on cli.id = v.cliente_id`.
2. `apps/web/lib/ventas-historial.ts` (Ventas ▸ Historial, ADR-0147) — un embed de PostgREST, `cliente:clientes ( nombre )`, que depende de esa
   misma FK para resolverse.

Ningún camino de escritura de producción inserta en `clientes` (por eso las ~0 filas): la única vía sembraba datos era `supabase/seed.sql`, solo
para desarrollo local.

## Decisión

**DECIDÍ:** crear `retail.clientas` tal como pide D-76/D-77, y en la MISMA migración jubilar `retail.clientes`: repunto la FK de `ventas.cliente_id`
de `clientes` a `clientas` (constraint `ventas_clienta_fk`, el nombre que pide el encargo), actualizo los dos lectores reales para que apunten a la
tabla nueva, y elimino la tabla vieja.

**DESCARTÉ:** dejar `clientes` viva al lado de `clientas` (agregar solo la FK nueva, sin tocar la vieja). Costo concreto: dos tablas de «cliente»
en el mismo esquema es exactamente el caso que la integridad conceptual del sistema prohíbe — dos partes resolviendo el mismo problema de dos
formas. La vieja además es estrictamente peor (sin RLS de UPDATE, sin consentimiento de WhatsApp, con `tipo_doc`/`num_doc` que Felipe decidió no
querer). La siguiente persona que tocara Ventas no tendría cómo saber cuál de las dos es la real, y `docs/datos/generado/DICCIONARIO-RETAIL.md`
(que lee producción tal cual) mostraría las dos como si compitieran.

**SE ROMPE SI:** producción tiene la FK con un nombre distinto de `ventas_cliente_id_fkey` — la migración no asume el nombre, lo busca por
catálogo (`pg_constraint` con `confrelid = 'retail.clientes'`) antes de borrar nada; o si producción tuviera filas reales en `clientes` (no las
tiene: ~0 según el diccionario del 2026-09-12) — si algún día las tuviera, la migración se detiene sola con una excepción en vez de perderlas en
silencio (probado: sembrar 10 filas locales y confirmar que la migración para).

### La ficha en sí (D-76/D-77)

`retail.clientas`: `id`, `dni` (opcional, un solo campo — sin `tipo_doc`/`num_doc`, único cuando no es nulo), `nombre` (opcional), `telefono_whatsapp`
(opcional), `whatsapp_consentimiento_en` (NULL = sin permiso), `cumple_dia`/`cumple_mes` (1-31/1-12), `tallas` (jsonb libre), `created_at`,
`created_por`. RLS: cualquier colaborador con sesión activa lee/inserta/actualiza (retail no tiene noción de «mi clienta»), nunca `anon`; sin
política de DELETE (una clienta no se borra, mismo criterio que `movimientos`).

`retail.buscar_clienta(p_termino)`: DNI o WhatsApp exactos, o nombre con ILIKE. Un término vacío no devuelve filas — no es un listado.

`retail.registrar_clienta(...)`: alta o upsert por DNI.

### LA OBJECIÓN — sobre `registrar_clienta`, no sobre Postgres/RLS (la parte que decido yo, con la razón en 3 líneas)

El encargo dice literal: «si `p_acepta_whatsapp` es false deja NULL aunque venga el teléfono». Lo implementé así tal cual para el **alta** (fila
nueva). Para el **upsert** (mismo DNI, segunda llamada) NO lo tomé literal: si ya había `whatsapp_consentimiento_en` puesto y una llamada nueva
trae `p_acepta_whatsapp = false` (el default del parámetro, no una negativa explícita), la RPC lo **conserva** en vez de ponerlo en NULL.

Por qué: un formulario futuro que reabra la ficha para corregir solo el nombre —sin volver a preguntar por WhatsApp— llamaría a esta misma RPC con
el default `false`. Tomado literal, eso borraría un consentimiento real ya dado, que es exactamente lo que la Ley 29733 exige no hacer sin que la
clienta lo pida. Se rompe si algún día se necesita que «false» SÍ revoque expresamente: ese caso necesita su propio parámetro
(`p_revoca_whatsapp`), no compartir el default de «no me preguntaron». Probado: `pnpm pruebas:clientas`, casos 4 y 5.

### Un candado que no estaba y hacía falta

Postgres le da `EXECUTE` a `PUBLIC` por defecto a toda función nueva. Sin revocarlo explícitamente, `anon` podía llamar `buscar_clienta`/
`registrar_clienta` igual que `authenticated` — verificado con una prueba real (`has_function_privilege('anon', ...)` daba `true` antes del
`revoke`). Como las dos son `security definer` (owner `postgres`, que bypasea RLS), eso habría dejado leer y escribir clientas sin sesión. Se
corrigió con el mismo patrón que ya usa `20260922110000_colaboradores_suspender_y_actividad.sql`: `revoke ... from public, anon` seguido de
`grant ... to authenticated`. Sin este hallazgo el candado de RLS de la tabla habría dado una falsa sensación de seguridad — las RPC lo rodeaban
por completo.

## Lo que este ADR NO toca

- La pantalla de captura del mostrador (Punto de Venta): la construye otra tanda de agentes. `/clientas` (nueva) es solo una pantalla mínima de
  verificación — lista + buscador + alta — sin engancharse a `lib/menu.ts` (lo toca otra tarea de esta misma tanda).
- El candado de líder (ADR-0143): la ficha de clienta no distingue rol — cualquier colaborador con sesión identifica, por diseño de Felipe.
- `tenant_id` ni ninguna capa de multi-tenant.
- `packages/database/src/types.ts` se editó a mano (regenerarlo de verdad pide `supabase gen types --local`, que exige Docker; no estaba
  disponible en esta sesión) — revisar que calce con un `supabase gen types` real la próxima vez que el stack local esté arriba.

## Cómo se pega en producción

El archivo `supabase/migrations/20260922140000_ficha_de_clienta_v1_backend.sql` **no lleva el prefijo `retail.`** (así corre limpio contra
Postgres local). Al pegarlo en el SQL Editor de producción, agregar `set search_path to retail, public, extensions;` al principio o prefijar cada
tabla — ver CLAUDE.md, «Cómo aplicar SQL a producción». Después de aplicar: `pnpm datos:generar:produccion` para que
`docs/datos/generado/DICCIONARIO-RETAIL.md` deje de listar `clientes` y sume `clientas`.
