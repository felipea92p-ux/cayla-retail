#!/usr/bin/env node
/**
 * Prueba de ADR-0208 «Frescura del piso» — la lectura de la bajada tardía `retail.fn_bajadas_del_piso`
 * (`20260926000300_frescura_lectura_bajadas.sql`; desde el paso 2 de Frescura 3c, su núcleo
 * `20260928120100_bajadas_nucleo.sql` y el cambio de conducta `20260928120200_bajadas_netear_retiros.sql`; desde el
 * paso 4, el candado del módulo «Frescura del piso» en `20260929100000_frescura_modulo_y_candado.sql`).
 *
 * POR QUÉ. La marca «tardía» no se guarda: se deriva al leer, tomando el piso de antes del libro único
 * (`fn_ledger_puntos`, ADR-0202) y cruzándolo con las ventas desde el piso de los 10 minutos siguientes. Un error de
 * signo, de borde de ventana o de qué cuenta como venta acusaría a una colaboradora que registró bien (o taparía a la que
 * registró al cobrar). Eso solo se ve con un libro de verdad y horas fijadas, y ninguna prueba de TypeScript lo cubre.
 *
 * LA REGLA DESDE 20260928120200 (ADR-0208 (c)), con W = la ventana y retiro = piso → almacén de la misma tienda:
 *   piso_antes = el nivel justo antes de la bajada + TODO lo retirado de esa prenda en [t − W, t) (un retiro de la misma
 *   hora exacta no suma), aunque el retiro se descuente de otra bajada; si el nivel justo antes es negativo, ese nivel
 *   sin sumar nada: «dudosa». Cada retiro se descuenta de UNA sola bajada de la prenda: la más cercana a W o menos; empate →
 *   la de antes del retiro; si aún empata, la de menor id. retiradas = lo que le tocó; cantidad_efectiva =
 *   máx(0, cantidad − retiradas); tardías = mín(efectiva, máx(0, vendidas − piso_antes)); «corregida» si la efectiva es
 *   0; es_carga_inicial = entrada «carga_inicial» de la misma prenda en el mismo instante. Los casos que cambian respecto
 *   de la 0300 (la de producción) dicen «(cambia en 120200: antes …)». La primera versión de la 120200 (nunca pegada)
 *   tomaba el nivel MÁS ALTO de la ventana y descontaba cada retiro de toda bajada a W o menos; los casos que movió y
 *   esta regla devolvió o corrigió dicen «(primera 120200: …)».
 *
 * QUÉ CUBRE (valores esperados escritos a mano; ventana de 10 minutos salvo que se diga otra cosa)
 *   T0  forma: una sola versión, security definer, plan a medida, anon sin EXECUTE y authenticated con EXECUTE, y las
 *       columnas del contrato; la prueba ESTRUCTURAL de ADR-0202 mira el NÚCLEO (`fn_bajadas_del_piso_nucleo`, interno:
 *       nadie de afuera lo ejecuta): llama a `fn_ledger_puntos(` una sola vez y no lee `stock` por su cuenta; la puerta
 *       `fn_bajadas_del_piso` (el candado) llama al núcleo UNA vez y al libro ninguna.
 *   T1  piso 0, baja 3, vende 1 a los 3 min → 1 tardía.            T2  piso 5, baja 3, vende 2 a los 2 min → 0.
 *   T3a venta a los 10:00 exactos → cuenta.   T3b a los 10:01 → no. Con ventana de 5 minutos, la de 10:00 no cuenta.
 *   T4  bajadas de 2 y 3 y una venta de 5 que necesita las dos → 2 y 3.
 *   T5  venta anulada: no cuenta, pero su salida y su entrada de anulación mueven el piso (piso_antes correcto).
 *   T6  baja 10, vende 1, baja 3, vende 1 → 2 y 0 (el orden importa). La segunda: piso_antes 9, como en la 0300 (primera
 *       120200: 10, porque el nivel más alto absorbía la venta de 3 minutos antes).
 *   T7  la bajada de «Reponer» (mover_interno) sale con bajada_id nulo; la de bajar_al_piso, con el suyo y su firma.
 *   T8  la entrega de un apartado desde el almacén, la salida de regularizar_prenda y la «Prenda sin registrar» no son venta.
 *   T9  cuarentena→piso no es bajada; el piso→almacén de los 10 minutos antes es un retiro que se descuenta → «corregida»
 *       (cambia en 120200: antes «normal» con piso_antes 1).
 *   T10 stock tocado a mano: una unidad de más cambia piso_antes; si queda negativo → «dudosa» y tardías nulas.
 *   T11 bajada de hace 2 minutos sin venta → «en_curso», sin cerrar; si ya se vendió, «tardia» aunque siga abierta.
 *   T12 Taller (sin piso ni almacén) → cero filas y sin error.
 *   T13 el candado del paso 4 (ADR-0208, ADR-0253): una integrante SIN el módulo «Frescura del piso» → P0001
 *       frescura_sin_permiso; CON el módulo, su sede sí (las mismas filas que el líder, con persona_id nulo) y otra sede
 *       no; el líder ve persona_id. La TERMINAL de ventas de Trujillo, igual: sin el módulo P0001; con él, las mismas
 *       filas que el líder, la bajada que registró Felipe sin persona_id, Lima no, y el líder sigue viendo a Felipe
 *       (corrección del paso 4: un candado que dejara afuera a la terminal, o le mostrara quién bajó, pasaba todo).
 *   T14 historia mezclada (y una entrada de hace 40 días, fuera del rango): piso_antes = nivel justo antes + retiros de
 *       [t − W, t), recalculado desde cero (cambia en 120200: antes 4, 5, 7 y ahora 4, 6, 7; primera 120200: 4, 7, 8); el
 *       retiro a 10 minutos justos de dos bajadas va a la de antes (efectivas 2, 2, 1; primera 120200: 2, 1, 1).
 *   T15 un cambio (la prenda que se lleva la clienta) cuenta como venta.
 *   T16 ventana fuera de 1..240 y rango de más de 120 días → sus errores; los bordes pasan; hasta <= desde → cero filas.
 *   T17 rango [desde, hasta): el borde de hasta queda fuera, y las ventas posteriores a hasta igual se miran.
 *       T17 (con retiros): los mismos dos bordes cuando la tienda tiene un retiro, que es la OTRA rama del cálculo (en T17
 *       no hay ningún retiro, así que `r.t <= v_hasta` en la rama con retiros pasaba; revisión 3 del 2026-09-27).
 *   T18 LÍMITE CONOCIDO: una devolución que entra al piso dentro de la ventana no se descuenta → la bajada sale tardía.
 *   T19 lo que llega de OTRA tienda directo al piso no es bajada, pero sí suma en piso_antes (criterio del libro).
 *   T20 tienda inactiva → cero filas y sin error (el libro no reconstruye sedes inactivas).
 *   T21 la venta se mide a la hora de la VENTA, no a la de su salida del libro, cuando las dos no coinciden.
 *   T22 la guarda de 20260928120100: con un parche en vivo aborta sin tocar nada; pegada DESPUÉS de la 120200, aborta
 *       con su aviso y no deshace nada (la cadena 0300 → 120100 → 120200 termina en la puerta de la 120200, 34a7e0cc…). T22 (el núcleo), desde la revisión 3: pegada dos veces pasa, y con el NÚCLEO de la
 *       120100 parchado en vivo aborta y no lo pisa (antes la guarda solo miraba la puerta).
 *   T23 la guarda de 20260928120200 (sobre su propia puerta, la de antes del paso 4): pegada dos veces deja lo mismo;
 *       con un parche en vivo del núcleo aborta sin tocar;
 *       con la PUERTA parchada en vivo (con la 120200 ya pegada, o justo después de la 120100) también aborta y no pisa
 *       el parche (revisión 2 del 2026-09-27: quitar la mitad de la guarda que mira la puerta pasaba sin que nada fallara).
 *   T24 el ejemplo de ADR-0208 (c): piso 2, se retiran 2 por error, se reponen 2 al minuto y se vende 1 → «corregida»,
 *       0 tardías (antes de 120200: «tardia»); con otra bajada 5 minutos antes del retiro, el retiro va a la re-bajada
 *       (a 1 minuto) y no a esa (a 5): Σ efectivas 2.
 *   T25 retiro DESPUÉS: se bajan 10 y a los 5 minutos se retiran 4 → efectiva 6; las tardías se topan por la efectiva;
 *       un retiro entre dos bajadas va solo a la más cercana (primera 120200: se descontaba de las dos).
 *   T26 carga inicial: la entrada «carga_inicial» y su bajada en el mismo instante (cargar_stock_inicial con p_al_piso,
 *       o a mano) → es_carga_inicial; en otro instante, o una bajada normal → no; dos entradas de carga en el mismo
 *       instante no duplican la bajada.
 *   T27 bordes del rango: una bajada del primer minuto ve su piso de antes y el retiro previo aunque caigan antes de
 *       p_desde; y un retiro que se disputa con una bajada de fuera del rango (a dos ventanas de p_desde) va a esa bajada
 *       igual que con el rango de 30 días. El espejo en p_hasta: la bajada del último minuto ve su retiro de después, y un
 *       retiro que le disputa una bajada a más de una ventana después de p_hasta va a esa.
 *       T27 (único retiro), desde la revisión 3, cada uno en su propia transacción: el ÚNICO retiro de la tienda cae antes
 *       de p_desde (o después de p_hasta), dentro de la ventana ampliada, y la bajada del borde igual lo ve. Es la tienda
 *       entera, y no el rango pedido, la que decide si se recorre la rama con retiros.
 *   T28 la misma hora exacta (una transacción): el piso de antes es el nivel que el libro deja justo ANTES de la bajada
 *       (created_at, id), nunca lo de después; un retiro de la misma hora no suma al piso de antes ([t − W, t) deja fuera
 *       la hora t), pero se descuenta de la bajada (a 0 minutos) (primera 120200: la venta de la misma hora ANTES de la
 *       bajada subía el piso de antes a 2; ahora, como en la 0300, 0 y tardía).
 *   T29 la regla de los retiros: empate a la misma distancia → la bajada de antes (Σ efectivas 3, sin doble descuento);
 *       retiro más grande que su bajada → efectiva 0 y lo que sobra no pasa a otra; retiro a 11 minutos → ni se
 *       descuenta ni suma al piso de antes; «dudosa» con un retiro en la ventana → el nivel negativo sin sumarlo, también
 *       cuando el retiro lo dejaría en >= 0 (−1 + 2); dos bajadas de la prenda en el mismo instante → el retiro va solo a
 *       la de menor id; dos retiros para la misma bajada se SUMAN (en piso_antes y en retiradas); un retiro previo con
 *       efectiva > 0 y ventas evita la tardía (con el nivel justo antes saldrían 2); dos retiros IGUALES (1 y 1) también
 *       se suman y evitan la tardía (con cantidades distintas, «sumar sin repetidos» pasaba).
 *   T30 LÍMITE CONOCIDO, el precio de la regla del piso de antes (decidida el 2026-09-27: se queda la vigente; ADR-0208,
 *       «Límites» del paso 2): retiro por error, re-bajada que lo corrige y, 2 minutos después, una bajada real → la real
 *       sale con piso_antes 4 (el retiro cuenta dos veces: en el nivel, a través de la re-bajada, y en la suma) y 0
 *       tardías; sin el error, 1 tardía. Fija la regla decidida para que cambiarla sea otra decisión y no un accidente.
 *   T31 bordes que ninguna prueba vigilaba (pruebas de mutación, 2026-09-27): piso→cuarentena no es retiro; con
 *       p_minutos 5 y 30, la ventana de los retiros y el margen de lectura (2·W) siguen a p_minutos; «dudosa» manda sobre
 *       «corregida» y «corregida» sobre «en_curso»; en el empate de distancia manda la hora (la de antes) aunque su id sea
 *       mayor; una carga inicial 30 segundos antes o después, 1 segundo antes, o de otra tienda, no marca la bajada.
 *       Desde la revisión 2 (2026-09-27): cuarentena → almacén no es retiro (definir el retiro solo por su destino
 *       tapaba una tardía); almacén → cuarentena no es bajada ni se lleva el retiro de la bajada real; dos ventas iguales
 *       del mismo instante se suman (un `union` en vez de `union all` las juntaba); leído con p_desde exacto, la bajada
 *       que está justo en p_desde − 2W igual se lleva su retiro; la función entrega de la más nueva a la más vieja; sin
 *       p_desde lee 30 días; un retiro con la bajada de después a medio segundo va a esa (el «después» empieza a 1 µs).
 *   T32 LÍMITE CONOCIDO, el mismo precio que T30 en su otra forma (A, «colgaron de más»): el retiro se le descontó a la
 *       bajada ANTERIOR (esas prendas nunca estuvieron en el piso) y la siguiente igual lo suma a su piso de antes: 1
 *       tardía real que no se ve, también con la carga inicial y en el empate de T29 con ventas. Fija la regla decidida.
 *       T32 (gemelos) (B, «retiro por error»): el mismo dibujo en el libro (bajada, retiro que va a ella, otra bajada,
 *       ventas), pero el retiro fue un error y la bajada siguiente lo corrige. La regla vigente no culpa a quien corrige
 *       (0 tardías, «normal»), tampoco cuando la corrección va en dos re-bajadas. La «variante C» (sumar solo lo retirado
 *       antes que se le asignó a ESA bajada) daba vuelta estas filas: por eso se descartó (ADR-0208, 2026-09-27).
 *   T33 «cerrada» no es final: una bajada cerrada y «corregida» pasa a «tardia» cuando después otra bajada de la misma
 *       talla queda más cerca de su retiro. Límite escrito en ADR-0208; fija el valor de hoy.
 *   T34 (revisión 4, 2026-09-27) la marca de carga: una segunda carga de la misma prenda a 5 minutos no apaga la
 *       primera (mutante 1: max en vez de min); un AJUSTE con motivo «carga_inicial» no es carga (mutante 24).
 *   T35 dos bajadas del mismo instante salen por id (mutante 20: id descendente; en producción hay 69 pares así).
 *   T36 solo un traslado interno es bajada o retiro: una salida o una entrada con sububicación de destino suelta (la
 *       base la acepta) ni se descuenta ni se lleva un retiro (mutante 8: sin fn_es_traslado_interno).
 *   T37 la guarda de 20260929100000 (paso 4) sobre la puerta: desde la 120200 entra y deja la puerta del paso 4
 *       (9821874e…) con las mismas filas para el líder; pegada otra vez no cambia nada; con la puerta o el núcleo parchados
 *       en vivo aborta y no los pisa; volver a pegar la 120200 después aborta y no la deshace.
 *
 * MUTANTES EQUIVALENTES (revisión 4): de los 38 cambios de la revisión 3, 9 no cambian ninguna fila posible, y ningún
 * caso puede matarlos. Diferencial aleatorio (8 historias densas: empates de minuto, retiros, cargas, la centinela,
 * filas sueltas; 100 combinaciones de p_desde, p_hasta y p_minutos cada una): 0 lecturas distintas de 800, y los 4 de
 * arriba sí se ven. Por qué:
 *   4  «después» desde el mismo instante: solo suma una bajada de la MISMA hora del retiro, y esa ya es su t_antes
 *      (distancia 0, gana el empate).   15 la bajada va a su t_antes: el de una bajada es su propia hora.
 *   33 la carga en [t − W, t] con max: «la más tardía hasta t es t» y «la más temprana desde t es t» dicen lo mismo, «hay
 *      una carga en t».   39 la rama por prenda: sin retiros de la prenda, las dos ramas dan 0 y 0.
 *   34 `< v_hasta + 2W`: una bajada del rango es < v_hasta, su retiro está a W o menos y quien se lo dispute, a W o menos
 *      de él: todo cae antes de v_hasta + 2W (el borde exacto solo importa abajo, donde el empate favorece a la de antes).
 *   7  la centinela: el libro no la reconstruye (sin punto ord 1), así que su bajada no pasa el `having` de juntas.
 *   27 sin `ord = 1`: el saldo inicial tiene oid nulo, no se junta con ninguna bajada ni es venta.
 *   22 y 28: toda bajada tiene su punto del libro con delta +cantidad (CHECK cantidad > 0) y un retiro nunca sube el piso;
 *      el `having` y el `es_bajada` se cubren entre sí.
 *
 * CÓMO. `now()` es constante dentro de una transacción y `movimientos` es inmutable: como `postgres`, cada caso inserta
 * sus movimientos con `created_at` explícito (colgados de t0 = ahora − 3 h) EN ORDEN CRONOLÓGICO y los aplica con
 * `fn_aplicar_movimiento`, así el stock cuadra con el libro. Prendas nuevas en cada caso (SKU «ZZ-FRE-…»); cada caso en
 * su transacción con ROLLBACK: no deja nada en la base. Mismo mecanismo que `fn_resumen_variantes.mjs`.
 *
 * USO
 *   pnpm pruebas:frescura-bajadas    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const migracion = (archivo) => readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8");
const MIGRACION_0300 = migracion("20260926000300_frescura_lectura_bajadas.sql");
const MIGRACION_NUCLEO = migracion("20260928120100_bajadas_nucleo.sql");
const MIGRACION_RETIROS = migracion("20260928120200_bajadas_netear_retiros.sql");
/** Paso 4 (la pantalla): el módulo «Frescura del piso» y el candado nuevo de la puerta. */
const MIGRACION_P4 = migracion("20260929100000_frescura_modulo_y_candado.sql");
/** Una migración entera como literal de SQL (entre $m$), para ejecutarla con pg_temp.intento dentro del caso. */
const comoLiteral = (sql) => `${"$"}m$${sql.replace(/\\/g, "\\\\")}${"$"}m$`;
/** El cuadre del piso (ADR-0328, 20261004200200) cambia el núcleo (y fn_frescura_sede) por reemplazo anclado. Esto lo deshace
 *  (sus anclas, leídas del archivo, en orden inverso) para los casos que prueban el orden de pegado de las migraciones
 *  ANTERIORES (T22, T37), que se escribieron sobre el núcleo de la 120200. El cuadre se prueba en cuadrar_piso.mjs (C11, C12). */
const DESHACER_CUADRE = [...migracion("20261004200200_cuadre_piso_frescura.sql").matchAll(/reemplazar_anclado\(\s*'([^']+)',\s*\$v\$([\s\S]*?)\$v\$,\s*\$n\$([\s\S]*?)\$n\$\s*\)/g)]
  .reverse()
  .map(([, firma, viejo, nuevo]) => `do $dd$ begin execute replace(pg_get_functiondef('${firma}'::regprocedure), $nn$${nuevo}$nn$, $vv$${viejo}$vv$); end $dd$;`)
  .join("\n");
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
/** La cuenta de una terminal de ventas de Trujillo que crea T13 (como terminales_por_tienda.mjs), dentro de su ROLLBACK. */
const TERMINAL_TRU = "33333333-3333-4333-8333-0000000000f2";
const CENTINELA = "22222222-2222-4222-8222-222222222222"; // «Prenda sin registrar» (ADR-0179)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

/** Todo caso empieza igual: Tienda Trujillo con piso, almacén y cuarentena, el líder en sesión y el reloj t0. */
const PRELUDIO = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
-- fn_actor_persona_id consulta la asistencia de Dynamic: en un Postgres sin Dynamic esas tablas no existen.
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Cuarentena', 'cuarentena' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena');
select id as sp from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sa from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
select id as sc from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select (now() - interval '3 hours') as t0 \\gset
-- psql no sustituye variables dentro de cuerpos entre $$: la tienda y sus sububicaciones viajan como parámetros de sesión.
select set_config('prueba.ubic', :'ubic', true) as _1, set_config('prueba.sp', :'sp', true) as _2,
       set_config('prueba.sa', :'sa', true) as _3, set_config('prueba.sc', :'sc', true) as _4 \\gset

-- Una prenda nueva (cada una su producto; desde ADR-0109 todo producto lleva marca y proveedor).
create function pg_temp.variante(p_sku text) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'productos' and column_name = 'marca_id') then
    insert into retail.productos (referencia, marca_id, proveedor_id)
      select 'ZZ ' || p_sku, mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
      returning id into p;
  else
    insert into retail.productos (referencia) values ('ZZ ' || p_sku) returning id into p;
  end if;
  insert into retail.variantes (producto_id, sku, precio, costo) values (p, p_sku, 100, 40) returning id into v;
  return v;
end $$;
-- Una fila del libro con hora fijada, aplicada al stock en el acto (se llaman en orden cronológico).
create function pg_temp.mov(v uuid, p_tipo text, n int, sub uuid, p_motivo text, cuando timestamptz,
                            sub_destino uuid default null, venta_item uuid default null, cambio uuid default null)
returns uuid language plpgsql as $$
declare u uuid := current_setting('prueba.ubic')::uuid; m uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                  tipo, cantidad, motivo, venta_item_id, cambio_id, created_at)
  values (v, u, sub, case when p_tipo = 'traslado' then u end, sub_destino, p_tipo, n, p_motivo, venta_item, cambio, cuando)
  returning id into m;
  perform retail.fn_aplicar_movimiento(m);
  return m;
end $$;
-- Entrada al almacén (lo que llegó del proveedor).
create function pg_temp.llega(v uuid, n int, cuando timestamptz) returns uuid language sql as $$
  select pg_temp.mov(v, 'entrada', n, current_setting('prueba.sa')::uuid, 'recepcion', cuando)
$$;
-- Bajada con la forma exacta de mover_interno: traslado almacén→piso de la misma tienda.
create function pg_temp.bajada(v uuid, n int, cuando timestamptz) returns uuid language sql as $$
  select pg_temp.mov(v, 'traslado', n, current_setting('prueba.sa')::uuid, 'movimiento_interno', cuando, current_setting('prueba.sp')::uuid)
$$;
-- Una venta de una línea (completada o anulada) con su hora; devuelve el id de la línea. No mueve stock.
create function pg_temp.venta_item(v uuid, n int, cuando timestamptz, p_estado text default 'completada') returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := current_setting('prueba.ubic')::uuid;
begin
  if p_estado = 'anulada' then
    insert into retail.ventas (ubicacion_id, estado, anulado_en, motivo_anulacion, created_at) values (u, 'anulada', cuando + interval '47 minutes', 'prueba', cuando) returning id into vt;
  else
    insert into retail.ventas (ubicacion_id, estado, created_at) values (u, 'completada', cuando) returning id into vt;
  end if;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, v, n, 100, 40) returning id into li;
  return li;
end $$;
-- Venta desde una sububicación (el piso si no se dice): la venta y su salida del libro, a la misma hora.
create function pg_temp.vende(v uuid, n int, cuando timestamptz, p_estado text default 'completada', sub uuid default null) returns uuid language sql as $$
  select pg_temp.mov(v, 'salida', n, coalesce(sub, current_setting('prueba.sp')::uuid), 'venta', cuando, null, pg_temp.venta_item(v, n, cuando, p_estado))
$$;
`;

/** Las filas de la función para las prendas de la prueba: una línea `R|…` por bajada. */
const FILAS = (args = "") => `
select 'R|' || v.sku || '|' || round(extract(epoch from (r.bajada_en - :'t0'::timestamptz)) / 60.0, 3) || '|' || r.cantidad
       || '|' || r.piso_antes || '|' || r.vendidas_en_ventana || '|' || coalesce(r.unidades_tardias::text, 'null')
       || '|' || r.cerrada || '|' || r.estado || '|' || coalesce(r.bajada_id::text, 'null') || '|' || coalesce(r.persona_id::text, 'null')
       || '|' || r.movimiento_id || '|' || r.retiradas_en_ventana || '|' || r.cantidad_efectiva || '|' || r.es_carga_inicial
  from retail.fn_bajadas_del_piso(:'ubic'${args}) r
  join retail.variantes v on v.id = r.variante_id
 where v.sku like 'ZZ-FRE-%'
 order by v.sku, r.bajada_en;`;

/** Llama a la función con esos argumentos y devuelve «ok + filas» o el error (estado, hint, mensaje) en una línea `E|nombre|…`. */
const PROBAR = `
create function pg_temp.probar(p_ubicacion uuid, p_desde timestamptz default null, p_hasta timestamptz default null, p_minutos integer default 10)
returns jsonb language plpgsql as $$
declare n bigint; v_estado text; v_msg text; v_hint text;
begin
  select count(*) into n from retail.fn_bajadas_del_piso(p_ubicacion, p_desde, p_hasta, p_minutos);
  return jsonb_build_object('ok', true, 'filas', n);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end $$;
