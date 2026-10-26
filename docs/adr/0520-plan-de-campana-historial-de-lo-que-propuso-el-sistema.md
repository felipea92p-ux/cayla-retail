# ADR-0520 — Plan de campaña: la base recuerda lo que el sistema propuso junto a lo que se guardó

- **Fecha:** 2026-10-26 · **Estado:** actividades A2 (base) y A3 (web) de la tarea #1 construidas y probadas **solo en local** (migración `20261026171000`, 22 casos en
  `pnpm pruebas:plan-compra-historial-lineas`, las dos suites vecinas ajustadas y `lib/plan-compra-propuesta-guardada.test.ts`). Verificado de punta a punta en el navegador local: guardar
  «Vestidos» desde la hoja dejó su fila con la propuesta tal como se veía. **No está en producción**; producción espera el OK puntual de Felipe tras el ensayo revertido (A4). El número de este ADR y la versión de la migración están reservados para la rama `claude/campaign-plan-audit-652032` (`pnpm reservar`).
- **Continúa a:** [ADR-0349](0349-plan-de-campana.md) (el modelo), [ADR-0372](0372-plan-de-campana-barra-de-rango-paso-a-paso-y-exportar.md) (la versión de cada línea, B4) y
  [ADR-0499](0499-plan-de-campana-descuento-y-fecha-limite.md) (el descuento, de cuya función de guardado parte esta).
- **Relacionados:** ADR-0193 (la versión sube en cada escritura), ADR-0195 (políticas y deadlocks: nada de `drop trigger` ni políticas en la misma parte), ADR-0496 (se prueba con el rol de la tienda, no solo como dueño).
- **Origen:** la auditoría `/pantalla` de Compras ▸ Plan de campaña, tarea #1 (`docs/pantallas/compras-plan.md`), aprobada por Felipe el 2026-10-26.

## El problema

El Plan propone los tres escenarios de cada categoría (flojo, normal, bueno) desde lo vendido en los últimos días, y la persona los acepta o los cambia. La base guarda UNA fila por categoría
(`planes_compra_lineas`) con lo último que se guardó: cada guardado pisa al anterior, y **lo que el sistema propuso en ese momento no se guarda en ningún lado**.

Eso importa por tres razones:

1. **La propuesta depende del día.** Cambian las ventas de los últimos días y cambia el número. Después no se puede reconstruir: recalcularla con las ventas de después da otra cifra.
2. **Sin ella nadie puede medir si el sistema acierta mejor que la persona.** Navidad 2026 es la primera campaña completa en el ERP; es la oportunidad de empezar a guardarlo.
3. **Sin el historial no hay «volver a la versión anterior».** Las versiones del plan (tarea #6) se construyen sobre esto.

## Lo que se decidió

1. **Una tabla que solo se agrega: `planes_compra_lineas_historial`.** Una fila por cada guardado de una categoría, con todo lo que quedó guardado (escenarios, precio, costo, lo que sobra, descuento,
   curva, nota), la versión que resultó, quién y cuándo, y la **propuesta que la pantalla mostró** (`propuesta`, un objeto JSON de hasta 8 KB; `null` si no la hubo). Un disparador impide editar
   y borrar; RLS sin políticas y sin permisos de tabla: la web no la lee ni la escribe (leerla es de la tarea #6).
2. **La escribe `guardar_plan_compra_linea`, en la misma transacción.** La función gana `p_propuesta jsonb default null`. Escribe el historial **después** de guardar la línea y copia lo que QUEDÓ en la
   línea (con su versión nueva), no lo que la llamada creyó mandar; si el historial no se puede escribir, la línea tampoco se guarda. Es la única que escribe `planes_compra_lineas`, así que ningún
   guardado se salta el historial.
3. **La propuesta es lo que la pantalla DIJO, no una verdad calculada en la base.** Calcularla en SQL duplicaría `proponer` (`lib/plan-compra-propuesta.ts`): dos fuentes de verdad. La contrapartida
   es que la base no puede comprobarla; solo exige que sea un objeto razonable.
4. **Un doble clic deja dos filas.** Con la misma información y versiones seguidas. No se deduplica: es lo que pasó, y esconderlo borraría el rastro de una pantalla que guarda dos veces.
5. **La firma cambia** (la de 12 parámetros se borra y se crea la de 13 en la misma transacción): dos sobrecargas confundirían a PostgREST. Con una guarda de md5: si la función que reemplaza no es la que
   se leyó, no aplica nada y lo dice.
6. **Orden con la web: da igual, sin marca nueva.** La web de antes con la base nueva guarda como siempre (sin propuesta). La web nueva con la base vieja recibe de PostgREST «no existe esa firma» y
   **reintenta sin la propuesta** (A3): el guardado nunca se pierde por esto.

```
DECIDÍ:     historial append-only escrito DENTRO de guardar_plan_compra_linea (misma transacción), con la propuesta que mandó la pantalla.
DESCARTÉ:   (a) escribirlo desde la web con un segundo llamado: dos pestañas guardando a la vez dejarían un guardado sin su fila, o al revés, y nada lo detectaría;
            (b) calcular la propuesta dentro de la base: duplica `proponer` y las dos cifras terminarían distintas;
            (c) un disparador sobre planes_compra_lineas: cubriría también el UPDATE a mano, pero no puede recibir la propuesta de la llamada (haría falta pasarla por una variable de sesión, que es acción a
                distancia) y hoy no hay otro escritor de esa tabla;
            (d) una marca `con_historial` en una lectura, como `con_descuento`: obligaba a reemplazar `fn_plan_compra_descuento` (130 líneas) solo para llevar un booleano.
SE ROMPE SI: la pantalla guarda con una pestaña vieja abierta desde ayer: la fila dice «propuesta de ayer», porque eso es lo que esa persona vio (por eso la web manda `calculada_en` dentro de la
            propuesta). O si la propuesta crece más de 8 KB: se rechaza el guardado con un mensaje claro en vez de truncarla.
```

## Contrato (lo que promete y lo que asume)

- **Promete:** cada guardado de una línea del plan deja **exactamente una** fila en el historial, atada a la versión que resultó, o no guarda nada.
- **Asume:** `p_propuesta` es un objeto JSON de hasta 8 KB; la base no mira qué trae adentro. La web manda `{v, calculada_en, …}` (A3), con `v` para poder cambiar el formato sin migrar.

## Estados que nunca deben existir (los cierra el esquema, no la pantalla)

| Estado imposible | Qué lo impide |
|---|---|
| Una línea guardada sin su fila de historial | los dos `insert` van en la misma función, la única que escribe la tabla |
| Dos filas para la misma versión de la misma línea | `UNIQUE (plan_id, categoria_id, version)`; la versión sube en cada escritura (ADR-0193) |
| Una fila editada o borrada después | disparador `planes_compra_lineas_historial_inmutable` (42501, ni siquiera el dueño) |
| Una propuesta que no es un objeto, o enorme | `CHECK` en la tabla y la misma comprobación en la función (con su mensaje) |
| Escenarios desordenados o costo ≥ precio | los mismos `CHECK` que la línea |
| Que la web lea o escriba la tabla | RLS sin políticas y `revoke all` a `anon`/`authenticated` |

## Números

Hoy hay 0 líneas en producción (2026-10-26). Pensando en el año: unas 12 categorías × ~10 guardados × ~8 campañas ≈ 1 000 filas/año, de ~1 KB (hasta 8 KB con una propuesta grande): menos de 10 MB al año.
No hace falta más índice que el `UNIQUE`.

## Qué pasa si algo falla

- **La pantalla no pudo calcular la propuesta:** guarda sin ella; la fila queda con `propuesta null`. Nunca bloquea el guardado.
- **La base no responde:** el guardado falla como siempre (ADR-0450, `/sin-base`); no se guarda ni línea ni historial.
- **El historial no se puede escribir** (disco, restricción): el guardado entero se revierte y la persona ve el error; nunca queda una línea sin su rastro.

## Cómo se pega en producción (con el OK de Felipe)

Una sola parte: una tabla **nueva**, un disparador con `create or replace trigger`, tres funciones y **sin políticas** (ADR-0195). `lock_timeout` de 3 s e idempotente. Va **después** de
`20261024215000` (ya en producción desde el 2026-10-24: la función viva tiene md5 `b8a8be791f596c9bd87767935fe08a98`, la misma que local). Ensayo revertido con `set local role authenticated`
y huella completa antes y después (ver `docs/pantallas/compras-plan.md`, A4).

### Pegarla y comprobarla (lo que se hace el día que Felipe da el OK)

1. **Antes:** la propia migración comprueba su punto de partida (md5 del cuerpo de la función que reemplaza, `b8a8be791f596c9bd87767935fe08a98`, verificado en producción el 2026-10-26 con una sola
   sobrecarga, 0 líneas guardadas y 5 planes). Si no coincide, no aplica nada y lo dice: no hace falta otra comprobación previa.
2. **Pegar** en el SQL Editor de `cayla-dynamic` el archivo `supabase/migrations/20261026171000_plan_compra_historial_de_lineas.sql` **entero y tal cual** (ya lleva `retail.` y su
   `set search_path`). Si responde `lock_timeout`, no se aplicó nada: se vuelve a pegar.
3. **Después**, con estas consultas (solo leen). Lo esperado y la huella de local (la misma de la prueba) van en el comentario:

```sql
-- 1 | 13 | true | true   (UNA función, de 13 parámetros, security definer, con search_path fijo)
select count(*), max(pronargs), bool_and(prosecdef), bool_and(proconfig::text like '%search_path%')
  from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'guardar_plan_compra_linea';

-- true | 1 | false | false   (RLS puesto, un disparador, y ni la tienda ni anon leen la tabla)
select (select relrowsecurity from pg_class where oid = 'retail.planes_compra_lineas_historial'::regclass),
       (select count(*) from pg_trigger where tgrelid = 'retail.planes_compra_lineas_historial'::regclass and not tgisinternal),
       has_table_privilege('authenticated', 'retail.planes_compra_lineas_historial', 'select'),
       has_table_privilege('anon', 'retail.planes_compra_lineas_historial', 'select');

-- false | false | false | true   (la interna no se ejecuta desde afuera; guardar: la tienda sí, anon no)
select has_function_privilege('anon', 'retail.fn_plan_compra_linea_al_historial(uuid,jsonb)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_plan_compra_linea_al_historial(uuid,jsonb)', 'execute'),
       has_function_privilege('anon', 'retail.guardar_plan_compra_linea(uuid,uuid,integer,integer,integer,numeric,numeric,integer,jsonb,text,integer,numeric,jsonb)', 'execute'),
       has_function_privilege('authenticated', 'retail.guardar_plan_compra_linea(uuid,uuid,integer,integer,integer,numeric,numeric,integer,jsonb,text,integer,numeric,jsonb)', 'execute');

-- La huella: los tres md5 tienen que ser IGUALES a los de local
--   fn_plan_compra_historial_inmutable  d990bbf83d7f867fad402611ecadc2d8
--   fn_plan_compra_linea_al_historial   abf1f7cad8bce59aaacf489a44b3fad3
--   guardar_plan_compra_linea           2da5d3aad10795061977ff9611049206
select proname, md5(prosrc) from pg_proc
 where pronamespace = 'retail'::regnamespace
   and proname in ('guardar_plan_compra_linea', 'fn_plan_compra_linea_al_historial', 'fn_plan_compra_historial_inmutable')
 order by 1;
```

4. **Y la prueba de verdad:** guardar una categoría desde Compras ▸ Plan y comprobar que la tabla tiene su fila (`select version, normal, propuesta from retail.planes_compra_lineas_historial`).
   Es una escritura real en un plan de verdad: se hace con una categoría que se iba a guardar de todas formas, no con una de prueba (la fila no se puede borrar, ni a propósito).

Los md5 de local valen mientras el archivo de la migración no cambie: si se edita, se vuelven a calcular. El check «SQL pegado» del PR compara la misma huella con producción (`huellas-del-pr.mjs`).

## Lo que NO cubre

- **Leer el historial.** Ni la pantalla ni ninguna función lo lee todavía: eso es la tarea #6 (versiones del plan) y la de medir aciertos.
- **Dinero, stock y comprobantes.** El historial no mueve nada; es solo memoria.
- **Lo que la web manda (A3, `lib/plan-compra-propuesta-guardada.ts`):** `{v: 1, calculada_en, dias_campana, flojo, normal, bueno, historial_leido, tiendas: [{tienda, normal, flojo,
  bueno, como, multiplicador, previa}]}`; si no cabe en 8 KB, sin el detalle por tienda; si la categoría no vendió en 90 días, `{v, calculada_en, sin_ventas: true}`; si la base no manda
  propuestas, nada (`null`). `calculada_en` es cuándo recibió la pantalla la lectura (una pestaña abierta desde ayer dice «ayer»). Con la base vieja repite el guardado sin la propuesta.

## Qué suites tocó

- `pnpm pruebas:plan-compra-historial-lineas` (nueva, 22 casos, ROLLBACK siempre).
- `pnpm pruebas:plan-compra`: quita también la sobrecarga de 13 antes de repasar la historia hasta B5 (como ya hacía con la de 12).
- `pnpm pruebas:plan-compra-descuento`: si la base ya trae la firma de 13 (el CI), prueba lo que la base tiene en vez de recargar `20261024215000`, cuya guarda no encontraría la firma que busca y
  dejaría dos sobrecargas.
