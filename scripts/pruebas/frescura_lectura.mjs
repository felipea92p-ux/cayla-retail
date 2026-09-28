#!/usr/bin/env node
/**
 * Prueba del paso 3 de Frescura 3c (ADR-0208, ADR-0246, ADR-0248): la lectura SQL
 * (`supabase/migrations/20260928120300_frescura_lectura.sql`, la de main, y sus correcciones de las revisiones 3 y 5 en
 * `20260928120310_frescura_lectura_revision3.sql`): `fn_es_llegada`, `fn_es_llegada_a_cayla`, `fn_frescura_sede`,
 * `fn_confianza_registro` y `fn_temporada_efectiva_nucleo`.
 *
 * POR QUÉ. La web arma la vara (Kaplan-Meier) y los tramos con lo que devuelve `fn_frescura_sede`: si una prenda colgada
 * sin moverse no llega, si una unidad de la carga inicial llega sin la marca de edad desconocida, o si la temporada sale
 * de la llegada equivocada, la pantalla pinta «Nueva» lo que lleva meses colgado o avisa «Temporada pasada» a lo que
 * acaba de llegar. Y el indicador de confianza culparía al equipo por la carga inicial o por lo que ya corrigió. Nada de
 * eso lo ve una prueba de TypeScript: hace falta el libro de verdad con horas fijadas.
 *
 * QUÉ CUBRE (valores esperados escritos a mano)
 *   T0  forma: una sola versión de cada función; las dos lecturas security definer, stable y con plan a medida;
 *       authenticated las ejecuta y anon y public no; fn_es_llegada immutable y sin EXECUTE para nadie de afuera; el
 *       cuerpo de fn_frescura_sede llama UNA vez a `fn_ledger_puntos(` (con la lista `v_ids`, que nace con coalesce a
 *       '{}' y no se reasigna) y UNA a `fn_bajadas_del_piso_nucleo(`; fn_confianza_registro sin persona_id; la guarda
 *       de la migración que manda (20260928120310) nombra los md5 vivos (de las seis: también
 *       fn_temporada_efectiva_nucleo, sin EXECUTE para nadie de afuera, fn_temporada_efectiva, que conserva sus
 *       permisos, y fn_es_llegada_a_cayla, immutable, sin search_path propio y sin EXECUTE para nadie de afuera);
 *       fn_confianza_registro lee el mes en hora de Lima.
 *   T1  permisos: el líder sí; una integrante (sin líder) no, con la pista frescura_sin_permiso, en las dos (también
 *       fn_confianza_registro sin tienda); anon no (42501); si fn_puede_operar_ubicacion dice que no a esa tienda, el
 *       líder tampoco (hoy un líder opera todas: la prueba la reemplaza dentro de su transacción para vigilar que el
 *       candado la pregunte), y sin tienda fn_confianza_registro igual responde.
 *   T2  qué prendas: la colgada sin movimiento en la ventana aparece con su saldo inicial (marca 4) y su primera
 *       exhibición de hace 149 días; la que solo está en el almacén aparece sin eventos; la que solo está en cuarentena
 *       no; la que se vendió entera en la ventana sí (sin ella no hay vara); la que se vendió antes de la ventana no; la
 *       ventana (desde = ahora − p_dias) y sus bordes.
 *   T2b repuesta a través del borde de la ventana: la primera exhibición es la PRIMERA entrada de toda la historia.
 *   T2c piso, almacén y cuarentena a la vez: almacen_hoy sin la cuarentena.
 *   T2d la primera exhibición es del MODELO+COLOR: la talla agotada antes de la ventana (fuera de la lista) cuenta.
 *   T2e la talla cuyo ÚNICO movimiento de la ventana es la venta sigue en la lista (sin ella el reloj del modelo+color
 *       se acortaba); T2f lo mismo con un ajuste negativo; T2g pasar del almacén a la cuarentena NO es exhibir.
 *   T3  las marcas de cada evento: bajada 2, venta 1, retiro 2; carga inicial por la puerta real y a mano 6 (2 + 4);
 *       carga de otra hora 2; ajuste al piso 4 y su ajuste negativo 0; devolución 4; llegada directo al piso 0; carga
 *       directo al piso 4; cuarentena → piso 2; lo que llega de otra tienda como traslado directo 4; saldo inicial 4 con
 *       oid nulo. El orden de los eventos: hora, saldo inicial primero.
 *   T4  temporada (ADR-0246): la chompa de invierno cargada el 26-set-2026 sale con fin_estacion = inicio de la
 *       primavera 2026 (ya pasó: «Temporada pasada») y el clásico de verano cargado el mismo día NO (es clásico); el
 *       clásico de todo el año sin fin ni estación; la temporada por categoría y por color (origen); sin temporada, todo
 *       nulo; sin llegada, sin fin; en_estacion_ahora = ¿hoy es su estación?; con dos llegadas, manda la ÚLTIMA (con el
 *       calendario 2025 sembrado dentro de la prueba).
 *   T4c una sola llegada en el invierno 2025, todavía colgada: el fin es el de SU llegada, no el de hoy.
 *   T4e la última llegada es la de ESTA tienda (un lote recibido en Trujillo no cuenta), y el fin de estación SÍ lo
 *       cuenta: es una llegada a CAYLA (decisión de Felipe del 2026-09-27).
 *   T4f la temporada cuenta desde que llegó a CAYLA: la chompa que llegó a Trujillo en julio de 2025 y se trasladó en
 *       abril de 2026 conserva el fin de la primavera 2025, en sus dos tallas (la M nunca llegó por su cuenta); la
 *       producción del Taller y la carga inicial de otra tienda son llegada a CAYLA; lo solo trasladado, sin llegada a
 *       CAYLA registrada, no tiene fin.
 *   T4g fn_temporada_efectiva sigue security definer y authenticated (líder e integrante) la llama sin 42501 en las dos
 *       llamadas de la web (la ficha con p_producto_id y la lista paginada de /productos); el control sin security
 *       definer da 42501.
 *   T4d una variante inactiva que sigue colgada conserva su temporada (del producto y del color); fn_temporada_efectiva
 *       ≡ fn_temporada_efectiva_nucleo(…, false) en todo el catálogo y la pantalla de Temporadas no cambia.
 *   T5  color nulo: la prenda sale con color nulo y su temporada del producto.
 *   T6  productos es_prueba y la «Prenda sin registrar» fuera; una tienda donde solo se movió un producto de prueba da
 *       prendas [], eventos {} y tardías [] — con la lista nula el libro SÍ los habría devuelto (se muestra).
 *   T7  Taller, tienda inactiva, tienda con piso y sin almacén, tienda nula o inexistente → {"separa_piso": false}.
 *   T7b la tienda con almacén y sin piso tampoco separa; ni ella, ni la de piso sin almacén, ni una inactiva salen en
 *       fn_confianza_registro().
 *   T8  fn_es_llegada ≡ el predicado de fn_resumen_comparacion: el predicado se LEE del cuerpo vivo de esa función y se
 *       evalúa contra fn_es_llegada en todas las filas del libro del seed y en todas las combinaciones de tipo, motivo y
 *       las tres llaves; 0 diferencias.
 *   T8b fn_es_llegada_a_cayla ≡ fn_es_llegada sin la recepción de un traslado (seed y combinaciones), nunca nula, y la
 *       tabla de verdad de la decisión escrita a mano.
 *   T9  tardías y dudosas: la bajada tardía cerrada sale con su oid y sus unidades; la normal, la corregida, la que sigue
 *       abierta y la dudosa no; la dudosa sale en «dudosas». Ninguna persona en la salida.
 *   T9b con p_dias = 30, las tardías y dudosas son de la ventana; T9c la bajada dudosa de hace 2 minutos (abierta) ya
 *       deja a la prenda en «dudosas».
 *   T10 fn_confianza_registro: cuenta la normal, la tardía y la del retiro parcial (unidades = Σ efectiva); deja fuera
 *       la carga inicial, la corregida, la dudosa, la abierta y la de hace menos de 20 minutos; mes de Lima; una fila
 *       por tienda y mes aunque no haya bajadas; p_meses de 1 a 3; sin tienda, todas las tiendas y nunca el Taller.
 *   T10b sin las bajadas de productos es_prueba (como fn_frescura_sede).
 *   T10c mes de Lima con la sesión en UTC (como producción): la bajada del último día del mes a las 21:00 de Lima.
 *   T10d las tardías se cuentan en UNIDADES: una bajada de 3 con 2 tardías y otra normal de 3 = 2 filas, 6 unidades,
 *       2 tardías, 0,6667.
 *   T2h piso_hoy y almacen_hoy son solo de ESTA tienda: la misma talla con stock en Trujillo no suma.
 *   T11 niveles: 9 filas «pocos_datos», 10 y 19 «aceptable», 20 «solido».
 *   T12 la guarda de 20260928120310: pegada otra vez deja lo mismo; con cualquiera de las seis funciones parchada en
 *       vivo aborta sin tocarla.
 *   T12b el orden de las dos migraciones, desde el estado de producción del 2026-09-27 (ninguna pegada,
 *       fn_temporada_efectiva de 20260928100000): la de main entra y deja sus md5; la corregida entra ENCIMA; la de main
 *       otra vez aborta sin deshacer nada; sin la de main, la corregida la pide. Antes, con la corrección editada en el
 *       mismo archivo, la corregida abortaba culpando a un «parche en vivo» (revisión 4, hallazgo 1).
 *   T13 el contrato con la web: siembra una tienda con de todo (la vara de las blusas, nueva, vieja, carga inicial,
 *       tardía, retiro, dudosa, solo almacén, chompa de invierno con otro lote en Trujillo —su llegada a la tienda y a
 *       CAYLA difieren—, clásico, sin temporada) y exige que la salida de las
 *       dos lecturas tenga la MISMA forma (claves y tipos) que `apps/web/lib/__fixtures__/frescura-sede.json`, la salida
 *       real con la que `frescura-contrato.test.ts` prueba la web. Con FRESCURA_FIXTURE_ESCRIBIR=1 reescribe ese archivo.
 *
 * CÓMO. Como `frescura_bajadas.mjs`: cada caso en su transacción con ROLLBACK y la zona horaria de producción (UTC), en
 * una TIENDA NUEVA (así lo sembrado no se mezcla), movimientos insertados como `postgres` con `created_at` fijado (t0 = ahora − 3 h) en orden cronológico y
 * aplicados con `fn_aplicar_movimiento`, sesión del líder con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:frescura-lectura    → con las migraciones ya aplicadas en el Postgres local
 *   FRESCURA_FIXTURE_ESCRIBIR=1 pnpm pruebas:frescura-lectura    → además rehace el archivo de la web (T13)
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leerMigracion = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8");
/** La lectura como la dejó main (PR #542): la primera versión, que se pega primero y ya no se edita. */
const MIGRACION_0300 = leerMigracion("20260928120300_frescura_lectura.sql");
/** Las correcciones de la revisión 3, en su propio archivo (revisión 4, hallazgo 1): es la que manda hoy. */
const MIGRACION = leerMigracion("20260928120310_frescura_lectura_revision3.sql");
/** El cuerpo de fn_temporada_efectiva de 20260928100000 (el que tiene producción antes de pegar 20260928120310). */
const TEMPORADA_EFECTIVA_0100 = (() => {
  const t = leerMigracion("20260928100000_temporadas_como_atributo.sql");
  const i = t.indexOf("create or replace function retail.fn_temporada_efectiva(");
  return t.slice(i, t.indexOf("\n$$;", i) + 4);
})();
/** Una migración entera como literal de SQL (entre $m$), para ejecutarla con pg_temp.intento dentro del caso. */
const comoLiteral = (sql) => `${"$"}m$${sql.replace(/\\/g, "\\\\")}${"$"}m$`;
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const CENTINELA = "22222222-2222-4222-8222-222222222222"; // «Prenda sin registrar» (ADR-0179)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

/** Todo caso empieza igual: una tienda nueva con piso, almacén y cuarentena, el líder en sesión y el reloj t0. */
const PRELUDIO = `
begin;
-- Producción corre con TimeZone = 'UTC' (consultado el 2026-09-27) y el Postgres de pruebas puede traer otra zona (el
-- desechable trae America/Lima): sin esto, un «mes de Lima» mal escrito pasaría la prueba (revisión 3, caso X4).
set local timezone = 'UTC';
set local request.jwt.claim.sub = '${FELIPE}';
-- fn_actor_persona_id consulta la asistencia de Dynamic: en un Postgres sin Dynamic esas tablas no existen.
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);

-- Cualquier SQL: «ok» o el error (estado, pista, mensaje), sin cortar el caso.
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end $$;

-- Una tienda nueva con sus tres sububicaciones (con p_almacen = false, solo el piso).
create function pg_temp.tienda(p_nombre text, p_almacen boolean default true) returns uuid language plpgsql as $$
declare u uuid;
begin
  insert into retail.ubicaciones (nombre, tipo) values (p_nombre, 'tienda') returning id into u;
  insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (u, 'Piso de venta', 'piso_venta');
  if p_almacen then
    insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
      values (u, 'Almacén de tienda', 'almacen_tienda'), (u, 'Cuarentena', 'cuarentena');
  end if;
  return u;
end $$;
-- psql no sustituye variables dentro de cuerpos entre $$: la tienda en uso viaja como parámetro de sesión.
create function pg_temp.usar(u uuid) returns void language plpgsql as $$
begin
  perform set_config('prueba.ubic', u::text, true);
  perform set_config('prueba.sp', coalesce((select id::text from retail.sububicaciones where ubicacion_id = u and tipo = 'piso_venta'), ''), true);
  perform set_config('prueba.sa', coalesce((select id::text from retail.sububicaciones where ubicacion_id = u and tipo = 'almacen_tienda'), ''), true);
  perform set_config('prueba.sc', coalesce((select id::text from retail.sububicaciones where ubicacion_id = u and tipo = 'cuarentena'), ''), true);
end $$;
select pg_temp.tienda('ZZ Tienda Frescura') as ubic \\gset
select pg_temp.usar(:'ubic') as _u \\gset
select id as sp from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta' \\gset
select id as sa from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda' \\gset
select id as sc from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
select (now() - interval '3 hours') as t0 \\gset
select codigo as c1 from retail.colores order by codigo limit 1 \\gset
select codigo as c2 from retail.colores order by codigo offset 1 limit 1 \\gset

-- Un modelo (desde ADR-0109 todo producto lleva marca y proveedor), con su temporada y categoría si se dan.
create function pg_temp.producto(p_nombre text, p_temporada text default null, p_categoria uuid default null,
                                 p_es_prueba boolean default false) returns uuid language plpgsql as $$
declare p uuid;
begin
  insert into retail.productos (referencia, marca_id, proveedor_id, temporada, categoria_id, es_prueba)
    select 'ZZ ' || p_nombre, mp.marca_id, mp.proveedor_id, p_temporada, p_categoria, p_es_prueba
      from retail.marca_proveedores mp order by mp.created_at limit 1
    returning id into p;
  return p;
end $$;
-- Una prenda (talla × color) con su código = el SKU, para encontrarla en la salida.
create function pg_temp.variante(p_sku text, p_producto uuid default null, p_color text default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into retail.variantes (producto_id, sku, codigo, precio, costo, color_codigo)
    values (coalesce(p_producto, pg_temp.producto(p_sku)), p_sku, p_sku, 100, 40, p_color)
    returning id into v;
  return v;
end $$;
-- Un lote recibido (lo que hace «llegada» a una entrada).
create function pg_temp.lote() returns uuid language sql as $$
  insert into retail.lotes (ubicacion_id, proveedor_id, fecha_recepcion)
    select current_setting('prueba.ubic')::uuid, mp.proveedor_id, now() from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id
$$;
-- Una fila del libro con hora fijada, aplicada al stock en el acto (se llaman en orden cronológico).
create function pg_temp.mov(v uuid, p_tipo text, n int, sub uuid, p_motivo text, cuando timestamptz,
                            sub_destino uuid default null, venta_item uuid default null, p_lote uuid default null)
returns uuid language plpgsql as $$
declare u uuid := current_setting('prueba.ubic')::uuid; m uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                  tipo, cantidad, motivo, venta_item_id, lote_id, created_at)
  values (v, u, sub, case when p_tipo = 'traslado' then u end, sub_destino, p_tipo, n, p_motivo, venta_item, p_lote, cuando)
  returning id into m;
  perform retail.fn_aplicar_movimiento(m);
  return m;
end $$;
-- Llegada del proveedor (entrada con lote), al almacén si no se dice otra sububicación.
create function pg_temp.llega(v uuid, n int, cuando timestamptz, sub uuid default null) returns uuid language sql as $$
  select pg_temp.mov(v, 'entrada', n, coalesce(sub, current_setting('prueba.sa')::uuid), 'recepcion', cuando, null, null, pg_temp.lote())
$$;
-- Bajada (almacén → piso) y retiro (piso → almacén), con la forma de mover_interno.
create function pg_temp.bajada(v uuid, n int, cuando timestamptz) returns uuid language sql as $$
  select pg_temp.mov(v, 'traslado', n, current_setting('prueba.sa')::uuid, 'movimiento_interno', cuando, current_setting('prueba.sp')::uuid)
$$;
create function pg_temp.retiro(v uuid, n int, cuando timestamptz) returns uuid language sql as $$
  select pg_temp.mov(v, 'traslado', n, current_setting('prueba.sp')::uuid, 'movimiento_interno', cuando, current_setting('prueba.sa')::uuid)
$$;
-- Venta desde el piso: la venta y su salida del libro, a la misma hora.
create function pg_temp.vende(v uuid, n int, cuando timestamptz) returns uuid language plpgsql as $$
declare vt uuid; li uuid;
begin
  insert into retail.ventas (ubicacion_id, estado, created_at) values (current_setting('prueba.ubic')::uuid, 'completada', cuando) returning id into vt;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, v, n, 100, 40) returning id into li;
  return pg_temp.mov(v, 'salida', n, current_setting('prueba.sp')::uuid, 'venta', cuando, null, li);
end $$;

-- La lectura de la tienda en uso, y cómo mirarla.
create function pg_temp.lectura(p_dias integer default 120) returns jsonb language sql as $$
  select retail.fn_frescura_sede(current_setting('prueba.ubic')::uuid, p_dias)
$$;
create function pg_temp.prenda(j jsonb, p_codigo text) returns jsonb language sql as $$
  select x from jsonb_array_elements(j -> 'prendas') x where x ->> 'codigo' = p_codigo
$$;
-- Los eventos de una prenda en una línea: «minutos desde t0:delta:marcas», con «S» en lugar de la hora para el saldo
-- inicial (oid nulo).
create function pg_temp.ev(j jsonb, v uuid, t0 timestamptz) returns text language sql as $$
  select coalesce(string_agg(
           case when e ->> 3 is null then 'S' else trim_scale(round(extract(epoch from ((e ->> 0)::timestamptz - t0)) / 60, 3))::text end
           || ':' || (e ->> 1) || ':' || (e ->> 2), ',' order by o), '-')
    from jsonb_array_elements(j -> 'eventos' -> v::text) with ordinality as x(e, o)
$$;
-- Días antes de ahora (para fechas de toda la historia).
create function pg_temp.dias(t text) returns text language sql as $$
  select coalesce(trim_scale(round(extract(epoch from (now() - t::timestamptz)) / 86400, 4))::text, 'null')
$$;
-- Una prenda en una línea: piso, almacén, primera exhibición y última llegada (en días antes de ahora).
create function pg_temp.resumen(j jsonb, p_codigo text) returns text language sql as $$
  select coalesce((select format('piso=%s,alm=%s,primera=%s,llegada=%s', x ->> 'piso_hoy', x ->> 'almacen_hoy',
                                 pg_temp.dias(x ->> 'primera_exhibicion'), pg_temp.dias(x ->> 'ultima_llegada'))
                     from jsonb_array_elements(j -> 'prendas') x where x ->> 'codigo' = p_codigo), 'ausente')
$$;
-- La temporada de una prenda en una línea.
create function pg_temp.temporada(j jsonb, p_codigo text) returns text language sql as $$
  select coalesce((select format('%s|%s|%s', coalesce(x ->> 'temporada', 'null'), coalesce(x ->> 'temporada_origen', 'null'),
                                 x ->> 'es_clasico')
                     from jsonb_array_elements(j -> 'prendas') x where x ->> 'codigo' = p_codigo), 'ausente')
$$;
-- ¿Hoy es la estación de esta temporada? (la regla, calculada aparte con el calendario)
create function pg_temp.hoy_en(p_temporada text) returns text language sql as $$
  select coalesce((select (oc.desde <= now() and (oc.hasta is null or now() < oc.hasta))::text
                     from retail.fn_ocurrencia_temporada(p_temporada, now()) oc), 'null')
$$;
`;

