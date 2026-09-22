# ADR-0156 — Cotización de maquila externa: tabla, RPC de lectura y pantalla de carga (líder)

**Fecha:** 2026-09-22
**Estado:** Aceptado e implementado en local. Migración sin aplicar en producción (la pega Felipe). 11/11 pruebas en verde
(`scripts/pruebas/cotizaciones_maquila.mjs`, contra un Postgres 17 desechable de Homebrew — Docker estaba caído en esta sesión, ver
«Cómo se verificó»), 24 pruebas unitarias nuevas de reglas puras, tipos y lint en verde.
**Decide:** D-82 de la ronda de 60 preguntas (`docs/datos/DECISIONES-2026-09-21-menu-comercial.md`), que resuelve la mitad de D-31
(`docs/datos/DECISIONES-2026-09-12.md`) que hoy no tenía dónde guardarse.
**Afecta:** tabla nueva `retail.cotizaciones_maquila`, función nueva `retail.fn_cotizacion_maquila_vigente(uuid)`, pantalla nueva
`/produccion/cotizaciones-maquila` (líder, fuera del árbol de menú todavía), `apps/web/lib/error-escritura.ts` (tres huellas nuevas),
`packages/database/src/types.ts` (tabla y función nuevas). **Ningún cambio a tablas, funciones ni pantallas existentes.**

## Contexto — el problema

D-31 (Felipe, 2026-09-12) fue tajante desde el principio: el Taller se mide comparando su costo real contra lo que cobraría un taller
externo — **nunca contra un precio que Felipe invente**. Hoy no existe tabla ni pantalla para guardar esa cotización externa: el Taller
no tiene con qué compararse.

**Contradicción encontrada en el repo, sin resolver — se la dejo a Felipe.** El mismo día (2026-09-21), dos documentos dicen cosas
opuestas y ninguno quedó marcado como el vigente:

- `docs/datos/DECISIONES-2026-09-12.md` (commit `44ee0b30`, 11:28) agrega una «Enmienda (2026-09-22, Felipe)» a D-31: «se descarta: no
  se registra ninguna cotización».
- `docs/PLAN-PRODUCCION.md` (mismo commit `44ee0b30`) marca **D-E ⛔ Descartada por Felipe (2026-09-22)**: «no sería necesario registrar
  cuánto cobraría un taller externo».
- `docs/datos/DECISIONES-2026-09-21-menu-comercial.md` (commit `42c736f7`, 21:26 — diez horas después del mismo día, y descendiente
  directo del anterior en `git log`) vuelve a decidir **D-82** en sentido contrario, nombrando explícitamente que D-31 «hoy» (a esa
  hora) sigue sin dónde guardar esa cotización — es decir, ya sabía de la enmienda y la revirtió.

La decisión más reciente en git (D-82) es la que ejecuta esta migración, tal como llegó la tarea. Pero `DECISIONES-2026-09-12.md` y
`PLAN-PRODUCCION.md` (fila D-E) siguen diciendo «descartada» sin apuntar a D-82 — quien los lea sin cruzar los tres archivos se
confunde, y `PLAN-PRODUCCION.md` línea 266 incluso describe la F7 ya construida (Eficiencia del Taller) como si NO fuera a comparar
contra maquila externa. **No edité esos dos archivos calientes** (otras sesiones los tocaban ese mismo día, y la regla del repo es
tocar lo mínimo un archivo caliente) — le queda a Felipe decidir cuál de las dos es la versión final y corregir la otra.

## Decisión

### 1. La tabla: `retail.cotizaciones_maquila`

Una fila = una cotización real que un taller externo dio para maquilar un tipo de prenda, con vigencia. **Append-only**: renovar es
insertar una fila nueva, nunca editar la vigencia de una pasada — mismo principio que `movimientos` (el snapshot vigente se calcula al
leer, nunca se sobrescribe un hecho pasado), así queda el historial completo de cómo se movió el precio de mercado.

```
id                    uuid primary key
categoria_id          uuid not null → retail.categorias(id)
precio_maquila        numeric(12,2) not null, check (>= 0)
fecha_cotizacion      date not null
vigente_hasta         date not null, check (>= fecha_cotizacion)
proveedor_referencia  text nullable — quién la dio, para volver a pedirla
creado_por            uuid → public.personas(id)
created_at            timestamptz not null default now()
```