-- Cualquier SQL (una migración entera, una llamada al núcleo): «ok» o el error, sin cortar el caso.
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'msg', v_msg);
end $$;`;
const probar =(nombre, args) => `select 'E|${nombre}|' || pg_temp.probar(${args})::text;`;

function parsear(salida) {
  const filas = {};
  const errores = {};
  const otras = {};
  for (const linea of salida.split("\n")) {
    if (linea.startsWith("R|")) {
      const [, sku, min, cantidad, pisoAntes, vendidas, tardias, cerrada, estado, bajadaId, personaId, movimientoId, retiradas, efectiva, carga] =
        linea.split("|");
      (filas[sku] ??= []).push({
        min: Number(min), cantidad: +cantidad, pisoAntes: +pisoAntes, vendidas: +vendidas,
        tardias: tardias === "null" ? null : +tardias, cerrada: cerrada === "true", estado,
        bajadaId: bajadaId === "null" ? null : bajadaId, personaId: personaId === "null" ? null : personaId, movimientoId,
        retiradas: +retiradas, efectiva: +efectiva, carga: carga === "true",
      });
    } else if (linea.startsWith("E|")) {
      const [, nombre, ...resto] = linea.split("|");
      errores[nombre] = JSON.parse(resto.join("|"));
    } else if (/^[A-Z][A-Z0-9_]*\|/.test(linea)) {
      const [clave, ...resto] = linea.split("|");
      otras[clave] = resto.join("|");
    }
  }
  return { filas, errores, otras };
}

let fallos = 0;
let total = 0;
function afirmar(nombre, condicion, detalle = "") {
  total += 1;
  if (condicion) console.log(`  ✔ ${nombre}`);
  else {
    fallos += 1;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}
const ver = (x) => JSON.stringify(x);
/** ¿La fila tiene exactamente estos valores? (solo compara las claves que se piden) */
const es = (fila, esperado) => !!fila && Object.entries(esperado).every(([k, v]) => fila[k] === v);

function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(`${PRELUDIO}\n${PROBAR}\n${sql}\nrollback;\n`).trim();
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 6).join(" ")}`);
    return;
  }
  verificar(parsear(salida), salida);
}