const sesion = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
set local role authenticated;
`;
const COMO_POSTGRES = `reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
`;
/** Una línea `K|clave|valor` con el resultado de una expresión SQL (nulo → «null»). */
const k = (clave, expr) => `select 'K|${clave}|' || coalesce((${expr})::text, 'null');`;

function parsear(salida) {
  const otras = {};
  for (const linea of salida.split("\n")) {
    if (linea.startsWith("K|")) {
      const [, clave, ...resto] = linea.split("|");
      otras[clave] = resto.join("|");
    }
  }
  return otras;
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
const json = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
/** «ok» o el error esperado (estado y pista). */
const error = (s, estado, hint) => {
  const e = json(s);
  return !!e && e.ok === false && e.estado === estado && (hint === undefined || e.hint === hint);
};

function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim();
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 6).join(" ")}`);
    return;
  }
  verificar(parsear(salida), salida);
}

const FIRMA_SEDE = "retail.fn_frescura_sede(uuid, integer)";
const FIRMA_CONF = "retail.fn_confianza_registro(uuid, integer)";
const FIRMA_LLEG = "retail.fn_es_llegada(text, text, uuid, uuid, uuid)";
const FIRMA_LLEG_CAYLA = "retail.fn_es_llegada_a_cayla(text, text, uuid, uuid, uuid)";
const FIRMA_NUCLEO_TEMP = "retail.fn_temporada_efectiva_nucleo(uuid, boolean)";
const FIRMA_TEMP = "retail.fn_temporada_efectiva(uuid)";
const FUNCIONES = ["fn_es_llegada", "fn_es_llegada_a_cayla", "fn_frescura_sede", "fn_confianza_registro", "fn_temporada_efectiva_nucleo", "fn_temporada_efectiva"];
const EN_FUNCIONES = FUNCIONES.map((f) => `'${f}'`).join(", ");
/** ¿`public` (grantee 0) tiene EXECUTE? Un proacl nulo es el valor por defecto: sí. */
const aPublic = (firma) =>
  `(select p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
      from pg_proc p where p.oid = '${firma}'::regprocedure)`;
const veces = (firma, texto) =>
  `(select (length(d) - length(replace(d, '${texto}', ''))) / length('${texto}') from (select pg_get_functiondef('${firma}'::regprocedure) as d) x)`;

