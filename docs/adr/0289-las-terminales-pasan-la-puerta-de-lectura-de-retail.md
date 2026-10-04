# ADR-0289 · Las terminales pasan la puerta de lectura de retail

- **Fecha:** 2026-09-30 · **Estado:** aceptado. **SQL pegado en producción el 2026-09-30** (por el conector MCP, con el «sí» de Felipe;
  versión `20260930143821`) y verificado (ver «Cómo se pegó»).
- **Pedido:** Felipe, 2026-09-30, con la captura de Compras ▸ Proveedores en «Esta pantalla no está mostrando datos»:
  «analiza por qué pasa eso con los proveedores» y, con el análisis hecho, «escribe la migración y la prueba».
- **Migración:** `supabase/migrations/20260930050000_terminales_pasan_la_puerta_de_lectura.sql` (una sola función, sin
  tablas ni políticas). **Prueba:** `pnpm pruebas:terminales-lecturas` (27 casos, en el CI).
- **Toca:** ADR-0162 (terminales sin persona), ADR-0184 (Compras por tienda), ADR-0161 (roles por módulo). No los cambia:
  cierra un hueco entre ellos.

## Qué pasó (medido en producción el 2026-09-30, solo lecturas)

La tarjeta de error sale cuando algo LANZA en el servidor. En `apps/web/app/(app)/compras/proveedores/page.tsx` lanzan solo
`getProveedores()` y `getProveedoresResumen()`; las otras dos lecturas degradan a `null`. Los registros de la API mostraron
que las tres RPC de la pantalla respondían **200 con 2 bytes (`[]`)** a la cuenta de hoy, y con cuerpo completo (~600 ms) a
la del día anterior. La cuenta de hoy es la **terminal administrativa de Tienda TRU**; la de ayer, una persona con rol
Admin/Líder. El detalle de la cadena:

1. La web deja entrar a la terminal: `requirePersonaActualV2` usa `fn_persona_actual_resumen()` y `fn_mis_modulos()`, que la
   conocen (ADR-0162), y su rol trae el módulo `proveedores`. `exigirModulo("proveedores")` pasa y `verMontos` es verdadero.
2. La base la deja fuera: `fn_proveedores()` y `fn_proveedores_resumen()` terminan en `where retail.fn_tiene_acceso_retail()`,
   y esa puerta exigía «persona activa con colaborador activo». Una terminal no es ninguna de las dos. Sin error: cero filas.
3. `getProveedoresResumen()` (`apps/web/lib/proveedores.ts:155`) recibe `[]`, no encuentra `filas[0]` y lanza.

Reproducido impersonando ambas cuentas en una transacción con `ROLLBACK`:

| | Líder | Terminal administrativa |
|---|---|---|
| `fn_proveedores()` | 78 filas | **0** |
| `fn_proveedores_resumen()` | 1 fila | **0** |
| `fn_existencias()` | 30 filas | **0** |
| `fn_tiene_acceso_retail()` | verdadero | **falso** |
| ve el módulo Proveedores | sí | sí |

La puerta nació el 2026-09-22 (`20260922170000`) y las terminales ese mismo día (`20260922200000`); nunca se enteró.
Consultado en vivo, **solo cuatro funciones la usan** —`fn_proveedores`, `fn_proveedores_resumen`, `fn_existencias`,
`fn_existencias_productos`— y nada más depende de ella (0 políticas, 0 vistas, 0 funciones de otro schema).

## Decisión

**`fn_tiene_acceso_retail()` pasa de «persona con colaborador activo» a «eso, o una terminal activa de una sede activa»**
(`or exists (select 1 from retail.fn_terminal_actual())`, la misma pieza que ya usan `fn_ubicacion_actual_persona` y
`fn_mi_rol_id`). Se arregla la definición de «actor de retail», no cada función: las cuatro quedan arregladas y cualquier
lectura futura que use la puerta nace sabiendo de terminales. La migración lleva una guardia (compara el md5 del cuerpo vivo con
el de producción y con el suyo) y se puede pegar dos veces.

## Por qué esto no abre de más

- **Lo que ve cada cuenta lo sigue decidiendo su rol (ADR-0161).** La puerta solo dice «es un actor de retail»; la terminal de
  ventas no ve Proveedores porque su rol no trae el módulo, y si llamara la función a mano el dinero le llega en NULL
  (`fn_puede_ver_dinero_de_compras()` es falso para ella). Probado.