**DECIDÍ:** `categoria_id uuid references retail.categorias(id)`, no `tipo_prenda text` libre.
**DESCARTÉ:** el texto libre que la tarea sugería «por ahora» — la tarea misma pedía preguntarle antes al catálogo, y sí existe:
`retail.categorias` (Blusas/BLU, Vestidos/VES, Faldas/FAL…, `familia = 'indumentaria'`) es exactamente la taxonomía de tipo de prenda,
ya usada en Alta de producto. Un texto libre nuevo habría sido dos fuentes de verdad para «qué tipos de prenda existen» (principio 4
del repo) y una captura nueva que el catálogo ya resolvió hace semanas («Blusa» vs «Blusas», con o sin tilde, prefijo único de 3
letras).
**SE ROMPE SI:** el Taller maquila algo que hoy no es una categoría de `indumentaria` (ej. un accesorio cosido) — ahí no falta una
columna en esta tabla, falta esa categoría en el catálogo, que es donde se da de alta (no se duplica acá).

### 2. RPC: `retail.fn_cotizacion_maquila_vigente(p_categoria_id uuid) returns retail.cotizaciones_maquila`

La cotización más reciente que no venció, para una categoría; sin ninguna vigente, `null` — nunca inventa un valor (D-31). `security
definer` con `set search_path = retail, public, extensions` (regla dura de esta tanda de tareas), sin candado de líder ni de
ubicación: D-80 (`DECISIONES-2026-09-21-menu-comercial.md`) dice que el Taller y las tiendas comparten esta misma lectura como su costo
de referencia — no depende de rol ni de dónde está parada la persona, solo de tener sesión.

**DECIDÍ:** el parámetro es `p_categoria_id uuid`, no `p_tipo_prenda text` (aunque el nombre de la función en la tarea decía
`p_tipo_prenda`).
**DESCARTÉ:** aceptar texto y resolverlo contra `categorias.nombre` — un typo o un plural distinto («blusa» vs «Blusas») habría hecho
que la función devolviera `null` en silencio aunque existiera una cotización vigente real: exactamente el estado engañoso que se quería
evitar al reusar el catálogo en vez de texto libre.
**SE ROMPE SI:** algún día una pantalla solo tiene el NOMBRE de la categoría, no su id, y no lo resuelve antes de llamar al RPC — hoy
no aplica, el selector de la pantalla siempre trae el id.