// ---------------------------------------------------------------------------
correr(
  "T0 · forma: una versión de cada una, security definer y plan a medida, quién la ejecuta, una llamada al libro y al núcleo",
  `${k("N", `(select string_agg(proname || '=' || n, ',' order by proname) from (select proname, count(*) as n from pg_proc where pronamespace = 'retail'::regnamespace and proname in (${EN_FUNCIONES}) group by proname) x)`)}
${k("F_SEDE", `(select p.prosecdef || ',' || p.provolatile::text || ',' || array_to_string(p.proconfig, ';') from pg_proc p where p.oid = '${FIRMA_SEDE}'::regprocedure)`)}
${k("F_CONF", `(select p.prosecdef || ',' || p.provolatile::text || ',' || array_to_string(p.proconfig, ';') from pg_proc p where p.oid = '${FIRMA_CONF}'::regprocedure)`)}
${k("F_LLEG", `(select p.prosecdef || ',' || p.provolatile::text from pg_proc p where p.oid = '${FIRMA_LLEG}'::regprocedure)`)}
${k("F_LLEG_CAYLA", `(select p.prosecdef || ',' || p.provolatile::text || ',' || coalesce(array_to_string(p.proconfig, ';'), '-') from pg_proc p where p.oid = '${FIRMA_LLEG_CAYLA}'::regprocedure)`)}
${k("F_NUCLEO_TEMP", `(select p.prosecdef || ',' || p.provolatile::text || ',' || array_to_string(p.proconfig, ';') from pg_proc p where p.oid = '${FIRMA_NUCLEO_TEMP}'::regprocedure)`)}
${k("P_NUCLEO_TEMP", `has_function_privilege('authenticated', '${FIRMA_NUCLEO_TEMP}', 'execute') || ',' || has_function_privilege('anon', '${FIRMA_NUCLEO_TEMP}', 'execute') || ',' || ${aPublic(FIRMA_NUCLEO_TEMP)}`)}
${k("P_TEMP", `has_function_privilege('authenticated', '${FIRMA_TEMP}', 'execute') || ',' || has_function_privilege('anon', '${FIRMA_TEMP}', 'execute') || ',' || ${aPublic(FIRMA_TEMP)}`)}
${k("MES_LIMA", `(select d ~ 'date_trunc\\(''month'', v_ahora at time zone ''America/Lima''\\)' and d ~ 'date_trunc\\(''month'', n\\.bajada_en at time zone ''America/Lima''\\)'
  from (select pg_get_functiondef('${FIRMA_CONF}'::regprocedure) as d) x)`)}
${k("P_SEDE", `has_function_privilege('authenticated', '${FIRMA_SEDE}', 'execute') || ',' || has_function_privilege('anon', '${FIRMA_SEDE}', 'execute') || ',' || ${aPublic(FIRMA_SEDE)}`)}
${k("P_CONF", `has_function_privilege('authenticated', '${FIRMA_CONF}', 'execute') || ',' || has_function_privilege('anon', '${FIRMA_CONF}', 'execute') || ',' || ${aPublic(FIRMA_CONF)}`)}
${k("P_LLEG", `has_function_privilege('authenticated', '${FIRMA_LLEG}', 'execute') || ',' || has_function_privilege('anon', '${FIRMA_LLEG}', 'execute') || ',' || ${aPublic(FIRMA_LLEG)}`)}
${k("P_LLEG_CAYLA", `has_function_privilege('authenticated', '${FIRMA_LLEG_CAYLA}', 'execute') || ',' || has_function_privilege('anon', '${FIRMA_LLEG_CAYLA}', 'execute') || ',' || ${aPublic(FIRMA_LLEG_CAYLA)}`)}
${k("LLAMADAS", `${veces(FIRMA_SEDE, "fn_ledger_puntos(")} || ',' || ${veces(FIRMA_SEDE, "fn_bajadas_del_piso_nucleo(")}`)}
${k("LIBRO_CON_LISTA", `(select d ~ 'fn_ledger_puntos\\(p_ubicacion_id, v_desde, v_ids\\)'
    and d ~ 'coalesce\\(array_agg\\(i\\.variante_id\\), ''\\{\\}''::uuid\\[\\]\\) into v_ids'
    and (length(d) - length(replace(d, 'into v_ids', ''))) / length('into v_ids') = 1
    and d !~ 'v_ids\\s*:='
  from (select pg_get_functiondef('${FIRMA_SEDE}'::regprocedure) as d) x)`)}
${k("COLUMNAS_CONF", `(select array_to_string(p.proargnames, ',') from pg_proc p where p.oid = '${FIRMA_CONF}'::regprocedure)`)}
${k("MD5", `(select string_agg(proname || '=' || md5(prosrc), ',' order by proname) from pg_proc where pronamespace = 'retail'::regnamespace and proname in (${EN_FUNCIONES}))`)}`,
  (o) => {
    afirmar(
      "una sola versión de cada una",
      o.N === "fn_confianza_registro=1,fn_es_llegada=1,fn_es_llegada_a_cayla=1,fn_frescura_sede=1,fn_temporada_efectiva=1,fn_temporada_efectiva_nucleo=1",
      `N=${o.N}`,
    );
    const conf = "true,s,search_path=retail, public, extensions;plan_cache_mode=force_custom_plan";
    afirmar("fn_frescura_sede: security definer, stable, search_path y plan a medida", o.F_SEDE === conf, `F_SEDE=${o.F_SEDE}`);
    afirmar("fn_confianza_registro: security definer, stable, search_path y plan a medida", o.F_CONF === conf, `F_CONF=${o.F_CONF}`);
    afirmar("fn_es_llegada: immutable, sin security definer", o.F_LLEG === "false,i", `F_LLEG=${o.F_LLEG}`);
    afirmar(
      "fn_es_llegada_a_cayla: immutable, sin security definer y sin search_path propio (así se expande dentro de la consulta)",
      o.F_LLEG_CAYLA === "false,i,-",
      `F_LLEG_CAYLA=${o.F_LLEG_CAYLA}`,
    );
    afirmar("fn_frescura_sede: authenticated sí, anon no, public no", o.P_SEDE === "true,false,false", `P_SEDE=${o.P_SEDE}`);
    afirmar("fn_confianza_registro: authenticated sí, anon no, public no", o.P_CONF === "true,false,false", `P_CONF=${o.P_CONF}`);
    afirmar("fn_es_llegada: nadie de afuera (ni authenticated, ni anon, ni public)", o.P_LLEG === "false,false,false", `P_LLEG=${o.P_LLEG}`);
    afirmar("fn_es_llegada_a_cayla: nadie de afuera (ni authenticated, ni anon, ni public)", o.P_LLEG_CAYLA === "false,false,false", `P_LLEG_CAYLA=${o.P_LLEG_CAYLA}`);
    afirmar(
      "fn_temporada_efectiva_nucleo: security definer, stable, search_path; nadie de afuera la ejecuta",
      o.F_NUCLEO_TEMP === "true,s,search_path=retail, public, extensions" && o.P_NUCLEO_TEMP === "false,false,false",
      `F_NUCLEO_TEMP=${o.F_NUCLEO_TEMP} P_NUCLEO_TEMP=${o.P_NUCLEO_TEMP}`,
    );
    afirmar("fn_temporada_efectiva conserva sus permisos (authenticated sí, anon no, public no)", o.P_TEMP === "true,false,false", `P_TEMP=${o.P_TEMP}`);
    afirmar(
      "fn_confianza_registro: el mes actual y el de cada bajada, en hora de Lima (el mes actual depende de now(): solo se puede vigilar el texto)",
      o.MES_LIMA === "true",
      `MES_LIMA=${o.MES_LIMA}`,
    );
    afirmar("el cuerpo llama UNA vez a fn_ledger_puntos( y UNA a fn_bajadas_del_piso_nucleo(", o.LLAMADAS === "1,1", `LLAMADAS=${o.LLAMADAS}`);
    afirmar("el libro recibe v_ids, que nace con coalesce(array_agg(...), '{}') y no se reasigna (nunca nulo)", o.LIBRO_CON_LISTA === "true", `LIBRO_CON_LISTA=${o.LIBRO_CON_LISTA}`);
    afirmar(
      "fn_confianza_registro: sus columnas, sin persona_id",
      o.COLUMNAS_CONF === "p_ubicacion_id,p_meses,ubicacion_id,sede,mes,filas,unidades,tardias,confianza,nivel",
      `COLUMNAS_CONF=${o.COLUMNAS_CONF}`,
    );
    const md5 = Object.fromEntries((o.MD5 ?? "").split(",").map((x) => x.split("=")));
    afirmar(
      "la guarda de la migración nombra el md5 vivo de cada función (quien cambie un cuerpo tiene que cambiar la guarda)",
      FUNCIONES.every((f) => md5[f] && MIGRACION.includes(`'${md5[f]}'`)),
      `MD5=${o.MD5}`,
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T1 · permisos: el líder sí; una integrante no (frescura_sin_permiso); anon no; sin operar la tienda, tampoco el líder",
  `${sesion(FELIPE)}${k("LIDER_SEDE", "pg_temp.intento(format('select retail.fn_frescura_sede(%L)', :'ubic'))")}
${k("LIDER_CONF", "pg_temp.intento(format('select * from retail.fn_confianza_registro(%L)', :'ubic'))")}
${k("LIDER_CONF_TODAS", "pg_temp.intento('select * from retail.fn_confianza_registro()')")}
${sesion(MICAELA)}${k("INT_SEDE", "pg_temp.intento(format('select retail.fn_frescura_sede(%L)', :'tru'))")}
${k("INT_CONF", "pg_temp.intento(format('select * from retail.fn_confianza_registro(%L)', :'tru'))")}
${k("INT_CONF_TODAS", "pg_temp.intento('select * from retail.fn_confianza_registro()')")}
reset role;
set local role anon;
${k("ANON_SEDE", "pg_temp.intento(format('select retail.fn_frescura_sede(%L)', :'tru'))")}
${k("ANON_CONF", "pg_temp.intento('select * from retail.fn_confianza_registro()')")}
${COMO_POSTGRES}
-- Hoy un líder opera todas las tiendas: para vigilar que el candado PREGUNTE si opera esta, se le quita solo esta tienda
-- (dentro de la transacción del caso; el ROLLBACK la devuelve).
create or replace function retail.fn_puede_operar_ubicacion(p_ubicacion_id uuid) returns boolean
language sql stable set search_path to 'retail', 'public', 'extensions' as $f$
  select p_ubicacion_id is distinct from current_setting('prueba.ubic')::uuid
     and coalesce(fn_es_lider() or p_ubicacion_id = fn_ubicacion_actual_persona(), false);
$f$;
${sesion(FELIPE)}${k("NO_OPERA_SEDE", "pg_temp.intento(format('select retail.fn_frescura_sede(%L)', :'ubic'))")}
${k("NO_OPERA_CONF", "pg_temp.intento(format('select * from retail.fn_confianza_registro(%L)', :'ubic'))")}
${k("NO_OPERA_OTRA", "pg_temp.intento(format('select retail.fn_frescura_sede(%L)', :'tru'))")}
${k("NO_OPERA_CONF_TODAS", "pg_temp.intento('select * from retail.fn_confianza_registro()')")}
${COMO_POSTGRES}`,
  (o) => {
    afirmar("líder: fn_frescura_sede, fn_confianza_registro de su tienda y de todas", [o.LIDER_SEDE, o.LIDER_CONF, o.LIDER_CONF_TODAS].every((x) => json(x)?.ok === true), `${o.LIDER_SEDE} ${o.LIDER_CONF} ${o.LIDER_CONF_TODAS}`);
    afirmar("integrante de TRU en TRU: P0001, frescura_sin_permiso", error(o.INT_SEDE, "P0001", "frescura_sin_permiso"), o.INT_SEDE);
    afirmar("integrante: fn_confianza_registro de TRU y de todas, P0001 frescura_sin_permiso", error(o.INT_CONF, "P0001", "frescura_sin_permiso") && error(o.INT_CONF_TODAS, "P0001", "frescura_sin_permiso"), `${o.INT_CONF} ${o.INT_CONF_TODAS}`);
    afirmar("anon: 42501 en las dos", error(o.ANON_SEDE, "42501") && error(o.ANON_CONF, "42501"), `${o.ANON_SEDE} ${o.ANON_CONF}`);
    afirmar("líder que no opera esta tienda: fn_frescura_sede P0001 frescura_sin_permiso", error(o.NO_OPERA_SEDE, "P0001", "frescura_sin_permiso"), o.NO_OPERA_SEDE);
    afirmar("líder que no opera esta tienda: fn_confianza_registro(esa) P0001 frescura_sin_permiso", error(o.NO_OPERA_CONF, "P0001", "frescura_sin_permiso"), o.NO_OPERA_CONF);
    afirmar("…y las que sí opera siguen respondiendo (otra tienda; todas en fn_confianza_registro)", json(o.NO_OPERA_OTRA)?.ok === true && json(o.NO_OPERA_CONF_TODAS)?.ok === true, `${o.NO_OPERA_OTRA} ${o.NO_OPERA_CONF_TODAS}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T2 · qué prendas: la colgada sin moverse en la ventana sí (saldo inicial, marca 4); almacén sí; cuarentena no; agotada en la ventana sí, antes no",
  `select pg_temp.variante('ZZ-FL-T2-COLGADA') as va \\gset
select pg_temp.variante('ZZ-FL-T2-ALMACEN') as vb \\gset
select pg_temp.variante('ZZ-FL-T2-CUARENTENA') as vc \\gset
select pg_temp.variante('ZZ-FL-T2-AGOTADA') as vd \\gset
select pg_temp.variante('ZZ-FL-T2-VIEJA-AGOTADA') as ve \\gset
select pg_temp.llega(:'va', 5, now() - interval '150 days') as _1 \\gset
select pg_temp.bajada(:'va', 3, now() - interval '149 days') as _2 \\gset
select pg_temp.llega(:'vb', 4, now() - interval '150 days') as _3 \\gset
select pg_temp.llega(:'vc', 2, now() - interval '150 days', :'sc') as _4 \\gset
select pg_temp.llega(:'ve', 1, now() - interval '150 days') as _5 \\gset
select pg_temp.bajada(:'ve', 1, now() - interval '149 days') as _6 \\gset
select pg_temp.vende(:'ve', 1, now() - interval '140 days') as _7 \\gset
select pg_temp.llega(:'vd', 2, now() - interval '10 days') as _8 \\gset
select pg_temp.bajada(:'vd', 2, now() - interval '9 days') as _9 \\gset
select pg_temp.vende(:'vd', 2, now() - interval '5 days') as _10 \\gset
select pg_temp.lectura() as j \\gset
select pg_temp.lectura(30) as j30 \\gset
${k("COLGADA", "pg_temp.resumen(:'j', 'ZZ-FL-T2-COLGADA')")}
${k("COLGADA_EV", "pg_temp.ev(:'j', :'va', :'t0')")}
${k("COLGADA_S", "(select (e ->> 0)::timestamptz = now() - interval '120 days' from jsonb_array_elements(:'j'::jsonb -> 'eventos' -> (:'va')) e limit 1)")}
${k("COLGADA_30", "pg_temp.resumen(:'j30', 'ZZ-FL-T2-COLGADA') || ' ' || pg_temp.ev(:'j30', :'va', :'t0')")}
${k("ALMACEN", "pg_temp.resumen(:'j', 'ZZ-FL-T2-ALMACEN') || ' ' || pg_temp.ev(:'j', :'vb', :'t0')")}
${k("CUARENTENA", "pg_temp.resumen(:'j', 'ZZ-FL-T2-CUARENTENA')")}
${k("AGOTADA", "pg_temp.resumen(:'j', 'ZZ-FL-T2-AGOTADA')")}
${k("AGOTADA_EV", "(select string_agg((e ->> 1) || ':' || (e ->> 2), ',') from jsonb_array_elements(:'j'::jsonb -> 'eventos' -> (:'vd')) e)")}
${k("VIEJA", "pg_temp.resumen(:'j', 'ZZ-FL-T2-VIEJA-AGOTADA')")}
${k("CABECERA", "(select (j ->> 'separa_piso') || ',' || ((j ->> 'desde')::timestamptz = now() - interval '120 days') || ',' || ((j ->> 'ahora')::timestamptz = now()) || ',' || jsonb_array_length(j -> 'prendas') from (select :'j'::jsonb as j) x)")}
${k("DESDE_30", "((:'j30'::jsonb ->> 'desde')::timestamptz = now() - interval '30 days')")}
${k("UNICAS", "(select count(*) = count(distinct x ->> 'variante_id') from jsonb_array_elements(:'j'::jsonb -> 'prendas') x)")}
${k("DIAS_0", "pg_temp.intento(format('select retail.fn_frescura_sede(%L, 0)', :'ubic'))")}
${k("DIAS_121", "pg_temp.intento(format('select retail.fn_frescura_sede(%L, 121)', :'ubic'))")}
${k("DIAS_NULO", "pg_temp.intento(format('select retail.fn_frescura_sede(%L, null)', :'ubic'))")}
${k("DIAS_1", "pg_temp.intento(format('select retail.fn_frescura_sede(%L, 1)', :'ubic'))")}`,
  (o) => {
    afirmar("colgada hace 149 días sin moverse: aparece con piso 3, almacén 2, primera exhibición 149, llegada 150", o.COLGADA === "piso=3,alm=2,primera=149,llegada=150", `COLGADA=${o.COLGADA}`);
    afirmar("…y su único evento es el saldo inicial: +3, marca 4 (edad desconocida), oid nulo", o.COLGADA_EV === "S:3:4", `COLGADA_EV=${o.COLGADA_EV}`);
    afirmar("…con la hora de «desde» (ahora − 120 días)", o.COLGADA_S === "true", `COLGADA_S=${o.COLGADA_S}`);
    afirmar("a 30 días, igual: la primera exhibición es de toda la historia", o.COLGADA_30 === "piso=3,alm=2,primera=149,llegada=150 S:3:4", `COLGADA_30=${o.COLGADA_30}`);
    afirmar("solo en el almacén: aparece, sin eventos del piso ni primera exhibición", o.ALMACEN === "piso=0,alm=4,primera=null,llegada=150 -", `ALMACEN=${o.ALMACEN}`);
    afirmar("solo en cuarentena (y sin moverse en la ventana): no aparece", o.CUARENTENA === "ausente", `CUARENTENA=${o.CUARENTENA}`);
    afirmar("vendida entera dentro de la ventana: aparece (piso 0, almacén 0) con sus eventos", o.AGOTADA === "piso=0,alm=0,primera=9,llegada=10" && o.AGOTADA_EV === "2:2,-2:1", `AGOTADA=${o.AGOTADA} ${o.AGOTADA_EV}`);
    afirmar("vendida entera antes de la ventana: no aparece", o.VIEJA === "ausente", `VIEJA=${o.VIEJA}`);
    afirmar("cabecera: separa_piso, desde = ahora − 120 días, ahora = now(), 3 prendas", o.CABECERA === "true,true,true,3", `CABECERA=${o.CABECERA}`);
    afirmar("con p_dias = 30, desde = ahora − 30 días", o.DESDE_30 === "true", `DESDE_30=${o.DESDE_30}`);
    afirmar("cada prenda una sola vez", o.UNICAS === "true", `UNICAS=${o.UNICAS}`);
    afirmar("p_dias 0, 121 o nulo → error; 1 → ok", error(o.DIAS_0, "P0001") && error(o.DIAS_121, "P0001") && error(o.DIAS_NULO, "P0001") && json(o.DIAS_1)?.ok === true, `${o.DIAS_0} ${o.DIAS_121} ${o.DIAS_NULO} ${o.DIAS_1}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T2b · repuesta a través del borde de la ventana: colgada hace 149 días, agotada hace 140, vuelta a colgar hace 10 → primera exhibición 149",
  `select pg_temp.variante('ZZ-FL-T2B-REPUESTA') as va \\gset
select pg_temp.llega(:'va', 2, now() - interval '150 days') as _1 \\gset
select pg_temp.bajada(:'va', 2, now() - interval '149 days') as _2 \\gset
select pg_temp.vende(:'va', 2, now() - interval '140 days') as _3 \\gset
select pg_temp.llega(:'va', 2, now() - interval '11 days') as _4 \\gset
select pg_temp.bajada(:'va', 2, now() - interval '10 days') as _5 \\gset
select pg_temp.lectura() as j \\gset
${k("REPUESTA", "pg_temp.resumen(:'j', 'ZZ-FL-T2B-REPUESTA')")}`,
  (o) => afirmar("primera = 149 (toda la historia, la PRIMERA entrada; no la de hace 10), llegada = 11", o.REPUESTA === "piso=2,alm=0,primera=149,llegada=11", `REPUESTA=${o.REPUESTA}`),
);

// ---------------------------------------------------------------------------
correr(
  "T2c · piso, almacén Y cuarentena a la vez: almacen_hoy no cuenta la cuarentena (si la contara, la web sugeriría «Trasladar» lo defectuoso)",
  `select pg_temp.variante('ZZ-FL-T2C') as v \\gset
select pg_temp.llega(:'v', 3, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz - interval '50 minutes') as _2 \\gset
select pg_temp.llega(:'v', 1, :'t0'::timestamptz - interval '40 minutes', :'sc') as _3 \\gset
select pg_temp.lectura() as j \\gset
${k("TRES", "pg_temp.resumen(:'j', 'ZZ-FL-T2C')")}`,
  (o) => afirmar("piso = 2, almacén = 1 (la unidad en cuarentena no es almacén)", (o.TRES ?? "").startsWith("piso=2,alm=1,"), `TRES=${o.TRES}`),
);

// ---------------------------------------------------------------------------
correr(
  "T2d · modelo+color repuesto en OTRA talla: S colgada hace 149 días y agotada hace 140 (no está en la lista); M colgada hace 10 → primera exhibición 149",
  `select pg_temp.producto('T2d Blusa', null, null) as px \\gset
select pg_temp.variante('ZZ-FL-T2D-S', :'px', :'c1') as vs \\gset
select pg_temp.variante('ZZ-FL-T2D-M', :'px', :'c1') as vm \\gset
select pg_temp.variante('ZZ-FL-T2D-OTRO-COLOR', :'px', :'c2') as vo \\gset
select pg_temp.llega(:'vs', 1, now() - interval '150 days') as _1 \\gset
select pg_temp.bajada(:'vs', 1, now() - interval '149 days') as _2 \\gset
select pg_temp.vende(:'vs', 1, now() - interval '140 days') as _3 \\gset
select pg_temp.llega(:'vm', 1, now() - interval '11 days') as _4 \\gset
select pg_temp.bajada(:'vm', 1, now() - interval '10 days') as _5 \\gset
select pg_temp.llega(:'vo', 1, now() - interval '6 days') as _6 \\gset
select pg_temp.bajada(:'vo', 1, now() - interval '5 days') as _7 \\gset
select pg_temp.lectura() as j \\gset
${k("TALLAS", "pg_temp.resumen(:'j', 'ZZ-FL-T2D-S') || ' | ' || pg_temp.resumen(:'j', 'ZZ-FL-T2D-M') || ' | ' || pg_temp.resumen(:'j', 'ZZ-FL-T2D-OTRO-COLOR')")}`,
  (o) => {
    const [s, m, otro] = (o.TALLAS ?? "").split(" | ");
    afirmar("S (agotada antes de la ventana) no está en la lista", s === "ausente", `TALLAS=${o.TALLAS}`);
    afirmar("M lleva la primera exhibición del MODELO+COLOR: 149, no la suya de hace 10 (no vuelve a ser «Nueva»)", m === "piso=1,alm=0,primera=149,llegada=11", `TALLAS=${o.TALLAS}`);
    afirmar("otro color del mismo modelo es otra prenda: su primera exhibición es la suya (5)", otro === "piso=1,alm=0,primera=5,llegada=6", `TALLAS=${o.TALLAS}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T3 · las marcas: 1 venta, 2 interno, 4 edad desconocida (saldo inicial, carga inicial, ajuste, devolución, traslado de otra tienda)",
  `select pg_temp.variante('ZZ-FL-T3-BAJADA') as vbaj \\gset
select pg_temp.variante('ZZ-FL-T3-CARGA-PUERTA') as vcp \\gset
select pg_temp.variante('ZZ-FL-T3-CARGA-MANO') as vcm \\gset
select pg_temp.variante('ZZ-FL-T3-CARGA-OTRA-HORA') as vco \\gset
select pg_temp.variante('ZZ-FL-T3-AJUSTE') as vaj \\gset
select pg_temp.variante('ZZ-FL-T3-DEVOLUCION') as vdev \\gset
select pg_temp.variante('ZZ-FL-T3-LLEGA-PISO') as vlp \\gset
select pg_temp.variante('ZZ-FL-T3-CARGA-PISO') as vcpi \\gset
select pg_temp.variante('ZZ-FL-T3-CUARENTENA-PISO') as vcu \\gset
select pg_temp.variante('ZZ-FL-T3-OTRA-TIENDA') as vot \\gset
select pg_temp.variante('ZZ-FL-T3-SALDO') as vsa \\gset
-- Saldo de antes de la ventana y una bajada dentro.
select pg_temp.llega(:'vsa', 5, now() - interval '150 days') as _0 \\gset
select pg_temp.bajada(:'vsa', 3, now() - interval '149 days') as _1 \\gset
select pg_temp.bajada(:'vsa', 1, :'t0'::timestamptz) as _2 \\gset
-- Una historia normal: llega al almacén, se baja, se vende, se retira.
select pg_temp.llega(:'vbaj', 5, :'t0'::timestamptz - interval '100 minutes') as _3 \\gset
select pg_temp.bajada(:'vbaj', 3, :'t0'::timestamptz - interval '90 minutes') as _4 \\gset
select pg_temp.vende(:'vbaj', 1, :'t0'::timestamptz - interval '80 minutes') as _5 \\gset
select pg_temp.retiro(:'vbaj', 1, :'t0'::timestamptz - interval '70 minutes') as _6 \\gset
-- Carga inicial a mano: la entrada «carga_inicial» al almacén y su bajada en el mismo instante.
select pg_temp.mov(:'vcm', 'entrada', 3, :'sa', 'carga_inicial', :'t0'::timestamptz) as _7 \\gset
select pg_temp.bajada(:'vcm', 3, :'t0'::timestamptz) as _8 \\gset
-- La carga entró 20 minutos antes y la bajada es aparte: esa bajada sí tiene fecha de colgado.
select pg_temp.mov(:'vco', 'entrada', 3, :'sa', 'carga_inicial', :'t0'::timestamptz - interval '20 minutes') as _9 \\gset
select pg_temp.bajada(:'vco', 2, :'t0'::timestamptz) as _10 \\gset
-- Ajuste al piso (+2) y después uno negativo (−1).
select pg_temp.mov(:'vaj', 'ajuste', 2, :'sp', 'conteo', :'t0'::timestamptz) as _11 \\gset
select pg_temp.mov(:'vaj', 'ajuste', -1, :'sp', 'conteo', :'t0'::timestamptz + interval '5 minutes') as _12 \\gset
-- Devolución al piso.
select pg_temp.mov(:'vdev', 'entrada', 1, :'sp', 'devolucion', :'t0'::timestamptz) as _13 \\gset
-- Llegada del proveedor directo al piso: tiene fecha.
select pg_temp.llega(:'vlp', 2, :'t0'::timestamptz, :'sp') as _14 \\gset
-- Carga inicial directo al piso (hoy ninguna puerta la escribe): edad desconocida igual.
select pg_temp.mov(:'vcpi', 'entrada', 2, :'sp', 'carga_inicial', :'t0'::timestamptz) as _15 \\gset
-- Cuarentena → piso: interno, con fecha.
select pg_temp.llega(:'vcu', 1, :'t0'::timestamptz - interval '10 minutes', :'sc') as _16 \\gset
select pg_temp.mov(:'vcu', 'traslado', 1, :'sc', 'movimiento_interno', :'t0'::timestamptz, :'sp') as _17 \\gset
-- De Tienda Trujillo directo al piso de esta tienda como traslado (la forma vieja, sin recepción): edad desconocida.
select id as tru_sa from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
  values (:'vot', :'tru', :'tru_sa', 'entrada', 1, 'compra', :'t0'::timestamptz - interval '30 minutes') returning id as ot1 \\gset
select retail.fn_aplicar_movimiento(:'ot1') as _18 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (:'vot', :'tru', :'tru_sa', :'ubic', :'sp', 'traslado', 1, 'traslado', :'t0'::timestamptz) returning id as ot2 \\gset
select retail.fn_aplicar_movimiento(:'ot2') as _19 \\gset
-- La puerta real de la carga inicial (ADR-0235): entrada «carga_inicial» + bajar_al_piso en una transacción. Como en
-- frescura_bajadas T26, se corre 1 minuto atrás (las DOS filas, siguen en el mismo instante): el núcleo lee hasta now()
-- sin incluirlo.
select retail.cargar_stock_inicial(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'vcp', 'cantidad', 4)), null, true, gen_random_uuid()) as _20 \\gset
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '1 minute' where variante_id = :'vcp';
alter table retail.movimientos enable always trigger movimientos_inmutables;
select pg_temp.lectura() as j \\gset
${k("SALDO", "pg_temp.ev(:'j', :'vsa', :'t0')")}
${k("BAJADA", "pg_temp.ev(:'j', :'vbaj', :'t0')")}
${k("BAJADA_OID", "(select (e ->> 3)::uuid = :'_4'::uuid from jsonb_array_elements(:'j'::jsonb -> 'eventos' -> (:'vbaj')) with ordinality x(e, o) where o = 1)")}
${k("CARGA_PUERTA", "(select string_agg((e ->> 1) || ':' || (e ->> 2), ',') from jsonb_array_elements(:'j'::jsonb -> 'eventos' -> (:'vcp')) e)")}
${k("CARGA_MANO", "pg_temp.ev(:'j', :'vcm', :'t0')")}
${k("CARGA_OTRA_HORA", "pg_temp.ev(:'j', :'vco', :'t0')")}
${k("AJUSTE", "pg_temp.ev(:'j', :'vaj', :'t0')")}
${k("DEVOLUCION", "pg_temp.ev(:'j', :'vdev', :'t0')")}
${k("LLEGA_PISO", "pg_temp.ev(:'j', :'vlp', :'t0')")}
${k("CARGA_PISO", "pg_temp.ev(:'j', :'vcpi', :'t0')")}
${k("CUARENTENA_PISO", "pg_temp.ev(:'j', :'vcu', :'t0')")}
${k("OTRA_TIENDA", "pg_temp.ev(:'j', :'vot', :'t0') || ' ' || pg_temp.resumen(:'j', 'ZZ-FL-T3-OTRA-TIENDA')")}
${k("PRIMERAS", "pg_temp.resumen(:'j', 'ZZ-FL-T3-LLEGA-PISO') || ' ' || pg_temp.resumen(:'j', 'ZZ-FL-T3-AJUSTE')")}`,
  (o) => {
    afirmar("saldo inicial +3 marca 4 (oid nulo) y la bajada de la ventana +1 marca 2, en ese orden", o.SALDO === "S:3:4,0:1:2", `SALDO=${o.SALDO}`);
    afirmar("bajada +3 marca 2, venta −1 marca 1, retiro −1 marca 2 (la llegada al almacén no es del piso)", o.BAJADA === "-90:3:2,-80:-1:1,-70:-1:2", `BAJADA=${o.BAJADA}`);
    afirmar("el oid del evento es el id del movimiento", o.BAJADA_OID === "true", `BAJADA_OID=${o.BAJADA_OID}`);
    afirmar("carga inicial por la puerta real (cargar_stock_inicial con p_al_piso): +4 marca 6 (interno + edad desconocida)", o.CARGA_PUERTA === "4:6", `CARGA_PUERTA=${o.CARGA_PUERTA}`);
    afirmar("carga inicial a mano en el mismo instante: +3 marca 6", o.CARGA_MANO === "0:3:6", `CARGA_MANO=${o.CARGA_MANO}`);
    afirmar("carga 20 minutos antes y bajada aparte: +2 marca 2 (se colgó a esa hora)", o.CARGA_OTRA_HORA === "0:2:2", `CARGA_OTRA_HORA=${o.CARGA_OTRA_HORA}`);
    afirmar("ajuste al piso +2 marca 4; el ajuste negativo, marca 0", o.AJUSTE === "0:2:4,5:-1:0", `AJUSTE=${o.AJUSTE}`);
    afirmar("devolución al piso: marca 4", o.DEVOLUCION === "0:1:4", `DEVOLUCION=${o.DEVOLUCION}`);
    afirmar("llegada del proveedor directo al piso: marca 0 (tiene fecha)", o.LLEGA_PISO === "0:2:0", `LLEGA_PISO=${o.LLEGA_PISO}`);
    afirmar("carga inicial directo al piso: marca 4", o.CARGA_PISO === "0:2:4", `CARGA_PISO=${o.CARGA_PISO}`);
    afirmar("cuarentena → piso: marca 2 (interno, con fecha)", o.CUARENTENA_PISO === "0:1:2", `CUARENTENA_PISO=${o.CUARENTENA_PISO}`);
    afirmar("traslado directo desde otra tienda: marca 4, y cuenta como primera exhibición", o.OTRA_TIENDA === "0:1:4 piso=1,alm=0,primera=0.125,llegada=null", `OTRA_TIENDA=${o.OTRA_TIENDA}`);
    afirmar("la llegada directo al piso y el ajuste positivo son la primera exhibición", o.PRIMERAS === "piso=2,alm=0,primera=0.125,llegada=0.125 piso=1,alm=0,primera=0.125,llegada=null", `PRIMERAS=${o.PRIMERAS}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T4 · temporada: la chompa de invierno cargada el 26-set-2026 es «Temporada pasada»; el clásico de verano del mismo día no",
  `select id as cat from retail.categorias where activo order by nombre limit 1 \\gset
select pg_temp.producto('T4 Chompa', 'invierno') as pch \\gset
select pg_temp.producto('T4 Polo clasico verano', 'clasico_verano') as pcv \\gset
select pg_temp.producto('T4 Basico', 'clasico') as pcl \\gset
select pg_temp.producto('T4 De categoria', null, :'cat') as pcat \\gset
select pg_temp.producto('T4 Por color', 'invierno') as pcol \\gset
select pg_temp.producto('T4 Sin temporada') as psin \\gset
select pg_temp.producto('T4 Sin llegada', 'invierno') as pnol \\gset
update retail.categorias set temporada = 'verano' where id = :'cat';
select pg_temp.variante('ZZ-FL-T4-CHOMPA', :'pch', :'c1') as vch \\gset
select pg_temp.variante('ZZ-FL-T4-CLASICO-VERANO', :'pcv', :'c1') as vcv \\gset
select pg_temp.variante('ZZ-FL-T4-CLASICO', :'pcl', :'c1') as vcl \\gset
select pg_temp.variante('ZZ-FL-T4-CATEGORIA', :'pcat', :'c1') as vcat \\gset
select pg_temp.variante('ZZ-FL-T4-COLOR-1', :'pcol', :'c1') as vcol1 \\gset
select pg_temp.variante('ZZ-FL-T4-COLOR-2', :'pcol', :'c2') as vcol2 \\gset
select pg_temp.variante('ZZ-FL-T4-SIN', :'psin', :'c1') as vsin \\gset
select pg_temp.variante('ZZ-FL-T4-SIN-LLEGADA', :'pnol', :'c1') as vnol \\gset
insert into retail.producto_color_temporadas (producto_id, color_codigo, temporada) values (:'pcol', :'c1', 'otono');
-- La carga inicial del 26-set-2026 al mediodía (hora de Perú), colgada en el mismo instante.
select count(pg_temp.mov(v, 'entrada', 2, :'sa', 'carga_inicial', '2026-09-26 12:00-05')) as _c from unnest(array[:'vch', :'vcv', :'vcl', :'vcat', :'vcol1', :'vcol2', :'vsin']::uuid[]) v \\gset
select count(pg_temp.bajada(v, 2, '2026-09-26 12:00-05')) as _b from unnest(array[:'vch', :'vcv', :'vcl', :'vcat', :'vcol1', :'vcol2', :'vsin']::uuid[]) v \\gset
-- Una entrada sin lote ni carga (no es llegada).
select pg_temp.mov(:'vnol', 'entrada', 2, :'sa', 'compra', now() - interval '10 days') as _n \\gset
-- Una temporada cuya estación es HOY y otra que no (la regla elige cuáles, así la prueba no depende de la fecha).
select clave as t_hoy from retail.temporadas where not es_clasico and pg_temp.hoy_en(clave) = 'true' order by orden limit 1 \\gset
select clave as t_no from retail.temporadas where not es_clasico and pg_temp.hoy_en(clave) = 'false' order by orden limit 1 \\gset
select pg_temp.variante('ZZ-FL-T4-HOY', pg_temp.producto('T4 Hoy', :'t_hoy')) as vhoy \\gset
select pg_temp.variante('ZZ-FL-T4-NO-HOY', pg_temp.producto('T4 No hoy', :'t_no')) as vnohoy \\gset
select pg_temp.llega(:'vhoy', 1, now() - interval '1 day') as _h1 \\gset
select pg_temp.llega(:'vnohoy', 1, now() - interval '1 day') as _h2 \\gset
select pg_temp.lectura() as j \\gset
${k("CHOMPA", "pg_temp.temporada(:'j', 'ZZ-FL-T4-CHOMPA')")}
${k("CHOMPA_FIN", "((pg_temp.prenda(:'j', 'ZZ-FL-T4-CHOMPA') ->> 'fin_estacion')::timestamptz = (select inicio from retail.temporada_fechas where anio = 2026 and estacion = 'primavera'))")}
${k("CHOMPA_LLEGADA", "((pg_temp.prenda(:'j', 'ZZ-FL-T4-CHOMPA') ->> 'ultima_llegada')::timestamptz = '2026-09-26 12:00-05'::timestamptz)")}
${k("CHOMPA_LLEGADA_CAYLA", "((pg_temp.prenda(:'j', 'ZZ-FL-T4-CHOMPA') ->> 'ultima_llegada_cayla')::timestamptz = '2026-09-26 12:00-05'::timestamptz)")}
${k("CHOMPA_PASADA", "(select not (x ->> 'es_clasico')::boolean and (x ->> 'fin_estacion')::timestamptz <= now() from (select pg_temp.prenda(:'j', 'ZZ-FL-T4-CHOMPA') as x) y)")}
${k("CHOMPA_AHORA", "(pg_temp.prenda(:'j', 'ZZ-FL-T4-CHOMPA') ->> 'en_estacion_ahora') = pg_temp.hoy_en('invierno')")}
${k("CV", "pg_temp.temporada(:'j', 'ZZ-FL-T4-CLASICO-VERANO')")}
${k("CV_FIN", "((pg_temp.prenda(:'j', 'ZZ-FL-T4-CLASICO-VERANO') ->> 'fin_estacion')::timestamptz = (select hasta from retail.fn_ocurrencia_temporada('clasico_verano', '2026-09-26 12:00-05')))")}
${k("CV_PASADA", "(select not (x ->> 'es_clasico')::boolean and (x ->> 'fin_estacion')::timestamptz <= now() from (select pg_temp.prenda(:'j', 'ZZ-FL-T4-CLASICO-VERANO') as x) y)")}
${k("CV_AHORA", "(pg_temp.prenda(:'j', 'ZZ-FL-T4-CLASICO-VERANO') ->> 'en_estacion_ahora') = pg_temp.hoy_en('clasico_verano')")}
${k("CLASICO", "(select pg_temp.temporada(:'j', 'ZZ-FL-T4-CLASICO') || '|' || coalesce(x ->> 'fin_estacion', 'null') || '|' || coalesce(x ->> 'en_estacion_ahora', 'null') from (select pg_temp.prenda(:'j', 'ZZ-FL-T4-CLASICO') as x) y)")}
${k("CATEGORIA", "pg_temp.temporada(:'j', 'ZZ-FL-T4-CATEGORIA')")}
${k("COLOR", "pg_temp.temporada(:'j', 'ZZ-FL-T4-COLOR-1') || ' ' || pg_temp.temporada(:'j', 'ZZ-FL-T4-COLOR-2')")}
${k("COLOR_FIN", "((pg_temp.prenda(:'j', 'ZZ-FL-T4-COLOR-1') ->> 'fin_estacion')::timestamptz = (select hasta from retail.fn_ocurrencia_temporada('otono', '2026-09-26 12:00-05')))")}
${k("SIN", "(select pg_temp.temporada(:'j', 'ZZ-FL-T4-SIN') || '|' || coalesce(x ->> 'fin_estacion', 'null') || '|' || coalesce(x ->> 'en_estacion_ahora', 'null') from (select pg_temp.prenda(:'j', 'ZZ-FL-T4-SIN') as x) y)")}
${k("EN_HOY", "(pg_temp.prenda(:'j', 'ZZ-FL-T4-HOY') ->> 'en_estacion_ahora') || ',' || (pg_temp.prenda(:'j', 'ZZ-FL-T4-NO-HOY') ->> 'en_estacion_ahora')")}
${k("SIN_LLEGADA", "(select pg_temp.temporada(:'j', 'ZZ-FL-T4-SIN-LLEGADA') || '|' || coalesce(x ->> 'ultima_llegada', 'null') || '|' || coalesce(x ->> 'ultima_llegada_cayla', 'null') || '|' || coalesce(x ->> 'fin_estacion', 'null') || '|' || ((x ->> 'en_estacion_ahora') = pg_temp.hoy_en('invierno')) from (select pg_temp.prenda(:'j', 'ZZ-FL-T4-SIN-LLEGADA') as x) y)")}`,
  (o) => {
    afirmar("chompa: invierno, del producto, no clásica", o.CHOMPA === "invierno|producto|false", `CHOMPA=${o.CHOMPA}`);
    afirmar("chompa: última llegada = la carga del 26-set", o.CHOMPA_LLEGADA === "true", `CHOMPA_LLEGADA=${o.CHOMPA_LLEGADA}`);
    afirmar("chompa: la carga inicial también es su llegada a CAYLA", o.CHOMPA_LLEGADA_CAYLA === "true", `CHOMPA_LLEGADA_CAYLA=${o.CHOMPA_LLEGADA_CAYLA}`);
    afirmar("chompa: fin_estacion = inicio de la primavera 2026 (el invierno que terminó 4 días antes)", o.CHOMPA_FIN === "true", `CHOMPA_FIN=${o.CHOMPA_FIN}`);
    afirmar("chompa: no es clásica y su estación ya terminó → «Temporada pasada»", o.CHOMPA_PASADA === "true", `CHOMPA_PASADA=${o.CHOMPA_PASADA}`);
    afirmar("chompa: en_estacion_ahora = ¿hoy es invierno?", o.CHOMPA_AHORA === "true", `CHOMPA_AHORA=${o.CHOMPA_AHORA}`);
    afirmar("clásico de verano: clasico_verano, del producto, clásico", o.CV === "clasico_verano|producto|true", `CV=${o.CV}`);
    afirmar("clásico de verano: fin_estacion = el de su aparición (fn_ocurrencia_temporada)", o.CV_FIN === "true", `CV_FIN=${o.CV_FIN}`);
    afirmar("clásico de verano fuera de su estación: NO es «Temporada pasada»", o.CV_PASADA === "false", `CV_PASADA=${o.CV_PASADA}`);
    afirmar("clásico de verano: en_estacion_ahora = ¿hoy es verano?", o.CV_AHORA === "true", `CV_AHORA=${o.CV_AHORA}`);
    afirmar("clásico de todo el año: clásico, sin fin ni estación", o.CLASICO === "clasico|producto|true|null|null", `CLASICO=${o.CLASICO}`);
    afirmar("sin temporada propia y con la de su categoría: verano, origen categoría", o.CATEGORIA === "verano|categoria|false", `CATEGORIA=${o.CATEGORIA}`);
    afirmar("el color manda sobre el producto: otoño (color) y el otro color invierno (producto)", o.COLOR === "otono|color|false invierno|producto|false", `COLOR=${o.COLOR}`);
    afirmar("…y el fin es el de SU temporada (otoño)", o.COLOR_FIN === "true", `COLOR_FIN=${o.COLOR_FIN}`);
    afirmar("sin temporada: todo nulo y no clásica", o.SIN === "null|null|false|null|null", `SIN=${o.SIN}`);
    afirmar("en_estacion_ahora: true para la temporada cuya estación es hoy, false para una que no", o.EN_HOY === "true,false", `EN_HOY=${o.EN_HOY}`);
    afirmar(
      "sin ninguna llegada (a la tienda ni a CAYLA): sin fin_estacion (pero sí sabe si hoy es su estación)",
      o.SIN_LLEGADA === "invierno|producto|false|null|null|null|true",
      `SIN_LLEGADA=${o.SIN_LLEGADA}`,
    );
  },
);

// ---------------------------------------------------------------------------
correr(
  "T4 (la última llegada) · con dos llegadas en dos inviernos, el fin es el del invierno de la ÚLTIMA; la primera exhibición es la más vieja",
  `-- El calendario no trae 2025 (ADR-0246): se siembra aquí, dentro de la prueba y por fuera de sus candados.
alter table retail.temporada_fechas disable trigger user;
insert into retail.temporada_fechas (anio, estacion, inicio, fuente) values
  (2025, 'otono', '2025-03-20 04:01-05', 'usno'), (2025, 'invierno', '2025-06-20 21:42-05', 'usno'),
  (2025, 'primavera', '2025-09-22 13:19-05', 'usno'), (2025, 'verano', '2025-12-21 10:03-05', 'usno')
on conflict do nothing;
alter table retail.temporada_fechas enable trigger user;
select pg_temp.producto('T4b Chompa', 'invierno') as pch \\gset
select pg_temp.variante('ZZ-FL-T4B-CHOMPA', :'pch') as vch \\gset
select pg_temp.llega(:'vch', 3, '2025-07-15 12:00-05') as _1 \\gset
select pg_temp.bajada(:'vch', 2, '2025-07-16 12:00-05') as _2 \\gset
select pg_temp.llega(:'vch', 3, '2026-07-15 12:00-05') as _3 \\gset
select pg_temp.lectura() as j \\gset
${k("LLEGADA", "((pg_temp.prenda(:'j', 'ZZ-FL-T4B-CHOMPA') ->> 'ultima_llegada')::timestamptz = '2026-07-15 12:00-05'::timestamptz)")}
${k("PRIMERA", "((pg_temp.prenda(:'j', 'ZZ-FL-T4B-CHOMPA') ->> 'primera_exhibicion')::timestamptz = '2025-07-16 12:00-05'::timestamptz)")}
${k("FIN", "((pg_temp.prenda(:'j', 'ZZ-FL-T4B-CHOMPA') ->> 'fin_estacion')::timestamptz = (select inicio from retail.temporada_fechas where anio = 2026 and estacion = 'primavera'))")}
${k("FIN_SI_FUERA_LA_PRIMERA", "((select hasta from retail.fn_ocurrencia_temporada('invierno', '2025-07-15 12:00-05')) = (select inicio from retail.temporada_fechas where anio = 2025 and estacion = 'primavera'))")}`,
  (o) => {
    afirmar("última llegada = la de 2026", o.LLEGADA === "true", `LLEGADA=${o.LLEGADA}`);
    afirmar("primera exhibición = la bajada de 2025 (toda la historia)", o.PRIMERA === "true", `PRIMERA=${o.PRIMERA}`);
    afirmar("fin_estacion = inicio de la primavera 2026 (el invierno de la última llegada)", o.FIN === "true", `FIN=${o.FIN}`);
    afirmar("(con la primera llegada habría sido la primavera 2025: el caso distingue)", o.FIN_SI_FUERA_LA_PRIMERA === "true", `FIN_SI_FUERA_LA_PRIMERA=${o.FIN_SI_FUERA_LA_PRIMERA}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T4c · una sola llegada, en el invierno 2025, y todavía colgada: fin = primavera 2025 (la de su llegada, no la de hoy) → «Temporada pasada»",
  `alter table retail.temporada_fechas disable trigger user;
insert into retail.temporada_fechas (anio, estacion, inicio, fuente) values
  (2025, 'otono', '2025-03-20 04:01-05', 'usno'), (2025, 'invierno', '2025-06-20 21:42-05', 'usno'),
  (2025, 'primavera', '2025-09-22 13:19-05', 'usno'), (2025, 'verano', '2025-12-21 10:03-05', 'usno')
on conflict do nothing;
alter table retail.temporada_fechas enable trigger user;
select pg_temp.producto('T4c Chompa', 'invierno') as pch \\gset
select pg_temp.variante('ZZ-FL-T4C-CHOMPA', :'pch') as vch \\gset
select pg_temp.llega(:'vch', 3, '2025-07-15 12:00-05') as _1 \\gset
select pg_temp.bajada(:'vch', 2, '2025-07-16 12:00-05') as _2 \\gset
select pg_temp.lectura() as j \\gset
${k("FIN", "((pg_temp.prenda(:'j', 'ZZ-FL-T4C-CHOMPA') ->> 'fin_estacion')::timestamptz = (select inicio from retail.temporada_fechas where anio = 2025 and estacion = 'primavera'))")}`,
  (o) => afirmar("fin_estacion = inicio de la primavera 2025", o.FIN === "true", `FIN=${o.FIN}`),
);

// ---------------------------------------------------------------------------
correr(
  "T4d · una talla descontinuada (variante inactiva) que sigue colgada conserva su temporada (del producto y del color); la pantalla de Temporadas no cambia",
  `select pg_temp.producto('T4d Chompa', 'invierno') as pa \\gset
select pg_temp.variante('ZZ-FL-T4D-INACTIVA', :'pa', :'c1') as vi \\gset
select pg_temp.variante('ZZ-FL-T4D-ACTIVA', :'pa', :'c2') as va \\gset
select pg_temp.producto('T4d Blusa') as pb \\gset
select pg_temp.variante('ZZ-FL-T4D-COLOR-INACTIVO', :'pb', :'c1') as vc \\gset
insert into retail.producto_color_temporadas (producto_id, color_codigo, temporada) values (:'pb', :'c1', 'otono');
select count(pg_temp.llega(v, 3, '2026-07-15 12:00-05')) as _l from unnest(array[:'vi', :'va', :'vc']::uuid[]) v \\gset
select count(pg_temp.bajada(v, 2, '2026-07-16 12:00-05')) as _b from unnest(array[:'vi', :'va', :'vc']::uuid[]) v \\gset
update retail.variantes set activo = false where id in (:'vi', :'vc');
select pg_temp.lectura() as j \\gset
${k("INACTIVA", "pg_temp.temporada(:'j', 'ZZ-FL-T4D-INACTIVA') || '|' || coalesce((pg_temp.prenda(:'j', 'ZZ-FL-T4D-INACTIVA') ->> 'fin_estacion')::timestamptz = (pg_temp.prenda(:'j', 'ZZ-FL-T4D-ACTIVA') ->> 'fin_estacion')::timestamptz, false)")}
${k("ACTIVA", "pg_temp.temporada(:'j', 'ZZ-FL-T4D-ACTIVA')")}
${k("COLOR_INACTIVO", "pg_temp.temporada(:'j', 'ZZ-FL-T4D-COLOR-INACTIVO') || '|' || ((pg_temp.prenda(:'j', 'ZZ-FL-T4D-COLOR-INACTIVO') ->> 'fin_estacion') is not null)")}
${k("PANTALLA", "(select coalesce(string_agg(coalesce(color_codigo, 'null'), ',' order by color_codigo), '-') from retail.fn_temporada_efectiva(:'pa')) = :'c2' and not exists (select 1 from retail.fn_temporada_efectiva(:'pb'))")}
${k("NUCLEO_CON", "(select string_agg(color_codigo || '=' || temporada || ':' || origen, ',' order by color_codigo) from retail.fn_temporada_efectiva_nucleo(:'pa', true))")}
-- El envoltorio da EXACTAMENTE lo que el núcleo sin inactivas, en todo el catálogo (en los dos sentidos).
${k("IGUALES", "(select count(*) from ((select * from retail.fn_temporada_efectiva(null) except all select * from retail.fn_temporada_efectiva_nucleo(null, false)) union all (select * from retail.fn_temporada_efectiva_nucleo(null, false) except all select * from retail.fn_temporada_efectiva(null))) x) || ',' || (select count(*) > 0 from retail.fn_temporada_efectiva(null))")}`,
  (o) => {
    afirmar("inactiva: invierno del producto, con el mismo fin de estación que la talla activa", o.INACTIVA === "invierno|producto|false|true", `INACTIVA=${o.INACTIVA}`);
    afirmar("…la activa, igual que siempre", o.ACTIVA === "invierno|producto|false", `ACTIVA=${o.ACTIVA}`);
    afirmar("color inactivo con excepción de color: otoño, origen color, con fin", o.COLOR_INACTIVO === "otono|color|false|true", `COLOR_INACTIVO=${o.COLOR_INACTIVO}`);
    afirmar("la pantalla de Temporadas (fn_temporada_efectiva) sigue sin mostrar lo inactivo", o.PANTALLA === "true", `PANTALLA=${o.PANTALLA}`);
    afirmar("el núcleo con inactivas sí las ve", o.NUCLEO_CON?.split(",").length === 2 && o.NUCLEO_CON.includes("=invierno:producto"), `NUCLEO_CON=${o.NUCLEO_CON}`);
    afirmar("fn_temporada_efectiva(null) ≡ fn_temporada_efectiva_nucleo(null, false): 0 filas distintas, con filas", o.IGUALES === "0,true", `IGUALES=${o.IGUALES}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T5 · color nulo: la prenda sale con color nulo y la temporada de su producto",
  `select pg_temp.producto('T5 Sin color', 'verano') as p \\gset
select pg_temp.variante('ZZ-FL-T5-SIN-COLOR', :'p') as v \\gset
select pg_temp.llega(:'v', 2, :'t0'::timestamptz) as _1 \\gset
select pg_temp.bajada(:'v', 1, :'t0'::timestamptz + interval '1 minute') as _2 \\gset
select pg_temp.lectura() as j \\gset
${k("SIN_COLOR", "(select coalesce(x ->> 'color_codigo', 'null') || '|' || coalesce(x ->> 'color_nombre', 'null') || '|' || pg_temp.temporada(:'j', 'ZZ-FL-T5-SIN-COLOR') || '|' || (x ->> 'piso_hoy') from (select pg_temp.prenda(:'j', 'ZZ-FL-T5-SIN-COLOR') as x) y)")}`,
  (o) => {
    afirmar("color nulo, nombre nulo, verano del producto, piso 1", o.SIN_COLOR === "null|null|verano|producto|false|1", `SIN_COLOR=${o.SIN_COLOR}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T6 · productos de prueba y la «Prenda sin registrar» fuera; una tienda que solo movió un producto de prueba da todo vacío (la lista nunca va nula)",
  `select pg_temp.producto('T6 Prueba', null, null, true) as pp \\gset
select pg_temp.variante('ZZ-FL-T6-PRUEBA', :'pp') as vp \\gset
select pg_temp.variante('ZZ-FL-T6-REAL') as vr \\gset
select pg_temp.llega(:'vp', 3, :'t0'::timestamptz - interval '30 minutes') as _1 \\gset
select pg_temp.bajada(:'vp', 2, :'t0'::timestamptz) as _2 \\gset
select pg_temp.vende(:'vp', 1, :'t0'::timestamptz + interval '2 minutes') as _3 \\gset
select pg_temp.llega(:'vr', 3, :'t0'::timestamptz - interval '30 minutes') as _4 \\gset
select pg_temp.bajada(:'vr', 2, :'t0'::timestamptz) as _5 \\gset
select pg_temp.mov('${CENTINELA}', 'entrada', 1, :'sp', 'regularizacion', :'t0'::timestamptz) as _6 \\gset
select pg_temp.lectura() as j \\gset
${k("CODIGOS", "(select string_agg(x ->> 'codigo', ',' order by x ->> 'codigo') from jsonb_array_elements(:'j'::jsonb -> 'prendas') x)")}
${k("EVENTOS", "(select string_agg(k, ',' order by k) from jsonb_object_keys(:'j'::jsonb -> 'eventos') k) = :'vr'")}
${k("TARDIAS", "(:'j'::jsonb -> 'tardias')")}
-- Una tienda donde SOLO se movió el producto de prueba (con una bajada tardía).
select pg_temp.tienda('ZZ Tienda Solo Prueba') as ub2 \\gset
select pg_temp.usar(:'ub2') as _u \\gset
select pg_temp.variante('ZZ-FL-T6-PRUEBA-2', :'pp') as vp2 \\gset
select pg_temp.llega(:'vp2', 3, :'t0'::timestamptz - interval '30 minutes') as _7 \\gset
select pg_temp.bajada(:'vp2', 2, :'t0'::timestamptz) as _8 \\gset
select pg_temp.vende(:'vp2', 2, :'t0'::timestamptz + interval '2 minutes') as _9 \\gset
select pg_temp.lectura() as j2 \\gset
${k("SOLO_PRUEBA", "(select (j -> 'prendas')::text || ' ' || (j -> 'eventos')::text || ' ' || (j -> 'tardias')::text || ' ' || (j -> 'dudosas')::text from (select :'j2'::jsonb as j) x)")}
${k("CON_NULO_EL_LIBRO_SI", "(select count(*) from retail.fn_ledger_puntos(:'ub2', now() - interval '120 days', null) where bucket = 'piso')")}`,
  (o) => {
    afirmar("solo la prenda real (ni la de prueba ni la «Prenda sin registrar»)", o.CODIGOS === "ZZ-FL-T6-REAL", `CODIGOS=${o.CODIGOS}`);
    afirmar("eventos solo de la prenda real", o.EVENTOS === "true", `EVENTOS=${o.EVENTOS}`);
    afirmar("la bajada tardía del producto de prueba no sale en tardías", o.TARDIAS === "[]", `TARDIAS=${o.TARDIAS}`);
    afirmar("tienda que solo movió un producto de prueba: prendas [], eventos {}, tardías [], dudosas []", o.SOLO_PRUEBA === "[] {} [] []", `SOLO_PRUEBA=${o.SOLO_PRUEBA}`);
    afirmar("(con la lista nula, el libro SÍ habría devuelto sus puntos: la prueba distingue)", Number(o.CON_NULO_EL_LIBRO_SI) > 0, `CON_NULO_EL_LIBRO_SI=${o.CON_NULO_EL_LIBRO_SI}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T7 · Taller, tienda inactiva, tienda sin almacén, nula o inexistente → {\"separa_piso\": false}",
  `select pg_temp.tienda('ZZ Tienda Inactiva') as inactiva \\gset
update retail.ubicaciones set activo = false where id = :'inactiva';
select pg_temp.tienda('ZZ Tienda Sin Almacen', false) as sin_alm \\gset
${k("TALLER", "retail.fn_frescura_sede(:'taller')")}
${k("INACTIVA", "retail.fn_frescura_sede(:'inactiva')")}
${k("SIN_ALMACEN", "retail.fn_frescura_sede(:'sin_alm')")}
${k("NULA", "retail.fn_frescura_sede(null)")}
${k("INEXISTENTE", "retail.fn_frescura_sede(gen_random_uuid())")}`,
  (o) => {
    for (const c of ["TALLER", "INACTIVA", "SIN_ALMACEN", "NULA", "INEXISTENTE"]) {
      afirmar(`${c.toLowerCase().replace("_", " ")}: {"separa_piso": false}`, o[c] === '{"separa_piso": false}', `${c}=${o[c]}`);
    }
  },
);

// ---------------------------------------------------------------------------
correr(
  "T8 · fn_es_llegada ≡ el predicado de fn_resumen_comparacion (leído de su cuerpo vivo): 0 diferencias en el libro del seed y en todas las combinaciones",
  `-- El predicado, tal como está HOY dentro de fn_resumen_comparacion (CTE entradas). Si alguien lo cambia allá, esta
-- prueba evalúa el nuevo y avisa si fn_es_llegada quedó atrás.
select substring(pg_get_functiondef('retail.fn_resumen_comparacion(uuid, date, date, date, date)'::regprocedure)
                 from $r$m\\.tipo = 'entrada'\\s+and \\(m\\.lote_id is not null[^\\n]*\\)$r$) as pred \\gset
select md5(:'pred') as pred_md5 \\gset
create temp table combos as
  select t.tipo, mo.motivo, l.lote_id, pr.produccion_id, tr.transferencia_recepcion_id
    from (values ('entrada'), ('salida'), ('ajuste'), ('traslado'), ('apartado'), ('liberacion_apartado'), (null)) t(tipo)
    cross join (select distinct motivo from retail.movimientos union select 'carga_inicial' union select 'recepcion' union select null) mo
    cross join (values (null::uuid), (gen_random_uuid())) l(lote_id)
    cross join (values (null::uuid), (gen_random_uuid())) pr(produccion_id)
    cross join (values (null::uuid), (gen_random_uuid())) tr(transferencia_recepcion_id);
create function pg_temp.diferencias(p_pred text, p_tabla text) returns text language plpgsql as $f$
declare n_dif bigint; n_si bigint; n_no bigint; n bigint;
begin
  execute format('select count(*) filter (where retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id) is distinct from coalesce((%s), false)),
                         count(*) filter (where retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)),
                         count(*) filter (where not retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)),
                         count(*)
                    from %s m', p_pred, p_tabla) into n_dif, n_si, n_no, n;
  return format('dif=%s,si=%s,no=%s,total=%s', n_dif, (n_si > 0)::text, (n_no > 0)::text, n);
end $f$;
${k("PRED", "(:'pred' is not null)")}
${k("SEED", "pg_temp.diferencias(:'pred', 'retail.movimientos')")}
${k("COMBOS", "pg_temp.diferencias(:'pred', 'combos')")}
${k("NULOS", "(select count(*) from combos m where retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id) is null)")}`,
  (o) => {
    afirmar("el predicado se encontró en el cuerpo vivo de fn_resumen_comparacion", o.PRED === "true", `PRED=${o.PRED}`);
    afirmar("libro del seed: 0 diferencias, con llegadas y no llegadas", /^dif=0,si=true,no=true,total=\d+$/.test(o.SEED ?? ""), `SEED=${o.SEED}`);
    afirmar("todas las combinaciones (tipo × motivo × lote × producción × recepción): 0 diferencias", /^dif=0,si=true,no=true,total=\d+$/.test(o.COMBOS ?? ""), `COMBOS=${o.COMBOS}`);
    afirmar("fn_es_llegada nunca devuelve nulo", o.NULOS === "0", `NULOS=${o.NULOS}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T9 · tardías (cerradas, ni dudosa ni corregida) y dudosas del núcleo; ninguna persona en la salida",
  `select pg_temp.variante('ZZ-FL-T9-TARDIA') as vt \\gset
select pg_temp.variante('ZZ-FL-T9-NORMAL') as vn \\gset
select pg_temp.variante('ZZ-FL-T9-CORREGIDA') as vc \\gset
select pg_temp.variante('ZZ-FL-T9-ABIERTA') as va \\gset
select pg_temp.variante('ZZ-FL-T9-DUDOSA') as vd \\gset
select count(pg_temp.llega(v, 10, :'t0'::timestamptz - interval '60 minutes')) as _l from unnest(array[:'vt', :'vn', :'vc', :'va', :'vd']::uuid[]) v \\gset
-- Tardía: piso 0, se baja 1 y a los 3 minutos se vende 1.
select pg_temp.bajada(:'vt', 1, :'t0'::timestamptz) as bt \\gset
select pg_temp.vende(:'vt', 1, :'t0'::timestamptz + interval '3 minutes') as _1 \\gset
-- Normal: piso 5, se bajan 3, se venden 2.
select pg_temp.bajada(:'vn', 5, :'t0'::timestamptz - interval '30 minutes') as _2 \\gset
select pg_temp.bajada(:'vn', 3, :'t0'::timestamptz) as _3 \\gset
select pg_temp.vende(:'vn', 2, :'t0'::timestamptz + interval '2 minutes') as _4 \\gset
-- Corregida: se bajan 2 y al minuto se retiran 2; se vende 1 de lo que ya estaba.
select pg_temp.bajada(:'vc', 1, :'t0'::timestamptz - interval '30 minutes') as _5 \\gset
select pg_temp.bajada(:'vc', 2, :'t0'::timestamptz) as _6 \\gset
select pg_temp.retiro(:'vc', 2, :'t0'::timestamptz + interval '1 minute') as _7 \\gset
select pg_temp.vende(:'vc', 1, :'t0'::timestamptz + interval '3 minutes') as _8 \\gset
-- Abierta: bajada de hace 2 minutos y ya vendida («tardia», pero sin cerrar).
select pg_temp.bajada(:'va', 1, now() - interval '2 minutes') as _9 \\gset
select pg_temp.vende(:'va', 1, now() - interval '1 minute') as _10 \\gset
-- Dudosa: el stock del piso tocado a mano (0 cuando el libro dice 1).
select pg_temp.bajada(:'vd', 2, :'t0'::timestamptz) as _11 \\gset
select pg_temp.vende(:'vd', 1, :'t0'::timestamptz + interval '3 minutes') as _12 \\gset
update retail.stock set cantidad = 0 where variante_id = :'vd' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
select pg_temp.lectura() as j \\gset
${k("TARDIAS", "(select string_agg(v.codigo || ':' || (t ->> 'unidades_tardias') || ':' || ((t ->> 'oid') = :'bt') || ':' || ((t ->> 'bajada_en')::timestamptz = :'t0'::timestamptz), ',' order by v.codigo) from jsonb_array_elements(:'j'::jsonb -> 'tardias') t join retail.variantes v on v.id = (t ->> 'variante_id')::uuid)")}
${k("DUDOSAS", "(select string_agg(v.codigo, ',' order by v.codigo) from jsonb_array_elements_text(:'j'::jsonb -> 'dudosas') d join retail.variantes v on v.id = d::uuid)")}
${k("CLAVES_TARDIA", "(select string_agg(k, ',' order by k) from jsonb_object_keys(:'j'::jsonb -> 'tardias' -> 0) k)")}
${k("PERSONA", "(:'j'::jsonb)::text ~* 'persona'")}
${k("CLAVES_PRENDA", "(select string_agg(k, ',' order by k) from jsonb_object_keys(:'j'::jsonb -> 'prendas' -> 0) k)")}
${k("CLAVES", "(select string_agg(k, ',' order by k) from jsonb_object_keys(:'j'::jsonb) k)")}`,
  (o) => {
    afirmar("solo la tardía cerrada: 1 unidad, con el oid de su bajada y su hora", o.TARDIAS === "ZZ-FL-T9-TARDIA:1:true:true", `TARDIAS=${o.TARDIAS}`);
    afirmar("la dudosa sale en «dudosas» (y no en tardías)", o.DUDOSAS === "ZZ-FL-T9-DUDOSA", `DUDOSAS=${o.DUDOSAS}`);
    afirmar("cada tardía: oid, variante_id, bajada_en, unidades_tardias", o.CLAVES_TARDIA === "bajada_en,oid,unidades_tardias,variante_id", `CLAVES_TARDIA=${o.CLAVES_TARDIA}`);
    afirmar("ninguna persona en la salida", o.PERSONA === "false", `PERSONA=${o.PERSONA}`);
    afirmar(
      "cada prenda trae las claves del contrato",
      o.CLAVES_PRENDA === "almacen_hoy,categoria_id,categoria_nombre,codigo,color_codigo,color_nombre,en_estacion_ahora,es_clasico,fin_estacion,piso_hoy,primera_exhibicion,producto_id,producto_nombre,talla,temporada,temporada_origen,ultima_llegada,ultima_llegada_cayla,variante_id",
      `CLAVES_PRENDA=${o.CLAVES_PRENDA}`,
    );
    afirmar("la lectura trae las claves del contrato", o.CLAVES === "ahora,desde,dudosas,eventos,prendas,separa_piso,tardias", `CLAVES=${o.CLAVES}`);
  },
);

// ---------------------------------------------------------------------------
// Las bajadas de la confianza van a una hora tb (hace unos 41 minutos) elegida para que el minuto que ocupan no cruce
// el cambio de mes de Lima: así la fila del mes es una sola y la prueba no depende de la hora del día.
const TB = `select case when date_trunc('month', (now() - interval '39 minutes') at time zone 'America/Lima')
                          <> date_trunc('month', (now() - interval '42 minutes') at time zone 'America/Lima')
                     then now() - interval '44 minutes' else now() - interval '41 minutes' end as tb \\gset
select date_trunc('month', :'tb'::timestamptz at time zone 'America/Lima')::date as mes \\gset`;
const FILA = (clave, ubic, meses = 2) =>
  k(clave, `(select filas || ',' || unidades || ',' || tardias || ',' || coalesce(confianza::text, 'null') || ',' || coalesce(nivel, 'null')
      from retail.fn_confianza_registro(${ubic}, ${meses}) where mes = :'mes')`);

correr(
  "T10 · fn_confianza_registro: cuentan la normal, la tardía y el retiro parcial (Σ efectiva); fuera la carga inicial, corregida, dudosa, abierta y la de hace < 20 minutos",
  `${TB}
select pg_temp.variante('ZZ-FL-T10-NORMAL') as vn \\gset
select pg_temp.variante('ZZ-FL-T10-TARDIA') as vt \\gset
select pg_temp.variante('ZZ-FL-T10-PARCIAL') as vp \\gset
select pg_temp.variante('ZZ-FL-T10-CARGA') as vca \\gset
select pg_temp.variante('ZZ-FL-T10-CORREGIDA') as vco \\gset
select pg_temp.variante('ZZ-FL-T10-DUDOSA') as vd \\gset
select pg_temp.variante('ZZ-FL-T10-RECIENTE') as vr \\gset
select pg_temp.variante('ZZ-FL-T10-ABIERTA') as va \\gset
select count(pg_temp.llega(v, 20, :'tb'::timestamptz - interval '30 minutes')) as _l from unnest(array[:'vn', :'vt', :'vp', :'vco', :'vd', :'vr', :'va']::uuid[]) v \\gset
-- Normal (3), tardía (2, con 1 vendida a los 3 s del piso vacío), parcial (10 y se retiran 4: efectiva 6).
select pg_temp.bajada(:'vn', 3, :'tb'::timestamptz) as _1 \\gset
select pg_temp.bajada(:'vt', 2, :'tb'::timestamptz + interval '1 second') as _2 \\gset
select pg_temp.vende(:'vt', 1, :'tb'::timestamptz + interval '4 seconds') as _3 \\gset
select pg_temp.bajada(:'vp', 10, :'tb'::timestamptz + interval '2 seconds') as _4 \\gset
select pg_temp.retiro(:'vp', 4, :'tb'::timestamptz + interval '5 seconds') as _5 \\gset
-- Carga inicial a mano (con una venta que la haría tardía): fuera.
select pg_temp.mov(:'vca', 'entrada', 3, :'sa', 'carga_inicial', :'tb'::timestamptz + interval '3 seconds') as _6 \\gset
select pg_temp.bajada(:'vca', 3, :'tb'::timestamptz + interval '3 seconds') as _7 \\gset
select pg_temp.vende(:'vca', 1, :'tb'::timestamptz + interval '6 seconds') as _8 \\gset
-- Corregida: se bajan 2 y se retiran 2: fuera.
select pg_temp.bajada(:'vco', 2, :'tb'::timestamptz + interval '7 seconds') as _9 \\gset
select pg_temp.retiro(:'vco', 2, :'tb'::timestamptz + interval '8 seconds') as _10 \\gset
-- Dudosa: el stock del piso tocado a mano: fuera.
select pg_temp.bajada(:'vd', 2, :'tb'::timestamptz + interval '9 seconds') as _11 \\gset
select pg_temp.vende(:'vd', 1, :'tb'::timestamptz + interval '10 seconds') as _12 \\gset
update retail.stock set cantidad = 0 where variante_id = :'vd' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
-- Cerrada pero de hace 15 minutos (< 2W), tardía: fuera. Y una de hace 5 minutos (sin cerrar): fuera.
select pg_temp.bajada(:'vr', 1, now() - interval '15 minutes') as _13 \\gset
select pg_temp.vende(:'vr', 1, now() - interval '14 minutes') as _14 \\gset
select pg_temp.bajada(:'va', 1, now() - interval '5 minutes') as _15 \\gset
select date_trunc('month', now() at time zone 'America/Lima')::date as mes_actual \\gset
${FILA("TIENDA", ":'ubic'")}
${k("NUCLEO", "(select string_agg(v.codigo || ':' || n.estado || ':' || n.cerrada || ':' || n.es_carga_inicial, ',' order by v.codigo) from retail.fn_bajadas_del_piso_nucleo(:'ubic', now() - interval '1 day', null) n join retail.variantes v on v.id = n.variante_id)")}
${k("MESES_2", "(select string_agg(mes::text, ',' order by mes) from retail.fn_confianza_registro(:'ubic'))")}
${k("MESES_ESPERADOS_2", "(select (:'mes_actual'::date - interval '1 month')::date || ',' || :'mes_actual'::date)")}
${k("MESES_1", "(select string_agg(mes::text, ',' order by mes) from retail.fn_confianza_registro(:'ubic', 1))")}
${k("MESES_3", "(select count(*) from retail.fn_confianza_registro(:'ubic', 3))")}
${k("MES_VACIO", "(select filas || ',' || unidades || ',' || tardias || ',' || coalesce(confianza::text, 'null') || ',' || coalesce(nivel, 'null') from retail.fn_confianza_registro(:'ubic', 3) where mes = (:'mes_actual'::date - interval '2 months')::date)")}
${k("MESES_0", "pg_temp.intento(format('select * from retail.fn_confianza_registro(%L, 0)', :'ubic'))")}
${k("MESES_4", "pg_temp.intento(format('select * from retail.fn_confianza_registro(%L, 4)', :'ubic'))")}
${k("MESES_NULO", "pg_temp.intento(format('select * from retail.fn_confianza_registro(%L, null)', :'ubic'))")}
${k("TODAS", "(select string_agg(distinct sede, ',' order by sede) from retail.fn_confianza_registro())")}
${k("TODAS_FILAS", "(select count(*) = 2 * count(distinct ubicacion_id) from retail.fn_confianza_registro())")}
${k("TALLER", "(select count(*) from retail.fn_confianza_registro(:'taller'))")}`,
  (o) => {
    afirmar(
      "el núcleo ve las 8 bajadas con su estado (la tabla de la que sale la cifra)",
      o.NUCLEO === "ZZ-FL-T10-ABIERTA:en_curso:false:false,ZZ-FL-T10-CARGA:tardia:true:true,ZZ-FL-T10-CORREGIDA:corregida:true:false,ZZ-FL-T10-DUDOSA:dudosa:true:false,ZZ-FL-T10-NORMAL:normal:true:false,ZZ-FL-T10-PARCIAL:normal:true:false,ZZ-FL-T10-RECIENTE:tardia:true:false,ZZ-FL-T10-TARDIA:tardia:true:false",
      `NUCLEO=${o.NUCLEO}`,
    );
    afirmar(
      "3 filas, 11 unidades (3 + 2 + 6, la efectiva), 1 tardía, confianza 1 − 1/11 = 0.9091, «pocos_datos»",
      o.TIENDA === "3,11,1,0.9091,pocos_datos",
      `TIENDA=${o.TIENDA}`,
    );
    afirmar("p_meses = 2 (por defecto): el mes anterior y el actual de Lima", o.MESES_2 === o.MESES_ESPERADOS_2, `MESES_2=${o.MESES_2} esperado ${o.MESES_ESPERADOS_2}`);
    afirmar("p_meses = 1: solo el actual; 3: tres filas", o.MESES_1 === o.MESES_ESPERADOS_2?.split(",")[1] && o.MESES_3 === "3", `MESES_1=${o.MESES_1} MESES_3=${o.MESES_3}`);
    afirmar("un mes sin bajadas: 0, 0, 0, confianza nula, nivel nulo", o.MES_VACIO === "0,0,0,null,null", `MES_VACIO=${o.MES_VACIO}`);
    afirmar("p_meses 0, 4 o nulo → error", [o.MESES_0, o.MESES_4, o.MESES_NULO].every((x) => error(x, "P0001")), `${o.MESES_0} ${o.MESES_4} ${o.MESES_NULO}`);
    afirmar("sin tienda: todas las tiendas con piso (TRU, Lima y la de la prueba), nunca el Taller", o.TODAS === "Tienda Lima,Tienda Trujillo,ZZ Tienda Frescura", `TODAS=${o.TODAS}`);
    afirmar("…una fila por tienda y mes", o.TODAS_FILAS === "true", `TODAS_FILAS=${o.TODAS_FILAS}`);
    afirmar("el Taller pedido directo: 0 filas", o.TALLER === "0", `TALLER=${o.TALLER}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T10b · fn_confianza_registro no cuenta las bajadas de productos de prueba (como fn_frescura_sede)",
  `${TB}
select pg_temp.producto('T10b Prueba', null, null, true) as pp \\gset
select pg_temp.variante('ZZ-FL-T10B-PRUEBA', :'pp') as vp \\gset
select pg_temp.variante('ZZ-FL-T10B-REAL') as vr \\gset
select count(pg_temp.llega(v, 5, :'tb'::timestamptz - interval '30 minutes')) as _l from unnest(array[:'vp', :'vr']::uuid[]) v \\gset
-- La de prueba: tardía (piso 0, se bajan 2 y se venden 2 a los 3 segundos). La real: normal.
select pg_temp.bajada(:'vp', 2, :'tb'::timestamptz) as _1 \\gset
select pg_temp.vende(:'vp', 2, :'tb'::timestamptz + interval '3 seconds') as _2 \\gset
select pg_temp.bajada(:'vr', 3, :'tb'::timestamptz + interval '1 second') as _3 \\gset
${FILA("TIENDA", ":'ubic'")}
${k("NUCLEO", "(select count(*) from retail.fn_bajadas_del_piso_nucleo(:'ubic', now() - interval '1 day', null))")}`,
  (o) => {
    afirmar("(el núcleo ve las dos bajadas)", o.NUCLEO === "2", `NUCLEO=${o.NUCLEO}`);
    afirmar("solo cuenta la real: 1 fila, 3 unidades, 0 tardías, confianza 1", o.TIENDA === "1,3,0,1.0000,pocos_datos", `TIENDA=${o.TIENDA}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T10c · mes de LIMA con la sesión en UTC (como producción): una bajada del último día del mes pasado a las 21:00 de Lima cuenta en el mes pasado",
  `select pg_temp.variante('ZZ-FL-T10C') as v \\gset
select (date_trunc('month', now() at time zone 'America/Lima') at time zone 'America/Lima') - interval '3 hours' as tfm \\gset
select pg_temp.llega(:'v', 2, :'tfm'::timestamptz - interval '1 hour') as _1 \\gset
select pg_temp.bajada(:'v', 1, :'tfm'::timestamptz) as _2 \\gset
${k("ZONA", "current_setting('TimeZone')")}
${k("MESES", "(select string_agg(mes::text || ':' || filas, ',' order by mes) from retail.fn_confianza_registro(:'ubic', 2))")}
${k("ESPERADO", "(select (date_trunc('month', now() at time zone 'America/Lima') - interval '1 month')::date || ':1,' || date_trunc('month', now() at time zone 'America/Lima')::date || ':0')")}`,
  (o) => {
    afirmar("(la prueba corre en UTC)", o.ZONA === "UTC", `ZONA=${o.ZONA}`);
    afirmar("la bajada cuenta en el mes pasado de Lima, no en el actual", o.MESES === o.ESPERADO, `MESES=${o.MESES} esperado ${o.ESPERADO}`);
  },
);

// ---------------------------------------------------------------------------
correr(
  "T11 · niveles por filas: 9 «pocos_datos», 10 y 19 «aceptable», 20 «solido»",
  `${TB}
create function pg_temp.bajadas_normales(p_tienda uuid, n int, tb timestamptz) returns void language plpgsql as $f$
declare v uuid;
begin
  perform pg_temp.usar(p_tienda);
  for i in 1..n loop
    v := pg_temp.variante('ZZ-FL-T11-' || p_tienda || '-' || i);
    perform pg_temp.llega(v, 2, tb - interval '30 minutes');
    perform pg_temp.bajada(v, 1, tb + make_interval(secs => i));
  end loop;
end $f$;
select pg_temp.tienda('ZZ T11 nueve') as u9 \\gset
select pg_temp.tienda('ZZ T11 diez') as u10 \\gset
select pg_temp.tienda('ZZ T11 diecinueve') as u19 \\gset
select pg_temp.tienda('ZZ T11 veinte') as u20 \\gset
select pg_temp.bajadas_normales(:'u9', 9, :'tb') as _9 \\gset
select pg_temp.bajadas_normales(:'u10', 10, :'tb') as _10 \\gset
select pg_temp.bajadas_normales(:'u19', 19, :'tb') as _19 \\gset
select pg_temp.bajadas_normales(:'u20', 20, :'tb') as _20 \\gset
${FILA("N9", ":'u9'")}
${FILA("N10", ":'u10'")}
${FILA("N19", ":'u19'")}
${FILA("N20", ":'u20'")}`,
  (o) => {
    afirmar("9 filas → pocos_datos, confianza 1", o.N9 === "9,9,0,1.0000,pocos_datos", `N9=${o.N9}`);
    afirmar("10 filas → aceptable", o.N10 === "10,10,0,1.0000,aceptable", `N10=${o.N10}`);
    afirmar("19 filas → aceptable", o.N19 === "19,19,0,1.0000,aceptable", `N19=${o.N19}`);
    afirmar("20 filas → solido", o.N20 === "20,20,0,1.0000,solido", `N20=${o.N20}`);
  },
);

// ---------------------------------------------------------------------------
// Casos de la revisión 4 (lente pruebas): cada uno mata un mutante que las 132 verificaciones de antes dejaban vivo.
//   T2e/T2f (m01, m02): la talla cuyo ÚNICO movimiento de la ventana es la venta, o un ajuste negativo, sigue en la
//     lista; sin ella, el reloj del modelo+color se acorta (un modelo de 110 días parecía recién llegado).
//   T2g (p07): pasar del almacén a la cuarentena NO es exhibir.
//   T4e (m50): la última llegada es la de ESTA tienda: un lote de Trujillo no cuenta. (Para el fin de estación sí,
//   desde la decisión de Felipe del 2026-09-27: es una llegada a CAYLA; ver T4f.)
//   T7b, T9b, T9c: tiendas sin piso o inactivas fuera de la confianza; tardías y dudosas de la ventana; la dudosa abierta.
// ======================= CASOS EXTRA DEL REVISOR (ronda 2, lente pruebas) =======================
correr(
  "T4e · ultima_llegada es de ESTA tienda (un lote de otra tienda no cuenta); el fin de estación SÍ lo cuenta: es una llegada a CAYLA (decisión del 2026-09-27)",
  `alter table retail.temporada_fechas disable trigger user;
insert into retail.temporada_fechas (anio, estacion, inicio, fuente) values
  (2025, 'otono', '2025-03-20 04:01-05', 'usno'), (2025, 'invierno', '2025-06-20 21:42-05', 'usno'),
  (2025, 'primavera', '2025-09-22 13:19-05', 'usno'), (2025, 'verano', '2025-12-21 10:03-05', 'usno')
on conflict do nothing;
alter table retail.temporada_fechas enable trigger user;
select pg_temp.producto('RX1 Chompa', 'invierno') as pch \\gset
select pg_temp.variante('ZZ-RX1-CHOMPA', :'pch') as v \\gset
select pg_temp.llega(:'v', 3, '2025-07-15 12:00-05') as _1 \\gset
select pg_temp.bajada(:'v', 2, '2025-07-16 12:00-05') as _2 \\gset
select id as tru_sa from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
insert into retail.lotes (ubicacion_id, proveedor_id, fecha_recepcion)
  select :'tru', mp.proveedor_id, now() from retail.marca_proveedores mp order by mp.created_at limit 1 returning id as lote_tru \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, created_at)
  values (:'v', :'tru', :'tru_sa', 'entrada', 4, 'recepcion', :'lote_tru', '2026-07-15 12:00-05') returning id as m_tru \\gset
select retail.fn_aplicar_movimiento(:'m_tru') as _3 \\gset
select pg_temp.lectura() as j \\gset
${k("LLEGADA", "((pg_temp.prenda(:'j', 'ZZ-RX1-CHOMPA') ->> 'ultima_llegada')::timestamptz = '2025-07-15 12:00-05'::timestamptz)")}
${k("CAYLA", "((pg_temp.prenda(:'j', 'ZZ-RX1-CHOMPA') ->> 'ultima_llegada_cayla')::timestamptz = '2026-07-15 12:00-05'::timestamptz)")}
${k("FIN", "((pg_temp.prenda(:'j', 'ZZ-RX1-CHOMPA') ->> 'fin_estacion')::timestamptz = (select inicio from retail.temporada_fechas where anio = 2026 and estacion = 'primavera'))")}
${k("VISTO", "(pg_temp.prenda(:'j', 'ZZ-RX1-CHOMPA') ->> 'ultima_llegada') || ' cayla=' || (pg_temp.prenda(:'j', 'ZZ-RX1-CHOMPA') ->> 'ultima_llegada_cayla') || ' fin=' || (pg_temp.prenda(:'j', 'ZZ-RX1-CHOMPA') ->> 'fin_estacion')")}`,
  (o) => {
    afirmar("T4e ultima_llegada = la de esta tienda (2025), no el lote de Trujillo (2026)", o.LLEGADA === "true", `LLEGADA=${o.LLEGADA} ${o.VISTO}`);
    afirmar("T4e ultima_llegada_cayla = el lote de Trujillo (2026): llegó a CAYLA de nuevo", o.CAYLA === "true", `CAYLA=${o.CAYLA} ${o.VISTO}`);
    afirmar("T4e fin_estacion = primavera 2026 (el invierno de su última llegada a CAYLA; antes, el de 2025)", o.FIN === "true", `FIN=${o.FIN} ${o.VISTO}`);
  },
);

correr(
  "T2e · talla cuyo ÚNICO movimiento en la ventana es la venta (colgada antes de la ventana y agotada dentro) sigue en la lista",
  `select pg_temp.producto('RX2 Blusa') as px \\gset
select pg_temp.variante('ZZ-RX2-S', :'px', :'c1') as vs \\gset
select pg_temp.variante('ZZ-RX2-M', :'px', :'c1') as vm \\gset
select pg_temp.llega(:'vs', 2, now() - interval '150 days') as _1 \\gset
select pg_temp.bajada(:'vs', 2, now() - interval '149 days') as _2 \\gset
select pg_temp.vende(:'vs', 2, now() - interval '10 days') as _3 \\gset
select pg_temp.llega(:'vm', 1, now() - interval '6 days') as _4 \\gset
select pg_temp.bajada(:'vm', 1, now() - interval '5 days') as _5 \\gset
select pg_temp.lectura() as j \\gset
${k("S", "pg_temp.resumen(:'j', 'ZZ-RX2-S') || ' ' || coalesce((select string_agg((e ->> 1) || ':' || (e ->> 2), ',') from jsonb_array_elements(:'j'::jsonb -> 'eventos' -> (:'vs')) e), '-')")}`,
  (o) => afirmar("T2e S aparece (piso 0) con su saldo +2 marca 4 y la venta −2", o.S === "piso=0,alm=0,primera=149,llegada=150 2:4,-2:1", `S=${o.S}`),
);

correr(
  "T2f · talla cuyo ÚNICO movimiento en la ventana es un ajuste negativo del piso (conteo) sigue en la lista",
  `select pg_temp.variante('ZZ-RX3') as v \\gset
select pg_temp.llega(:'v', 1, now() - interval '150 days') as _1 \\gset
select pg_temp.bajada(:'v', 1, now() - interval '149 days') as _2 \\gset
select pg_temp.mov(:'v', 'ajuste', -1, :'sp', 'conteo', now() - interval '10 days') as _3 \\gset
select pg_temp.lectura() as j \\gset
${k("X", "pg_temp.resumen(:'j', 'ZZ-RX3') || ' ' || coalesce((select string_agg((e ->> 1) || ':' || (e ->> 2), ',') from jsonb_array_elements(:'j'::jsonb -> 'eventos' -> (:'v')) e), '-')")}`,
  (o) => afirmar("T2f aparece con su saldo +1 marca 4 y el ajuste −1", o.X === "piso=0,alm=0,primera=149,llegada=150 1:4,-1:0", `X=${o.X}`),
);

correr(
  "T2g · primera exhibición: pasar del almacén a la cuarentena NO es exhibir; la primera es la entrada al piso",
  `select pg_temp.variante('ZZ-RX4') as v \\gset
select pg_temp.llega(:'v', 2, now() - interval '20 days') as _1 \\gset
select pg_temp.mov(:'v', 'traslado', 2, :'sa', 'movimiento_interno', now() - interval '15 days', :'sc') as _2 \\gset
select pg_temp.mov(:'v', 'traslado', 2, :'sc', 'movimiento_interno', now() - interval '5 days', :'sp') as _3 \\gset
select pg_temp.lectura() as j \\gset
${k("X", "pg_temp.resumen(:'j', 'ZZ-RX4')")}`,
  (o) => afirmar("T2g primera = 5 (la cuarentena → piso), no 15 (almacén → cuarentena)", o.X === "piso=2,alm=0,primera=5,llegada=20", `X=${o.X}`),
);

correr(
  "T9b · con p_dias = 30, las tardías y dudosas son de la ventana: una bajada tardía y una dudosa de hace 60 días no salen",
  `select pg_temp.variante('ZZ-RX5-TARDIA') as vt \\gset
select pg_temp.variante('ZZ-RX5-DUDOSA') as vd \\gset
select count(pg_temp.llega(v, 3, now() - interval '70 days')) as _l from unnest(array[:'vt', :'vd']::uuid[]) v \\gset
select pg_temp.bajada(:'vt', 1, now() - interval '60 days') as _1 \\gset
select pg_temp.vende(:'vt', 1, now() - interval '60 days' + interval '3 minutes') as _2 \\gset
select pg_temp.bajada(:'vd', 2, now() - interval '60 days') as _3 \\gset
select pg_temp.vende(:'vd', 1, now() - interval '60 days' + interval '3 minutes') as _4 \\gset
update retail.stock set cantidad = 0 where variante_id = :'vd' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
select pg_temp.lectura(30) as j30 \\gset
select pg_temp.lectura(120) as j120 \\gset
${k("T30", "(:'j30'::jsonb -> 'tardias')::text || ' ' || (:'j30'::jsonb -> 'dudosas')::text")}
${k("T120", "jsonb_array_length(:'j120'::jsonb -> 'tardias') || ',' || jsonb_array_length(:'j120'::jsonb -> 'dudosas')")}`,
  (o) => {
    afirmar("T9b (a 120 días sí salen: 1 tardía, 1 dudosa)", o.T120 === "1,1", `T120=${o.T120}`);
    afirmar("T9b a 30 días: tardías [] y dudosas []", o.T30 === "[] []", `T30=${o.T30}`);
  },
);

correr(
  "T7b · tiendas que no separan piso: con almacén y sin piso → separa_piso false; ni esa, ni la de piso sin almacén, ni una inactiva salen en fn_confianza_registro()",
  `select pg_temp.tienda('ZZ RX6 inactiva') as inactiva \\gset
update retail.ubicaciones set activo = false where id = :'inactiva';
select pg_temp.tienda('ZZ RX6 sin almacen', false) as sin_alm \\gset
insert into retail.ubicaciones (nombre, tipo) values ('ZZ RX6 sin piso', 'tienda') returning id as sin_piso \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'sin_piso', 'Almacén de tienda', 'almacen_tienda');
${k("SIN_PISO", "retail.fn_frescura_sede(:'sin_piso')")}
${k("CONF", "(select string_agg(distinct sede, ',') from retail.fn_confianza_registro() where sede like 'ZZ RX6%')")}`,
  (o) => {
    afirmar("T7b tienda con almacén y sin piso: {separa_piso: false}", o.SIN_PISO === '{"separa_piso": false}', `SIN_PISO=${o.SIN_PISO}`);
    afirmar("T7b ninguna de las tres en fn_confianza_registro()", o.CONF === "null", `CONF=${o.CONF}`);
  },
);

correr(
  "T9c · una bajada dudosa de hace 2 minutos (aún sin cerrar) ya deja a la prenda en «dudosas»",
  `select pg_temp.variante('ZZ-RX7') as v \\gset
select pg_temp.llega(:'v', 3, now() - interval '30 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, now() - interval '2 minutes') as _2 \\gset
select pg_temp.vende(:'v', 1, now() - interval '1 minute') as _3 \\gset
update retail.stock set cantidad = 0 where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
select pg_temp.lectura() as j \\gset
${k("D", "(:'j'::jsonb -> 'dudosas') ? :'v'")}
${k("N", "(select string_agg(n.estado || ':' || n.cerrada, ',') from retail.fn_bajadas_del_piso_nucleo(:'ubic', now() - interval '1 day', null) n where n.variante_id = :'v')")}`,
  (o) => {
    afirmar("T9c (el núcleo la ve dudosa y abierta)", o.N === "dudosa:false", `N=${o.N}`);
    afirmar("T9c sale en dudosas", o.D === "true", `D=${o.D}`);
  },
);

// ======================= REVISIÓN 5 (2026-09-27): los cinco hallazgos pendientes y la decisión 1 de Felipe =======================
// T2h (RX5): piso_hoy y almacen_hoy son solo de ESTA tienda.
// T10d (RX6): fn_confianza_registro cuenta las tardías en UNIDADES, no en filas.
// T4g (RX8): fn_temporada_efectiva sigue security definer y authenticated la llama sin 42501, en las dos llamadas de la web.
// T8b y T4f (decisión 1): la llegada A CAYLA (fn_es_llegada_a_cayla) y el fin de estación que sale de ella.
correr(
  "T2h · piso_hoy y almacen_hoy son de ESTA tienda: la misma talla colgada en Trujillo no suma (RX5)",
  `select pg_temp.variante('ZZ-FL-RX5') as v \\gset
select pg_temp.llega(:'v', 2, :'t0'::timestamptz - interval '60 minutes') as _1 \\gset
select pg_temp.bajada(:'v', 2, :'t0'::timestamptz - interval '50 minutes') as _2 \\gset
select pg_temp.usar(:'tru') as _u1 \\gset
select pg_temp.llega(:'v', 4, :'t0'::timestamptz - interval '45 minutes') as _3 \\gset
select pg_temp.bajada(:'v', 3, :'t0'::timestamptz - interval '40 minutes') as _4 \\gset
select pg_temp.usar(:'ubic') as _u2 \\gset
select pg_temp.lectura() as j \\gset
${k("RX5", "pg_temp.resumen(:'j', 'ZZ-FL-RX5')")}
${k("TRU", "(select string_agg(su.tipo || '=' || s.cantidad, ',' order by su.tipo) from retail.stock s join retail.sububicaciones su on su.id = s.sububicacion_id where s.variante_id = :'v' and s.ubicacion_id = :'tru')")}`,
  (o) => {
    afirmar("(T2h Trujillo sí tiene la talla: 1 en el almacén y 3 en el piso)", o.TRU === "almacen_tienda=1,piso_venta=3", `TRU=${o.TRU}`);
    afirmar("T2h piso=2, alm=0: lo de Trujillo no suma", (o.RX5 ?? "").startsWith("piso=2,alm=0,"), `RX5=${o.RX5}`);
  },
);

correr(
  "T10d · fn_confianza_registro: tardias = UNIDADES tardías (una bajada de 3 con 2 tardías + otra normal de 3 = 2 filas, 6 unidades, 2 tardías) (RX6)",
  `${TB}
select pg_temp.variante('ZZ-FL-RX6-T') as vt \\gset
select pg_temp.variante('ZZ-FL-RX6-N') as vn \\gset
select count(pg_temp.llega(v, 5, :'tb'::timestamptz - interval '30 minutes')) as _l from unnest(array[:'vt', :'vn']::uuid[]) v \\gset
select pg_temp.bajada(:'vt', 3, :'tb'::timestamptz) as _1 \\gset
select pg_temp.vende(:'vt', 2, :'tb'::timestamptz + interval '3 seconds') as _2 \\gset
select pg_temp.bajada(:'vn', 3, :'tb'::timestamptz + interval '1 second') as _3 \\gset
${FILA("RX6", ":'ubic'")}
${k("RX6N", "(select string_agg(v.codigo || ':' || n.estado || ':' || n.unidades_tardias, ',' order by v.codigo) from retail.fn_bajadas_del_piso_nucleo(:'ubic', now() - interval '1 day', null) n join retail.variantes v on v.id = n.variante_id)")}`,
  (o) => {
    afirmar("(T10d el núcleo: la tardía con 2 unidades tardías y la normal con 0)", o.RX6N === "ZZ-FL-RX6-N:normal:0,ZZ-FL-RX6-T:tardia:2", `RX6N=${o.RX6N}`);
    afirmar("T10d 2 filas, 6 unidades, 2 tardías, confianza 1 − 2/6 = 0.6667 (contando filas tardías serían 1 y 0.8333)", o.RX6 === "2,6,2,0.6667,pocos_datos", `RX6=${o.RX6}`);
  },
);

correr(
  "T4g · fn_temporada_efectiva sigue security definer: authenticated (líder e integrante) la llama sin 42501, como la ficha y la pantalla de Temporadas (RX8)",
  `select pg_temp.producto('RX8 Blusa', 'verano') as p \\gset
select pg_temp.variante('ZZ-FL-RX8', :'p', :'c1') as v \\gset
${sesion(FELIPE)}${k("FICHA_LIDER", "pg_temp.intento(format('select * from retail.fn_temporada_efectiva(p_producto_id => %L)', :'p'))")}
${k("FICHA_FILAS", "(select string_agg(color_codigo || '=' || temporada || ':' || origen, ',') from retail.fn_temporada_efectiva(p_producto_id => :'p'))")}
${k("LISTA_LIDER", "pg_temp.intento('select * from retail.fn_temporada_efectiva() order by producto_id, color_codigo limit 1000 offset 0')")}
${sesion(MICAELA)}${k("FICHA_INT", "pg_temp.intento(format('select * from retail.fn_temporada_efectiva(p_producto_id => %L)', :'p'))")}
${k("LISTA_INT", "pg_temp.intento('select * from retail.fn_temporada_efectiva() order by producto_id, color_codigo limit 1000 offset 0')")}
${COMO_POSTGRES}
${k("SD", "(select prosecdef from pg_proc where oid = 'retail.fn_temporada_efectiva(uuid)'::regprocedure)")}
-- El control: sin security definer, el envoltorio llama al núcleo (sin EXECUTE para nadie de afuera) con los permisos de
-- quien pide, y la web recibe 42501. Es lo que esta prueba vigila.
savepoint sin_definer;
alter function retail.fn_temporada_efectiva(uuid) security invoker;
${sesion(FELIPE)}${k("SIN_DEFINER", "pg_temp.intento('select * from retail.fn_temporada_efectiva() order by producto_id, color_codigo limit 1000 offset 0')")}
${COMO_POSTGRES}
rollback to savepoint sin_definer;`,
  (o) => {
    afirmar("la ficha (con p_producto_id), como líder: ok", json(o.FICHA_LIDER)?.ok === true, `FICHA_LIDER=${o.FICHA_LIDER}`);
    afirmar("…y trae su temporada", o.FICHA_FILAS?.endsWith("=verano:producto") === true, `FICHA_FILAS=${o.FICHA_FILAS}`);
    afirmar("la lista paginada de /productos (sin argumentos), como líder: ok", json(o.LISTA_LIDER)?.ok === true, `LISTA_LIDER=${o.LISTA_LIDER}`);
    afirmar("las dos, como integrante: ok", json(o.FICHA_INT)?.ok === true && json(o.LISTA_INT)?.ok === true, `FICHA_INT=${o.FICHA_INT} LISTA_INT=${o.LISTA_INT}`);
    afirmar("fn_temporada_efectiva es security definer", o.SD === "true", `SD=${o.SD}`);
    afirmar("(control: sin security definer, authenticated recibe 42501)", error(o.SIN_DEFINER, "42501"), `SIN_DEFINER=${o.SIN_DEFINER}`);
  },
);

correr(
  "T8b · fn_es_llegada_a_cayla ≡ fn_es_llegada sin la recepción de un traslado: 0 diferencias en el libro del seed y en todas las combinaciones; nunca nulo",
  `create temp table combos as
  select t.tipo, mo.motivo, l.lote_id, pr.produccion_id, tr.transferencia_recepcion_id
    from (values ('entrada'), ('salida'), ('ajuste'), ('traslado'), ('apartado'), ('liberacion_apartado'), (null)) t(tipo)
    cross join (select distinct motivo from retail.movimientos union select 'carga_inicial' union select 'recepcion' union select 'traslado_entrada' union select null) mo
    cross join (values (null::uuid), (gen_random_uuid())) l(lote_id)
    cross join (values (null::uuid), (gen_random_uuid())) pr(produccion_id)
    cross join (values (null::uuid), (gen_random_uuid())) tr(transferencia_recepcion_id);
create function pg_temp.dif_cayla(p_tabla text) returns text language plpgsql as $f$
declare n_dif bigint; n_si bigint; n_no bigint; n_nulos bigint; n bigint;
begin
  execute format('select count(*) filter (where retail.fn_es_llegada_a_cayla(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
                                               is distinct from (retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
                                                                 and m.transferencia_recepcion_id is null)),
                         count(*) filter (where retail.fn_es_llegada_a_cayla(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)),
                         count(*) filter (where not retail.fn_es_llegada_a_cayla(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)),
                         count(*) filter (where retail.fn_es_llegada_a_cayla(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id) is null),
                         count(*)
                    from %s m', p_tabla) into n_dif, n_si, n_no, n_nulos, n;
  return format('dif=%s,si=%s,no=%s,nulos=%s,total=%s', n_dif, (n_si > 0)::text, (n_no > 0)::text, n_nulos, n);
end $f$;
${k("SEED", "pg_temp.dif_cayla('retail.movimientos')")}
${k("COMBOS", "pg_temp.dif_cayla('combos')")}
-- La tabla de verdad de lo que decidió Felipe, escrita a mano.
${k("VERDAD", `(select string_agg(x.nombre || '=' || retail.fn_es_llegada_a_cayla(x.tipo, x.motivo, x.lote, x.prod, x.recep)::text, ',' order by x.n)
   from (values (1, 'lote', 'entrada', 'recepcion', gen_random_uuid(), null::uuid, null::uuid),
                (2, 'produccion', 'entrada', 'produccion', null, gen_random_uuid(), null),
                (3, 'carga_inicial', 'entrada', 'carga_inicial', null, null, null),
                (4, 'recepcion_traslado', 'entrada', 'traslado_entrada', null, null, gen_random_uuid()),
                (5, 'entrada_suelta', 'entrada', 'compra', null, null, null),
                (6, 'ajuste', 'ajuste', 'reposicion', null, null, null),
                (7, 'salida_con_lote', 'salida', 'venta', gen_random_uuid(), null, null)) x(n, nombre, tipo, motivo, lote, prod, recep))`)}`,
  (o) => {
    afirmar("libro del seed: 0 diferencias, con llegadas y no llegadas, sin nulos", /^dif=0,si=true,no=true,nulos=0,total=\d+$/.test(o.SEED ?? ""), `SEED=${o.SEED}`);
    afirmar("todas las combinaciones: 0 diferencias, sin nulos", /^dif=0,si=true,no=true,nulos=0,total=\d+$/.test(o.COMBOS ?? ""), `COMBOS=${o.COMBOS}`);
    afirmar(
      "lote, producción y carga inicial SÍ llegan a CAYLA; la recepción de un traslado, una entrada suelta, un ajuste y una salida NO",
      o.VERDAD === "lote=true,produccion=true,carga_inicial=true,recepcion_traslado=false,entrada_suelta=false,ajuste=false,salida_con_lote=false",
      `VERDAD=${o.VERDAD}`,
    );
  },
);

correr(
  "T4f · la temporada cuenta desde que llegó a CAYLA (decisión de Felipe del 2026-09-27): lo trasladado conserva el fin de su llegada, en todas sus tallas",
  `alter table retail.temporada_fechas disable trigger user;
insert into retail.temporada_fechas (anio, estacion, inicio, fuente) values
  (2025, 'otono', '2025-03-20 04:01-05', 'usno'), (2025, 'invierno', '2025-06-20 21:42-05', 'usno'),
  (2025, 'primavera', '2025-09-22 13:19-05', 'usno'), (2025, 'verano', '2025-12-21 10:03-05', 'usno')
on conflict do nothing;
alter table retail.temporada_fechas enable trigger user;
-- Una recepción de traslado de Trujillo a esta tienda, a una hora dada (la fila que pide la llave foránea).
create function pg_temp.recibe(v uuid, n int, cuando timestamptz) returns uuid language plpgsql as $f$
declare t uuid; r uuid; m uuid; u uuid := current_setting('prueba.ubic')::uuid;
begin
  insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, created_at)
    select id, u, 'cerrada', cuando from retail.ubicaciones where nombre = 'Tienda Trujillo' returning id into t;
  insert into retail.transferencia_recepciones (transferencia_id, variante_id, cantidad_recibida, created_at)
    values (t, v, n, cuando) returning id into r;
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_recepcion_id, created_at)
    values (v, u, current_setting('prueba.sa')::uuid, 'entrada', n, 'traslado_entrada', r, cuando) returning id into m;
  perform retail.fn_aplicar_movimiento(m);
  return m;
end $f$;
-- 1) La chompa: S llegó del proveedor a TRUJILLO en julio de 2025 (invierno 2025); S y M llegaron aquí trasladadas en
--    abril de 2026 y se colgaron. M nunca llegó a CAYLA por su cuenta: es el mismo modelo+color.
select pg_temp.producto('T4f Chompa', 'invierno') as pch \\gset
select pg_temp.variante('ZZ-FL-T4F-CHOMPA-S', :'pch', :'c1') as vs \\gset
select pg_temp.variante('ZZ-FL-T4F-CHOMPA-M', :'pch', :'c1') as vm \\gset
select pg_temp.usar(:'tru') as _ut \\gset
select pg_temp.llega(:'vs', 3, '2025-07-15 12:00-05') as _l \\gset
select pg_temp.usar(:'ubic') as _uu \\gset
select count(pg_temp.recibe(v, 2, '2026-04-10 12:00-05')) as _r from unnest(array[:'vs', :'vm']::uuid[]) v \\gset
select count(pg_temp.bajada(v, 2, '2026-04-11 12:00-05')) as _b from unnest(array[:'vs', :'vm']::uuid[]) v \\gset
-- 2) Del Taller (producción) y 3) de la carga inicial de Trujillo, las dos en julio de 2025, trasladadas en abril.
select pg_temp.producto('T4f Taller', 'invierno') as ptl \\gset
select pg_temp.variante('ZZ-FL-T4F-TALLER', :'ptl', :'c1') as vtl \\gset
select id as sa_taller from retail.sububicaciones where ubicacion_id = :'taller' order by tipo limit 1 \\gset
insert into retail.producciones (ubicacion_id, producto_id, cantidad_plan) values (:'taller', :'ptl', 5) returning id as prod \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, produccion_id, created_at)
  values (:'vtl', :'taller', nullif(:'sa_taller', '')::uuid, 'entrada', 5, 'produccion', :'prod', '2025-07-20 12:00-05') returning id as m_tl \\gset
select retail.fn_aplicar_movimiento(:'m_tl') as _tl \\gset
select pg_temp.producto('T4f Carga', 'invierno') as pcg \\gset
select pg_temp.variante('ZZ-FL-T4F-CARGA', :'pcg', :'c1') as vcg \\gset
select pg_temp.usar(:'tru') as _ut2 \\gset
select pg_temp.mov(:'vcg', 'entrada', 3, current_setting('prueba.sa')::uuid, 'carga_inicial', '2025-07-25 12:00-05') as _cg \\gset
select pg_temp.usar(:'ubic') as _uu2 \\gset
select count(pg_temp.recibe(v, 2, '2026-04-10 12:00-05')) as _r2 from unnest(array[:'vtl', :'vcg']::uuid[]) v \\gset
-- 4) Solo trasladada: su llegada a CAYLA no quedó registrada (entró por un ajuste en Trujillo).
select pg_temp.producto('T4f Sin llegada', 'invierno') as psl \\gset
select pg_temp.variante('ZZ-FL-T4F-SOLO-TRASLADO', :'psl', :'c1') as vsl \\gset
select pg_temp.recibe(:'vsl', 2, '2026-04-10 12:00-05') as _r3 \\gset
select pg_temp.lectura() as j \\gset
select (select inicio from retail.temporada_fechas where anio = 2025 and estacion = 'primavera') as fin25 \\gset
select (select inicio from retail.temporada_fechas where anio = 2026 and estacion = 'primavera') as fin26 \\gset
create function pg_temp.t4f(j jsonb, p_codigo text, fin25 timestamptz, fin26 timestamptz) returns text language sql as $f$
  select format('tienda=%s,cayla=%s,fin=%s',
                coalesce(to_char((x ->> 'ultima_llegada')::timestamptz at time zone 'America/Lima', 'YYYY-MM-DD'), 'null'),
                coalesce(to_char((x ->> 'ultima_llegada_cayla')::timestamptz at time zone 'America/Lima', 'YYYY-MM-DD'), 'null'),
                case when x ->> 'fin_estacion' is null then 'null'
                     when (x ->> 'fin_estacion')::timestamptz = fin25 then 'primavera2025'
                     when (x ->> 'fin_estacion')::timestamptz = fin26 then 'primavera2026'
                     else x ->> 'fin_estacion' end)
    from jsonb_array_elements(j -> 'prendas') x where x ->> 'codigo' = p_codigo
$f$;
${["CHOMPA-S", "CHOMPA-M", "TALLER", "CARGA", "SOLO-TRASLADO"].map((c) => k(c, `pg_temp.t4f(:'j', 'ZZ-FL-T4F-${c}', :'fin25', :'fin26')`)).join("\n")}
${k("SI_FUERA_LA_RECEPCION", "((select hasta from retail.fn_ocurrencia_temporada('invierno', '2026-04-10 12:00-05')) = :'fin26'::timestamptz)")}`,
  (o) => {
    afirmar(
      "chompa S: última llegada a la tienda = el traslado de abril 2026; a CAYLA = el lote de Trujillo de julio 2025; fin = primavera 2025 → «Temporada pasada»",
      o["CHOMPA-S"] === "tienda=2026-04-10,cayla=2025-07-15,fin=primavera2025",
      `CHOMPA-S=${o["CHOMPA-S"]}`,
    );
    afirmar("chompa M (nunca llegó a CAYLA por su cuenta): el mismo fin que S, es el mismo modelo+color", o["CHOMPA-M"] === "tienda=2026-04-10,cayla=2025-07-15,fin=primavera2025", `CHOMPA-M=${o["CHOMPA-M"]}`);
    afirmar("la producción del Taller es una llegada a CAYLA", o.TALLER === "tienda=2026-04-10,cayla=2025-07-20,fin=primavera2025", `TALLER=${o.TALLER}`);
    afirmar("la carga inicial de otra tienda es una llegada a CAYLA", o.CARGA === "tienda=2026-04-10,cayla=2025-07-25,fin=primavera2025", `CARGA=${o.CARGA}`);
    afirmar(
      "solo trasladada, sin llegada a CAYLA registrada: sin fin (nunca «Temporada pasada»), aunque sí tiene llegada a la tienda",
      o["SOLO-TRASLADO"] === "tienda=2026-04-10,cayla=null,fin=null",
      `SOLO-TRASLADO=${o["SOLO-TRASLADO"]}`,
    );
    afirmar("(con la recepción del traslado, el fin habría sido la primavera 2026: el caso distingue)", o.SI_FUERA_LA_RECEPCION === "true", `SI_FUERA_LA_RECEPCION=${o.SI_FUERA_LA_RECEPCION}`);
  },
);

// ---------------------------------------------------------------------------
const MD5S = `(select string_agg(proname || '=' || md5(prosrc), ',' order by proname) from pg_proc
  where pronamespace = 'retail'::regnamespace and proname in (${EN_FUNCIONES}))`;
const FIRMAS = {
  fn_es_llegada: FIRMA_LLEG,
  fn_es_llegada_a_cayla: FIRMA_LLEG_CAYLA,
  fn_frescura_sede: FIRMA_SEDE,
  fn_confianza_registro: FIRMA_CONF,
  fn_temporada_efectiva_nucleo: FIRMA_NUCLEO_TEMP,
  fn_temporada_efectiva: FIRMA_TEMP,
};
/** Lo que dice la guarda al abortar por cada una (fn_temporada_efectiva se reescribe: su aviso es otro). */
const AVISO_GUARDA = (f) =>
  f === "fn_temporada_efectiva"
    ? "fn_temporada_efectiva cambió desde 20260928100000"
    : f === "fn_temporada_efectiva_nucleo" || f === "fn_es_llegada_a_cayla"
      ? `${f} ya existe con otro cuerpo`
      : `${f} tiene otro cuerpo`;
correr(
  "T12 · la guarda: pegada otra vez deja lo mismo; con una función parchada en vivo aborta y no la pisa",
  `select ${MD5S} as antes \\gset
${k("OTRA_VEZ", `pg_temp.intento(${comoLiteral(MIGRACION)})`)}
${k("MISMOS", `${MD5S} = :'antes'`)}
${FUNCIONES
  .map((f, i) => {
    const firma = FIRMAS[f];
    // Un parche en vivo: el mismo cuerpo con un comentario más (cambia el md5, no la conducta).
    return `savepoint s${i};
select md5(prosrc) as parche${i} from pg_proc where oid = '${firma}'::regprocedure \\gset
do $p$ begin
  execute replace(pg_get_functiondef('${firma}'::regprocedure), E'\\n$function$', E'\\n-- parche en vivo\\n$function$');
end $p$;
select md5(prosrc) as parchado${i} from pg_proc where oid = '${firma}'::regprocedure \\gset
${k(`PARCHE_${i}`, `pg_temp.intento(${comoLiteral(MIGRACION)})`)}
${k(`SIGUE_${i}`, `(select md5(prosrc) = :'parchado${i}' and md5(prosrc) <> :'parche${i}' from pg_proc where oid = '${firma}'::regprocedure)`)}
rollback to savepoint s${i};`;
  })
  .join("\n")}`,
  (o) => {
    afirmar("pegada otra vez: ok", json(o.OTRA_VEZ)?.ok === true, `OTRA_VEZ=${o.OTRA_VEZ}`);
    afirmar("…y los seis md5 no cambian", o.MISMOS === "true", `MISMOS=${o.MISMOS}`);
    FUNCIONES.forEach((f, i) => {
      const e = json(o[`PARCHE_${i}`]);
      afirmar(`${f} parchada en vivo: la migración aborta nombrándola`, e?.ok === false && (e?.msg ?? "").includes(AVISO_GUARDA(f)), o[`PARCHE_${i}`]);
      afirmar(`…y el parche de ${f} sigue ahí`, o[`SIGUE_${i}`] === "true", `SIGUE_${i}=${o[`SIGUE_${i}`]}`);
    });
  },
);

// ---------------------------------------------------------------------------
// T12b · El orden de las dos migraciones (revisión 4, hallazgo 1). Producción el 2026-09-27: ninguna de las dos pegada y
// fn_temporada_efectiva con su cuerpo de 20260928100000. Main trae 20260928120300 con la orden de pegarla; la corrección
// vive en 20260928120310. Con la de main ya pegada, la corregida TIENE que entrar (antes, editada en su lugar, abortaba
// culpando a un «parche en vivo» que no existía); y volver a pegar la de main después no deshace nada.
const MD5_0300 = "fn_confianza_registro=9c714f98dd2776eebb505846eb24c33a,fn_es_llegada=5089ba50874f611d96d5df751b63ed57,fn_frescura_sede=644e10126796adc1111702290c14f2bb,fn_temporada_efectiva=1cc652ba0bef3e9783a014b840cb870f";
correr(
  "T12b · con la versión de main (20260928120300) ya pegada, la corregida (20260928120310) se aplica; la de main otra vez aborta; sin la de main, la corregida no entra",
  `select ${MD5S} as nuevos \\gset
-- Producción antes de pegar nada del paso 3: sin las lecturas ni el núcleo de temporadas, fn_temporada_efectiva de
-- 20260928100000. (Las funciones SQL y plpgsql no dejan dependencias de cuerpo: se pueden quitar en cualquier orden.)
drop function retail.fn_frescura_sede(uuid, integer);
drop function retail.fn_confianza_registro(uuid, integer);
drop function retail.fn_temporada_efectiva_nucleo(uuid, boolean);
drop function retail.fn_es_llegada_a_cayla(text, text, uuid, uuid, uuid);
${k("TEMP_0100", `pg_temp.intento(${comoLiteral(TEMPORADA_EFECTIVA_0100)})`)}
${k("MAIN", `pg_temp.intento(${comoLiteral(MIGRACION_0300)})`)}
${k("MD5_MAIN", MD5S)}
${k("CORREGIDA", `pg_temp.intento(${comoLiteral(MIGRACION)})`)}
${k("MD5_CORREGIDA", `${MD5S} = :'nuevos'`)}
${k("CORREGIDA_LEE", "pg_temp.intento(format('select retail.fn_frescura_sede(%L)', :'ubic'))")}
${k("MAIN_OTRA_VEZ", `pg_temp.intento(${comoLiteral(MIGRACION_0300)})`)}
${k("MD5_SIGUEN", `${MD5S} = :'nuevos'`)}
${k("CORREGIDA_OTRA_VEZ", `pg_temp.intento(${comoLiteral(MIGRACION)})`)}
-- Sin la de main: la corregida la pide.
drop function retail.fn_es_llegada(text, text, uuid, uuid, uuid);
${k("SIN_MAIN", `pg_temp.intento(${comoLiteral(MIGRACION)})`)}`,
  (o) => {
    afirmar("fn_temporada_efectiva vuelve a su cuerpo de 20260928100000", json(o.TEMP_0100)?.ok === true, `TEMP_0100=${o.TEMP_0100}`);
    afirmar("la de main se pega sobre producción de hoy", json(o.MAIN)?.ok === true, `MAIN=${o.MAIN}`);
    afirmar("…y deja sus md5 (los que manda el BACKLOG de main)", o.MD5_MAIN === MD5_0300, `MD5_MAIN=${o.MD5_MAIN}`);
    afirmar("la corregida se pega ENCIMA de la de main (su guarda acepta la versión anterior)", json(o.CORREGIDA)?.ok === true, `CORREGIDA=${o.CORREGIDA}`);
    afirmar("…y deja los seis md5 de este archivo (con fn_es_llegada_a_cayla, que nace aquí)", o.MD5_CORREGIDA === "true", `MD5_CORREGIDA=${o.MD5_CORREGIDA}`);
    afirmar("…y la lectura responde", json(o.CORREGIDA_LEE)?.ok === true, `CORREGIDA_LEE=${o.CORREGIDA_LEE}`);
    afirmar(
      "volver a pegar la de main después aborta (su guarda no conoce el cuerpo nuevo) y no deshace nada",
      json(o.MAIN_OTRA_VEZ)?.ok === false && (json(o.MAIN_OTRA_VEZ)?.msg ?? "").includes("fn_frescura_sede ya existe con otro cuerpo") && o.MD5_SIGUEN === "true",
      `MAIN_OTRA_VEZ=${o.MAIN_OTRA_VEZ} MD5_SIGUEN=${o.MD5_SIGUEN}`,
    );
    afirmar("la corregida otra vez: ok", json(o.CORREGIDA_OTRA_VEZ)?.ok === true, `CORREGIDA_OTRA_VEZ=${o.CORREGIDA_OTRA_VEZ}`);
    afirmar(
      "sin la de main, la corregida aborta pidiendo pegarla antes",
      json(o.SIN_MAIN)?.ok === false && (json(o.SIN_MAIN)?.msg ?? "").includes("pega antes 20260928120300"),
      `SIN_MAIN=${o.SIN_MAIN}`,
    );
  },
);

// ---------------------------------------------------------------------------
// T13 · El contrato con la web. La web (`apps/web/lib/frescura-reglas.ts`) lee el jsonb de fn_frescura_sede y las filas
// de fn_confianza_registro; su prueba (`frescura-contrato.test.ts`) corre la lógica sobre una SALIDA REAL de estas dos
// funciones, guardada en `apps/web/lib/__fixtures__/frescura-sede.json`. Este caso siembra la misma tienda y exige que la
// salida de hoy tenga la MISMA forma que ese archivo (claves y tipos de cada campo): si alguien cambia el contrato en SQL
// sin rehacer el archivo, falla aquí, no en producción. Para rehacerlo (y volver a correr la prueba de la web):
//   FRESCURA_FIXTURE_ESCRIBIR=1 pnpm pruebas:frescura-lectura
const FIXTURE = join(RAIZ, "apps", "web", "lib", "__fixtures__", "frescura-sede.json");

/** La forma de un valor, sin sus datos: por cada ruta, los tipos que aparecen («string|null»). Los eventos van por
 *  variante (la clave es un uuid): se describen como un solo arreglo de tuplas. */
function forma(sede, conf) {
  const tipos = new Map();
  const anotar = (ruta, v) => {
    const t = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
    if (!tipos.has(ruta)) tipos.set(ruta, new Set());
    tipos.get(ruta).add(t);
  };
  const objeto = (ruta, o) => {
    if (!tipos.has(`${ruta}{}`)) tipos.set(`${ruta}{}`, new Set());
    tipos.get(`${ruta}{}`).add(Object.keys(o).sort().join(","));
    for (const [c, v] of Object.entries(o)) anotar(`${ruta}.${c}`, v);
  };
  objeto("sede", sede);
  for (const p of sede.prendas ?? []) objeto("prenda", p);
  for (const t of sede.tardias ?? []) objeto("tardia", t);
  for (const d of sede.dudosas ?? []) anotar("dudosa", d);
  for (const lista of Object.values(sede.eventos ?? {})) {
    anotar("eventos[]", lista);
    for (const e of lista) {
      anotar("evento.largo", String(e.length));
      e.forEach((x, i) => anotar(`evento[${i}]`, x));
    }
  }
  for (const f of conf ?? []) objeto("confianza", f);
  return [...tipos].map(([ruta, s]) => `${ruta}: ${[...s].sort().join("|")}`).sort();
}

correr(
  "T13 · el contrato con la web: la salida de hoy tiene la forma del archivo que prueba frescura-reglas.ts",
  `select id as cat_a from retail.categorias where nombre = 'Camisas y Blusas' \\gset
select id as cat_b from retail.categorias where nombre = 'Chompas' \\gset
select id as t_s from retail.tallas where valor = 'S' \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset
select id as t_l from retail.tallas where valor = 'L' \\gset
create function pg_temp.talla(v uuid, t uuid) returns uuid language sql as $$
  update retail.variantes set talla_id = t where id = v returning id
$$;
-- La vara de las blusas: 12 modelos colgados hace unos 50 días (2 cada uno), vendidos a los i y a los 2i días: 24
-- ventas con edad conocida, así la categoría tiene sus tres cortes y nivel «solido».
create function pg_temp.vara_blusas(p_cat uuid, p_talla uuid, p_color text) returns int language plpgsql as $f$
declare v uuid; t timestamptz;
begin
  for i in 1..12 loop
    v := pg_temp.talla(pg_temp.variante('ZZ-FX-VARA-' || lpad(i::text, 2, '0'), pg_temp.producto('FX Blusa vara ' || lpad(i::text, 2, '0'), null, p_cat), p_color), p_talla);
    t := now() - interval '50 days' + i * interval '1 hour';
    perform pg_temp.llega(v, 3, t - interval '1 day');
    perform pg_temp.bajada(v, 2, t);
    perform pg_temp.vende(v, 1, t + i * interval '1 day');
    perform pg_temp.vende(v, 1, t + i * interval '2 days');
  end loop;
  return 12;
end $f$;
select pg_temp.vara_blusas(:'cat_a', :'t_m', :'c1') as _vara \\gset
-- Blusa nueva: un modelo y color en tres tallas, colgado ayer.
select pg_temp.producto('FX Blusa nueva', null, :'cat_a') as pbn \\gset
select pg_temp.talla(pg_temp.variante('ZZ-FX-NUEVA-S', :'pbn', :'c1'), :'t_s') as vns \\gset
select pg_temp.talla(pg_temp.variante('ZZ-FX-NUEVA-M', :'pbn', :'c1'), :'t_m') as vnm \\gset
select pg_temp.talla(pg_temp.variante('ZZ-FX-NUEVA-L', :'pbn', :'c1'), :'t_l') as vnl \\gset
select count(pg_temp.llega(v, 3, now() - interval '2 days')) as _n1 from unnest(array[:'vns', :'vnm', :'vnl']::uuid[]) v \\gset
select count(pg_temp.bajada(v, 1, now() - interval '1 day')) as _n2 from unnest(array[:'vns', :'vnm', :'vnl']::uuid[]) v \\gset
-- Blusa vieja: colgada hace 40 días y nada vendido.
select pg_temp.talla(pg_temp.variante('ZZ-FX-VIEJA-M', pg_temp.producto('FX Blusa vieja', null, :'cat_a'), :'c1'), :'t_m') as vvi \\gset
select pg_temp.llega(:'vvi', 3, now() - interval '41 days') as _v1 \\gset
select pg_temp.bajada(:'vvi', 2, now() - interval '40 days') as _v2 \\gset
-- Blusa de la carga inicial: por la puerta real, hace 5 días (edad desconocida).
select pg_temp.talla(pg_temp.variante('ZZ-FX-CARGA-M', pg_temp.producto('FX Blusa carga inicial', null, :'cat_a'), :'c2'), :'t_m') as vca \\gset
select retail.cargar_stock_inicial(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'vca', 'cantidad', 2)), null, true, gen_random_uuid()) as _c1 \\gset
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '5 days' where variante_id = :'vca';
alter table retail.movimientos enable always trigger movimientos_inmutables;
-- Blusa tardía: piso 0, se baja 1 hace 3 días y a los 3 minutos se vende; al día siguiente se bajan 2 más.
select pg_temp.talla(pg_temp.variante('ZZ-FX-TARDIA-M', pg_temp.producto('FX Blusa tardia', null, :'cat_a'), :'c1'), :'t_m') as vta \\gset
select pg_temp.llega(:'vta', 4, now() - interval '4 days') as _t1 \\gset
select pg_temp.bajada(:'vta', 1, now() - interval '3 days') as _t2 \\gset
select pg_temp.vende(:'vta', 1, now() - interval '3 days' + interval '3 minutes') as _t3 \\gset
select pg_temp.bajada(:'vta', 2, now() - interval '2 days') as _t4 \\gset
-- Blusa con retiro: se bajan 3 hace 10 días, se retira 1 a los 2 minutos y se vende 1 hace 8 días.
select pg_temp.talla(pg_temp.variante('ZZ-FX-RETIRO-M', pg_temp.producto('FX Blusa retiro', null, :'cat_a'), :'c1'), :'t_m') as vre \\gset
select pg_temp.llega(:'vre', 4, now() - interval '11 days') as _r1 \\gset
select pg_temp.bajada(:'vre', 3, now() - interval '10 days') as _r2 \\gset
select pg_temp.retiro(:'vre', 1, now() - interval '10 days' + interval '2 minutes') as _r3 \\gset
select pg_temp.vende(:'vre', 1, now() - interval '8 days') as _r4 \\gset
-- Blusa dudosa: el stock del piso tocado a mano (0 cuando el libro dice 1).
select pg_temp.talla(pg_temp.variante('ZZ-FX-DUDOSA-M', pg_temp.producto('FX Blusa dudosa', null, :'cat_a'), :'c1'), :'t_m') as vdu \\gset
select pg_temp.llega(:'vdu', 3, now() - interval '7 days') as _d1 \\gset
select pg_temp.bajada(:'vdu', 2, now() - interval '6 days') as _d2 \\gset
select pg_temp.vende(:'vdu', 1, now() - interval '6 days' + interval '3 minutes') as _d3 \\gset
update retail.stock set cantidad = 0 where variante_id = :'vdu' and ubicacion_id = :'ubic' and sububicacion_id = :'sp';
-- Blusa que solo está en el almacén.
select pg_temp.talla(pg_temp.variante('ZZ-FX-ALMACEN-M', pg_temp.producto('FX Blusa en almacen', null, :'cat_a'), :'c1'), :'t_m') as val \\gset
select pg_temp.llega(:'val', 2, now() - interval '3 days') as _a1 \\gset
-- Chompa de invierno: llegó el 15-ago-2026 (invierno; fecha fija, así su estación ya terminó con cualquier fecha en que
-- se rehaga el archivo) y se colgó al día siguiente, en dos tallas; se vendió 1. El 20-ago llegó otro lote de la M a
-- TRUJILLO: su última llegada a esta tienda sigue siendo el 15, y su última llegada a CAYLA (la de las dos tallas: es el
-- mismo modelo+color) es el 20. Así el archivo distingue los dos campos.
select pg_temp.producto('FX Chompa invierno', 'invierno', :'cat_b') as pch \\gset
select pg_temp.talla(pg_temp.variante('ZZ-FX-CHOMPA-S', :'pch', :'c1'), :'t_s') as vchs \\gset
select pg_temp.talla(pg_temp.variante('ZZ-FX-CHOMPA-M', :'pch', :'c1'), :'t_m') as vchm \\gset
select count(pg_temp.llega(v, 3, '2026-08-15 10:00-05')) as _h1 from unnest(array[:'vchs', :'vchm']::uuid[]) v \\gset
select count(pg_temp.bajada(v, 2, '2026-08-16 10:00-05')) as _h2 from unnest(array[:'vchs', :'vchm']::uuid[]) v \\gset
select pg_temp.vende(:'vchs', 1, '2026-09-07 10:00-05') as _h3 \\gset
select pg_temp.usar(:'tru') as _hu1 \\gset
select pg_temp.llega(:'vchm', 2, '2026-08-20 10:00-05') as _h4 \\gset
select pg_temp.usar(:'ubic') as _hu2 \\gset
-- Polo clásico (todo el año) y chompa sin temporada, en la misma categoría.
select pg_temp.talla(pg_temp.variante('ZZ-FX-CLASICO-M', pg_temp.producto('FX Polo clasico', 'clasico', :'cat_b'), :'c1'), :'t_m') as vcl \\gset
select pg_temp.llega(:'vcl', 3, now() - interval '31 days') as _k1 \\gset
select pg_temp.bajada(:'vcl', 2, now() - interval '30 days') as _k2 \\gset
select pg_temp.talla(pg_temp.variante('ZZ-FX-SINTEMP-M', pg_temp.producto('FX Chompa sin temporada', null, :'cat_b'), :'c1'), :'t_m') as vst \\gset
select pg_temp.llega(:'vst', 3, now() - interval '16 days') as _s1 \\gset
select pg_temp.bajada(:'vst', 2, now() - interval '15 days') as _s2 \\gset
${k("FX_SEDE", "pg_temp.lectura()")}
${k("FX_CONF", "(select coalesce(jsonb_agg(to_jsonb(c) order by c.mes), '[]'::jsonb) from retail.fn_confianza_registro(:'ubic') c)")}`,
  (o) => {
    const sede = json(o.FX_SEDE);
    const conf = json(o.FX_CONF);
    afirmar("la lectura sembrada sale entera", sede?.separa_piso === true && Array.isArray(sede?.prendas) && Array.isArray(conf), `FX_SEDE=${(o.FX_SEDE ?? "").slice(0, 120)}`);
    if (!sede || !conf) return;
    if (process.env.FRESCURA_FIXTURE_ESCRIBIR) {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      const archivo = {
        _comentario:
          "Salida REAL de retail.fn_frescura_sede y retail.fn_confianza_registro sobre la tienda sembrada en el caso T13 de scripts/pruebas/frescura_lectura.mjs. Se rehace con FRESCURA_FIXTURE_ESCRIBIR=1 pnpm pruebas:frescura-lectura; no se edita a mano.",
        fn_frescura_sede: sede,
        fn_confianza_registro: conf,
      };
      writeFileSync(FIXTURE, `${JSON.stringify(archivo, null, 2)}\n`);
      console.log(`  · escrito ${FIXTURE}`);
    }
    let guardado = null;
    try {
      guardado = JSON.parse(readFileSync(FIXTURE, "utf8"));
    } catch {
      /* sin archivo: la afirmación de abajo lo dice */
    }
    afirmar("existe el archivo de la web", guardado !== null, FIXTURE);
    if (!guardado) return;
    const hoy = forma(sede, conf);
    const archivo = forma(guardado.fn_frescura_sede, guardado.fn_confianza_registro);
    const faltan = archivo.filter((x) => !hoy.includes(x));
    const sobran = hoy.filter((x) => !archivo.includes(x));
    afirmar(
      "misma forma que el archivo de la web (claves y tipos de la lectura, cada prenda, evento, tardía y fila de confianza)",
      faltan.length === 0 && sobran.length === 0,
      `en el archivo y no hoy: ${faltan.join(" / ") || "—"} · hoy y no en el archivo: ${sobran.join(" / ") || "—"}`,
    );
    afirmar(
      "la siembra da lo mismo que cuando se escribió el archivo (prendas, tardías, dudosas y meses)",
      sede.prendas.length === guardado.fn_frescura_sede.prendas.length &&
        sede.tardias.length === guardado.fn_frescura_sede.tardias.length &&
        sede.dudosas.length === guardado.fn_frescura_sede.dudosas.length &&
        conf.length === guardado.fn_confianza_registro.length,
      `prendas ${sede.prendas.length}/${guardado.fn_frescura_sede.prendas.length}, tardías ${sede.tardias.length}/${guardado.fn_frescura_sede.tardias.length}, dudosas ${sede.dudosas.length}/${guardado.fn_frescura_sede.dudosas.length}, meses ${conf.length}/${guardado.fn_confianza_registro.length}`,
    );
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