// ---------------------------------------------------------------------------
correr(
  "T0 · forma: una sola versión, security definer, plan a medida; authenticated la ejecuta y anon no",
  `select 'N|' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_bajadas_del_piso';
select 'F|' || p.prosecdef || ',' || p.provolatile::text || ',' || array_to_string(p.proconfig, ';')
  from pg_proc p where p.oid = 'retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)'::regprocedure;
select 'C|' || array_to_string(p.proargnames, ',')
  from pg_proc p where p.oid = 'retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)'::regprocedure;
select 'P|' || has_function_privilege('authenticated', 'retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)', 'execute')
       || ',' || has_function_privilege('anon', 'retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)', 'execute');
-- ADR-0202: cuántas veces llama el NÚCLEO al libro único y si vuelve a leer el stock por su cuenta (el saldo de partida
-- es del libro). La puerta no toca el libro: le pide todo al núcleo, una vez.
select 'LEDGER|' || (length(d) - length(replace(d, 'fn_ledger_puntos(', ''))) / length('fn_ledger_puntos(')
       || ',' || (d ~* '\\m(from|join)\\s+(retail\\.)?stock\\M')
  from (select pg_get_functiondef('retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)'::regprocedure) as d) x;
select 'PUERTA|' || (length(d) - length(replace(d, 'fn_bajadas_del_piso_nucleo(', ''))) / length('fn_bajadas_del_piso_nucleo(')
       || ',' || (length(d) - length(replace(d, 'fn_ledger_puntos(', ''))) / length('fn_ledger_puntos(')
  from (select pg_get_functiondef('retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)'::regprocedure) as d) x;
-- El núcleo: uno solo, security definer, y nadie de afuera lo ejecuta (ni authenticated, ni anon, ni public).
select 'NN|' || count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_bajadas_del_piso_nucleo';
select 'NF|' || p.prosecdef || ',' || p.provolatile::text
  from pg_proc p where p.oid = 'retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)'::regprocedure;
select 'NP|' || has_function_privilege('authenticated', 'retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)', 'execute')
       || ',' || has_function_privilege('anon', 'retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)', 'execute')
       || ',' || coalesce((select bool_or(a.grantee = 0) from pg_proc p, aclexplode(p.proacl) a
                            where p.oid = 'retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)'::regprocedure), false);
set local role authenticated;
select 'A|' || count(*) from retail.fn_bajadas_del_piso(:'ubic');
select 'NA|' || pg_temp.intento(format('select count(*) from retail.fn_bajadas_del_piso_nucleo(%L)', :'ubic'))::text;
reset role;
set local role anon;
${probar("anon", ":'ubic'")}
reset role;`,
  ({ errores, otras }) => {
    const [llamadas, leeStock] = (otras.LEDGER ?? "").split(",");
    afirmar("las entrañas descansan en el libro único: el núcleo llama a fn_ledger_puntos( UNA sola vez (sin N+1)", llamadas === "1", `LEDGER=${otras.LEDGER}`);
    afirmar("el núcleo no lee stock por su cuenta (el saldo de partida sale de fn_ledger_puntos)", leeStock === "false", `LEDGER=${otras.LEDGER}`);
    afirmar("la puerta llama al núcleo UNA vez y al libro ninguna (un solo cálculo)", otras.PUERTA === "1,0", `PUERTA=${otras.PUERTA}`);
    afirmar("hay UN solo núcleo, security definer y stable", otras.NN === "1" && otras.NF === "true,s", `NN=${otras.NN} NF=${otras.NF}`);
    afirmar("nadie de afuera ejecuta el núcleo: ni authenticated, ni anon, ni public", otras.NP === "false,false,false", `NP=${otras.NP}`);
    const na = otras.NA ? JSON.parse(otras.NA) : null;
    afirmar("authenticated llamando al núcleo directo → permission denied (42501)", na?.ok === false && na?.estado === "42501", otras.NA);
    afirmar("hay UNA sola función fn_bajadas_del_piso", otras.N === "1", `N=${otras.N}`);
    const [secdef, volatil, ...resto] = (otras.F ?? "").split(",");
    const config = resto.join(",");
    afirmar("security definer y stable", secdef === "true" && volatil === "s", otras.F);
    afirmar("plan_cache_mode = force_custom_plan y search_path fijo", /plan_cache_mode=force_custom_plan/.test(config ?? "") && /search_path=retail, public, extensions/.test(config ?? ""), config);
    afirmar(
      "parámetros y columnas del contrato, en su orden",
      otras.C ===
        "p_ubicacion_id,p_desde,p_hasta,p_minutos,movimiento_id,bajada_id,variante_id,persona_id,bajada_en,cantidad,piso_antes,vendidas_en_ventana," +
          "unidades_tardias,cerrada,estado,retiradas_en_ventana,cantidad_efectiva,es_carga_inicial",
      otras.C,
    );
    afirmar("authenticated tiene EXECUTE y anon no", otras.P === "true,false", otras.P);
    afirmar("el líder la llama como authenticated (grant real, no solo postgres)", /^\d+$/.test(otras.A ?? ""), `A=${otras.A}`);
    afirmar("anon llamándola → permission denied", errores.anon?.ok === false && errores.anon?.estado === "42501", ver(errores.anon));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T1 · piso vacío, baja 3 y a los 3 minutos se vende 1 → 1 tardía",
  `select pg_temp.variante('ZZ-FRE-T1') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz) as _2 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '3 minutes') as _3 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T1"] ?? [];
    afirmar("una sola fila (la entrada al almacén y la venta no son bajadas)", f.length === 1, ver(f));
    afirmar("piso_antes 0, cantidad 3, vendidas 1, tardías 1, tardía y cerrada", es(f[0], { min: 0, cantidad: 3, pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia", cerrada: true }), ver(f[0]));
    afirmar("una bajada por movimiento directo no tiene documento de bajada", f[0]?.bajadaId === null, ver(f[0]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T2 · el piso ya tenía 5, baja 3 y a los 2 minutos se venden 2 → 0 tardías (el piso de antes alcanzaba)",
  `select pg_temp.variante('ZZ-FRE-T2') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
-- Entrada directa al piso (no es bajada): deja 5 colgadas.
select pg_temp.mov(:'v', 'entrada', 5, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _2 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz) as _3 \\gset
select pg_temp.vende(:'v', 2, :'t0'::timestamptz + interval '2 minutes') as _4 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T2"] ?? [];
    afirmar("una sola fila (la entrada directa al piso no es bajada)", f.length === 1, ver(f));
    afirmar("piso_antes 5, vendidas 2, tardías 0, normal", es(f[0], { cantidad: 3, pisoAntes: 5, vendidas: 2, tardias: 0, estado: "normal" }), ver(f[0]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T3 · el borde de la ventana: a los 10:00 exactos cuenta (T3a), a los 10:01 no (T3b); con ventana de 5 minutos, la de 10:00 tampoco",
  `select pg_temp.variante('ZZ-FRE-T3A') as va \\gset
select pg_temp.variante('ZZ-FRE-T3B') as vb \\gset
select pg_temp.llega(:'va', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'vb', 5, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.bajada(:'va', 1, :'t0'::timestamptz) as _3 \\gset
select pg_temp.bajada(:'vb', 1, :'t0'::timestamptz) as _4 \\gset
select pg_temp.vende(:'va', 1, :'t0'::timestamptz + interval '10 minutes') as _5 \\gset
select pg_temp.vende(:'vb', 1, :'t0'::timestamptz + interval '10 minutes 1 second') as _6 \\gset
${FILAS()}
${FILAS(", p_minutos => 5").replace("'R|' || v.sku", "'R|' || v.sku || '-5MIN'")}`,
  ({ filas }) => {
    afirmar("T3a · venta a los 10:00 exactos → 1 tardía", es(filas["ZZ-FRE-T3A"]?.[0], { pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }), ver(filas["ZZ-FRE-T3A"]));
    afirmar("T3b · venta a los 10:01 → fuera de la ventana, 0 tardías", es(filas["ZZ-FRE-T3B"]?.[0], { pisoAntes: 0, vendidas: 0, tardias: 0, estado: "normal" }), ver(filas["ZZ-FRE-T3B"]));
    afirmar("con p_minutos = 5 la venta de los 10:00 ya no cuenta", es(filas["ZZ-FRE-T3A-5MIN"]?.[0], { vendidas: 0, tardias: 0, estado: "normal" }), ver(filas["ZZ-FRE-T3A-5MIN"]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T4 · dos bajadas seguidas (2 y a los 4 minutos 3) y una venta de 5 a los 6 minutos → 2 y 3 tardías",
  `select pg_temp.variante('ZZ-FRE-T4') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _2 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz + interval '4 minutes') as _3 \\gset
select pg_temp.vende(:'v', 5, :'t0'::timestamptz + interval '6 minutes') as _4 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T4"] ?? [];
    afirmar("dos filas", f.length === 2, ver(f));
    afirmar("la primera: piso_antes 0, vendidas 5, 2 tardías", es(f[0], { min: 0, cantidad: 2, pisoAntes: 0, vendidas: 5, tardias: 2, estado: "tardia" }), ver(f[0]));
    afirmar("la segunda: piso_antes 2, vendidas 5, 3 tardías", es(f[1], { min: 4, cantidad: 3, pisoAntes: 2, vendidas: 5, tardias: 3, estado: "tardia" }), ver(f[1]));
    afirmar("entre las dos suman las 5 vendidas", (f[0]?.tardias ?? 0) + (f[1]?.tardias ?? 0) === 5);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T5 · una venta anulada no es venta, pero su salida y su entrada de anulación sí mueven el piso",
  `select pg_temp.variante('ZZ-FRE-T5') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz) as _2 \\gset
-- Se vendió 1 a los 2 minutos y se anuló a los 50: la salida original queda en el libro y vuelve con 'anulacion_venta'.
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '2 minutes', 'anulada') as mv \\gset
select venta_item_id as li from retail.movimientos where id = :'mv' \\gset
select pg_temp.mov(:'v', 'entrada', 1, :'sp', 'anulacion_venta', :'t0'::timestamptz + interval '50 minutes', null, :'li') as _3 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz + interval '60 minutes') as _4 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T5"] ?? [];
    afirmar("la bajada de t0: vendidas 0 (la anulada no cuenta), 0 tardías, piso_antes 0", es(f[0], { min: 0, pisoAntes: 0, vendidas: 0, tardias: 0, estado: "normal" }), ver(f[0]));
    afirmar("la bajada de t0+60: piso_antes 3 (3 − 1 que salió + 1 que volvió)", es(f[1], { min: 60, pisoAntes: 3, vendidas: 0, tardias: 0 }), ver(f[1]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T6 · baja 10, se vende 1 a los 2 min, baja 3 a los 5 y se vende 1 a los 7 → 2 y 0 tardías (el orden importa)",
  `select pg_temp.variante('ZZ-FRE-T6') as v \\gset
select pg_temp.llega(:'v', 20, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 10, :'t0'::timestamptz) as _2 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '2 minutes') as _3 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz + interval '5 minutes') as _4 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '7 minutes') as _5 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T6"] ?? [];
    afirmar("la de 10: piso_antes 0, vendidas 2 → 2 tardías", es(f[0], { min: 0, cantidad: 10, pisoAntes: 0, vendidas: 2, tardias: 2, estado: "tardia" }), ver(f[0]));
    // Como en la 0300: el piso de antes es el nivel justo antes (9); una VENTA de los minutos previos no se le suma
    // (primera 120200: 10, porque el nivel más alto de la ventana era el de antes de venderla). Sin retiros, nada más.
    afirmar("la de 3: piso_antes 9 (la venta de 3 minutos antes no se absorbe), vendidas 1 → 0 tardías", es(f[1], { min: 5, cantidad: 3, pisoAntes: 9, vendidas: 1, tardias: 0, estado: "normal" }), ver(f[1]));
    afirmar("sin retiros: la efectiva es la cantidad", f.every((x) => x.retiradas === 0 && x.efectiva === x.cantidad && x.carga === false), ver(f));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T7 · «Reponer» (mover_interno) sale sin bajada_id; bajar_al_piso sale con el suyo; las dos firmadas por quien bajó",
  `select pg_temp.variante('ZZ-FRE-T7-REPONER') as vr \\gset
select pg_temp.variante('ZZ-FRE-T7-BAJAR') as vb \\gset
select pg_temp.llega(:'vr', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'vb', 5, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select retail.mover_interno(:'ubic', :'vr', 2, :'sa', :'sp', null) as mov_reponer \\gset
select retail.bajar_al_piso(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'vb', 'cantidad', 3)), gen_random_uuid()) ->> 'bajada_id' as bid \\gset
-- Lo recién escrito tiene created_at = now() de ESTA transacción y la lectura va hasta now() sin incluirlo ([desde,
-- hasta)): en la vida real la lectura es otra transacción, posterior. Se corre 1 minuto hacia atrás por fuera de los
-- disparadores (solo postgres y solo en esta transacción, que termina en ROLLBACK); el stock no cambia. El candado se
-- apaga A LA VISTA y no con el modo réplica: desde 20260926160000 está en ALWAYS y el modo réplica ya no lo salta (D-22).
set constraints retail.trg_actividad_movimientos, retail.trg_actividad_conteo_nuevo, retail.trg_actividad_traslado_nuevo immediate; -- Actividad (ADR-0207): sin eventos pendientes, el alter no choca
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '1 minute'
 where id = :'mov_reponer' or id in (select movimiento_id from retail.bajada_piso_items where bajada_id = :'bid');
alter table retail.movimientos enable always trigger movimientos_inmutables;
select 'BID|' || :'bid';
select 'FELIPE|' || :'felipe';
select 'MOVR|' || :'mov_reponer';
${FILAS()}`,
  ({ filas, otras }) => {
    const r = filas["ZZ-FRE-T7-REPONER"]?.[0];
    const b = filas["ZZ-FRE-T7-BAJAR"]?.[0];
    afirmar("la de «Reponer» aparece, es su movimiento y no tiene documento", r?.bajadaId === null && r?.movimientoId === otras.MOVR, ver(r));
    afirmar("la de bajar_al_piso aparece con su bajada_id", !!otras.BID && b?.bajadaId === otras.BID, `${ver(b)} bid=${otras.BID}`);
    afirmar("persona_id = quien firmó el movimiento (el líder en sesión)", r?.personaId === otras.FELIPE && b?.personaId === otras.FELIPE, `${r?.personaId} ${b?.personaId} felipe=${otras.FELIPE}`);
    afirmar("recién hechas: ventana abierta → en_curso y sin cerrar", es(r, { estado: "en_curso", cerrada: false, cantidad: 2 }) && es(b, { estado: "en_curso", cerrada: false, cantidad: 3 }), `${ver(r)} ${ver(b)}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T8 · no son venta: la entrega de un apartado desde el almacén, la salida de regularizar_prenda y la «Prenda sin registrar»",
  `select pg_temp.variante('ZZ-FRE-T8') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
-- Apartado en el almacén para una clienta.
select pg_temp.mov(:'v', 'apartado', 1, :'sa', 'apartado', :'t0'::timestamptz - interval '50 minutes') as _2 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _3 \\gset
-- Venta registrada al cobrar con la «Prenda sin registrar» a los t0+1; se regulariza a los t0+4 y sale del piso con
-- motivo 'venta' y la hora de la venta original (dentro de la ventana): regularizar_prenda la fecha en otro momento.
select pg_temp.venta_item(:'v', 1, :'t0'::timestamptz + interval '1 minute') as li_reg \\gset
insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado,
                                            estado, variante_id, forma, precio_oficial, diferencia, regularizado_en)
  select :'li_reg', :'ubic', 'Blusa sin etiqueta', (select id from retail.categorias order by id limit 1), (select id from retail.tallas order by id limit 1),
         (select codigo from retail.colores order by codigo limit 1), 100, 'regularizada', :'v', 'ya_registrada', 100, 0, :'t0'::timestamptz + interval '4 minutes';
select pg_temp.mov(:'v', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '4 minutes', null, :'li_reg') as _4 \\gset
-- Entrega del apartado a los t0+3: se libera y sale DESDE EL ALMACÉN como venta completada.
select pg_temp.mov(:'v', 'liberacion_apartado', 1, :'sa', 'liberacion_apartado', :'t0'::timestamptz + interval '3 minutes') as _5 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '3 minutes', 'completada', :'sa') as _6 \\gset
-- «Prenda sin registrar»: una venta de la centinela no mueve stock; y una fila con forma de bajada de la centinela no sale.
select pg_temp.venta_item('${CENTINELA}'::uuid, 1, :'t0'::timestamptz + interval '5 minutes') as _7 \\gset
select pg_temp.llega('${CENTINELA}'::uuid, 1, :'t0'::timestamptz - interval '60 minutes') as _8 \\gset
select pg_temp.bajada('${CENTINELA}'::uuid, 1, :'t0'::timestamptz) as _9 \\gset
select 'CENT|' || count(*) from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = '${CENTINELA}'::uuid;
${FILAS()}`,
  ({ filas, otras }) => {
    const f = filas["ZZ-FRE-T8"] ?? [];
    afirmar("una sola fila para la prenda", f.length === 1, ver(f));
    afirmar("vendidas 0 y 0 tardías: ni la entrega desde el almacén ni la regularización cuentan", es(f[0], { pisoAntes: 0, vendidas: 0, tardias: 0, estado: "normal" }), ver(f[0]));
    afirmar("la «Prenda sin registrar» nunca sale como bajada", otras.CENT === "0", `CENT=${otras.CENT}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T9 · cuarentena→piso no es bajada; el piso→almacén de 10 minutos antes es un retiro y se descuenta de la bajada",
  `select pg_temp.variante('ZZ-FRE-T9') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
-- Devolución dañada a cuarentena; ya reparada, pasa al piso (2). Después una vuelve al almacén (queda 1).
select pg_temp.mov(:'v', 'entrada', 2, :'sc', 'devolucion', :'t0'::timestamptz - interval '40 minutes') as _2 \\gset
select pg_temp.mov(:'v', 'traslado', 2, :'sc', 'movimiento_interno', :'t0'::timestamptz - interval '20 minutes', :'sp') as _3 \\gset
select pg_temp.mov(:'v', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '10 minutes', :'sa') as _4 \\gset
select pg_temp.bajada(:'v', 1, :'t0'::timestamptz) as _5 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T9"] ?? [];
    afirmar("una sola fila: solo almacén→piso es bajada", f.length === 1, ver(f));
    // Cambia en 120200 (antes «normal» con piso_antes 1): la vuelta al almacén de los 10:00 exactos antes es un retiro
    // de la misma prenda a W o menos (el borde cuenta) y es la única bajada cerca: se descuenta (efectiva 0 →
    // «corregida»), y como cae en [t − 10, t), el piso de antes lo suma: 1 + 1 = 2, el que había antes de retirarla.
    afirmar(
      "retiro de 1 dentro de la ventana → retiradas 1, efectiva 0, «corregida», piso_antes 2 (cuarentena→piso sí lo sube)",
      es(f[0], { min: 0, cantidad: 1, pisoAntes: 2, retiradas: 1, efectiva: 0, tardias: 0, estado: "corregida" }),
      ver(f[0]),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T10 · stock tocado a mano: una unidad de más cambia piso_antes; si el libro no alcanza a explicarlo (negativo) → «dudosa»",
  `select pg_temp.variante('ZZ-FRE-T10-DEMAS') as vl \\gset
select pg_temp.variante('ZZ-FRE-T10-DUDOSA') as vm \\gset
select pg_temp.llega(:'vl', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'vm', 10, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.bajada(:'vl', 3, :'t0'::timestamptz) as _3 \\gset
select pg_temp.bajada(:'vm', 2, :'t0'::timestamptz) as _4 \\gset
select pg_temp.vende(:'vm', 1, :'t0'::timestamptz + interval '3 minutes') as _5 \\gset
-- Como postgres y por fuera del libro: una de más en el piso de L; el piso de M queda en 0 cuando el libro dice 1.
update retail.stock set cantidad = cantidad + 1 where variante_id = :'vl' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
update retail.stock set cantidad = 0 where variante_id = :'vm' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
${FILAS()}`,
  ({ filas }) => {
    const l = filas["ZZ-FRE-T10-DEMAS"]?.[0];
    const m = filas["ZZ-FRE-T10-DUDOSA"]?.[0];
    afirmar("una de más en el stock → piso_antes 1 (el libro repetido desde cero diría 0)", es(l, { pisoAntes: 1, tardias: 0, estado: "normal" }), ver(l));
    afirmar("piso_antes negativo → estado «dudosa» y tardías nulas (aunque hubo una venta en la ventana)", es(m, { pisoAntes: -1, vendidas: 1, tardias: null, estado: "dudosa" }), ver(m));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T11 · bajada de hace 2 minutos sin venta → «en_curso», sin cerrar; si ya se vendió de más, «tardia» aunque siga abierta",
  `select pg_temp.variante('ZZ-FRE-T11') as v \\gset
select pg_temp.variante('ZZ-FRE-T11-VENDIDA') as w \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'w', 5, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.bajada(:'v', 1, now() - interval '2 minutes') as _3 \\gset
select pg_temp.bajada(:'w', 1, now() - interval '2 minutes') as _4 \\gset
select pg_temp.vende(:'w', 1, now() - interval '1 minute') as _5 \\gset
${FILAS()}`,
  ({ filas }) => {
    afirmar("sin venta: en_curso, cerrada = false, 0 tardías", es(filas["ZZ-FRE-T11"]?.[0], { cerrada: false, estado: "en_curso", tardias: 0 }), ver(filas["ZZ-FRE-T11"]));
    afirmar("con venta que el piso no cubría: tardia, cerrada = false", es(filas["ZZ-FRE-T11-VENDIDA"]?.[0], { cerrada: false, estado: "tardia", tardias: 1 }), ver(filas["ZZ-FRE-T11-VENDIDA"]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T12 · Taller (sin piso ni almacén) → cero filas y sin error",
  `${probar("taller", ":'taller'")}
${probar("sin_tienda", "null")}`,
  ({ errores }) => {
    afirmar("Taller: ok con 0 filas", errores.taller?.ok === true && errores.taller?.filas === 0, ver(errores.taller));
    afirmar("tienda nula: ok con 0 filas", errores.sin_tienda?.ok === true && errores.sin_tienda?.filas === 0, ver(errores.sin_tienda));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T13 · el candado del paso 4: sin el módulo no; con «Frescura del piso» en su rol, su sede sí (sin persona_id) y otra no; la terminal de TRU, igual; el líder ve quién bajó",
  `select pg_temp.variante('ZZ-FRE-T13') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select retail.bajar_al_piso(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 2)), gen_random_uuid()) ->> 'bajada_id' as bid \\gset
-- Como en T7: lo recién escrito se corre 1 minuto atrás para que la lectura, que va hasta now(), lo vea.
set constraints retail.trg_actividad_movimientos, retail.trg_actividad_conteo_nuevo, retail.trg_actividad_traslado_nuevo immediate; -- Actividad (ADR-0207): sin eventos pendientes, el alter no choca
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '1 minute'
 where id in (select movimiento_id from retail.bajada_piso_items where bajada_id = :'bid');
alter table retail.movimientos enable always trigger movimientos_inmutables;
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select 'LIDER|' || coalesce((select string_agg(coalesce(r.persona_id::text, 'null'), ',') from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = :'v'), 'ninguna');
select 'FELIPE|' || :'felipe';
set local request.jwt.claim.sub = '${MICAELA}';
${probar("sin_modulo", ":'ubic'")}
-- El módulo en el rol Integrante, dentro de la transacción (el ROLLBACK lo quita). Ninguna migración lo hace: nace sin rol.
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'frescura');
${probar("con_modulo", ":'ubic'")}
${probar("con_modulo_otra", ":'lim'")}
select 'MOD|' || coalesce((select string_agg(coalesce(r.persona_id::text, 'null'), ',') from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = :'v'), 'ninguna');
select 'MOD_TODAS|' || (select count(*) from retail.fn_bajadas_del_piso(:'ubic') r where r.persona_id is not null);
set local request.jwt.claim.sub = '${FELIPE}';
select 'LIDER_N|' || (select count(*) from retail.fn_bajadas_del_piso(:'ubic'));
-- LA TERMINAL de ventas de Trujillo (ADR-0161: lo que ve una cuenta, persona o terminal, lo decide su rol), creada como
-- en terminales_por_tienda.mjs dentro del ROLLBACK. Primero sin el módulo: se quita «frescura» de todos los roles (la
-- integrante de arriba lo tenía) para no depender de lo que haya dejado otra prueba en una base compartida.
delete from retail.rol_modulos where modulo = 'frescura';
insert into auth.users (id, aud, role, email) values ('${TERMINAL_TRU}', 'authenticated', 'authenticated', 'terminal-frescura-bajadas@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  values (:'ubic', 'ZZ Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${TERMINAL_TRU}');
set local request.jwt.claim.sub = '${TERMINAL_TRU}';
set local request.jwt.claims = '{"sub":"${TERMINAL_TRU}","role":"authenticated"}';
${probar("term_sin_modulo", ":'ubic'")}
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('terminal_ventas'), 'frescura');
select 'TERM_VE|' || (retail.fn_ve_modulo('frescura') and not retail.fn_es_lider());
${probar("term_con_modulo", ":'ubic'")}
${probar("term_otra", ":'lim'")}
-- Protegidas con pg_temp.intento: si el candado la dejara afuera, estas dos líneas dicen «sin permiso» en vez de cortar
-- el caso (así cada afirmación dice qué se rompió).
select 'TERM|' || case when (pg_temp.intento(format('select * from retail.fn_bajadas_del_piso(%L)', :'ubic')) ->> 'ok') = 'true'
  then coalesce((select string_agg(coalesce(r.persona_id::text, 'null'), ',') from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = :'v'), 'ninguna')
  else 'sin permiso' end;
select 'TERM_TODAS|' || case when (pg_temp.intento(format('select * from retail.fn_bajadas_del_piso(%L)', :'ubic')) ->> 'ok') = 'true'
  then (select count(*) from retail.fn_bajadas_del_piso(:'ubic') r where r.persona_id is not null)::text
  else 'sin permiso' end;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select 'LIDER_DESPUES|' || coalesce((select string_agg(coalesce(r.persona_id::text, 'null'), ',') from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = :'v'), 'ninguna');`,
  ({ errores, otras }) => {
    const sin = errores.sin_modulo;
    afirmar(
      "integrante SIN el módulo: P0001, hint frescura_sin_permiso, y el mensaje nombra el módulo «Frescura del piso»",
      sin?.ok === false && sin?.estado === "P0001" && sin?.hint === "frescura_sin_permiso" && (sin?.msg ?? "").includes("«Frescura del piso»"),
      ver(sin),
    );
    const con = errores.con_modulo;
    afirmar("integrante CON el módulo, en su sede: ok, con filas", con?.ok === true && con?.filas >= 1 && String(con?.filas) === otras.LIDER_N, `${ver(con)} LIDER_N=${otras.LIDER_N}`);
    const otra = errores.con_modulo_otra;
    afirmar("…en otra sede (Lima): P0001 frescura_sin_permiso", otra?.ok === false && otra?.estado === "P0001" && otra?.hint === "frescura_sin_permiso", ver(otra));
    afirmar("el líder ve quién registró la bajada (persona_id)", otras.LIDER === otras.FELIPE, `LIDER=${otras.LIDER} FELIPE=${otras.FELIPE}`);
    afirmar("la integrante con el módulo ve la misma bajada SIN persona_id, y ninguna fila de su sede trae persona", otras.MOD === "null" && otras.MOD_TODAS === "0", `MOD=${otras.MOD} MOD_TODAS=${otras.MOD_TODAS}`);
    const tSin = errores.term_sin_modulo;
    afirmar("terminal de ventas de TRU SIN el módulo: P0001 frescura_sin_permiso", tSin?.ok === false && tSin?.estado === "P0001" && tSin?.hint === "frescura_sin_permiso", ver(tSin));
    afirmar("…con «Frescura del piso» en terminal_ventas, la terminal VE el módulo sin ser líder", otras.TERM_VE === "true", `TERM_VE=${otras.TERM_VE}`);
    const tCon = errores.term_con_modulo;
    afirmar("…y lee su sede: las MISMAS filas que el líder", tCon?.ok === true && tCon?.filas >= 1 && String(tCon?.filas) === otras.LIDER_N, `${ver(tCon)} LIDER_N=${otras.LIDER_N}`);
    const tOtra = errores.term_otra;
    afirmar("…otra sede (Lima): P0001 frescura_sin_permiso", tOtra?.ok === false && tOtra?.estado === "P0001" && tOtra?.hint === "frescura_sin_permiso", ver(tOtra));
    afirmar(
      "…la bajada que registró Felipe le llega SIN persona_id, y ninguna fila de su sede trae persona",
      otras.TERM === "null" && otras.TERM_TODAS === "0",
      `TERM=${otras.TERM} TERM_TODAS=${otras.TERM_TODAS}`,
    );
    afirmar("…y el líder, después, sigue viendo que la registró Felipe", otras.LIDER_DESPUES === otras.FELIPE, `LIDER_DESPUES=${otras.LIDER_DESPUES} FELIPE=${otras.FELIPE}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T14 · historia mezclada (con una entrada de hace 40 días, fuera del rango): piso_antes = nivel justo antes + retiros de la ventana, recalculado desde cero",
  `select pg_temp.variante('ZZ-FRE-T14') as v \\gset
select pg_temp.mov(:'v', 'entrada', 5, :'sp', 'recepcion', now() - interval '40 days') as _1 \\gset
select pg_temp.mov(:'v', 'ajuste', 2, :'sp', 'conteo', :'t0'::timestamptz - interval '100 minutes') as _2 \\gset
select pg_temp.mov(:'v', 'ajuste', -1, :'sp', 'conteo', :'t0'::timestamptz - interval '90 minutes') as _3 \\gset
select pg_temp.vende(:'v', 2, :'t0'::timestamptz - interval '80 minutes') as _4 \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '75 minutes') as _5 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz - interval '60 minutes') as _6 \\gset
select pg_temp.mov(:'v', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '50 minutes', :'sa') as _7 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz - interval '45 minutes') as _8 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz - interval '40 minutes') as _9 \\gset
select pg_temp.mov(:'v', 'entrada', 1, :'sc', 'devolucion', :'t0'::timestamptz - interval '38 minutes') as _10 \\gset
select pg_temp.mov(:'v', 'traslado', 1, :'sc', 'movimiento_interno', :'t0'::timestamptz - interval '33 minutes', :'sp') as _11 \\gset
select pg_temp.mov(:'v', 'salida', 1, :'sp', 'merma', :'t0'::timestamptz - interval '30 minutes') as _12 \\gset
select pg_temp.bajada(:'v', 1, :'t0'::timestamptz - interval '20 minutes') as _13 \\gset
select pg_temp.mov(:'v', 'entrada', 1, :'sp', 'devolucion', :'t0'::timestamptz - interval '10 minutes') as _14 \\gset
-- Recalculo independiente HACIA ADELANTE, desde la primera fila del libro y sin mirar el stock: el nivel del piso con
-- que se llegó a la bajada, más lo que pasó del piso al almacén de la tienda en [bajada − 10 min, bajada).
select 'REPLAY|' || string_agg(round(extract(epoch from (r.bajada_en - :'t0'::timestamptz)) / 60.0, 3) || '=' || (
         (select coalesce(sum(
                   case when m.sububicacion_id = :'sp' then case m.tipo when 'entrada' then m.cantidad when 'ajuste' then m.cantidad
                                                                       when 'salida' then -m.cantidad when 'traslado' then -m.cantidad else 0 end else 0 end
                 + case when m.tipo = 'traslado' and m.sububicacion_destino_id = :'sp' then m.cantidad else 0 end), 0)
            from retail.movimientos m
           where m.variante_id = :'v' and m.ubicacion_id = :'ubic'
             and (m.created_at, m.id) < (r.bajada_en, r.movimiento_id))
       + (select coalesce(sum(m.cantidad), 0)
            from retail.movimientos m
           where m.variante_id = :'v' and m.ubicacion_id = :'ubic' and m.tipo = 'traslado'
             and m.sububicacion_id = :'sp' and m.sububicacion_destino_id = :'sa'
             and m.created_at >= r.bajada_en - interval '10 minutes'
             and (m.created_at, m.id) < (r.bajada_en, r.movimiento_id))), ',' order by r.bajada_en)
  from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = :'v';
select 'PISO|' || (select cantidad from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'sp');
${FILAS()}`,
  ({ filas, otras }) => {
    const f = filas["ZZ-FRE-T14"] ?? [];
    const replay = Object.fromEntries((otras.REPLAY ?? "").split(",").filter(Boolean).map((p) => p.split("=").map(Number)));
    afirmar("tres bajadas", f.length === 3, ver(f));
    // Cambia en 120200 (antes 4, 5 y 7, el nivel justo antes): la segunda suma el retiro de −50, que cae en su
    // [t − 10, t) (5 + 1); la venta de −45 NO se le suma, y la merma de −30 tampoco a la tercera (primera 120200: 4, 7
    // y 8, el nivel más alto de cada ventana, que absorbía esa venta y esa merma).
    afirmar("piso_antes a mano: 4, 6 y 7 (nivel justo antes + retiros de la ventana)", f.map((x) => x.pisoAntes).join(",") === "4,6,7", ver(f.map((x) => x.pisoAntes)));
    afirmar("piso_antes = recalcular el libro desde cero + los retiros de cada ventana", f.length === 3 && f.every((x) => replay[x.min] === x.pisoAntes), `función=${ver(f.map((x) => [x.min, x.pisoAntes]))} replay=${otras.REPLAY}`);
    // El retiro de −50 cae a 10 minutos justos DESPUÉS de la primera y ANTES de la segunda: empate → va SOLO a la de
    // antes del retiro (primera 120200: se descontaba de las dos, efectivas 2, 1 y 1).
    afirmar("retiradas 1, 0 y 0 → efectivas 2, 2 y 1 (el empate va a la bajada de antes del retiro)", f.map((x) => `${x.retiradas}/${x.efectiva}`).join(",") === "1/2,0/2,0/1", ver(f.map((x) => [x.retiradas, x.efectiva])));
    afirmar("el stock del piso de hoy es 9 (el libro cuadra)", otras.PISO === "9", `PISO=${otras.PISO}`);
    afirmar("sin ventas en ninguna ventana: 0 tardías y normales", f.every((x) => x.vendidas === 0 && x.tardias === 0 && x.estado === "normal"), ver(f));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T15 · un cambio (la prenda que se lleva la clienta sale del piso con cambio_id) cuenta como venta",
  `select pg_temp.variante('ZZ-FRE-T15') as v \\gset
select pg_temp.variante('ZZ-FRE-T15-DEVUELTA') as w \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.mov(:'w', 'entrada', 3, :'sp', 'recepcion', :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.vende(:'w', 1, :'t0'::timestamptz - interval '30 minutes') as mw \\gset
select venta_item_id as li from retail.movimientos where id = :'mw' \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _3 \\gset
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, created_at)
  values (:'li', :'ubic', :'v', 1, :'t0'::timestamptz + interval '4 minutes') returning id as cam \\gset
select pg_temp.mov(:'w', 'entrada', 1, :'sp', 'cambio', :'t0'::timestamptz + interval '4 minutes', null, null, :'cam') as _4 \\gset
select pg_temp.mov(:'v', 'salida', 1, :'sp', 'cambio', :'t0'::timestamptz + interval '4 minutes', null, null, :'cam') as _5 \\gset
${FILAS()}`,
  ({ filas }) => {
    afirmar("vendidas 1 por el cambio → 1 tardía", es(filas["ZZ-FRE-T15"]?.[0], { pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }), ver(filas["ZZ-FRE-T15"]));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T16 · ventana fuera de 1..240 y rango de más de 120 días → sus errores; los bordes pasan; hasta <= desde → cero filas",
  `${probar("min0", "null, null, null, 0")}
${probar("min241", "null, null, null, 241")}
${probar("minnull", "null, null, null, null")}
${probar("rango121", "null, now() - interval '121 days'")}
${probar("min1", "null, null, null, 1")}
${probar("min240", "null, null, null, 240")}
${probar("rango120", "null, now() - interval '120 days'")}
select pg_temp.variante('ZZ-FRE-T16') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 1, :'t0'::timestamptz) as _2 \\gset
select 'AL_REVES|' || count(*) from retail.fn_bajadas_del_piso(:'ubic', :'t0'::timestamptz + interval '1 hour', :'t0'::timestamptz - interval '1 hour') r where r.variante_id = :'v';
select 'IGUALES|' || count(*) from retail.fn_bajadas_del_piso(:'ubic', :'t0'::timestamptz, :'t0'::timestamptz) r where r.variante_id = :'v';`,
  ({ errores, otras }) => {
    const ventana = "La ventana va de 1 a 240 minutos.";
    for (const k of ["min0", "min241", "minnull"]) {
      afirmar(`p_minutos ${k.slice(3)} → «${ventana}» (P0001)`, errores[k]?.ok === false && errores[k]?.estado === "P0001" && errores[k]?.msg === ventana, ver(errores[k]));
    }
    afirmar("desde hace 121 días → «El rango máximo es de 120 días.» (P0001)", errores.rango121?.ok === false && errores.rango121?.estado === "P0001" && errores.rango121?.msg === "El rango máximo es de 120 días.", ver(errores.rango121));
    afirmar("los bordes pasan: 1 y 240 minutos, 120 días justos", errores.min1?.ok && errores.min240?.ok && errores.rango120?.ok, `${ver(errores.min1)} ${ver(errores.min240)} ${ver(errores.rango120)}`);
    afirmar("hasta antes que desde → cero filas, sin error", otras.AL_REVES === "0", `AL_REVES=${otras.AL_REVES}`);
    afirmar("hasta igual a desde → cero filas, sin error", otras.IGUALES === "0", `IGUALES=${otras.IGUALES}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T17 · rango [desde, hasta): el borde de hasta queda fuera, el de desde dentro; la venta posterior a hasta igual se mira",
  `select pg_temp.variante('ZZ-FRE-T17') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _2 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '3 minutes') as _3 \\gset
select 'HASTA_BORDE|' || count(*) from retail.fn_bajadas_del_piso(:'ubic', :'t0'::timestamptz - interval '1 hour', :'t0'::timestamptz) r where r.variante_id = :'v';
select 'DESDE_BORDE|' || count(*) from retail.fn_bajadas_del_piso(:'ubic', :'t0'::timestamptz, :'t0'::timestamptz + interval '1 second') r where r.variante_id = :'v';
${FILAS(", p_desde => :'t0'::timestamptz - interval '1 hour', p_hasta => :'t0'::timestamptz + interval '1 minute'")}`,
  ({ filas, otras }) => {
    afirmar("hasta = la hora de la bajada → fuera (0 filas)", otras.HASTA_BORDE === "0", `HASTA_BORDE=${otras.HASTA_BORDE}`);
    afirmar("desde = la hora de la bajada → dentro (1 fila)", otras.DESDE_BORDE === "1", `DESDE_BORDE=${otras.DESDE_BORDE}`);
    afirmar("con hasta a 1 minuto, la venta de los 3 minutos igual cuenta (el libro llega hasta hoy)", es(filas["ZZ-FRE-T17"]?.[0], { pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }), ver(filas["ZZ-FRE-T17"]));
  },
);

// ---------------------------------------------------------------------------
// T17 no tiene ningún retiro, así que solo mira la PRIMERA rama de `bajadas` (la que no recorre los retiros). La rama con
// retiros filtra el rango por su cuenta; escribirle `r.t <= v_hasta` metía la bajada del borde y T17 pasaba igual
// (revisión 3 del 2026-09-27, mutante 2). Aquí la tienda tiene un retiro de otra prenda a −13 minutos: cae dentro de la
// ventana ampliada de las dos lecturas ([t0 − 1 h − 2W, t0 + 2W] y [t0 − 2W, t0 + 1 s + 2W]), así que las dos recorren
// la rama con retiros. Va en su propia transacción: ningún retiro de otro caso decide la rama.
correr(
  "T17 (con retiros) · el rango [desde, hasta) también en la rama con retiros: el borde de hasta queda fuera, el de desde dentro",
  `select pg_temp.variante('ZZ-FRE-T17R') as v \\gset
select pg_temp.variante('ZZ-FRE-T17R-OTRA') as w \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'w', 5, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.bajada(:'w', 1, :'t0'::timestamptz - interval '15 minutes') as _3 \\gset
select pg_temp.mov(:'w', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '13 minutes', :'sa') as _4 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _5 \\gset
select 'HASTA_BORDE_R|' || count(*) from retail.fn_bajadas_del_piso(:'ubic', :'t0'::timestamptz - interval '1 hour', :'t0'::timestamptz) r where r.variante_id = :'v';
select 'DESDE_BORDE_R|' || count(*) from retail.fn_bajadas_del_piso(:'ubic', :'t0'::timestamptz, :'t0'::timestamptz + interval '1 second') r where r.variante_id = :'v';
-- Que de verdad es la rama con retiros: la bajada de la otra prenda se lleva su retiro (a 2 minutos).
select 'OTRA_R|' || r.retiradas_en_ventana || ',' || r.cantidad_efectiva || ',' || r.estado
  from retail.fn_bajadas_del_piso(:'ubic', :'t0'::timestamptz - interval '1 hour', :'t0'::timestamptz) r where r.variante_id = :'w';`,
  ({ otras }) => {
    afirmar("la otra prenda se lleva su retiro (1, efectiva 0, «corregida»): la lectura recorre la rama con retiros", otras.OTRA_R === "1,0,corregida", `OTRA_R=${otras.OTRA_R}`);
    afirmar("hasta = la hora de la bajada, con un retiro en la tienda → fuera (0 filas)", otras.HASTA_BORDE_R === "0", `HASTA_BORDE_R=${otras.HASTA_BORDE_R}`);
    afirmar("desde = la hora de la bajada, con un retiro en la tienda → dentro (1 fila)", otras.DESDE_BORDE_R === "1", `DESDE_BORDE_R=${otras.DESDE_BORDE_R}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T18 · LÍMITE CONOCIDO: una devolución entra al piso dentro de la ventana y después se vende 1 → la bajada sale tardía igual",
  `select pg_temp.variante('ZZ-FRE-T18') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz) as _2 \\gset
-- Una clienta devuelve una unidad al piso a los 2 minutos; a los 3 se vende una, que pudo ser la devuelta.
select pg_temp.mov(:'v', 'entrada', 1, :'sp', 'devolucion', :'t0'::timestamptz + interval '2 minutes') as _3 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '3 minutes') as _4 \\gset
${FILAS()}`,
  ({ filas }) => {
    // Se afirma lo que HOY hace la fórmula, no lo deseable: mira el piso de antes y no lo que entró después de la
    // bajada. Descontar esas entradas cambia el contrato y lo decide el paso 3 (ADR-0208, LÍMITES). Si esta prueba
    // se pone roja, alguien cambió la fórmula: que sea a propósito y con el ADR al día.
    const f = filas["ZZ-FRE-T18"] ?? [];
    afirmar("comportamiento actual: piso_antes 0, vendidas 1 → 1 tardía y «tardia»", es(f[0], { min: 0, cantidad: 3, pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }), ver(f));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T19 · lo que llega de OTRA tienda directo al piso no es bajada, pero sí suma en piso_antes (criterio de fn_ledger_puntos)",
  `select id as otra from retail.ubicaciones where tipo = 'tienda' and activo and id <> :'ubic' order by nombre limit 1 \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'otra', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'otra' and tipo = 'almacen_tienda');
select id as otra_sa from retail.sububicaciones where ubicacion_id = :'otra' and tipo = 'almacen_tienda' \\gset
select pg_temp.variante('ZZ-FRE-T19') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
-- La otra tienda recibe 4 y manda 2 directo al piso de esta ANTES de la bajada y 2 DESPUÉS: la fila es de la otra
-- tienda (ubicacion_id) y llega aquí por ubicacion_destino_id.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
  values (:'v', :'otra', :'otra_sa', 'entrada', 4, 'recepcion', :'t0'::timestamptz - interval '90 minutes') returning id as e_otra \\gset
select retail.fn_aplicar_movimiento(:'e_otra') as _2 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (:'v', :'otra', :'otra_sa', :'ubic', :'sp', 'traslado', 2, 'transferencia', :'t0'::timestamptz - interval '30 minutes') returning id as t_antes \\gset
select retail.fn_aplicar_movimiento(:'t_antes') as _3 \\gset
select pg_temp.bajada(:'v', 1, :'t0'::timestamptz) as _4 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (:'v', :'otra', :'otra_sa', :'ubic', :'sp', 'traslado', 2, 'transferencia', :'t0'::timestamptz + interval '30 minutes') returning id as t_despues \\gset
select retail.fn_aplicar_movimiento(:'t_despues') as _5 \\gset
select 'PISO19|' || (select cantidad from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'sp');
${FILAS()}`,
  ({ filas, otras }) => {
    const f = filas["ZZ-FRE-T19"] ?? [];
    afirmar("una sola fila: lo que cruza de tienda no es bajada", f.length === 1, ver(f));
    // Antes de apoyarse en el libro salía 4: la llegada posterior estaba en el stock de hoy pero no se restaba.
    afirmar("piso_antes 2: cuenta la llegada de antes y descuenta la de después", es(f[0], { min: 0, cantidad: 1, pisoAntes: 2, estado: "normal" }), ver(f[0]));
    afirmar("el piso de hoy es 5 (2 + 1 bajada + 2): el libro cuadra", otras.PISO19 === "5", `PISO19=${otras.PISO19}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T20 · tienda inactiva → cero filas y sin error (el libro no reconstruye sedes inactivas)",
  `select pg_temp.variante('ZZ-FRE-T20') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _2 \\gset
select 'ACTIVA|' || count(*) from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = :'v';
update retail.ubicaciones set activo = false where id = :'ubic';
${probar("inactiva", ":'ubic'")}`,
  ({ errores, otras }) => {
    afirmar("activa: su bajada aparece", otras.ACTIVA === "1", `ACTIVA=${otras.ACTIVA}`);
    afirmar("inactiva: ok con 0 filas", errores.inactiva?.ok === true && errores.inactiva?.filas === 0, ver(errores.inactiva));
  },
);

// ---------------------------------------------------------------------------
correr(
  "T21 · la venta se mide a la hora de la venta (coalesce(ventas.created_at, movimientos.created_at)), no a la de su salida",
  `select pg_temp.variante('ZZ-FRE-T21') as v \\gset
select pg_temp.llega(:'v', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _2 \\gset
-- La venta es de los 3 minutos; su salida del piso quedó en el libro a los 15 (fuera de la ventana de 10).
select pg_temp.venta_item(:'v', 1, :'t0'::timestamptz + interval '3 minutes') as li \\gset
select pg_temp.mov(:'v', 'salida', 1, :'sp', 'venta', :'t0'::timestamptz + interval '15 minutes', null, :'li') as _3 \\gset
${FILAS()}`,
  ({ filas }) => {
    afirmar("cuenta por la hora de la venta: vendidas 1 → 1 tardía", es(filas["ZZ-FRE-T21"]?.[0], { pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }), ver(filas["ZZ-FRE-T21"]));
  },
);

// ---------------------------------------------------------------------------
const MD5 = (fn) => `(select md5(prosrc) from pg_proc where oid = to_regprocedure('retail.${fn}(uuid, timestamptz, timestamptz, integer)'))`;
const FIRMA = "(uuid, timestamptz, timestamptz, integer)";
const BORRAR_LAS_DOS = `drop function retail.fn_bajadas_del_piso${FIRMA}; drop function retail.fn_bajadas_del_piso_nucleo${FIRMA};`;
const CUANTAS = "(select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname like 'fn_bajadas_del_piso%')";
const intento = (sql) => `pg_temp.intento(${comoLiteral(sql)})`;
const abortaCon = (r, texto) => `((:'${r}')::jsonb ->> 'ok') || ',' || (position('${texto}' in (:'${r}')::jsonb ->> 'msg') > 0)`;
correr(
  "T22 · la guarda de 20260928120100: acepta solo el cuerpo de 20260926000300; un parche en vivo la hace abortar; después de la 120200, avisa y no deshace nada",
  `${DESHACER_CUADRE}
select ${MD5("fn_bajadas_del_piso")} as puerta_hoy, ${MD5("fn_bajadas_del_piso_nucleo")} as nucleo_hoy \\gset
-- 1. Pegada otra vez sobre la base de hoy (ya con la 120200): se niega con su aviso y no toca nada.
select ${intento(MIGRACION_NUCLEO)} as r1 \\gset
select 'TARDE|' || ${abortaCon("r1", "Ya está pegada la 20260928120200")} || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_hoy')
       || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'nucleo_hoy');
-- 2. La cadena completa desde el cuerpo de 20260926000300 (el de producción): 0300 → 120100 → 120200, cada una pasa.
${BORRAR_LAS_DOS}
select ${intento(MIGRACION_0300)} ->> 'ok' as c1 \\gset
select ${MD5("fn_bajadas_del_piso")} as md5_0300 \\gset
select ${intento(MIGRACION_NUCLEO)} ->> 'ok' as c2 \\gset
select ${intento(MIGRACION_RETIROS)} ->> 'ok' as c3 \\gset
select 'CADENA|' || :'c1' || ',' || :'md5_0300' || ',' || :'c2' || ',' || :'c3' || ',' || (${MD5("fn_bajadas_del_piso")} = '34a7e0cc5f421333761e8bda92a582eb')
       || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'nucleo_hoy') || ',' || ${CUANTAS};
-- 3. Alguien parcha la puerta vieja en vivo (el mismo contrato de la 0300, otro cuerpo): la 120100 se niega a pisarlo.
${BORRAR_LAS_DOS}
create function retail.fn_bajadas_del_piso(p_ubicacion_id uuid, p_desde timestamptz default null,
  p_hasta timestamptz default null, p_minutos integer default 10)
returns table (movimiento_id uuid, bajada_id uuid, variante_id uuid, persona_id uuid, bajada_en timestamptz, cantidad integer,
  piso_antes integer, vendidas_en_ventana integer, unidades_tardias integer, cerrada boolean, estado text)
language plpgsql stable security definer set search_path = retail, public, extensions as $f$
begin /* parche en vivo desconocido */ return; end $f$;
select ${MD5("fn_bajadas_del_piso")} as parche \\gset
select ${intento(MIGRACION_NUCLEO)} as r3 \\gset
select 'PARCHE|' || ${abortaCon("r3", "cambió desde que se escribió")} || ',' || (${MD5("fn_bajadas_del_piso")} = :'parche')
       || ',' || (to_regprocedure('retail.fn_bajadas_del_piso_nucleo${FIRMA}') is null);`,
  ({ otras }) => {
    afirmar("pegada después de la 120200: aborta con «Ya está pegada la 20260928120200» y no toca ninguna de las dos", otras.TARDE === "false,true,true,true", `TARDE=${otras.TARDE}`);
    afirmar(
      "la cadena 0300 → 120100 → 120200 pasa entera, la 0300 mide 91e2d0c1… (el md5 de producción de entonces) y termina en la puerta de la 120200 (34a7e0cc…) y el núcleo de hoy",
      otras.CADENA === "true,91e2d0c19981952706c7b75d8514eb26,true,true,true,true,2",
      `CADENA=${otras.CADENA}`,
    );
    afirmar("con un parche en vivo aborta («cambió desde que se escribió»), no pisa el parche y no crea el núcleo", otras.PARCHE === "false,true,true,true", `PARCHE=${otras.PARCHE}`);
  },
);

// ---------------------------------------------------------------------------
// Hasta la revisión 3 (2026-09-27) la guarda de la 120100 miraba solo la PUERTA: con la 120100 ya pegada y su núcleo
// parchado en vivo, volver a pegarla lo recreaba con `create or replace` y borraba el parche sin avisar (lo que rompió
// Análisis con el PR 397). Ahora exige que el núcleo no exista o sea el suyo (8d38d6dd…).
correr(
  "T22 (el núcleo) · la guarda de 20260928120100 mira también el NÚCLEO: pegada dos veces pasa; con el núcleo parchado en vivo aborta y no lo pisa",
  `${BORRAR_LAS_DOS}
select ${intento(MIGRACION_0300)} ->> 'ok' as c1 \\gset
select ${intento(MIGRACION_NUCLEO)} ->> 'ok' as c2 \\gset
select ${MD5("fn_bajadas_del_piso_nucleo")} as nucleo_120100, ${MD5("fn_bajadas_del_piso")} as puerta_120100 \\gset
-- Pegada otra vez, con su propio núcleo vivo: pasa y deja lo mismo (re-ejecutable).
select ${intento(MIGRACION_NUCLEO)} ->> 'ok' as c3 \\gset
select 'OTRA_VEZ|' || :'c1' || ',' || :'c2' || ',' || :'nucleo_120100' || ',' || :'puerta_120100' || ',' || :'c3'
       || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'nucleo_120100') || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_120100');
-- Alguien parcha el NÚCLEO en vivo (las 11 columnas de la 120100, otro cuerpo).
create or replace function retail.fn_bajadas_del_piso_nucleo(p_ubicacion_id uuid, p_desde timestamptz default null,
  p_hasta timestamptz default null, p_minutos integer default 10)
returns table (movimiento_id uuid, bajada_id uuid, variante_id uuid, persona_id uuid, bajada_en timestamptz, cantidad integer,
  piso_antes integer, vendidas_en_ventana integer, unidades_tardias integer, cerrada boolean, estado text)
language plpgsql stable security definer set search_path = retail, public, extensions as $f$
begin /* parche en vivo del núcleo */ return; end $f$;
select ${MD5("fn_bajadas_del_piso_nucleo")} as parche \\gset
select ${intento(MIGRACION_NUCLEO)} as r \\gset
select 'PARCHE_NUCLEO|' || ${abortaCon("r", "fn_bajadas_del_piso_nucleo cambió desde que se escribió")}
       || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'parche') || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_120100');`,
  ({ otras }) => {
    afirmar(
      "0300 → 120100 → 120100 otra vez: pasan las dos, el núcleo mide 8d38d6dd… y la puerta 34a7e0cc…, y quedan iguales",
      otras.OTRA_VEZ === "true,true,8d38d6dd6c657ab06b2e8a7c0b66a53b,34a7e0cc5f421333761e8bda92a582eb,true,true,true",
      `OTRA_VEZ=${otras.OTRA_VEZ}`,
    );
    afirmar(
      "con el NÚCLEO parchado en vivo, volver a pegar la 120100 aborta («fn_bajadas_del_piso_nucleo cambió…») y no toca ni el parche ni la puerta",
      otras.PARCHE_NUCLEO === "false,true,true,true",
      `PARCHE_NUCLEO=${otras.PARCHE_NUCLEO}`,
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T23 · la guarda de 20260928120200: pegada dos veces deja lo mismo (y los permisos); un parche del núcleo o su falta la hacen abortar",
  `-- Desde el paso 4 la puerta de hoy es otra (20260929100000): la 120200 se prueba sobre SU puerta, la de la cadena
-- 0300 → 120100, como cuando se escribió. T37 prueba la guarda del paso 4.
${BORRAR_LAS_DOS}
select ${intento(MIGRACION_0300)} ->> 'ok' as c1 \\gset
select ${intento(MIGRACION_NUCLEO)} ->> 'ok' as c2 \\gset
select ${intento(MIGRACION_RETIROS)} ->> 'ok' as c3 \\gset
select ${MD5("fn_bajadas_del_piso")} as puerta_hoy, ${MD5("fn_bajadas_del_piso_nucleo")} as nucleo_hoy \\gset
select 'CADENA|' || :'c1' || ',' || :'c2' || ',' || :'c3' || ',' || :'puerta_hoy';
select ${intento(MIGRACION_RETIROS)} ->> 'ok' as p1 \\gset
select ${intento(MIGRACION_RETIROS)} ->> 'ok' as p2 \\gset
select 'DOS|' || :'p1' || ',' || :'p2' || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_hoy') || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'nucleo_hoy')
       || ',' || ${CUANTAS}
       || ',' || has_function_privilege('authenticated', 'retail.fn_bajadas_del_piso${FIRMA}', 'execute')
       || ',' || has_function_privilege('anon', 'retail.fn_bajadas_del_piso${FIRMA}', 'execute')
       || ',' || has_function_privilege('authenticated', 'retail.fn_bajadas_del_piso_nucleo${FIRMA}', 'execute');
-- Alguien parcha el núcleo en vivo (las mismas columnas, otro cuerpo).
create or replace function retail.fn_bajadas_del_piso_nucleo(p_ubicacion_id uuid, p_desde timestamptz default null,
  p_hasta timestamptz default null, p_minutos integer default 10)
returns table (movimiento_id uuid, bajada_id uuid, variante_id uuid, persona_id uuid, bajada_en timestamptz, cantidad integer,
  piso_antes integer, vendidas_en_ventana integer, unidades_tardias integer, cerrada boolean, estado text,
  retiradas_en_ventana integer, cantidad_efectiva integer, es_carga_inicial boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $f$
begin /* parche en vivo desconocido */ return; end $f$;
select ${MD5("fn_bajadas_del_piso_nucleo")} as parche \\gset
select ${intento(MIGRACION_RETIROS)} as r \\gset
select 'PARCHE|' || ${abortaCon("r", "cambiaron desde que se escribió")} || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'parche')
       || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_hoy');
drop function retail.fn_bajadas_del_piso_nucleo${FIRMA};
select ${intento(MIGRACION_RETIROS)} as r2 \\gset
select 'SIN_NUCLEO|' || ${abortaCon("r2", "pega antes 20260928120100")};`,
  ({ otras }) => {
    afirmar("la cadena 0300 → 120100 → 120200 deja la puerta de la 120200 (34a7e0cc…)", otras.CADENA === "true,true,true,34a7e0cc5f421333761e8bda92a582eb", `CADENA=${otras.CADENA}`);
    afirmar(
      "pegada dos veces: pasan las dos, las dos funciones quedan iguales, authenticated ejecuta la puerta y no el núcleo, anon ninguna",
      otras.DOS === "true,true,true,true,2,true,false,false",
      `DOS=${otras.DOS}`,
    );
    afirmar("con un parche en vivo del núcleo aborta («cambiaron desde que se escribió») y no toca nada", otras.PARCHE === "false,true,true,true", `PARCHE=${otras.PARCHE}`);
    afirmar("sin el núcleo pide pegar antes la 20260928120100", otras.SIN_NUCLEO === "false,true", `SIN_NUCLEO=${otras.SIN_NUCLEO}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T23 (la puerta) · la guarda de 20260928120200 mira también la PUERTA: parchada en vivo con la 120200 ya pegada, o justo después de la 120100, aborta y no pisa el parche",
  `-- Con la 120200 ya pegada, alguien parcha la PUERTA en vivo (las mismas columnas, otro cuerpo; por ejemplo, afloja el
-- candado de líder en el SQL Editor). Volver a pegar la 120200 la recrearía con drop + create y borraría el parche.
create or replace function retail.fn_bajadas_del_piso(p_ubicacion_id uuid, p_desde timestamptz default null,
  p_hasta timestamptz default null, p_minutos integer default 10)
returns table (movimiento_id uuid, bajada_id uuid, variante_id uuid, persona_id uuid, bajada_en timestamptz, cantidad integer,
  piso_antes integer, vendidas_en_ventana integer, unidades_tardias integer, cerrada boolean, estado text,
  retiradas_en_ventana integer, cantidad_efectiva integer, es_carga_inicial boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $f$
begin /* parche en vivo de la puerta */ return; end $f$;
select ${MD5("fn_bajadas_del_piso")} as parche1, ${MD5("fn_bajadas_del_piso_nucleo")} as nucleo1 \\gset
select ${intento(MIGRACION_RETIROS)} as r1 \\gset
select 'REPEGAR|' || ${abortaCon("r1", "cambiaron desde que se escribió")} || ',' || (${MD5("fn_bajadas_del_piso")} = :'parche1')
       || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'nucleo1');
-- La cadena llega a la 120100 y, antes de pegar la 120200, alguien parcha la PUERTA (con las 11 columnas de entonces).
${BORRAR_LAS_DOS}
select ${intento(MIGRACION_0300)} ->> 'ok' as c1 \\gset
select ${intento(MIGRACION_NUCLEO)} ->> 'ok' as c2 \\gset
select ${MD5("fn_bajadas_del_piso_nucleo")} as nucleo2 \\gset
create or replace function retail.fn_bajadas_del_piso(p_ubicacion_id uuid, p_desde timestamptz default null,
  p_hasta timestamptz default null, p_minutos integer default 10)
returns table (movimiento_id uuid, bajada_id uuid, variante_id uuid, persona_id uuid, bajada_en timestamptz, cantidad integer,
  piso_antes integer, vendidas_en_ventana integer, unidades_tardias integer, cerrada boolean, estado text)
language plpgsql stable security definer set search_path = retail, public, extensions as $f$
begin /* parche en vivo de la puerta, tras la 120100 */ return; end $f$;
select ${MD5("fn_bajadas_del_piso")} as parche2 \\gset
select ${intento(MIGRACION_RETIROS)} as r2 \\gset
select 'TRAS120100|' || :'c1' || ',' || :'c2' || ',' || ${abortaCon("r2", "cambiaron desde que se escribió")}
       || ',' || (${MD5("fn_bajadas_del_piso")} = :'parche2') || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'nucleo2');`,
  ({ otras }) => {
    afirmar(
      "con la 120200 pegada y la PUERTA parchada en vivo, volver a pegarla aborta («cambiaron desde que se escribió») y no toca ni el parche ni el núcleo",
      otras.REPEGAR === "false,true,true,true",
      `REPEGAR=${otras.REPEGAR}`,
    );
    afirmar(
      "justo después de la 120100, con la PUERTA parchada en vivo, la 120200 aborta y no toca ni el parche ni el núcleo de la 120100",
      otras.TRAS120100 === "true,true,false,true,true,true",
      `TRAS120100=${otras.TRAS120100}`,
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T24 · el ejemplo de ADR-0208 (c): piso 2; se retiran 2 por error; al minuto se reponen 2; a los 5 se vende 1 → «corregida», sin tardía",
  `select pg_temp.variante('ZZ-FRE-T24') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz - interval '30 minutes') as _2 \\gset
select pg_temp.mov(:'v', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz, :'sa') as _3 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz + interval '1 minute') as _4 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '5 minutes') as _5 \\gset
-- El mismo error con otra bajada 5 minutos ANTES del retiro: 9:55 se bajan 2 (piso 0); 10:00 se retiran 2; 10:01 se
-- reponen 2; 10:05 se vende 1. El retiro está a 5 minutos de la primera y a 1 de la re-bajada: va a la re-bajada.
select pg_temp.variante('ZZ-FRE-T24-ANTERIOR') as w \\gset
select pg_temp.llega(:'w', 10, :'t0'::timestamptz - interval '60 minutes') as _6 \\gset
select pg_temp.bajada(:'w', 2, :'t0'::timestamptz - interval '5 minutes') as _7 \\gset
select pg_temp.mov(:'w', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz, :'sa') as _8 \\gset
select pg_temp.bajada(:'w', 2, :'t0'::timestamptz + interval '1 minute') as _9 \\gset
select pg_temp.vende(:'w', 1, :'t0'::timestamptz + interval '5 minutes') as _10 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T24"] ?? [];
    afirmar("dos filas (el retiro no es bajada)", f.length === 2, ver(f));
    afirmar("la de hace 30 minutos no se toca: el retiro cae fuera de su ventana", es(f[0], { min: -30, cantidad: 2, pisoAntes: 0, retiradas: 0, efectiva: 2, estado: "normal" }), ver(f[0]));
    // Antes de 120200: piso_antes 0, vendidas 1 → 1 tardía y «tardia» (a quien corrigió).
    afirmar(
      "la re-bajada: piso_antes 2 (el nivel 0 de justo antes + el retiro de 2 de hace 1 minuto), retiradas 2, efectiva 0, 0 tardías, «corregida»",
      es(f[1], { min: 1, cantidad: 2, pisoAntes: 2, vendidas: 1, retiradas: 2, efectiva: 0, tardias: 0, estado: "corregida" }),
      ver(f[1]),
    );
    const w = filas["ZZ-FRE-T24-ANTERIOR"] ?? [];
    // La de 9:55 conserva sus 2 (el retiro fue a la re-bajada). Su ventana [9:55, 10:05] incluye la venta de las 10:05
    // con el piso vacío antes de bajar: 1 tardía, lo que corresponde por ventas.
    afirmar(
      "con una bajada 5 minutos antes del retiro: esa conserva su efectiva 2 (retiradas 0; 1 tardía por la venta de su ventana)",
      w.length === 2 && es(w[0], { min: -5, cantidad: 2, pisoAntes: 0, vendidas: 1, retiradas: 0, efectiva: 2, tardias: 1, estado: "tardia" }),
      ver(w),
    );
    afirmar(
      "…y el retiro va a la re-bajada (a 1 minuto, no a 5): piso_antes 2, retiradas 2, efectiva 0, «corregida»; Σ efectivas 2",
      es(w[1], { min: 1, cantidad: 2, pisoAntes: 2, vendidas: 1, retiradas: 2, efectiva: 0, tardias: 0, estado: "corregida" }) &&
        w.reduce((s, x) => s + x.efectiva, 0) === 2,
      ver(w),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T25 · retiro DESPUÉS: 10 escaneadas y 4 retiradas → efectiva 6; las tardías se topan por la efectiva; un retiro entre dos bajadas va solo a la más cercana",
  `select pg_temp.variante('ZZ-FRE-T25-DIEZ') as v \\gset
select pg_temp.variante('ZZ-FRE-T25-TOPE') as w \\gset
select pg_temp.variante('ZZ-FRE-T25-DOBLE') as x \\gset
select pg_temp.llega(:'v', 20, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'w', 20, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.llega(:'x', 20, :'t0'::timestamptz - interval '60 minutes') as _3 \\gset
-- 10 escaneadas; solo cupieron 6 y a los 5 minutos se retiran 4.
select pg_temp.bajada(:'v', 10, :'t0'::timestamptz) as _4 \\gset
select pg_temp.mov(:'v', 'traslado', 4, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '5 minutes', :'sa') as _5 \\gset
-- Tope: baja 3 (piso 0); una clienta devuelve 2 al piso; se retiran 2; se venden 3. Vendidas 3 − piso de antes 0 = 3,
-- pero la bajada solo dejó 1 colgada: 1 tardía (antes de 120200, 3).
select pg_temp.bajada(:'w', 3, :'t0'::timestamptz) as _6 \\gset
select pg_temp.mov(:'w', 'entrada', 2, :'sp', 'devolucion', :'t0'::timestamptz + interval '1 minute') as _7 \\gset
select pg_temp.mov(:'w', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '2 minutes', :'sa') as _8 \\gset
select pg_temp.vende(:'w', 3, :'t0'::timestamptz + interval '4 minutes') as _9 \\gset
-- Baja 2, a los 2 minutos baja 3, al minuto siguiente se retiran 2, a los 5 se venden 3. El retiro está a 3 minutos de
-- la primera y a 1 de la segunda: va SOLO a la segunda. Efectivas 2 y 1: las 3 que de verdad quedaron colgadas de 5.
select pg_temp.bajada(:'x', 2, :'t0'::timestamptz) as _10 \\gset
select pg_temp.bajada(:'x', 3, :'t0'::timestamptz + interval '2 minutes') as _11 \\gset
select pg_temp.mov(:'x', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '3 minutes', :'sa') as _12 \\gset
select pg_temp.vende(:'x', 3, :'t0'::timestamptz + interval '5 minutes') as _13 \\gset
${FILAS()}`,
  ({ filas }) => {
    const d = filas["ZZ-FRE-T25-DIEZ"] ?? [];
    afirmar("10 escaneadas, 4 retiradas a los 5 minutos → efectiva 6, sin ventas: normal", d.length === 1 && es(d[0], { cantidad: 10, pisoAntes: 0, retiradas: 4, efectiva: 6, tardias: 0, estado: "normal" }), ver(d));
    const t = filas["ZZ-FRE-T25-TOPE"] ?? [];
    afirmar("tope: vendidas 3, piso_antes 0, efectiva 1 → 1 tardía (topada por la efectiva, no por la cantidad)", t.length === 1 && es(t[0], { cantidad: 3, pisoAntes: 0, vendidas: 3, retiradas: 2, efectiva: 1, tardias: 1, estado: "tardia" }), ver(t));
    const x = filas["ZZ-FRE-T25-DOBLE"] ?? [];
    // Primera 120200: el retiro se descontaba de las dos (la primera «corregida» con efectiva 0; Σ efectivas 1, no 3).
    afirmar(
      "un retiro, una bajada: la primera retiradas 0 → efectiva 2 (vendidas 3, piso 0 → 2 tardías); la segunda retiradas 2 → efectiva 1, piso_antes 2, 1 tardía; Σ 3",
      x.length === 2 && es(x[0], { min: 0, cantidad: 2, pisoAntes: 0, vendidas: 3, retiradas: 0, efectiva: 2, tardias: 2, estado: "tardia" }) &&
        es(x[1], { min: 2, cantidad: 3, pisoAntes: 2, vendidas: 3, retiradas: 2, efectiva: 1, tardias: 1, estado: "tardia" }) &&
        x.reduce((s, y) => s + y.efectiva, 0) === 3,
      ver(x),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T26 · la carga inicial: su entrada «carga_inicial» y su bajada en el mismo instante → es_carga_inicial; en otro instante o una bajada normal → no",
  `select pg_temp.variante('ZZ-FRE-T26-PUERTA') as vp \\gset
select pg_temp.variante('ZZ-FRE-T26-MANO') as vm \\gset
select pg_temp.variante('ZZ-FRE-T26-OTRA-HORA') as vo \\gset
select pg_temp.variante('ZZ-FRE-T26-NORMAL') as vn \\gset
-- La puerta real (ADR-0235): carga inicial colgada = entrada «carga_inicial» al almacén + bajar_al_piso, una transacción.
select retail.cargar_stock_inicial(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'vp', 'cantidad', 4)), null, true, gen_random_uuid()) as _1 \\gset
-- Como en T7: lo recién escrito tiene created_at = now() y la lectura va hasta now() sin incluirlo; se corre 1 minuto
-- atrás, las DOS filas igual (siguen en el mismo instante), por fuera de los disparadores y solo en esta transacción.
set constraints retail.trg_actividad_movimientos, retail.trg_actividad_conteo_nuevo, retail.trg_actividad_traslado_nuevo immediate; -- Actividad (ADR-0207): sin eventos pendientes, el alter no choca
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '1 minute' where variante_id = :'vp';
alter table retail.movimientos enable always trigger movimientos_inmutables;
-- A mano, en el mismo instante: también es carga inicial.
select pg_temp.mov(:'vm', 'entrada', 3, :'sa', 'carga_inicial', :'t0'::timestamptz) as _2 \\gset
select pg_temp.bajada(:'vm', 3, :'t0'::timestamptz) as _3 \\gset
-- La carga entró 20 minutos antes y la bajada es aparte: no se marca.
select pg_temp.mov(:'vo', 'entrada', 3, :'sa', 'carga_inicial', :'t0'::timestamptz - interval '20 minutes') as _4 \\gset
select pg_temp.bajada(:'vo', 2, :'t0'::timestamptz) as _5 \\gset
-- Una recepción y su bajada en el mismo instante: no es carga inicial (el motivo manda).
select pg_temp.llega(:'vn', 3, :'t0'::timestamptz) as _6 \\gset
select pg_temp.bajada(:'vn', 2, :'t0'::timestamptz) as _7 \\gset
-- Dos entradas «carga_inicial» de la misma prenda en el mismo instante y una sola bajada: una fila, marcada.
select pg_temp.variante('ZZ-FRE-T26-DOS-ENTRADAS') as vd \\gset
select pg_temp.mov(:'vd', 'entrada', 2, :'sa', 'carga_inicial', :'t0'::timestamptz) as _8 \\gset
select pg_temp.mov(:'vd', 'entrada', 1, :'sa', 'carga_inicial', :'t0'::timestamptz) as _9 \\gset
select pg_temp.bajada(:'vd', 3, :'t0'::timestamptz) as _10 \\gset
${FILAS()}`,
  ({ filas }) => {
    const p = filas["ZZ-FRE-T26-PUERTA"] ?? [];
    afirmar("cargar_stock_inicial con p_al_piso → una bajada con su documento, es_carga_inicial", p.length === 1 && p[0].bajadaId !== null && es(p[0], { cantidad: 4, carga: true }), ver(p));
    afirmar("a mano en el mismo instante → es_carga_inicial", es(filas["ZZ-FRE-T26-MANO"]?.[0], { cantidad: 3, carga: true }), ver(filas["ZZ-FRE-T26-MANO"]));
    afirmar("carga 20 minutos antes y bajada aparte → no", es(filas["ZZ-FRE-T26-OTRA-HORA"]?.[0], { cantidad: 2, carga: false }), ver(filas["ZZ-FRE-T26-OTRA-HORA"]));
    afirmar("recepción + bajada en el mismo instante → no", es(filas["ZZ-FRE-T26-NORMAL"]?.[0], { cantidad: 2, carga: false }), ver(filas["ZZ-FRE-T26-NORMAL"]));
    afirmar("dos entradas de carga en el mismo instante → la bajada sale UNA vez, marcada", (filas["ZZ-FRE-T26-DOS-ENTRADAS"] ?? []).length === 1 && es(filas["ZZ-FRE-T26-DOS-ENTRADAS"][0], { cantidad: 3, carga: true }), ver(filas["ZZ-FRE-T26-DOS-ENTRADAS"]));
  },
);

// ---------------------------------------------------------------------------
// POR QUÉ LOS SUB-CASOS DE T27 NO ALCANZAN SOLOS (revisión 3 del 2026-09-27). El cálculo elige su rama por la TIENDA
// entera: si hay algún retiro entre p_desde − 2W y p_hasta + 2W, recorre los retiros; si no, los salta. Los cuatro
// sub-casos de T27 viven en UNA transacción y sus retiros caen a −9, −5, +5 y +7 minutos. En la lectura «desde 1 minuto
// antes» los de +5 y +7 (de FIN y FIN-DISPUTA) quedan DENTRO de [p_desde, p_hasta); en la de «hasta 1 minuto después»,
// los de −9 y −5. Así, un cálculo que preguntara «¿hay un retiro en el rango pedido?» (desde p_desde, en [p_desde,
// p_hasta) o hasta p_hasta: los mutantes 36, 37 y 38 de la revisión) recibía el «sí» de un vecino, recorría la rama con
// retiros y daba las mismas filas: los tres pasaban. Lo que los atrapa es un caso con el ÚNICO retiro de la tienda fuera
// del rango: T27 (único retiro), abajo, cada uno en su propia transacción.
correr(
  "T27 · bordes del rango: la bajada del primer minuto ve su piso de antes y el retiro previo aunque caigan antes de p_desde; la del último ve el retiro de después de p_hasta; un retiro que le disputa una bajada de fuera del rango (antes o después) va a esa",
  `select pg_temp.variante('ZZ-FRE-T27') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz - interval '30 minutes') as _2 \\gset
select pg_temp.mov(:'v', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '5 minutes', :'sa') as _3 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _4 \\gset
-- La disputa: una bajada de 2 a los −16 (fuera del rango que empieza en −1, y a más de UNA ventana de él), un retiro de
-- 1 a los −9 y la bajada de 2 en t0. El retiro está a 7 minutos de la de −16 y a 9 de la de t0: es de la de −16. Si el
-- libro empezara una sola ventana antes de p_desde (−11), la de −16 no se vería y el retiro caería en la de t0.
select pg_temp.variante('ZZ-FRE-T27-DISPUTA') as w \\gset
select pg_temp.llega(:'w', 10, :'t0'::timestamptz - interval '60 minutes') as _5 \\gset
select pg_temp.bajada(:'w', 2, :'t0'::timestamptz - interval '16 minutes') as _6 \\gset
select pg_temp.mov(:'w', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '9 minutes', :'sa') as _7 \\gset
select pg_temp.bajada(:'w', 2, :'t0'::timestamptz) as _8 \\gset
-- El borde de HASTA, el espejo de los dos de arriba (se leen con p_hasta = t0 + 1 minuto):
-- FIN: bajada de 2 en t0 y a los 5 minutos se retira 1, DESPUÉS de p_hasta. El retiro igual es de esa bajada: si los
-- retiros se leyeran solo hasta p_hasta, la bajada del final del rango conservaría sus 2.
select pg_temp.variante('ZZ-FRE-T27-FIN') as x \\gset
select pg_temp.llega(:'x', 10, :'t0'::timestamptz - interval '60 minutes') as _9 \\gset
select pg_temp.bajada(:'x', 2, :'t0'::timestamptz) as _10 \\gset
select pg_temp.mov(:'x', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '5 minutes', :'sa') as _11 \\gset
-- FIN-DISPUTA: bajada de 2 en t0, retiro de 1 a los +7 y bajada de 2 a los +12 (fuera del rango, y a más de UNA ventana
-- de p_hasta). El retiro está a 7 minutos de la de t0 y a 5 de la de +12: es de la de +12. Si el libro llegara solo una
-- ventana después de p_hasta (+11), la de +12 no se vería y el retiro caería en la de t0.
select pg_temp.variante('ZZ-FRE-T27-FIN-DISPUTA') as y \\gset
select pg_temp.llega(:'y', 10, :'t0'::timestamptz - interval '60 minutes') as _12 \\gset
select pg_temp.bajada(:'y', 2, :'t0'::timestamptz) as _13 \\gset
select pg_temp.mov(:'y', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '7 minutes', :'sa') as _14 \\gset
select pg_temp.bajada(:'y', 2, :'t0'::timestamptz + interval '12 minutes') as _15 \\gset
${FILAS(", p_desde => :'t0'::timestamptz - interval '1 minute'").replace("'R|' || v.sku", "'R|' || v.sku || '-BORDE'")}
${FILAS(", p_hasta => :'t0'::timestamptz + interval '1 minute'").replace("'R|' || v.sku", "'R|' || v.sku || '-HASTA'")}
${FILAS()}`,
  ({ filas }) => {
    const borde = filas["ZZ-FRE-T27-BORDE"] ?? [];
    const todo = (filas["ZZ-FRE-T27"] ?? []).filter((x) => x.min === 0);
    afirmar("desde 1 minuto antes: solo la bajada de t0, piso_antes 2, retiradas 2, «corregida»", borde.length === 1 && es(borde[0], { min: 0, pisoAntes: 2, retiradas: 2, efectiva: 0, estado: "corregida" }), ver(borde));
    afirmar("la misma fila que con el rango de 30 días", todo.length === 1 && es(borde[0], { pisoAntes: todo[0].pisoAntes, retiradas: todo[0].retiradas, efectiva: todo[0].efectiva, estado: todo[0].estado }), `${ver(borde)} ${ver(todo)}`);
    const dBorde = filas["ZZ-FRE-T27-DISPUTA-BORDE"] ?? [];
    const d = filas["ZZ-FRE-T27-DISPUTA"] ?? [];
    afirmar(
      "30 días: el retiro de −9 va a la bajada de −16 (a 7 minutos, no a 9): retiradas 1 y 0, efectivas 1 y 2; la de t0 suma el retiro al piso de antes (1 + 1)",
      d.length === 2 && es(d[0], { min: -16, retiradas: 1, efectiva: 1 }) && es(d[1], { min: 0, pisoAntes: 2, retiradas: 0, efectiva: 2, estado: "normal" }),
      ver(d),
    );
    afirmar(
      "desde 1 minuto antes: la de t0 da la MISMA fila (retiradas 0, efectiva 2, piso_antes 2), aunque la bajada que se llevó el retiro no esté en el rango",
      dBorde.length === 1 && es(dBorde[0], { min: 0, pisoAntes: 2, retiradas: 0, efectiva: 2, estado: "normal" }),
      ver(dBorde),
    );
    // El espejo en p_hasta: lo que pasa DESPUÉS del final del rango también cuenta para las bajadas del final.
    const fin = filas["ZZ-FRE-T27-FIN"] ?? [];
    const finHasta = filas["ZZ-FRE-T27-FIN-HASTA"] ?? [];
    afirmar(
      "30 días: el retiro de +5 es de la bajada de t0: retiradas 1, efectiva 1",
      fin.length === 1 && es(fin[0], { min: 0, cantidad: 2, retiradas: 1, efectiva: 1, estado: "normal" }),
      ver(fin),
    );
    afirmar(
      "hasta 1 minuto después: la MISMA fila (retiradas 1, efectiva 1), aunque el retiro caiga después de p_hasta",
      finHasta.length === 1 && es(finHasta[0], { min: 0, cantidad: 2, retiradas: 1, efectiva: 1, estado: "normal" }),
      ver(finHasta),
    );
    const fd = filas["ZZ-FRE-T27-FIN-DISPUTA"] ?? [];
    const fdHasta = filas["ZZ-FRE-T27-FIN-DISPUTA-HASTA"] ?? [];
    afirmar(
      "30 días: el retiro de +7 va a la bajada de +12 (a 5 minutos, no a 7): la de t0 retiradas 0 y efectiva 2; la de +12 retiradas 1 y efectiva 1",
      fd.length === 2 && es(fd[0], { min: 0, retiradas: 0, efectiva: 2 }) && es(fd[1], { min: 12, retiradas: 1, efectiva: 1 }),
      ver(fd),
    );
    afirmar(
      "hasta 1 minuto después: la de t0 da la MISMA fila (retiradas 0, efectiva 2), aunque la bajada que se llevó el retiro caiga a más de una ventana de p_hasta",
      fdHasta.length === 1 && es(fdHasta[0], { min: 0, cantidad: 2, retiradas: 0, efectiva: 2, estado: "normal" }),
      ver(fdHasta),
    );
  },
);

// ---------------------------------------------------------------------------
// T27 (único retiro): el ÚNICO retiro de la tienda cae fuera de [p_desde, p_hasta) y dentro de la ventana ampliada. Cada
// uno en su PROPIA transacción, para que ningún retiro de otro caso decida la rama (ver el comentario de T27).
correr(
  "T27 (único retiro, antes de p_desde) · el único retiro de la tienda cae 5 minutos antes de p_desde: la bajada del primer minuto igual lo ve",
  `-- Piso 2; 9:55 se retiran 2 (0); 10:00 se reponen 2 (2); 10:03 se vende 1. Leído desde las 9:59, el retiro queda
-- fuera del rango pero a 5 minutos de la bajada: suma al piso de antes y se descuenta de ella.
select pg_temp.variante('ZZ-FRE-T27U-DESDE') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.mov(:'v', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _2 \\gset
select pg_temp.mov(:'v', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '5 minutes', :'sa') as _3 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz) as _4 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '3 minutes') as _5 \\gset
${FILAS(", p_desde => :'t0'::timestamptz - interval '1 minute'").replace("'R|' || v.sku", "'R|' || v.sku || '-BORDE'")}
${FILAS()}`,
  ({ filas }) => {
    const t = filas["ZZ-FRE-T27U-DESDE"] ?? [];
    const b = filas["ZZ-FRE-T27U-DESDE-BORDE"] ?? [];
    afirmar(
      "30 días: piso_antes 2 (0 + el retiro), retiradas 2, efectiva 0, 0 tardías, «corregida»",
      t.length === 1 && es(t[0], { min: 0, cantidad: 2, pisoAntes: 2, vendidas: 1, retiradas: 2, efectiva: 0, tardias: 0, estado: "corregida" }),
      ver(t),
    );
    // Con la rama elegida por «¿hay un retiro desde p_desde / en el rango?», saldría piso_antes 0, 1 tardía, «tardia»:
    // a quien corrigió.
    afirmar(
      "desde 1 minuto antes (el único retiro de la tienda queda fuera del rango): la MISMA fila, no «tardia»",
      b.length === 1 && es(b[0], { min: 0, cantidad: 2, pisoAntes: 2, vendidas: 1, retiradas: 2, efectiva: 0, tardias: 0, estado: "corregida" }),
      ver(b),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T27 (único retiro, después de p_hasta) · el único retiro de la tienda cae 4 minutos después de p_hasta: la bajada del último minuto igual lo descuenta",
  `-- 10:00 se bajan 2; 10:05 se retira 1 (no cabía). Leído hasta las 10:01, el retiro queda fuera del rango pero a 5
-- minutos de la bajada: se descuenta de ella.
select pg_temp.variante('ZZ-FRE-T27U-HASTA') as x \\gset
select pg_temp.llega(:'x', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'x', 2, :'t0'::timestamptz) as _2 \\gset
select pg_temp.mov(:'x', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '5 minutes', :'sa') as _3 \\gset
${FILAS(", p_hasta => :'t0'::timestamptz + interval '1 minute'").replace("'R|' || v.sku", "'R|' || v.sku || '-FIN'")}
${FILAS()}`,
  ({ filas }) => {
    const t = filas["ZZ-FRE-T27U-HASTA"] ?? [];
    const f = filas["ZZ-FRE-T27U-HASTA-FIN"] ?? [];
    afirmar("30 días: retiradas 1, efectiva 1, «normal»", t.length === 1 && es(t[0], { min: 0, cantidad: 2, retiradas: 1, efectiva: 1, estado: "normal" }), ver(t));
    // Con la rama elegida por «¿hay un retiro hasta p_hasta / en el rango?», saldría retiradas 0 y efectiva 2.
    afirmar(
      "hasta 1 minuto después (el único retiro de la tienda queda fuera del rango): la MISMA fila, retiradas 1 y efectiva 1",
      f.length === 1 && es(f[0], { min: 0, cantidad: 2, retiradas: 1, efectiva: 1, estado: "normal" }),
      ver(f),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T28 · la misma hora exacta: el piso de antes es el nivel que el libro deja justo antes de la bajada (por id), nunca lo de después; un retiro de esa hora no suma pero se descuenta",
  `select pg_temp.variante('ZZ-FRE-T28-DESPUES') as v \\gset
select pg_temp.variante('ZZ-FRE-T28-ANTES') as w \\gset
select pg_temp.variante('ZZ-FRE-T28-RET-ANTES') as x \\gset
select pg_temp.variante('ZZ-FRE-T28-RET-DESPUES') as y \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'w', 10, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.llega(:'x', 10, :'t0'::timestamptz - interval '60 minutes') as _2x \\gset
select pg_temp.llega(:'y', 10, :'t0'::timestamptz - interval '60 minutes') as _2y \\gset
select pg_temp.mov(:'w', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _3 \\gset
select pg_temp.mov(:'x', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _3x \\gset
select pg_temp.mov(:'y', 'entrada', 1, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _3y \\gset
-- V: piso 0; a la MISMA hora, la bajada de 3 (id bajo: el libro la pone primero) y una venta de 1 (id alto: después).
-- El piso de antes es 0, no el 3 que dejó la propia bajada: la venta de esa hora es tardía.
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('00000000-0000-4000-8000-00000000f281', :'v', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 3, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('00000000-0000-4000-8000-00000000f281') as _4 \\gset
select pg_temp.venta_item(:'v', 1, :'t0'::timestamptz) as li_v \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, created_at)
  values ('ffffffff-ffff-4fff-bfff-00000000f282', :'v', :'ubic', :'sp', 'salida', 1, 'venta', :'li_v', :'t0');
select retail.fn_aplicar_movimiento('ffffffff-ffff-4fff-bfff-00000000f282') as _5 \\gset
-- W: piso 2; a la MISMA hora, una venta de 2 (id bajo: primero) y la bajada de 1 (id alto: después). El piso de antes
-- es el nivel justo antes: 0 (la venta ya se llevó las 2). Una VENTA no se suma, aunque sea de la misma hora.
select pg_temp.venta_item(:'w', 2, :'t0'::timestamptz) as li_w \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, created_at)
  values ('00000000-0000-4000-8000-00000000f283', :'w', :'ubic', :'sp', 'salida', 2, 'venta', :'li_w', :'t0');
select retail.fn_aplicar_movimiento('00000000-0000-4000-8000-00000000f283') as _6 \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('ffffffff-ffff-4fff-bfff-00000000f284', :'w', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 1, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('ffffffff-ffff-4fff-bfff-00000000f284') as _7 \\gset
-- X: piso 2; a la MISMA hora, un retiro de 2 (id bajo: primero) y la bajada de 2 (id alto: después); a los 3 minutos se
-- vende 1. El nivel justo antes ya es 0 (el retiro va antes en el libro) y el retiro no suma: [t − W, t) deja fuera la
-- hora t. Igual se descuenta de la bajada (a 0 minutos). En la tienda no pasa: retiro y bajada de la misma prenda en UNA
-- transacción solo se arman a mano.
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('00000000-0000-4000-8000-00000000f285', :'x', :'ubic', :'sp', :'ubic', :'sa', 'traslado', 2, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('00000000-0000-4000-8000-00000000f285') as _8 \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('ffffffff-ffff-4fff-bfff-00000000f286', :'x', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 2, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('ffffffff-ffff-4fff-bfff-00000000f286') as _9 \\gset
select pg_temp.vende(:'x', 1, :'t0'::timestamptz + interval '3 minutes') as _10 \\gset
-- Y: piso 1; a la MISMA hora, la bajada de 2 (id bajo: primero) y un retiro de 2 (id alto: después). El retiro está
-- DESPUÉS en el libro: no suma al piso de antes (1), pero igual se descuenta de la bajada (a 0 minutos).
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('00000000-0000-4000-8000-00000000f287', :'y', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 2, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('00000000-0000-4000-8000-00000000f287') as _11 \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('ffffffff-ffff-4fff-bfff-00000000f288', :'y', :'ubic', :'sp', :'ubic', :'sa', 'traslado', 2, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('ffffffff-ffff-4fff-bfff-00000000f288') as _12 \\gset
${FILAS()}`,
  ({ filas }) => {
    afirmar(
      "lo de después (la venta de la misma hora) no sube el piso de antes: piso_antes 0, vendidas 1 → 1 tardía",
      es(filas["ZZ-FRE-T28-DESPUES"]?.[0], { cantidad: 3, pisoAntes: 0, vendidas: 1, tardias: 1, estado: "tardia" }),
      ver(filas["ZZ-FRE-T28-DESPUES"]),
    );
    // Primera 120200: piso_antes 2, 0 tardías y «normal» (el nivel más alto era el de antes de esa venta). Ahora, como en
    // la 0300: la venta ya se había llevado las 2 cuando se bajó la tercera.
    afirmar(
      "una venta de la misma hora, primero en el libro, no se suma: piso_antes 0 (el nivel justo antes), vendidas 2 → 1 tardía",
      es(filas["ZZ-FRE-T28-ANTES"]?.[0], { cantidad: 1, pisoAntes: 0, vendidas: 2, tardias: 1, estado: "tardia" }),
      ver(filas["ZZ-FRE-T28-ANTES"]),
    );
    afirmar(
      "un retiro de la misma hora, primero en el libro: no suma al piso de antes (0) pero se descuenta → retiradas 2, efectiva 0, «corregida»",
      es(filas["ZZ-FRE-T28-RET-ANTES"]?.[0], { cantidad: 2, pisoAntes: 0, vendidas: 1, retiradas: 2, efectiva: 0, tardias: 0, estado: "corregida" }),
      ver(filas["ZZ-FRE-T28-RET-ANTES"]),
    );
    afirmar(
      "un retiro de la misma hora, después en el libro: no suma al piso de antes (1), pero se descuenta → retiradas 2, efectiva 0, «corregida»",
      es(filas["ZZ-FRE-T28-RET-DESPUES"]?.[0], { cantidad: 2, pisoAntes: 1, retiradas: 2, efectiva: 0, tardias: 0, estado: "corregida" }),
      ver(filas["ZZ-FRE-T28-RET-DESPUES"]),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T29 · la regla de los retiros: el empate va a la bajada de antes; lo que sobra no pasa a otra; a 11 minutos no cuenta; la «dudosa» no suma retiros ni se tapa con ellos; dos retiros se suman; el retiro previo pesa en las tardías",
  `select pg_temp.variante('ZZ-FRE-T29-EMPATE') as e \\gset
select pg_temp.variante('ZZ-FRE-T29-SOBRA') as s \\gset
select pg_temp.variante('ZZ-FRE-T29-ONCE') as o \\gset
select pg_temp.variante('ZZ-FRE-T29-DUDOSA') as d \\gset
select pg_temp.llega(:'e', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'s', 10, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.llega(:'o', 10, :'t0'::timestamptz - interval '60 minutes') as _3 \\gset
select pg_temp.llega(:'d', 10, :'t0'::timestamptz - interval '60 minutes') as _4 \\gset
-- EMPATE: 10:00 se bajan 2; 10:04 se retiran 2; 10:08 se bajan 3. El retiro está a 4 minutos de las dos: va a la de
-- antes del retiro (10:00), y a la de 10:08 no se le descuenta nada. Σ efectivas 3 = lo que quedó colgado.
select pg_temp.bajada(:'e', 2, :'t0'::timestamptz) as _5 \\gset
select pg_temp.mov(:'e', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '4 minutes', :'sa') as _6 \\gset
select pg_temp.bajada(:'e', 3, :'t0'::timestamptz + interval '8 minutes') as _7 \\gset
-- SOBRA: piso 4; 10:00 se bajan 2 (6); 10:01 se retiran 5 (1); 10:05 se bajan 3 (4). El retiro es de la de 10:00 (a 1
-- minuto, no a 4): efectiva 0; las 3 que sobran del retiro NO pasan a la de 10:05.
select pg_temp.mov(:'s', 'entrada', 4, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _8 \\gset
select pg_temp.bajada(:'s', 2, :'t0'::timestamptz) as _9 \\gset
select pg_temp.mov(:'s', 'traslado', 5, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '1 minute', :'sa') as _10 \\gset
select pg_temp.bajada(:'s', 3, :'t0'::timestamptz + interval '5 minutes') as _11 \\gset
-- ONCE: piso 3; 9:49 se retira 1 (2); 10:00 se bajan 2 (4); 10:11 se retira 1 (3). Los dos retiros están a 11 minutos:
-- ninguno se descuenta, y el de 9:49 no suma al piso de antes.
select pg_temp.mov(:'o', 'entrada', 3, :'sp', 'recepcion', :'t0'::timestamptz - interval '60 minutes') as _12 \\gset
select pg_temp.mov(:'o', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '11 minutes', :'sa') as _13 \\gset
select pg_temp.bajada(:'o', 2, :'t0'::timestamptz) as _14 \\gset
select pg_temp.mov(:'o', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '11 minutes', :'sa') as _15 \\gset
-- DUDOSA: 9:55 se bajan 3; 9:57 se retira 1; 10:00 se bajan 2 (piso 4 según el libro). Después, por fuera del libro, el
-- piso queda en 0: el libro, anclado en el stock de hoy, dice −4 antes de la primera y −2 antes de la segunda.
select pg_temp.bajada(:'d', 3, :'t0'::timestamptz - interval '5 minutes') as _16 \\gset
select pg_temp.mov(:'d', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '3 minutes', :'sa') as _17 \\gset
select pg_temp.bajada(:'d', 2, :'t0'::timestamptz) as _18 \\gset
update retail.stock set cantidad = 0 where variante_id = :'d' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
-- GEMELAS: dos bajadas de la misma prenda en el MISMO instante (solo se arma a mano: la tienda no lo hace), 2 y 3, y a
-- los 2 minutos se retira 1. Las dos quedan a la misma distancia y las dos son de antes del retiro: va a la de menor id.
select pg_temp.variante('ZZ-FRE-T29-GEMELAS') as g \\gset
select pg_temp.llega(:'g', 10, :'t0'::timestamptz - interval '60 minutes') as _19 \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('ffffffff-ffff-4fff-bfff-00000000f292', :'g', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 3, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('ffffffff-ffff-4fff-bfff-00000000f292') as _20 \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('00000000-0000-4000-8000-00000000f291', :'g', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 2, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('00000000-0000-4000-8000-00000000f291') as _21 \\gset
select pg_temp.mov(:'g', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '2 minutes', :'sa') as _22 \\gset
-- DOS-RETIROS: piso 3; 9:56 se retira 1 (2); 9:58 se retiran 2 (0); 10:00 se bajan 5. Los dos retiros son de esa bajada
-- y los dos estaban colgados antes: se SUMAN en las dos cuentas (retiradas 3, piso de antes 0 + 1 + 2), no se toma el
-- mayor.
select pg_temp.variante('ZZ-FRE-T29-DOS-RETIROS') as r2 \\gset
select pg_temp.llega(:'r2', 10, :'t0'::timestamptz - interval '60 minutes') as _23 \\gset
select pg_temp.mov(:'r2', 'entrada', 3, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _24 \\gset
select pg_temp.mov(:'r2', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '4 minutes', :'sa') as _25 \\gset
select pg_temp.mov(:'r2', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '2 minutes', :'sa') as _26 \\gset
select pg_temp.bajada(:'r2', 5, :'t0'::timestamptz) as _27 \\gset
-- DUDOSA-TAPADA: piso 2; 9:57 se retiran 2 (0); 10:00 se bajan 3 (3). Después, por fuera del libro, el piso queda en 2:
-- el libro dice −1 justo antes de la bajada. El retiro de 2 lo llevaría a 1, pero la «dudosa» se decide con el nivel
-- justo antes, SIN sumar retiros: un stock que no cuadra no se tapa con un retiro.
select pg_temp.variante('ZZ-FRE-T29-DUDOSA-TAPADA') as dt \\gset
select pg_temp.llega(:'dt', 10, :'t0'::timestamptz - interval '60 minutes') as _28 \\gset
select pg_temp.mov(:'dt', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _29 \\gset
select pg_temp.mov(:'dt', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '3 minutes', :'sa') as _30 \\gset
select pg_temp.bajada(:'dt', 3, :'t0'::timestamptz) as _31 \\gset
update retail.stock set cantidad = 2 where variante_id = :'dt' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
-- PARCIAL: piso 2; 9:58 se retiran 2 (0); 10:00 se bajan 5; 10:03 se venden 2. El retiro se descuenta (efectiva 3) y
-- suma al piso de antes (0 + 2): las 2 vendidas ya estaban colgadas antes del retiro → 0 tardías. Con el nivel justo
-- antes (0) saldrían 2 tardías y se volvería a acusar a quien repuso después de un retiro.
select pg_temp.variante('ZZ-FRE-T29-PARCIAL') as pa \\gset
select pg_temp.llega(:'pa', 10, :'t0'::timestamptz - interval '60 minutes') as _32 \\gset
select pg_temp.mov(:'pa', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _33 \\gset
select pg_temp.mov(:'pa', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '2 minutes', :'sa') as _34 \\gset
select pg_temp.bajada(:'pa', 5, :'t0'::timestamptz) as _35 \\gset
select pg_temp.vende(:'pa', 2, :'t0'::timestamptz + interval '3 minutes') as _36 \\gset
-- IGUALES: piso 2; 9:56 se retira 1 (1); 9:58 se retira OTRO 1 (0); 10:00 se bajan 3; 10:03 se venden 2. Los dos
-- retiros estaban colgados antes: piso de antes 0 + 1 + 1 = 2, y las 2 vendidas no son tardías. Con cantidades
-- IGUALES, una suma «sin repetidos» (sum(distinct), un union en vez de union all) daría 1 y una tardía falsa; con 1 y 2
-- (DOS-RETIROS) no se nota.
select pg_temp.variante('ZZ-FRE-T29-IGUALES') as ig \\gset
select pg_temp.llega(:'ig', 10, :'t0'::timestamptz - interval '60 minutes') as _37 \\gset
select pg_temp.mov(:'ig', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _38 \\gset
select pg_temp.mov(:'ig', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '4 minutes', :'sa') as _39 \\gset
select pg_temp.mov(:'ig', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '2 minutes', :'sa') as _40 \\gset
select pg_temp.bajada(:'ig', 3, :'t0'::timestamptz) as _41 \\gset
select pg_temp.vende(:'ig', 2, :'t0'::timestamptz + interval '3 minutes') as _42 \\gset
${FILAS()}`,
  ({ filas }) => {
    const r2 = filas["ZZ-FRE-T29-DOS-RETIROS"] ?? [];
    afirmar(
      "dos retiros en la ventana de una bajada se SUMAN: piso_antes 0 + 1 + 2 = 3, retiradas 3, efectiva 2, «normal»",
      r2.length === 1 && es(r2[0], { cantidad: 5, pisoAntes: 3, retiradas: 3, efectiva: 2, estado: "normal" }),
      ver(r2),
    );
    const ig = filas["ZZ-FRE-T29-IGUALES"] ?? [];
    afirmar(
      "dos retiros IGUALES (1 y 1) se suman: piso_antes 0 + 1 + 1 = 2, retiradas 2, efectiva 1, vendidas 2 → 0 tardías, «normal»",
      ig.length === 1 && es(ig[0], { cantidad: 3, pisoAntes: 2, retiradas: 2, efectiva: 1, vendidas: 2, tardias: 0, estado: "normal" }),
      ver(ig),
    );
    const dt = filas["ZZ-FRE-T29-DUDOSA-TAPADA"] ?? [];
    afirmar(
      "nivel justo antes −1 y un retiro de 2 en la ventana → «dudosa» igual: piso_antes −1 (sin sumar el retiro), tardías nulas, retiradas 2, efectiva 1",
      dt.length === 1 && es(dt[0], { cantidad: 3, pisoAntes: -1, tardias: null, estado: "dudosa", retiradas: 2, efectiva: 1 }),
      ver(dt),
    );
    const pa = filas["ZZ-FRE-T29-PARCIAL"] ?? [];
    afirmar(
      "retiro previo y efectiva > 0 con ventas: piso_antes 2 (0 + el retiro), retiradas 2, efectiva 3, vendidas 2 → 0 tardías, «normal»",
      pa.length === 1 && es(pa[0], { cantidad: 5, pisoAntes: 2, vendidas: 2, retiradas: 2, efectiva: 3, tardias: 0, estado: "normal" }),
      ver(pa),
    );
    const e = filas["ZZ-FRE-T29-EMPATE"] ?? [];
    afirmar(
      "empate (4 y 4 minutos) → a la de antes del retiro: retiradas 2 y 0, efectivas 0 y 3, «corregida» y «normal»; Σ 3 (sin doble descuento)",
      e.length === 2 && es(e[0], { min: 0, cantidad: 2, pisoAntes: 0, retiradas: 2, efectiva: 0, estado: "corregida" }) &&
        es(e[1], { min: 8, cantidad: 3, retiradas: 0, efectiva: 3, estado: "normal" }) && e.reduce((t, x) => t + x.efectiva, 0) === 3,
      ver(e),
    );
    afirmar("…y la de 10:08 suma ese retiro a su piso de antes (0 + 2), aunque se descontó de la otra", es(e[1], { pisoAntes: 2 }), ver(e[1]));
    const s = filas["ZZ-FRE-T29-SOBRA"] ?? [];
    afirmar(
      "retiro de 5 sobre una bajada de 2 → retiradas 5, efectiva 0, «corregida», piso_antes 4; la de 10:05 conserva sus 3 (piso_antes 1 + 5)",
      s.length === 2 && es(s[0], { min: 0, cantidad: 2, pisoAntes: 4, retiradas: 5, efectiva: 0, estado: "corregida" }) &&
        es(s[1], { min: 5, cantidad: 3, pisoAntes: 6, retiradas: 0, efectiva: 3, estado: "normal" }),
      ver(s),
    );
    const o = filas["ZZ-FRE-T29-ONCE"] ?? [];
    afirmar(
      "retiros a 11 minutos, antes y después → ni se descuentan (efectiva 2) ni suman al piso de antes (2, no 3)",
      o.length === 1 && es(o[0], { cantidad: 2, pisoAntes: 2, retiradas: 0, efectiva: 2, estado: "normal" }),
      ver(o),
    );
    const d = filas["ZZ-FRE-T29-DUDOSA"] ?? [];
    afirmar(
      "«dudosa» con el retiro en su ventana: piso_antes −2 (el nivel negativo, SIN sumar el retiro: no −1), tardías nulas",
      d.length === 2 && es(d[1], { min: 0, cantidad: 2, pisoAntes: -2, tardias: null, estado: "dudosa", retiradas: 0, efectiva: 2 }),
      ver(d),
    );
    afirmar(
      "…y el retiro se descuenta de la bajada más cercana (la de 9:55, a 2 minutos) aunque sea «dudosa»: la dudosa manda sobre la efectiva",
      es(d[0], { min: -5, cantidad: 3, pisoAntes: -4, tardias: null, estado: "dudosa", retiradas: 1, efectiva: 2 }),
      ver(d[0]),
    );
    const g = filas["ZZ-FRE-T29-GEMELAS"] ?? [];
    const menor = g.find((x) => x.movimientoId === "00000000-0000-4000-8000-00000000f291");
    const mayor = g.find((x) => x.movimientoId === "ffffffff-ffff-4fff-bfff-00000000f292");
    afirmar(
      "dos bajadas en el mismo instante y el retiro a la misma distancia de las dos → va SOLO a la de menor id (efectivas 1 y 3)",
      g.length === 2 && es(menor, { cantidad: 2, retiradas: 1, efectiva: 1 }) && es(mayor, { cantidad: 3, retiradas: 0, efectiva: 3 }),
      ver(g),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T30 · LÍMITE CONOCIDO (el precio de la regla decidida el 2026-09-27, ADR-0208): el piso de antes vuelve a sumar un retiro que una re-bajada ya repuso y tapa una tardía real",
  `select pg_temp.variante('ZZ-FRE-T30') as v \\gset
select pg_temp.variante('ZZ-FRE-T30-SIN') as w \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'w', 10, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.mov(:'v', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _3 \\gset
select pg_temp.mov(:'w', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _4 \\gset
-- Piso 2; 10:00 se retiran 2 por error (0); 10:01 se reponen 2 (2: la corrección); 10:03 otra colaboradora baja 1 de
-- verdad (3); 10:05 se venden 3. Antes de la de 10:03 había 2 colgadas en cualquier lectura del retiro, y el libro nunca
-- pasó de 3. Pero la regla suma TODO lo retirado en [t − W, t): el nivel justo antes (2, que ya incluye la reposición)
-- + el retiro (2) = 4, y con 3 vendidas no sale tardía.
select pg_temp.mov(:'v', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz, :'sa') as _5 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz + interval '1 minute') as _6 \\gset
select pg_temp.bajada(:'v', 1, :'t0'::timestamptz + interval '3 minutes') as _7 \\gset
select pg_temp.vende(:'v', 3, :'t0'::timestamptz + interval '5 minutes') as _8 \\gset
-- SIN: la misma tienda sin el error ni su corrección: piso 2; 10:03 se baja 1; 10:05 se venden 3 → 1 tardía.
select pg_temp.bajada(:'w', 1, :'t0'::timestamptz + interval '3 minutes') as _9 \\gset
select pg_temp.vende(:'w', 3, :'t0'::timestamptz + interval '5 minutes') as _10 \\gset
${FILAS()}`,
  ({ filas }) => {
    const v = filas["ZZ-FRE-T30"] ?? [];
    afirmar(
      "la corrección (10:01) sale «corregida»: piso_antes 2, retiradas 2, efectiva 0",
      v.length === 2 && es(v[0], { min: 1, cantidad: 2, pisoAntes: 2, retiradas: 2, efectiva: 0, tardias: 0, estado: "corregida" }),
      ver(v),
    );
    // DECIDIDO el 2026-09-27 (ADR-0208, «Límites» del paso 2): se queda la regla vigente, y esta fila es su precio. La
    // «variante C» («sumar al piso de antes solo lo retirado ANTES de la bajada que la regla le asignó a ESA misma
    // bajada») la daría vuelta (piso_antes 2, 1 tardía, «tardia», como SIN), pero en los gemelos de T32 culpa a quien
    // corrige un retiro por error: se descartó. Cambiar esta afirmación es reabrir esa decisión, no arreglar un error.
    afirmar(
      "la bajada real de 10:03 sale piso_antes 4 (2 + el retiro ya repuesto), 0 tardías, «normal» — el precio de la regla decidida",
      es(v[1], { min: 3, cantidad: 1, pisoAntes: 4, vendidas: 3, retiradas: 0, efectiva: 1, tardias: 0, estado: "normal" }),
      ver(v[1]),
    );
    const w = filas["ZZ-FRE-T30-SIN"] ?? [];
    afirmar(
      "la misma tienda sin el error ni su corrección: piso_antes 2, vendidas 3 → 1 tardía, «tardia»",
      w.length === 1 && es(w[0], { min: 3, cantidad: 1, pisoAntes: 2, vendidas: 3, tardias: 1, estado: "tardia" }),
      ver(w),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T31 · bordes que ninguna prueba vigilaba: piso→cuarentena no es retiro; la ventana de los retiros y el margen de lectura siguen a p_minutos; el orden de los estados; el desempate por hora antes que por id; la carga inicial es de ESE instante y de ESA tienda",
  `-- CUARENTENA: piso 3; 9:58 pasa 1 del piso a cuarentena; 10:00 se bajan 2. No es retiro: ni suma al piso de antes ni se
-- descuenta.
select pg_temp.variante('ZZ-FRE-T31-CUARENTENA') as c \\gset
select pg_temp.llega(:'c', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.mov(:'c', 'entrada', 3, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _2 \\gset
select pg_temp.mov(:'c', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '2 minutes', :'sc') as _3 \\gset
select pg_temp.bajada(:'c', 2, :'t0'::timestamptz) as _4 \\gset
-- VENTANA: piso 3; 9:53 se retira 1; 10:00 se bajan 2; 10:07 se retira 1. Con W = 10 los dos retiros cuentan; con W = 5,
-- ninguno (están a 7 minutos).
select pg_temp.variante('ZZ-FRE-T31-VENTANA') as w \\gset
select pg_temp.llega(:'w', 10, :'t0'::timestamptz - interval '60 minutes') as _5 \\gset
select pg_temp.mov(:'w', 'entrada', 3, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _6 \\gset
select pg_temp.mov(:'w', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '7 minutes', :'sa') as _7 \\gset
select pg_temp.bajada(:'w', 2, :'t0'::timestamptz) as _8 \\gset
select pg_temp.mov(:'w', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '7 minutes', :'sa') as _9 \\gset
-- MARGEN (W = 30): 9:12 se bajan 2; 9:33 se retira 1; 10:00 se bajan 2. El retiro está a 21 minutos de la de 9:12 y a 27
-- de la de 10:00: es de la de 9:12, y suma al piso de antes de la de 10:00. Leído desde 9:59, las dos cosas caen a más de
-- 20 minutos: solo se ven si el margen es 2·W (60), no un número fijo.
select pg_temp.variante('ZZ-FRE-T31-MARGEN') as m \\gset
select pg_temp.llega(:'m', 10, :'t0'::timestamptz - interval '120 minutes') as _10 \\gset
select pg_temp.bajada(:'m', 2, :'t0'::timestamptz - interval '48 minutes') as _11 \\gset
select pg_temp.mov(:'m', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '27 minutes', :'sa') as _12 \\gset
select pg_temp.bajada(:'m', 2, :'t0'::timestamptz) as _13 \\gset
-- DUDOSA-CORREGIDA: 10:00 se bajan 2; 10:02 se retiran 2; 10:30 entra 1 al piso; después, por fuera del libro, el piso
-- queda en 0 (el libro dice −1 antes de la bajada). Efectiva 0, pero la «dudosa» manda.
select pg_temp.variante('ZZ-FRE-T31-DUDOSA-CORREGIDA') as dc \\gset
select pg_temp.llega(:'dc', 10, :'t0'::timestamptz - interval '60 minutes') as _14 \\gset
select pg_temp.bajada(:'dc', 2, :'t0'::timestamptz) as _15 \\gset
select pg_temp.mov(:'dc', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '2 minutes', :'sa') as _16 \\gset
select pg_temp.mov(:'dc', 'entrada', 1, :'sp', 'recepcion', :'t0'::timestamptz + interval '30 minutes') as _17 \\gset
update retail.stock set cantidad = 0 where variante_id = :'dc' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
-- EN-CURSO: una bajada de hace 3 minutos deshecha por un retiro de hace 2: «corregida», aunque su ventana siga abierta.
select pg_temp.variante('ZZ-FRE-T31-EN-CURSO') as ec \\gset
select pg_temp.llega(:'ec', 10, :'t0'::timestamptz - interval '60 minutes') as _18 \\gset
select pg_temp.bajada(:'ec', 2, now() - interval '3 minutes') as _19 \\gset
select pg_temp.mov(:'ec', 'traslado', 2, :'sp', 'movimiento_interno', now() - interval '2 minutes', :'sa') as _20 \\gset
-- EMPATE-ID: 10:00 se bajan 2 (id MAYOR); 10:04 se retiran 2; 10:08 se bajan 3 (id menor). A 4 y 4 minutos, el retiro va a
-- la de antes aunque su id sea mayor: el id solo desempata dos bajadas del mismo instante.
select pg_temp.variante('ZZ-FRE-T31-EMPATE-ID') as ei \\gset
select pg_temp.llega(:'ei', 10, :'t0'::timestamptz - interval '60 minutes') as _21 \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('ffffffff-ffff-4fff-bfff-00000000f311', :'ei', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 2, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('ffffffff-ffff-4fff-bfff-00000000f311') as _22 \\gset
select pg_temp.mov(:'ei', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '4 minutes', :'sa') as _23 \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('00000000-0000-4000-8000-00000000f312', :'ei', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 3, 'movimiento_interno', :'t0'::timestamptz + interval '8 minutes');
select retail.fn_aplicar_movimiento('00000000-0000-4000-8000-00000000f312') as _24 \\gset
-- CARGA-CERCA: la entrada «carga_inicial» 30 segundos antes de la bajada: no es el mismo instante, no se marca.
select pg_temp.variante('ZZ-FRE-T31-CARGA-CERCA') as cc \\gset
select pg_temp.mov(:'cc', 'entrada', 3, :'sa', 'carga_inicial', :'t0'::timestamptz - interval '30 seconds') as _25 \\gset
select pg_temp.bajada(:'cc', 3, :'t0'::timestamptz) as _26 \\gset
-- CARGA-OTRA: una carga inicial de la misma prenda en OTRA tienda en el mismo instante que la bajada de esta: no se marca.
select pg_temp.variante('ZZ-FRE-T31-CARGA-OTRA') as co \\gset
select id as otra from retail.ubicaciones where tipo = 'tienda' and activo and id <> :'ubic' order by nombre limit 1 \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'otra', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'otra' and tipo = 'almacen_tienda');
select id as otra_sa from retail.sububicaciones where ubicacion_id = :'otra' and tipo = 'almacen_tienda' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
  values (:'co', :'otra', :'otra_sa', 'entrada', 3, 'carga_inicial', :'t0') returning id as e_otra \\gset
select retail.fn_aplicar_movimiento(:'e_otra') as _27 \\gset
select pg_temp.llega(:'co', 3, :'t0'::timestamptz - interval '10 minutes') as _28 \\gset
select pg_temp.bajada(:'co', 2, :'t0'::timestamptz) as _29 \\gset
-- CUAR-ALM: piso 2 y 1 en cuarentena; 9:58 la de cuarentena vuelve al ALMACÉN (mover_interno acepta cualquier par de la
-- tienda); 10:00 se bajan 2; 10:03 se venden 3. No salió nada del piso: no es retiro, y la venta de 3 con 2 colgadas
-- deja 1 tardía. Si el retiro se definiera solo por su destino (→ almacén), se la tragaría.
select pg_temp.variante('ZZ-FRE-T31-CUAR-ALM') as ca \\gset
select pg_temp.llega(:'ca', 10, :'t0'::timestamptz - interval '60 minutes') as _30 \\gset
select pg_temp.mov(:'ca', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _31 \\gset
select pg_temp.mov(:'ca', 'entrada', 1, :'sc', 'recepcion', :'t0'::timestamptz - interval '30 minutes') as _32 \\gset
select pg_temp.mov(:'ca', 'traslado', 1, :'sc', 'movimiento_interno', :'t0'::timestamptz - interval '2 minutes', :'sa') as _33 \\gset
select pg_temp.bajada(:'ca', 2, :'t0'::timestamptz) as _34 \\gset
select pg_temp.vende(:'ca', 3, :'t0'::timestamptz + interval '3 minutes') as _35 \\gset
-- ALM-CUAR: 10:00 se bajan 2; 10:04 se retiran 2 (piso → almacén); 10:05 pasa 1 del almacén a cuarentena. Almacén →
-- cuarentena no es bajada: el retiro es de la de 10:00 (a 4 minutos), aunque ese otro traslado quede a 1 minuto.
select pg_temp.variante('ZZ-FRE-T31-ALM-CUAR') as ac \\gset
select pg_temp.llega(:'ac', 10, :'t0'::timestamptz - interval '60 minutes') as _36 \\gset
select pg_temp.bajada(:'ac', 2, :'t0'::timestamptz) as _37 \\gset
select pg_temp.mov(:'ac', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '4 minutes', :'sa') as _38 \\gset
select pg_temp.mov(:'ac', 'traslado', 1, :'sa', 'movimiento_interno', :'t0'::timestamptz + interval '5 minutes', :'sc') as _39 \\gset
-- VENTAS-GEMELAS: piso 0; 10:00 se bajan 3; 10:03 dos ventas de 1 en el MISMO instante (dos tickets iguales). Son 2
-- vendidas y 2 tardías; si las filas de venta se juntaran «sin repetidos», contaría 1.
select pg_temp.variante('ZZ-FRE-T31-VENTAS-GEMELAS') as vg \\gset
select pg_temp.llega(:'vg', 10, :'t0'::timestamptz - interval '60 minutes') as _40 \\gset
select pg_temp.bajada(:'vg', 3, :'t0'::timestamptz) as _41 \\gset
select pg_temp.vende(:'vg', 1, :'t0'::timestamptz + interval '3 minutes') as _42 \\gset
select pg_temp.vende(:'vg', 1, :'t0'::timestamptz + interval '3 minutes') as _43 \\gset
-- CARGA-1S y CARGA-DESPUES: la entrada «carga_inicial» 1 segundo antes, o 30 segundos DESPUÉS, de la bajada: no es el
-- mismo instante, no se marca.
select pg_temp.variante('ZZ-FRE-T31-CARGA-1S') as c1 \\gset
select pg_temp.mov(:'c1', 'entrada', 3, :'sa', 'carga_inicial', :'t0'::timestamptz - interval '1 second') as _44 \\gset
select pg_temp.bajada(:'c1', 3, :'t0'::timestamptz) as _45 \\gset
select pg_temp.variante('ZZ-FRE-T31-CARGA-DESPUES') as cd \\gset
select pg_temp.llega(:'cd', 3, :'t0'::timestamptz - interval '60 minutes') as _46 \\gset
select pg_temp.bajada(:'cd', 3, :'t0'::timestamptz) as _47 \\gset
select pg_temp.mov(:'cd', 'entrada', 3, :'sa', 'carga_inicial', :'t0'::timestamptz + interval '30 seconds') as _48 \\gset
-- BORDE-DESDE: 9:40 se bajan 2; 9:50 se retira 1; 10:00 se bajan 2. Leído con p_desde = 10:00 EXACTO, el retiro empata
-- (10 y 10 minutos) y es de la de 9:40, que cae justo en p_desde − 2W: hay que leerla.
select pg_temp.variante('ZZ-FRE-T31-BORDE-DESDE') as bd \\gset
select pg_temp.llega(:'bd', 10, :'t0'::timestamptz - interval '60 minutes') as _49 \\gset
select pg_temp.bajada(:'bd', 2, :'t0'::timestamptz - interval '20 minutes') as _50 \\gset
select pg_temp.mov(:'bd', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz - interval '10 minutes', :'sa') as _51 \\gset
select pg_temp.bajada(:'bd', 2, :'t0'::timestamptz) as _52 \\gset
-- MEDIO-SEGUNDO: 9:55 se bajan 2; 10:00:00 se retiran 2; 10:00:00,5 se bajan 2. La de después está a medio segundo y
-- la de antes a 5 minutos: el retiro es de la de después («un instante después» es 1 µs, no 1 segundo).
select pg_temp.variante('ZZ-FRE-T31-MEDIO-SEGUNDO') as ms \\gset
select pg_temp.llega(:'ms', 10, :'t0'::timestamptz - interval '60 minutes') as _59 \\gset
select pg_temp.bajada(:'ms', 2, :'t0'::timestamptz - interval '5 minutes') as _60 \\gset
select pg_temp.mov(:'ms', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz, :'sa') as _61 \\gset
select pg_temp.bajada(:'ms', 2, :'t0'::timestamptz + interval '0.5 seconds') as _62 \\gset
-- ORDEN: dos bajadas a −10 y 0; la función las entrega de la más nueva a la más vieja.
select pg_temp.variante('ZZ-FRE-T31-ORDEN') as od \\gset
select pg_temp.llega(:'od', 10, :'t0'::timestamptz - interval '60 minutes') as _53 \\gset
select pg_temp.bajada(:'od', 1, :'t0'::timestamptz - interval '10 minutes') as _54 \\gset
select pg_temp.bajada(:'od', 1, :'t0'::timestamptz) as _55 \\gset
select 'ORDEN|' || string_agg(round(extract(epoch from (r.bajada_en - :'t0'::timestamptz)) / 60.0)::text, ',' order by r.ordinality)
  from retail.fn_bajadas_del_piso(:'ubic') with ordinality r join retail.variantes v on v.id = r.variante_id where v.sku = 'ZZ-FRE-T31-ORDEN';
-- DEFECTO: sin p_desde se leen 30 días: la bajada de hace 2 días sale y la de hace 31, no.
select pg_temp.variante('ZZ-FRE-T31-DEFECTO') as df \\gset
select pg_temp.llega(:'df', 10, now() - interval '40 days') as _56 \\gset
select pg_temp.bajada(:'df', 1, now() - interval '31 days') as _57 \\gset
select pg_temp.bajada(:'df', 1, now() - interval '2 days') as _58 \\gset
select 'DEFECTO|' || count(*) filter (where r.bajada_en > now() - interval '3 days') || ',' || count(*) filter (where r.bajada_en < now() - interval '30 days')
  from retail.fn_bajadas_del_piso(:'ubic') r join retail.variantes v on v.id = r.variante_id where v.sku = 'ZZ-FRE-T31-DEFECTO';
${FILAS(", p_minutos => 5").replace("'R|' || v.sku", "'R|' || v.sku || '-W5'")}
${FILAS(", p_minutos => 30").replace("'R|' || v.sku", "'R|' || v.sku || '-W30'")}
${FILAS(", p_desde => :'t0'::timestamptz - interval '1 minute', p_minutos => 30").replace("'R|' || v.sku", "'R|' || v.sku || '-W30-BORDE'")}
${FILAS(", p_desde => :'t0'::timestamptz").replace("'R|' || v.sku", "'R|' || v.sku || '-DESDE-T0'")}
${FILAS()}`,
  ({ filas, otras }) => {
    afirmar(
      "piso → cuarentena no es retiro: piso_antes 2 (no 3), retiradas 0, efectiva 2, «normal»",
      es(filas["ZZ-FRE-T31-CUARENTENA"]?.[0], { cantidad: 2, pisoAntes: 2, retiradas: 0, efectiva: 2, estado: "normal" }),
      ver(filas["ZZ-FRE-T31-CUARENTENA"]),
    );
    afirmar(
      "W = 10: los retiros de −7 y +7 cuentan: piso_antes 3, retiradas 2, efectiva 0, «corregida»",
      es(filas["ZZ-FRE-T31-VENTANA"]?.[0], { cantidad: 2, pisoAntes: 3, retiradas: 2, efectiva: 0, estado: "corregida" }),
      ver(filas["ZZ-FRE-T31-VENTANA"]),
    );
    afirmar(
      "W = 5: los mismos retiros, a 7 minutos, ni suman ni se descuentan: piso_antes 2, retiradas 0, efectiva 2",
      es(filas["ZZ-FRE-T31-VENTANA-W5"]?.[0], { cantidad: 2, pisoAntes: 2, retiradas: 0, efectiva: 2, estado: "normal" }),
      ver(filas["ZZ-FRE-T31-VENTANA-W5"]),
    );
    const m30 = (filas["ZZ-FRE-T31-MARGEN-W30"] ?? []).filter((x) => x.min === 0);
    const mBorde = filas["ZZ-FRE-T31-MARGEN-W30-BORDE"] ?? [];
    afirmar(
      "W = 30, 30 días: la de 10:00 suma el retiro de −27 al piso de antes (1 + 1 = 2) y no se lo descuenta (es de la de −48)",
      m30.length === 1 && es(m30[0], { pisoAntes: 2, retiradas: 0, efectiva: 2 }),
      ver(filas["ZZ-FRE-T31-MARGEN-W30"]),
    );
    afirmar(
      "W = 30 desde 1 minuto antes: la MISMA fila (el margen de lectura es 2·W, no 20 minutos fijos)",
      mBorde.length === 1 && es(mBorde[0], { min: 0, pisoAntes: 2, retiradas: 0, efectiva: 2 }),
      ver(mBorde),
    );
    afirmar(
      "«dudosa» manda sobre «corregida»: nivel justo antes −1 y efectiva 0 → «dudosa», tardías nulas",
      es(filas["ZZ-FRE-T31-DUDOSA-CORREGIDA"]?.[0], { cantidad: 2, pisoAntes: -1, retiradas: 2, efectiva: 0, tardias: null, estado: "dudosa" }),
      ver(filas["ZZ-FRE-T31-DUDOSA-CORREGIDA"]),
    );
    afirmar(
      "«corregida» manda sobre «en_curso»: bajada de hace 3 minutos deshecha por un retiro → «corregida», sin cerrar",
      es(filas["ZZ-FRE-T31-EN-CURSO"]?.[0], { cantidad: 2, retiradas: 2, efectiva: 0, cerrada: false, estado: "corregida" }),
      ver(filas["ZZ-FRE-T31-EN-CURSO"]),
    );
    const ei = filas["ZZ-FRE-T31-EMPATE-ID"] ?? [];
    afirmar(
      "empate a 4 y 4 minutos con la de antes de id MAYOR: el retiro igual va a la de antes (retiradas 2 y 0, efectivas 0 y 3)",
      ei.length === 2 && es(ei[0], { min: 0, retiradas: 2, efectiva: 0, estado: "corregida" }) && es(ei[1], { min: 8, retiradas: 0, efectiva: 3 }),
      ver(ei),
    );
    afirmar(
      "carga inicial 30 segundos antes de la bajada → no es carga inicial",
      es(filas["ZZ-FRE-T31-CARGA-CERCA"]?.[0], { cantidad: 3, carga: false }),
      ver(filas["ZZ-FRE-T31-CARGA-CERCA"]),
    );
    afirmar(
      "carga inicial de la misma prenda en OTRA tienda, en el mismo instante → no",
      es(filas["ZZ-FRE-T31-CARGA-OTRA"]?.[0], { cantidad: 2, carga: false }),
      ver(filas["ZZ-FRE-T31-CARGA-OTRA"]),
    );
    const ca = filas["ZZ-FRE-T31-CUAR-ALM"] ?? [];
    afirmar(
      "cuarentena → almacén no es retiro del piso: piso_antes 2, retiradas 0, efectiva 2, vendidas 3 → 1 tardía, «tardia»",
      ca.length === 1 && es(ca[0], { cantidad: 2, pisoAntes: 2, retiradas: 0, efectiva: 2, vendidas: 3, tardias: 1, estado: "tardia" }),
      ver(ca),
    );
    const ac = filas["ZZ-FRE-T31-ALM-CUAR"] ?? [];
    afirmar(
      "almacén → cuarentena no es bajada ni se lleva el retiro: una sola fila, la de 10:00, con retiradas 2, efectiva 0, «corregida»",
      ac.length === 1 && es(ac[0], { min: 0, cantidad: 2, retiradas: 2, efectiva: 0, estado: "corregida" }),
      ver(ac),
    );
    const vg = filas["ZZ-FRE-T31-VENTAS-GEMELAS"] ?? [];
    afirmar(
      "dos ventas iguales en el mismo instante se suman: vendidas 2 → 2 tardías, «tardia»",
      vg.length === 1 && es(vg[0], { cantidad: 3, pisoAntes: 0, vendidas: 2, tardias: 2, estado: "tardia" }),
      ver(vg),
    );
    afirmar(
      "carga inicial 1 segundo antes, o 30 segundos después, de la bajada → no es carga inicial",
      es(filas["ZZ-FRE-T31-CARGA-1S"]?.[0], { cantidad: 3, carga: false }) && es(filas["ZZ-FRE-T31-CARGA-DESPUES"]?.[0], { cantidad: 3, carga: false }),
      ver([filas["ZZ-FRE-T31-CARGA-1S"], filas["ZZ-FRE-T31-CARGA-DESPUES"]]),
    );
    const bd = (filas["ZZ-FRE-T31-BORDE-DESDE"] ?? []).filter((x) => x.min === 0);
    const bdT0 = filas["ZZ-FRE-T31-BORDE-DESDE-DESDE-T0"] ?? [];
    afirmar(
      "30 días: el retiro de −10 empata y es de la bajada de −20: la de t0 con piso_antes 2, retiradas 0, efectiva 2",
      bd.length === 1 && es(bd[0], { pisoAntes: 2, retiradas: 0, efectiva: 2 }),
      ver(bd),
    );
    afirmar(
      "p_desde = t0 EXACTO: la MISMA fila (la bajada de −20 está justo en p_desde − 2W y hay que leerla)",
      bdT0.length === 1 && es(bdT0[0], { min: 0, pisoAntes: 2, retiradas: 0, efectiva: 2 }),
      ver(bdT0),
    );
    const ms = filas["ZZ-FRE-T31-MEDIO-SEGUNDO"] ?? [];
    afirmar(
      "un retiro con la bajada de después a medio segundo y la de antes a 5 minutos → va a la de después (retiradas 0 y 2, efectivas 2 y 0)",
      ms.length === 2 && es(ms[0], { min: -5, retiradas: 0, efectiva: 2 }) && es(ms[1], { retiradas: 2, efectiva: 0, estado: "corregida" }),
      ver(ms),
    );
    afirmar("entrega las bajadas de la más nueva a la más vieja (0, −10)", otras.ORDEN === "0,-10", `ORDEN=${otras.ORDEN}`);
    afirmar("sin p_desde lee 30 días: la bajada de hace 2 días sale y la de hace 31 no", otras.DEFECTO === "1,0", `DEFECTO=${otras.DEFECTO}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T32 · LÍMITE CONOCIDO (el mismo precio que T30, forma A «colgaron de más», ADR-0208): el retiro que se le descontó a la bajada ANTERIOR igual suma al piso de antes de la siguiente y tapa tardías reales",
  `-- N1 («colgaron de más»): piso 0; 10:00 se bajan 3 y solo cabe 1; 10:02 se retiran 2; 10:08 otra colaboradora baja 1;
-- 10:11 y 10:13 se vende 1 y 1. El libro marca 3, 1, 2, 1, 0. El retiro es de la de 10:00 (a 2 minutos, no a 6): esas 2
-- nunca quedaron colgadas. Pero la regla decidida suma TODO lo retirado en [t − W, t) al piso de antes de la de 10:08: 1 + 2.
select pg_temp.variante('ZZ-FRE-T32-N1') as n1 \\gset
select pg_temp.llega(:'n1', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'n1', 3, :'t0'::timestamptz) as _2 \\gset
select pg_temp.mov(:'n1', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '2 minutes', :'sa') as _3 \\gset
select pg_temp.bajada(:'n1', 1, :'t0'::timestamptz + interval '8 minutes') as _4 \\gset
select pg_temp.vende(:'n1', 1, :'t0'::timestamptz + interval '11 minutes') as _5 \\gset
select pg_temp.vende(:'n1', 1, :'t0'::timestamptz + interval '13 minutes') as _6 \\gset
-- N1-SIN: la misma tienda sin el error: 10:00 se baja 1; 10:08 se baja 1; se venden 2 → la de 10:08, 1 tardía.
select pg_temp.variante('ZZ-FRE-T32-N1-SIN') as ns \\gset
select pg_temp.llega(:'ns', 10, :'t0'::timestamptz - interval '60 minutes') as _7 \\gset
select pg_temp.bajada(:'ns', 1, :'t0'::timestamptz) as _8 \\gset
select pg_temp.bajada(:'ns', 1, :'t0'::timestamptz + interval '8 minutes') as _9 \\gset
select pg_temp.vende(:'ns', 1, :'t0'::timestamptz + interval '11 minutes') as _10 \\gset
select pg_temp.vende(:'ns', 1, :'t0'::timestamptz + interval '13 minutes') as _11 \\gset
-- N1-CARGA: la carga inicial de 10 y su bajada en el mismo instante; 10:02 se retiran 4 (no cabían); 10:08 se baja 1;
-- de 10:11 a 10:13 se venden 7. El libro marca 10, 6, 7, 0: antes de la de 10:08 había 6.
select pg_temp.variante('ZZ-FRE-T32-N1-CARGA') as nc \\gset
select pg_temp.mov(:'nc', 'entrada', 10, :'sa', 'carga_inicial', :'t0'::timestamptz) as _12 \\gset
select pg_temp.bajada(:'nc', 10, :'t0'::timestamptz) as _13 \\gset
select pg_temp.mov(:'nc', 'traslado', 4, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '2 minutes', :'sa') as _14 \\gset
select pg_temp.bajada(:'nc', 1, :'t0'::timestamptz + interval '8 minutes') as _15 \\gset
select pg_temp.vende(:'nc', 3, :'t0'::timestamptz + interval '11 minutes') as _16 \\gset
select pg_temp.vende(:'nc', 2, :'t0'::timestamptz + interval '12 minutes') as _17 \\gset
select pg_temp.vende(:'nc', 2, :'t0'::timestamptz + interval '13 minutes') as _18 \\gset
-- EMPATE-VENTA (el EMPATE de T29 con una venta): 10:00 se bajan 2; 10:04 se retiran 2 (empate → la de 10:00,
-- «corregida»); 10:08 se bajan 3; 10:11 se venden 3. El libro marca 2, 0, 3, 0: antes de la de 10:08 no había nada.
select pg_temp.variante('ZZ-FRE-T32-EMPATE-VENTA') as ev \\gset
select pg_temp.llega(:'ev', 10, :'t0'::timestamptz - interval '60 minutes') as _19 \\gset
select pg_temp.bajada(:'ev', 2, :'t0'::timestamptz) as _20 \\gset
select pg_temp.mov(:'ev', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '4 minutes', :'sa') as _21 \\gset
select pg_temp.bajada(:'ev', 3, :'t0'::timestamptz + interval '8 minutes') as _22 \\gset
select pg_temp.vende(:'ev', 3, :'t0'::timestamptz + interval '11 minutes') as _23 \\gset
${FILAS()}`,
  ({ filas }) => {
    // DECIDIDO el 2026-09-27 (ADR-0208, «Límites» del paso 2): se queda la regla vigente, y estas filas son su precio.
    // La «variante C» («sumar al piso de antes solo lo retirado ANTES de la bajada que la regla le asignó a ESA misma
    // bajada») las daría vuelta (piso_antes 1 / 6 / 0 y 1 / 1 / 3 tardías), pero el libro no distingue este caso («colgaron
    // de más», A) del de T32 (gemelos) («retiro por error», B), donde C culpa a quien corrige: se descartó. Cambiar estas
    // afirmaciones es reabrir esa decisión.
    const n1 = filas["ZZ-FRE-T32-N1"] ?? [];
    afirmar(
      "N1: la de 10:00 se lleva el retiro (a 2 minutos): retiradas 2, efectiva 1, «normal»",
      n1.length === 2 && es(n1[0], { min: 0, cantidad: 3, pisoAntes: 0, retiradas: 2, efectiva: 1, estado: "normal" }),
      ver(n1),
    );
    afirmar(
      "N1: la de 10:08 sale piso_antes 3 (el libro dice 1: el retiro ya se le descontó a la de 10:00), vendidas 2, 0 tardías — el precio de la regla decidida",
      es(n1[1], { min: 8, cantidad: 1, pisoAntes: 3, vendidas: 2, retiradas: 0, efectiva: 1, tardias: 0, estado: "normal" }),
      ver(n1[1]),
    );
    const ns = filas["ZZ-FRE-T32-N1-SIN"] ?? [];
    afirmar(
      "N1-SIN (sin el error): la de 10:08 sale piso_antes 1, vendidas 2 → 1 tardía, «tardia»",
      ns.length === 2 && es(ns[1], { min: 8, cantidad: 1, pisoAntes: 1, vendidas: 2, tardias: 1, estado: "tardia" }),
      ver(ns),
    );
    const nc = filas["ZZ-FRE-T32-N1-CARGA"] ?? [];
    afirmar(
      "N1-CARGA: la carga se lleva el retiro (efectiva 6, es_carga_inicial) y HOY la de 10:08 sale piso_antes 10 (el libro dice 6), vendidas 7, 0 tardías",
      nc.length === 2 && es(nc[0], { min: 0, cantidad: 10, retiradas: 4, efectiva: 6, carga: true }) &&
        es(nc[1], { min: 8, cantidad: 1, pisoAntes: 10, vendidas: 7, tardias: 0, estado: "normal" }),
      ver(nc),
    );
    const ev = filas["ZZ-FRE-T32-EMPATE-VENTA"] ?? [];
    afirmar(
      "EMPATE-VENTA: la de 10:00 «corregida»; HOY la de 10:08 sale piso_antes 2 (el libro dice 0), vendidas 3 → 1 tardía y no 3",
      ev.length === 2 && es(ev[0], { min: 0, cantidad: 2, retiradas: 2, efectiva: 0, estado: "corregida" }) &&
        es(ev[1], { min: 8, cantidad: 3, pisoAntes: 2, vendidas: 3, retiradas: 0, efectiva: 3, tardias: 1, estado: "tardia" }),
      ver(ev),
    );
  },
);

// ---------------------------------------------------------------------------
// LOS GEMELOS DE T32 (revisión 3 del 2026-09-27; ADR-0208, «Límites» del paso 2). El mismo dibujo que T32 en el libro
// (una bajada, un retiro que la regla le da a ELLA, otra bajada después y ventas en la ventana de esa otra), pero la
// historia es la contraria: el retiro fue un ERROR y la bajada siguiente lo CORRIGE (B). El libro no distingue B de A
// («colgaron de más», T32), y la regla del piso de antes tiene que elegir a quién le falla. Se decidió que se queda la
// vigente (suma todo lo retirado en [t − W, t)): aquí no culpa a quien corrige. La «variante C» (sumar solo lo retirado
// ANTES que se le asignó a ESA bajada) atrapaba T30 y T32, pero DA VUELTA estas filas: FALSA2 → piso_antes 2, 2 tardías,
// «tardia»; EMPATE → piso_antes 1, 2 tardías, «tardia»; DOS-REBAJADAS → la segunda, piso_antes 1, 1 tardía, «tardia».
// Si alguien cambia la regla a C, estas afirmaciones fallan: es reabrir la decisión, no arreglar un error.
correr(
  "T32 (gemelos) · el retiro por error que la bajada siguiente corrige (B): la regla decidida no culpa a quien corrige (0 tardías, «normal»)",
  `-- FALSA2: piso 2; 9:57 se bajan 2 de verdad (4); 10:00 se retiran 2 por error (2); 10:08 otra colaboradora las vuelve
-- a colgar (4); 10:12 se venden 4. El retiro está a 3 minutos de la de 9:57 y a 8 de la corrección: va a la de 9:57.
select pg_temp.variante('ZZ-FRE-T32G-FALSA2') as f \\gset
select pg_temp.llega(:'f', 20, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.mov(:'f', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '50 minutes') as _2 \\gset
select pg_temp.bajada(:'f', 2, :'t0'::timestamptz - interval '3 minutes') as _3 \\gset
select pg_temp.mov(:'f', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz, :'sa') as _4 \\gset
select pg_temp.bajada(:'f', 2, :'t0'::timestamptz + interval '8 minutes') as _5 \\gset
select pg_temp.vende(:'f', 4, :'t0'::timestamptz + interval '12 minutes') as _6 \\gset
-- FALSA2-SIN: la misma tienda sin el error ni su corrección: nadie tiene tardías (la venta de 10:12 cae fuera de la
-- ventana de la de 9:57).
select pg_temp.variante('ZZ-FRE-T32G-FALSA2-SIN') as fs \\gset
select pg_temp.llega(:'fs', 20, :'t0'::timestamptz - interval '60 minutes') as _7 \\gset
select pg_temp.mov(:'fs', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '50 minutes') as _8 \\gset
select pg_temp.bajada(:'fs', 2, :'t0'::timestamptz - interval '3 minutes') as _9 \\gset
select pg_temp.vende(:'fs', 4, :'t0'::timestamptz + interval '12 minutes') as _10 \\gset
-- EMPATE: piso 2; 10:00 se baja 1 (3); 10:04 se retiran 2 por error (1); 10:08 se vuelven a colgar 2 (3); 10:12 se
-- venden 3. El retiro queda a 4 minutos de las dos: empate → la de antes.
select pg_temp.variante('ZZ-FRE-T32G-EMPATE') as e \\gset
select pg_temp.llega(:'e', 20, :'t0'::timestamptz - interval '60 minutes') as _11 \\gset
select pg_temp.mov(:'e', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '50 minutes') as _12 \\gset
select pg_temp.bajada(:'e', 1, :'t0'::timestamptz) as _13 \\gset
select pg_temp.mov(:'e', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '4 minutes', :'sa') as _14 \\gset
select pg_temp.bajada(:'e', 2, :'t0'::timestamptz + interval '8 minutes') as _15 \\gset
select pg_temp.vende(:'e', 3, :'t0'::timestamptz + interval '12 minutes') as _16 \\gset
-- DOS-REBAJADAS (la corrección en dos veces): piso 2; 10:00 se retiran 2 por error (0); 10:01 y 10:02 se vuelven a
-- colgar 1 y 1 (2); 10:05 se venden 2. El retiro entero va a la de 10:01 (a 1 minuto) y lo que sobra no pasa a la de
-- 10:02; la de 10:02 igual suma el retiro a su piso de antes.
select pg_temp.variante('ZZ-FRE-T32G-DOS-REBAJADAS') as d \\gset
select pg_temp.llega(:'d', 20, :'t0'::timestamptz - interval '60 minutes') as _17 \\gset
select pg_temp.mov(:'d', 'entrada', 2, :'sp', 'recepcion', :'t0'::timestamptz - interval '50 minutes') as _18 \\gset
select pg_temp.mov(:'d', 'traslado', 2, :'sp', 'movimiento_interno', :'t0'::timestamptz, :'sa') as _19 \\gset
select pg_temp.bajada(:'d', 1, :'t0'::timestamptz + interval '1 minute') as _20 \\gset
select pg_temp.bajada(:'d', 1, :'t0'::timestamptz + interval '2 minutes') as _21 \\gset
select pg_temp.vende(:'d', 2, :'t0'::timestamptz + interval '5 minutes') as _22 \\gset
${FILAS()}`,
  ({ filas }) => {
    const f = filas["ZZ-FRE-T32G-FALSA2"] ?? [];
    afirmar(
      "FALSA2: la de 9:57 se lleva el retiro (a 3 minutos): retiradas 2, efectiva 0, «corregida» (la corrección cae en la bajada equivocada, límite conocido)",
      f.length === 2 && es(f[0], { min: -3, cantidad: 2, pisoAntes: 2, vendidas: 0, retiradas: 2, efectiva: 0, tardias: 0, estado: "corregida" }),
      ver(f),
    );
    afirmar(
      "FALSA2: la corrección de 10:08 sale piso_antes 4 (2 + el retiro), vendidas 4, 0 tardías, «normal» (con la variante C: piso_antes 2, 2 tardías, «tardia»)",
      es(f[1], { min: 8, cantidad: 2, pisoAntes: 4, vendidas: 4, retiradas: 0, efectiva: 2, tardias: 0, estado: "normal" }),
      ver(f[1]),
    );
    const fs = filas["ZZ-FRE-T32G-FALSA2-SIN"] ?? [];
    afirmar(
      "FALSA2-SIN (sin el error): la de 9:57 sale 0 tardías, «normal»: el error no le cuesta a nadie una tardía",
      fs.length === 1 && es(fs[0], { min: -3, cantidad: 2, pisoAntes: 2, vendidas: 0, tardias: 0, estado: "normal" }),
      ver(fs),
    );
    const e = filas["ZZ-FRE-T32G-EMPATE"] ?? [];
    afirmar(
      "EMPATE: la de 10:00 se lleva el retiro (empate → la de antes): retiradas 2, efectiva 0, «corregida»",
      e.length === 2 && es(e[0], { min: 0, cantidad: 1, pisoAntes: 2, retiradas: 2, efectiva: 0, tardias: 0, estado: "corregida" }),
      ver(e),
    );
    afirmar(
      "EMPATE: la corrección de 10:08 sale piso_antes 3 (1 + el retiro), vendidas 3, 0 tardías, «normal» (con la variante C: piso_antes 1, 2 tardías, «tardia»)",
      es(e[1], { min: 8, cantidad: 2, pisoAntes: 3, vendidas: 3, retiradas: 0, efectiva: 2, tardias: 0, estado: "normal" }),
      ver(e[1]),
    );
    const d = filas["ZZ-FRE-T32G-DOS-REBAJADAS"] ?? [];
    afirmar(
      "DOS-REBAJADAS: la de 10:01 se lleva el retiro entero: retiradas 2, efectiva 0, «corregida»",
      d.length === 2 && es(d[0], { min: 1, cantidad: 1, pisoAntes: 2, retiradas: 2, efectiva: 0, estado: "corregida" }),
      ver(d),
    );
    afirmar(
      "DOS-REBAJADAS: la de 10:02 sale piso_antes 3 (1 + el retiro), vendidas 2, 0 tardías, «normal» (con la variante C: piso_antes 1, 1 tardía, «tardia»)",
      es(d[1], { min: 2, cantidad: 1, pisoAntes: 3, vendidas: 2, retiradas: 0, efectiva: 1, tardias: 0, estado: "normal" }),
      ver(d[1]),
    );
  },
);

// ---------------------------------------------------------------------------
// «CERRADA» NO ES FINAL (revisión 3 del 2026-09-27; ADR-0208, «Límites» del paso 2). `cerrada` dice que ya pasaron W
// minutos desde la bajada, pero su fila todavía puede cambiar hasta 2W después: si un retiro de su ventana queda más
// cerca de una bajada de la misma talla que llega DESPUÉS, el retiro pasa a esa (la regla de los retiros mira las dos
// direcciones). La fila solo puede PERDER retiros: su efectiva y sus tardías suben, nunca bajan. Este caso fija el valor
// de hoy. Las horas van contra now() (no contra t0): la bajada ya está cerrada en la primera lectura, y la otra bajada se
// registra después, como en la tienda.
correr(
  "T33 · «cerrada» no es final: una bajada cerrada y «corregida» pasa a «tardia» cuando después otra bajada de la misma talla queda más cerca de su retiro",
  `-- Piso 0; hace 10 minutos se baja 1 (1); a los 2 se vende (0); a los 5 una clienta devuelve 1 al piso (1); a los 9 se
-- retira 1 (0). Ahora, la bajada ya está cerrada (10 minutos justos) y «corregida»: el retiro es suyo (a 9 minutos).
select now() - interval '10 minutes' as tb1 \\gset
select pg_temp.variante('ZZ-FRE-T33') as v \\gset
select pg_temp.llega(:'v', 10, now() - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 1, :'tb1'::timestamptz) as _2 \\gset
select pg_temp.vende(:'v', 1, now() - interval '8 minutes') as _3 \\gset
select pg_temp.mov(:'v', 'entrada', 1, :'sp', 'devolucion', now() - interval '5 minutes') as _4 \\gset
select pg_temp.mov(:'v', 'traslado', 1, :'sp', 'movimiento_interno', now() - interval '1 minute', :'sa') as _5 \\gset
select 'ANTES|' || r.cerrada || ',' || r.estado || ',' || r.piso_antes || ',' || r.vendidas_en_ventana || ',' || r.retiradas_en_ventana
       || ',' || r.cantidad_efectiva || ',' || r.unidades_tardias
  from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = :'v' and r.bajada_en = :'tb1'::timestamptz;
-- Otra colaboradora baja 1 de la misma talla AHORA: queda a 1 minuto del retiro (la primera, a 9).
select pg_temp.bajada(:'v', 1, now()) as _6 \\gset
select 'DESPUES|' || r.cerrada || ',' || r.estado || ',' || r.piso_antes || ',' || r.vendidas_en_ventana || ',' || r.retiradas_en_ventana
       || ',' || r.cantidad_efectiva || ',' || r.unidades_tardias
  from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = :'v' and r.bajada_en = :'tb1'::timestamptz;
-- La de ahora no sale (el rango llega hasta now() sin incluirlo), pero igual se lleva el retiro: por eso la primera lo
-- pierde.
select 'N|' || count(*) from retail.fn_bajadas_del_piso(:'ubic') r where r.variante_id = :'v';`,
  ({ otras }) => {
    afirmar(
      "antes: cerrada, «corregida» (piso_antes 0, vendidas 1, retiradas 1, efectiva 0, 0 tardías)",
      otras.ANTES === "true,corregida,0,1,1,0,0",
      `ANTES=${otras.ANTES}`,
    );
    afirmar(
      "después de la otra bajada: sigue cerrada, pero pasa a «tardia» con 1 tardía (retiradas 0, efectiva 1) — el valor de hoy, un límite escrito",
      otras.DESPUES === "true,tardia,0,1,0,1,1",
      `DESPUES=${otras.DESPUES}`,
    );
    afirmar("la bajada de ahora no sale en la lectura (una sola fila de esta prenda)", otras.N === "1", `N=${otras.N}`);
  },
);

// ---------------------------------------------------------------------------
// T34 a T36: los mutantes de la revisión 3 que seguían pasando (revisión 4, 2026-09-27). Cada caso mata uno que sí cambia
// una fila posible; los que no pueden cambiar ninguna están explicados en la cabecera («MUTANTES EQUIVALENTES»).
correr(
  "T34 · la marca de carga inicial: una segunda carga de la misma prenda a 5 minutos no apaga la primera; un ajuste con motivo «carga_inicial» no es carga (la carga es una ENTRADA)",
  `-- DOS-CARGAS: 10:00 entra la carga inicial de 3 y se baja en el mismo instante; 10:05 entra otra carga de 2 de la misma
-- prenda y también se baja. Las dos bajadas son de carga. La marca mira «¿hay una carga en MI instante?»: tomar la carga
-- más TARDÍA de [t, t + W] (max en vez de min, mutante 1) veía la de 10:05 y apagaba la de 10:00. Solo se arma a mano: la
-- puerta (cargar_stock_inicial) rechaza la segunda carga de una prenda que ya tiene historia en la tienda.
select pg_temp.variante('ZZ-FRE-T34-DOS-CARGAS') as dc \\gset
select pg_temp.mov(:'dc', 'entrada', 3, :'sa', 'carga_inicial', :'t0'::timestamptz) as _1 \\gset
select pg_temp.bajada(:'dc', 3, :'t0'::timestamptz) as _2 \\gset
select pg_temp.mov(:'dc', 'entrada', 2, :'sa', 'carga_inicial', :'t0'::timestamptz + interval '5 minutes') as _3 \\gset
select pg_temp.bajada(:'dc', 2, :'t0'::timestamptz + interval '5 minutes') as _4 \\gset
-- AJUSTE: el motivo de registrar_movimiento es texto libre: un ajuste de +1 en el almacén con motivo «carga_inicial», en el
-- mismo instante que una bajada. No es la carga inicial (esa es una ENTRADA, ADR-0212/0235): sin exigir tipo = 'entrada'
-- (mutante 24) la bajada salía marcada. En producción hoy las 64 filas «carga_inicial» son entradas (2026-09-27).
select pg_temp.variante('ZZ-FRE-T34-AJUSTE') as aj \\gset
select pg_temp.llega(:'aj', 5, :'t0'::timestamptz - interval '60 minutes') as _5 \\gset
select pg_temp.mov(:'aj', 'ajuste', 1, :'sa', 'carga_inicial', :'t0'::timestamptz) as _6 \\gset
select pg_temp.bajada(:'aj', 2, :'t0'::timestamptz) as _7 \\gset
${FILAS()}`,
  ({ filas }) => {
    const dc = filas["ZZ-FRE-T34-DOS-CARGAS"] ?? [];
    afirmar(
      "dos cargas de la misma prenda a 5 minutos, cada una con su bajada → las DOS bajadas salen con es_carga_inicial",
      dc.length === 2 && es(dc[0], { min: 0, cantidad: 3, carga: true }) && es(dc[1], { min: 5, cantidad: 2, carga: true }),
      ver(dc),
    );
    const aj = filas["ZZ-FRE-T34-AJUSTE"] ?? [];
    afirmar(
      "un AJUSTE con motivo «carga_inicial» en el mismo instante no marca la bajada (es_carga_inicial false)",
      aj.length === 1 && es(aj[0], { min: 0, cantidad: 2, carga: false }),
      ver(aj),
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T35 · dos bajadas del mismo instante salen en orden de id (el desempate de «de la más nueva a la más vieja»)",
  `-- Una bajada con varias prendas (bajar_al_piso) escribe todas sus filas en el mismo instante: en producción hay 69
-- pares de traslados internos que comparten la hora (2026-09-27). La función las entrega de la más nueva a la más vieja
-- y, en la misma hora, por id: la pantalla no cambia de orden entre dos lecturas. Se insertan en otro orden que el de sus
-- ids para que el orden del libro no lo tape (con «id desc», mutante 20, salían al revés).
select pg_temp.variante('ZZ-FRE-T35-A') as a \\gset
select pg_temp.variante('ZZ-FRE-T35-B') as b \\gset
select pg_temp.variante('ZZ-FRE-T35-C') as c \\gset
select pg_temp.llega(:'a', 5, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.llega(:'b', 5, :'t0'::timestamptz - interval '60 minutes') as _2 \\gset
select pg_temp.llega(:'c', 5, :'t0'::timestamptz - interval '60 minutes') as _3 \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('ffffffff-ffff-4fff-bfff-00000000f353', :'c', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 1, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('ffffffff-ffff-4fff-bfff-00000000f353') as _4 \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('00000000-0000-4000-8000-00000000f351', :'a', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 1, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('00000000-0000-4000-8000-00000000f351') as _5 \\gset
insert into retail.movimientos (id, variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                tipo, cantidad, motivo, created_at)
  values ('80000000-0000-4000-8000-00000000f352', :'b', :'ubic', :'sa', :'ubic', :'sp', 'traslado', 1, 'movimiento_interno', :'t0');
select retail.fn_aplicar_movimiento('80000000-0000-4000-8000-00000000f352') as _6 \\gset
-- Una bajada de un minuto después, para que el orden por hora también se vea en la misma lectura.
select pg_temp.bajada(:'a', 1, :'t0'::timestamptz + interval '1 minute') as _7 \\gset
select 'ORDEN35|' || string_agg(round(extract(epoch from (r.bajada_en - :'t0'::timestamptz)) / 60.0)::text || ':' || right(r.movimiento_id::text, 4), ',' order by r.ordinality)
  from retail.fn_bajadas_del_piso(:'ubic') with ordinality r join retail.variantes v on v.id = r.variante_id where v.sku like 'ZZ-FRE-T35-%';`,
  ({ otras }) => {
    afirmar(
      "la de 10:01 primero; las tres de 10:00 después, por id (f351, f352, f353) aunque se escribieron en otro orden",
      otras.ORDEN35?.startsWith("1:") && otras.ORDEN35?.endsWith(",0:f351,0:f352,0:f353") && otras.ORDEN35.split(",").length === 4,
      `ORDEN35=${otras.ORDEN35}`,
    );
  },
);

// ---------------------------------------------------------------------------
// T36 va en su propia transacción: el retiro de ENTRADA decide la rama con retiros y nada de otro caso la toca.
correr(
  "T36 · solo un traslado interno es bajada o retiro: una fila que no es traslado, aunque traiga una sububicación de destino suelta, ni se descuenta ni se lleva un retiro",
  `-- La base acepta sububicacion_destino_id en una fila que no es traslado (el CHECK solo exige ubicacion_destino_id nulo
-- fuera de un traslado, y la FK compuesta no mira una fila con destino nulo), y ni el stock (fn_aplicar_movimiento) ni el
-- libro (fn_ledger_puntos) la leen. La bajada y el retiro se reconocen como Movimientos y el libro: traslado de la MISMA
-- tienda (fn_es_traslado_interno) y su par exacto. Sin ese filtro (mutante 8), el par de sububicaciones solo alcanzaba.
-- En producción hoy no hay ninguna fila así (2026-09-27): solo se arma a mano.
-- SALIDA: 10:00 se bajan 2; 10:03 sale 1 del piso por merma y la fila trae almacén como destino suelto. No es retiro.
select pg_temp.variante('ZZ-FRE-T36-SALIDA') as s \\gset
select pg_temp.llega(:'s', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'s', 2, :'t0'::timestamptz) as _2 \\gset
select pg_temp.mov(:'s', 'salida', 1, :'sp', 'merma', :'t0'::timestamptz + interval '3 minutes', :'sa') as _3 \\gset
-- ENTRADA: 10:00 se bajan 2; 10:03 se retira 1 de verdad (piso → almacén); 10:04 entra 1 al almacén (recepción) con el
-- piso como destino suelto. No es bajada: el retiro es de la de 10:00 (a 3 minutos), no de esa fila (a 1).
select pg_temp.variante('ZZ-FRE-T36-ENTRADA') as e \\gset
select pg_temp.llega(:'e', 10, :'t0'::timestamptz - interval '60 minutes') as _4 \\gset
select pg_temp.bajada(:'e', 2, :'t0'::timestamptz) as _5 \\gset
select pg_temp.mov(:'e', 'traslado', 1, :'sp', 'movimiento_interno', :'t0'::timestamptz + interval '3 minutes', :'sa') as _6 \\gset
select pg_temp.mov(:'e', 'entrada', 1, :'sa', 'recepcion', :'t0'::timestamptz + interval '4 minutes', :'sp') as _7 \\gset
-- Que las dos filas sueltas de verdad quedaron escritas así (y que no son traslado).
select 'SUELTAS|' || count(*) from retail.movimientos
 where variante_id in (:'s', :'e') and tipo <> 'traslado' and ubicacion_destino_id is null and sububicacion_destino_id is not null;
${FILAS()}`,
  ({ filas, otras }) => {
    afirmar("las dos filas sueltas existen (una salida y una entrada con sububicación de destino)", otras.SUELTAS === "2", `SUELTAS=${otras.SUELTAS}`);
    const s = filas["ZZ-FRE-T36-SALIDA"] ?? [];
    afirmar(
      "SALIDA: la merma del piso con destino suelto no es retiro: retiradas 0, efectiva 2, piso_antes 0, «normal»",
      s.length === 1 && es(s[0], { min: 0, cantidad: 2, pisoAntes: 0, vendidas: 0, retiradas: 0, efectiva: 2, tardias: 0, estado: "normal" }),
      ver(s),
    );
    const e = filas["ZZ-FRE-T36-ENTRADA"] ?? [];
    afirmar(
      "ENTRADA: la recepción con destino suelto no es bajada (una sola fila) ni se lleva el retiro: la de 10:00 retiradas 1, efectiva 1",
      e.length === 1 && es(e[0], { min: 0, cantidad: 2, pisoAntes: 0, retiradas: 1, efectiva: 1, estado: "normal" }),
      ver(e),
    );
  },
);

// ---------------------------------------------------------------------------
// T37 · La guarda del paso 4 (20260929100000) sobre la puerta. Lo que cambia es SOLO el candado y quién ve persona_id:
// para el líder, las filas tienen que ser las mismas que con la puerta de la 120200. (La lectura de una sede y el
// registro al colgar, que la misma migración reescribe, los prueba frescura_lectura, T12 y T12b.)
const FILAS_TEXTO = `(select coalesce(string_agg(concat_ws(':', r.movimiento_id, coalesce(r.persona_id::text, '-'), r.cantidad, r.piso_antes,
  r.vendidas_en_ventana, coalesce(r.unidades_tardias::text, '-'), r.cerrada, r.estado, r.retiradas_en_ventana, r.cantidad_efectiva,
  r.es_carga_inicial), ',' order by r.movimiento_id), '') from retail.fn_bajadas_del_piso(:'ubic') r)`;
correr(
  "T37 · la guarda de 20260929100000 (paso 4): desde la 120200 entra y deja su puerta con las mismas filas para el líder; otra vez no cambia nada; con la puerta o el núcleo parchados aborta y no los pisa; la 120200 después aborta",
  `${DESHACER_CUADRE}
select pg_temp.variante('ZZ-FRE-T37') as v \\gset
select pg_temp.llega(:'v', 10, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz) as _2 \\gset
select pg_temp.vende(:'v', 1, :'t0'::timestamptz + interval '3 minutes') as _3 \\gset
select ${MD5("fn_bajadas_del_piso")} as puerta_p4, ${MD5("fn_bajadas_del_piso_nucleo")} as nucleo_hoy \\gset
select ${FILAS_TEXTO} as filas_p4 \\gset
-- La puerta de antes del paso 4: la de la cadena 0300 → 120100 → 120200 (producción hasta pegar el paso 4).
${BORRAR_LAS_DOS}
select ${intento(MIGRACION_0300)} ->> 'ok' as c1 \\gset
select ${intento(MIGRACION_NUCLEO)} ->> 'ok' as c2 \\gset
select ${intento(MIGRACION_RETIROS)} ->> 'ok' as c3 \\gset
select ${MD5("fn_bajadas_del_piso")} as puerta_antes \\gset
select ${FILAS_TEXTO} as filas_antes \\gset
select ${intento(MIGRACION_P4)} as r1 \\gset
select 'ENTRA|' || :'c1' || ',' || :'c2' || ',' || :'c3' || ',' || :'puerta_antes' || ',' || ((:'r1')::jsonb ->> 'ok')
       || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_p4') || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'nucleo_hoy');
select 'MISMAS|' || (:'filas_antes' = :'filas_p4') || ',' || (${FILAS_TEXTO} = :'filas_p4') || ',' || (length(:'filas_p4') > 0);
select ${intento(MIGRACION_P4)} ->> 'ok' as r2 \\gset
select 'OTRA_VEZ|' || :'r2' || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_p4');
-- La 120200 después del paso 4: su guarda no conoce la puerta nueva, aborta y no la deshace.
select ${intento(MIGRACION_RETIROS)} as r3 \\gset
select 'TARDE|' || ${abortaCon("r3", "cambiaron desde que se escribió")} || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_p4');
-- Alguien parcha la puerta en vivo (las mismas columnas, otro cuerpo): el paso 4 no la pisa.
create or replace function retail.fn_bajadas_del_piso(p_ubicacion_id uuid, p_desde timestamptz default null,
  p_hasta timestamptz default null, p_minutos integer default 10)
returns table (movimiento_id uuid, bajada_id uuid, variante_id uuid, persona_id uuid, bajada_en timestamptz, cantidad integer,
  piso_antes integer, vendidas_en_ventana integer, unidades_tardias integer, cerrada boolean, estado text,
  retiradas_en_ventana integer, cantidad_efectiva integer, es_carga_inicial boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $f$
begin /* parche en vivo de la puerta, tras el paso 4 */ return; end $f$;
select ${MD5("fn_bajadas_del_piso")} as parche \\gset
select ${intento(MIGRACION_P4)} as r4 \\gset
select 'PARCHE_PUERTA|' || ${abortaCon("r4", "fn_bajadas_del_piso tiene otro cuerpo")} || ',' || (${MD5("fn_bajadas_del_piso")} = :'parche');
-- Y con el NÚCLEO parchado (la puerta del paso 4 lee sus columnas por nombre): también aborta.
${BORRAR_LAS_DOS}
select ${intento(MIGRACION_0300)} ->> 'ok' as d1 \\gset
select ${intento(MIGRACION_NUCLEO)} ->> 'ok' as d2 \\gset
select ${intento(MIGRACION_RETIROS)} ->> 'ok' as d3 \\gset
create or replace function retail.fn_bajadas_del_piso_nucleo(p_ubicacion_id uuid, p_desde timestamptz default null,
  p_hasta timestamptz default null, p_minutos integer default 10)
returns table (movimiento_id uuid, bajada_id uuid, variante_id uuid, persona_id uuid, bajada_en timestamptz, cantidad integer,
  piso_antes integer, vendidas_en_ventana integer, unidades_tardias integer, cerrada boolean, estado text,
  retiradas_en_ventana integer, cantidad_efectiva integer, es_carga_inicial boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $f$
begin /* parche en vivo del núcleo, antes del paso 4 */ return; end $f$;
select ${MD5("fn_bajadas_del_piso_nucleo")} as parche_n, ${MD5("fn_bajadas_del_piso")} as puerta_120200 \\gset
select ${intento(MIGRACION_P4)} as r5 \\gset
select 'PARCHE_NUCLEO|' || :'d1' || ',' || :'d2' || ',' || :'d3' || ',' || ${abortaCon("r5", "El núcleo de las bajadas no es el del paso 2")}
       || ',' || (${MD5("fn_bajadas_del_piso_nucleo")} = :'parche_n') || ',' || (${MD5("fn_bajadas_del_piso")} = :'puerta_120200');`,
  ({ otras }) => {
    afirmar(
      "desde la cadena 0300 → 120100 → 120200 (puerta 34a7e0cc…), el paso 4 entra y deja su puerta; el núcleo no cambia",
      otras.ENTRA === "true,true,true,34a7e0cc5f421333761e8bda92a582eb,true,true,true",
      `ENTRA=${otras.ENTRA}`,
    );
    afirmar("para el líder, las filas de la puerta de antes y de la del paso 4 son las mismas (con persona_id)", otras.MISMAS === "true,true,true", `MISMAS=${otras.MISMAS}`);
    afirmar("pegada otra vez: ok y la puerta no cambia", otras.OTRA_VEZ === "true,true", `OTRA_VEZ=${otras.OTRA_VEZ}`);
    afirmar("la 120200 después del paso 4 aborta («cambiaron desde que se escribió») y no deshace la puerta", otras.TARDE === "false,true,true", `TARDE=${otras.TARDE}`);
    afirmar("con la puerta parchada en vivo, el paso 4 aborta nombrándola y el parche sigue", otras.PARCHE_PUERTA === "false,true,true", `PARCHE_PUERTA=${otras.PARCHE_PUERTA}`);
    afirmar(
      "con el núcleo parchado en vivo, el paso 4 aborta («El núcleo de las bajadas no es el del paso 2») y no toca ni el núcleo ni la puerta",
      otras.PARCHE_NUCLEO === "true,true,true,false,true,true,true",
      `PARCHE_NUCLEO=${otras.PARCHE_NUCLEO}`,
    );
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