- **El dinero sigue por tienda.** No hizo falta tocar `fn_compras_ubicaciones()`: ya arma «mis tiendas» con la terminal
  (`fn_ubicacion_actual_persona` mira `fn_terminal_actual()` primero). Con dos comprobantes (TRU S/118 y Lima S/59) la terminal de
  TRU sube S/118, la de Lima S/59 y el líder S/177. **Esta era la parte que no se podía comprobar contra producción** (hoy tiene
  0 compras): si la capa de dinero hubiera sido solo-personas, abrir la puerta habría convertido un error visible en «deuda 0»
  sin avisar. Se midió en una base con todas las migraciones antes de escribir nada.
- **Siguen afuera:** terminal desactivada, terminal de una sede desactivada, cuenta sin persona ni terminal, sin sesión,
  persona de Dynamic sin colaborador (la puerta no se ensancha a Dynamic) y colaborador con el alta pendiente de aprobación.
- **Las escrituras no usan esta puerta**; siguen firmando con `fn_actor_persona_id` (ADR-0162).

## Descarté

- **Parchar las cuatro funciones** (`… or fn_es_terminal()` en cada una): arregla hoy y deja la trampa armada para la quinta.
- **Que `getProveedoresResumen()` devuelva un resumen en ceros cuando llegan `[]`:** la pantalla se dibujaría con «S/0 de
  deuda» a alguien que no puede ver la deuda. Es exactamente lo que `lib/resultado.ts` prohíbe (principio 9: mejor no mostrar
  que mostrar algo falso). La tarjeta de error hizo su trabajo; el defecto estaba aguas abajo.
- **Darle a cada terminal una persona y un colaborador de mentira** para que pase la puerta: es justo lo que ADR-0162 evitó
  al crear terminales sin persona (57 llaves foráneas de retail apuntan a `personas`, ADR-0184; el aparato firma con el
  responsable presente en la tienda). Inventar una persona por aparato desharía esa decisión.

## Se rompe si

- Alguien redefine la puerta sin la terminal (una migración que copie el cuerpo de `20260922170000`): la guardia se detiene si
  el cuerpo vivo es otro, y la prueba tiene un caso que lo reproduce.
- Una lectura nueva hace su propio `join personas + colaboradores` en vez de llamar a la puerta: el barrido de la prueba **no la
  ve**. Regla para funciones nuevas de lectura: preguntar «¿es actor de retail?» con `fn_tiene_acceso_retail()`, nunca con un
  join propio.
- Alguien usa la puerta en una política RLS: la prueba lo detecta (hoy hay cero) para revisar qué filas abre a las terminales.

## Cómo se verificó

- Postgres desechable con las 341 migraciones locales + las 27 posteriores del repo (28 menos `20260929100000`, cuya guardia
  de `fn_frescura_sede` se detuvo por una base local atrasada; no toca proveedores ni terminales):
  `pruebas:terminales-lecturas` **27/27**; sobre la misma base **sin** el arreglo, 17/27 (los 10 rojos son exactamente los de
  terminal, incluido «el resumen devuelve una fila» y el barrido); con `--en-seco` sobre la base sin arreglo, 27/27, y la base
  queda intacta (ROLLBACK).
- Vecinas en verde con el arreglo: `terminales` (todo), `terminales-sin-persona` 55/55, `actor-firma` 30/30,
  `proveedores-cuentas` 28/28, `proveedores-rubros` 15/15, `fn-existencias` 15/15, `roles` 70/70, `roles-cobertura` 32/32.
- `migraciones:sin-drop-trigger` y `migraciones:versiones` en verde.

## Cómo se pegó (2026-09-30)

Sola, sin la web: es un `create or replace function`, sin políticas ni `alter` (no toma los bloqueos de `auth`/`storage`,
ADR-0195), así que fue una sola pegada. La web de `main` no cambia. Antes de pegar, la puerta tenía el md5 que la guardia espera
(`403086e4…`, una sola firma). Se verificó en producción como cada cuenta, en una transacción con `ROLLBACK`:

| | antes | después |
|---|---|---|
| terminal de Tienda TRU: `fn_proveedores()` / `fn_proveedores_resumen()` / `fn_existencias()` | 0 / 0 / 0 | **78 / 1 / 30** |
| líder: las mismas tres | 78 / 1 / 30 | 78 / 1 / 30 |
| md5 de la puerta | `403086e4…` | `709e7723…` (el de este archivo), una sola firma, ACL intacto |

La consulta, por si hay que repetirla (reemplazar el `sub` por el `auth_user_id` de la terminal):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<auth_user_id de la terminal>","role":"authenticated"}', true);
select (select count(*) from retail.fn_proveedores()) as proveedores,      -- debe ser el total, no 0
       (select count(*) from retail.fn_proveedores_resumen()) as resumen;  -- debe ser 1, no 0