**Hallazgo de la propia prueba, corregido antes de cerrar (mérito de escribir el escenario "sin sesión" y no darlo por hecho):**
Postgres otorga `EXECUTE` a `PUBLIC` por defecto en toda función nueva. Sin `revoke execute ... from public`, cualquiera sin sesión
(rol `anon`) habría podido llamar al RPC y leer el precio de referencia del Taller — la RLS de la tabla no protege nada acá porque
`security definer` la salta. La migración lleva el `revoke` explícito; la prueba `scripts/pruebas/cotizaciones_maquila.mjs` lo cubre
("permission denied" para `anon").

### 3. RLS

- `select`: cualquier sesión autenticada (D-80: la tienda ve la misma cifra que el Taller).
- `insert`/`update`: solo `fn_es_lider()` — mismo criterio que `codigos_descuento` (un precio de referencia que afecta cómo se lee el
  resultado del Taller no lo carga cualquiera). `update` es para corregir un dato mal tecleado, no para "renovar" (eso es `insert`).
- sin `delete`: una cotización vieja es historia de precio de mercado (regla del repo: nunca `DELETE` en catálogos con historial).

### 4. La pantalla: `/produccion/cotizaciones-maquila`

Líder-only (`exigirLider()`), **sin exigir estar parado en el Taller** — a diferencia de Insumos/Órdenes, porque D-80 dice que un líder
de tienda también consulta esta cifra. Lista una fila por tipo de prenda (la cotización más reciente de cada categoría,
`masRecientePorCategoria`, mismo criterio que el RPC), ordenada por urgencia (vencida → por vencer → vigente), con un chip de aviso
cuando `vigente_hasta` está a 30 días o menos o ya venció, y un modal `<Modal>` (ADR-0136) para cargar una cotización nueva —
`vigente_hasta` se sugiere a 6 meses de `fecha_cotizacion` (`sumarDias`, editable, no forzado). **A propósito fuera de
`lib/menu.ts` todavía** (D-84, otra tarea de esta misma tanda agrupa Producción bajo «Abastecimiento» — evita el choque); se abre por
URL directa mientras tanto.

Sin RPC de escritura, mismo criterio que `codigos_descuento`
(`apps/web/components/CodigosDescuentoPanel.tsx`): la RLS ya exige `fn_es_lider()` y las reglas de negocio (precio ≥ 0, vigencia
coherente) ya son `check` de la tabla — no queda ninguna regla que un RPC tuviera que agregar encima. El insert va directo desde el
componente cliente con `supabase.from("cotizaciones_maquila").insert(...)`.

**A diferencia de un código de descuento vencido** (que simplemente deja de aplicar, sin consecuencia), una cotización de maquila
vencida SÍ es una falla activa para D-31 — sin ninguna vigente, la medición del Taller se queda sin punto de comparación. Por eso el
chip «Vencida» va en rojo (`facturacion-codigos-reglas.ts` decidió lo contrario para códigos de descuento, y con razón: acá la razón es
distinta, no es la misma regla aplicada dos veces).

## Estados imposibles que el esquema cierra

- Precio negativo — `check (precio_maquila >= 0)`.
- Una cotización que vence antes de empezar — `check (vigente_hasta >= fecha_cotizacion)`.
- Una cotización sin categoría real — FK a `retail.categorias`.
- Alguien sin sesión de líder creándose su propia cotización favorable — RLS `with check (fn_es_lider())`.
- Cualquiera sin sesión leyendo el precio de referencia por el RPC — `revoke execute from public` (ver hallazgo arriba).

## Números (principio 10)

~12-15 categorías de indumentaria activas, cotización renovada cada ~6 meses → 24-30 filas/año, ~100 filas en 3 años. Sin índice: un
`where categoria_id = X` sobre unos cientos de filas es instantáneo (mismo criterio que `etiqueta_categorias`,
`20260918160000_etiquetas_descuento_y_categorias.sql`); se agrega el día que el volumen real lo pida.

## Cómo se verificó

Docker estaba caído en esta sesión. Se levantó un Postgres 17 de Homebrew desechable (ver memoria `postgres-desechable-sin-docker.md`),
con el stub mínimo de Supabase (roles, `auth.users`/`identities`, `auth.uid()`/`role()`/`jwt()`) y el stub de Dynamic
(`supabase/0000_local_stub_dynamic.sql.example`), y se aplicaron las 194 migraciones numeradas de `supabase/migrations/` en orden
(2 fallos esperados y ya conocidos: el guard de datos de `20260918230200` en base vacía, y una política de `storage.objects` sin guard
en `20260919161000` — ninguno relacionado con esta migración) más `seed.sql`. Sobre esa base:

- La migración de esta ADR corre limpia, dos veces (idempotente vía `create or replace`/`drop policy if exists`).
- `pnpm typecheck`, `pnpm lint` y `pnpm test` (106 archivos, 2 561 pruebas) en verde.
- `scripts/pruebas/cotizaciones_maquila.mjs`: **11/11 en verde**, en modo normal y en `--en-seco`. El script está escrito con el patrón
  real del repo (`docker exec supabase_db_cayla-retail psql ...`, ROLLBACK explícito); para correrlo en esta sesión sin Docker se usó
  un `docker` de mentira al frente del `PATH` que redirige a la base de Homebrew — el script en el repo queda intacto y corre tal cual
  el día que alguien lo ejecute con Docker arriba.
- No se pudo abrir la pantalla en un navegador real con datos: sin Docker no hay PostgREST/GoTrue corriendo, y el cliente de Supabase
  del front necesita esa API HTTP (no una conexión Postgres cruda) para autenticar y leer. Queda pendiente que alguien con Docker
  arriba confirme visualmente `/produccion/cotizaciones-maquila` — el modelo de datos, la RLS y la lógica de estados están probados
  contra Postgres real, pero la pantalla en sí solo pasó `typecheck`/`lint`, no un `read_page`/screenshot real.

## Lo que este ADR NO toca

- El árbol de `lib/menu.ts` (D-84, otra tarea).
- `fn_persona_actual_resumen` ni el candado de líder existente (ADR-0143).
- D-80 (el «ingreso simulado» del Taller que va a llamar a este RPC) ni D-81 (costo automático de la prenda del Taller) — quedan para
  cuando esas piezas se construyan; hoy nadie llama a `fn_cotizacion_maquila_vigente` todavía.
- La contradicción D-31/D-E documentada arriba: la nombro, no la resuelvo — es una decisión de negocio de Felipe, no una de arquitectura.

## Cómo se pega en producción

Sin el prefijo `retail.` en el archivo del repo (corre limpio contra el Postgres local). Al pegar en el SQL Editor de producción,
agregar `set search_path to retail, public, extensions;` al principio, o prefijar cada `retail.` — igual que toda migración desde la
unificación con Dynamic (ver CLAUDE.md, «Cómo aplicar SQL a producción»). No mueve dinero ni borra datos; es seguro de ensayar con el
protocolo de excepción habitual.