rollback;
```

**Falta** (no lo pudo hacer Claude): recargar Compras ▸ Proveedores con la sesión real de la terminal, y `pnpm datos:generar:produccion`
para refrescar el diccionario.

## Pendiente

- **Decisión de Felipe — el directorio y los datos bancarios.** `fn_proveedores()` devuelve nombre, RUC, contacto, banco,
  cuenta, CCI y billetera a **cualquier cuenta que pase la puerta**, sin mirar el módulo `proveedores` (ya era así para los
  colaboradores). Con este cambio la lista suma a las terminales, incluida la de ventas si alguien llamara la función a mano
  (la web no se lo muestra). Si el directorio debe depender del módulo y no de la puerta, es otra migración, y cambiaría
  también lo que ven los colaboradores hoy.
- **Ruido aparte, sin verificar que sea la misma cuenta:** los registros de esos mismos minutos traen un `42501` («Elige quién
  hace esta operación») cada pocos segundos, de `fn_mi_pantalla_principal` → `fn_actor_persona_id(true)`. Es el candado del
  responsable (ADR-0162) funcionando; ensucia los registros, no rompe nada.
- La base local de Felipe está atrasada (llega a `20260928180000`; le faltan 28 migraciones, entre ellas la que define
  `fn_existencias`). Conviene ponerla al día antes de la próxima sesión de bases.

## Actualización 2026-10-04 — segunda tanda: `fn_stock_por_sede` (la puerta que quedó escrita dos veces)

Una revisión independiente de «Pedir a otra sede» desde Traslados (ADR-0242, tanda 4) encontró la misma causa en otra función:
`fn_stock_por_sede()` (ADR-0270, `20260929020000`, sección C) conservaba SU PROPIA puerta —un `exists (…colaboradores…
personas…)` copiado a mano— en vez de `fn_tiene_acceso_retail()`. Una terminal recibía cero filas sin error y
`fn_stock_por_sede_json()` devolvía `[]`: Vender («Dónde más hay»), Cambios, Apartados y «Pedir a otra sede» lo leían como «ninguna
otra sede tiene stock». Producción tiene hoy 6 terminales activas (administrativa y de ventas en AQP, LIM y TRU): las seis lo sufren.

- **Migración:** `supabase/migrations/20261004110000_stock_por_sede_pasa_la_puerta_de_lectura.sql`: un solo `create or replace
  function` (el `exists (…)` pasa a `retail.fn_tiene_acceso_retail()`; el resto del cuerpo es el de ADR-0270 línea por línea) y un
  `comment on function`. Sin políticas ni tablas. Guardia por md5 (`19273e62…` → `b7396e8a…`) y exige que la puerta ya conozca la
  terminal. **En producción** (verificada el 2026-10-04: md5 `b7396e8a…`, las 6 terminales y el líder reciben las mismas 538 filas; detalle en `docs/backlog/2026-10-04-frosty-bartik-ad6e8f.md`).
- **Prueba:** `pnpm pruebas:terminales-red` (27 casos, en el CI). Sin el arreglo: 9 rojos (los de terminal, la vía de Vender, el
  costo, el cuerpo y el inventario); con él, 27/27; `--en-seco` sobre una base sin el arreglo, 27/27.
- **Inventario de puertas propias (lo que cambia la regla).** El 2026-10-04, en la base con todas las migraciones y en producción
  (md5 idénticos), 11 funciones de `retail` mezclan `colaboradores` con `auth_user_id = auth.uid()`: cuatro ya conocen la terminal
  (`fn_actor_persona_id`, `fn_mi_rol_id`, `fn_persona_actual_resumen`, `fn_ubicacion_actual_persona`), una ES la puerta, y cinco
  quedan fuera a propósito (`fn_es_lider` y `fn_es_admin`: una terminal no es líder; `fn_colaboradores`: solo quien gestiona
  colaboradores; `fn_mi_perfil`: el perfil de una persona; `fn_compras_ubicaciones`: ya trae a la terminal por
  `fn_ubicacion_actual_persona`). `fn_stock_por_sede` era la única LECTURA de la red con puerta propia. Esa lista de cinco quedó
  escrita en la prueba: una función nueva que copie la puerta la pone en rojo. Cierra el pendiente «regla para lecturas nuevas» de
  la primera tanda con un candado en vez de una frase.
- **Lo que no se hizo:** el barrido de la primera tanda (`pruebas:terminales-lecturas`) solo veía funciones que mencionaban la
  puerta, por eso no atrapó esta; no se tocó. La web no cambia (`lib/inventario-v2.ts` ya tolera la lista vacía).
