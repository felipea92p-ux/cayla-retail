#!/usr/bin/env node
/**
 * Prueba del paso 3 de Frescura 3c (ADR-0208, ADR-0246, ADR-0248): la lectura SQL
 * (`supabase/migrations/20260928120300_frescura_lectura.sql`): `fn_es_llegada`, `fn_frescura_sede` y
 * `fn_confianza_registro`.
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
 *       de la migración nombra los md5 vivos.
 *   T1  permisos: el líder sí; una integrante (sin líder) no, con la pista frescura_sin_permiso, en las dos (también
 *       fn_confianza_registro sin tienda); anon no (42501); si fn_puede_operar_ubicacion dice que no a esa tienda, el
 *       líder tampoco (hoy un líder opera todas: la prueba la reemplaza dentro de su transacción para vigilar que el
 *       candado la pregunte), y sin tienda fn_confianza_registro igual responde.
 *   T2  qué prendas: la colgada sin movimiento en la ventana aparece con su saldo inicial (marca 4) y su primera
 *       exhibición de hace 149 días; la que solo está en el almacén aparece sin eventos; la que solo está en cuarentena
 *       no; la que se vendió entera en la ventana sí (sin ella no hay vara); la que se vendió antes de la ventana no; la
 *       ventana (desde = ahora − p_dias) y sus bordes.
 *   T3  las marcas de cada evento: bajada 2, venta 1, retiro 2; carga inicial por la puerta real y a mano 6 (2 + 4);
 *       carga de otra hora 2; ajuste al piso 4 y su ajuste negativo 0; devolución 4; llegada directo al piso 0; carga
 *       directo al piso 4; cuarentena → piso 2; lo que llega de otra tienda como traslado directo 4; saldo inicial 4 con
 *       oid nulo. El orden de los eventos: hora, saldo inicial primero.
 *   T4  temporada (ADR-0246): la chompa de invierno cargada el 26-set-2026 sale con fin_estacion = inicio de la
 *       primavera 2026 (ya pasó: «Temporada pasada») y el clásico de verano cargado el mismo día NO (es clásico); el
 *       clásico de todo el año sin fin ni estación; la temporada por categoría y por color (origen); sin temporada, todo
 *       nulo; sin llegada, sin fin; en_estacion_ahora = ¿hoy es su estación?; con dos llegadas, manda la ÚLTIMA (con el
 *       calendario 2025 sembrado dentro de la prueba).
 *   T5  color nulo: la prenda sale con color nulo y su temporada del producto.
 *   T6  productos es_prueba y la «Prenda sin registrar» fuera; una tienda donde solo se movió un producto de prueba da
 *       prendas [], eventos {} y tardías [] — con la lista nula el libro SÍ los habría devuelto (se muestra).
 *   T7  Taller, tienda inactiva, tienda con piso y sin almacén, tienda nula o inexistente → {"separa_piso": false}.
 *   T8  fn_es_llegada ≡ el predicado de fn_resumen_comparacion: el predicado se LEE del cuerpo vivo de esa función y se
 *       evalúa contra fn_es_llegada en todas las filas del libro del seed y en todas las combinaciones de tipo, motivo y
 *       las tres llaves; 0 diferencias.
 *   T9  tardías y dudosas: la bajada tardía cerrada sale con su oid y sus unidades; la normal, la corregida, la que sigue
 *       abierta y la dudosa no; la dudosa sale en «dudosas». Ninguna persona en la salida.
 *   T10 fn_confianza_registro: cuenta la normal, la tardía y la del retiro parcial (unidades = Σ efectiva); deja fuera
 *       la carga inicial, la corregida, la dudosa, la abierta y la de hace menos de 20 minutos; mes de Lima; una fila
 *       por tienda y mes aunque no haya bajadas; p_meses de 1 a 3; sin tienda, todas las tiendas y nunca el Taller.
 *   T11 niveles: 9 filas «pocos_datos», 10 y 19 «aceptable», 20 «solido».
 *   T12 la guarda: pegada otra vez deja lo mismo; con cualquiera de las tres funciones parchada en vivo aborta sin
 *       tocarla.
 *   T13 el contrato con la web: siembra una tienda con de todo (la vara de las blusas, nueva, vieja, carga inicial,
 *       tardía, retiro, dudosa, solo almacén, chompa de invierno, clásico, sin temporada) y exige que la salida de las
 *       dos lecturas tenga la MISMA forma (claves y tipos) que `apps/web/lib/__fixtures__/frescura-sede.json`, la salida
 *       real con la que `frescura-contrato.test.ts` prueba la web. Con FRESCURA_FIXTURE_ESCRIBIR=1 reescribe ese archivo.
 *
 * CÓMO. Como `frescura_bajadas.mjs`: cada caso en su transacción con ROLLBACK, en una TIENDA NUEVA (así lo sembrado no
 * se mezcla), movimientos insertados como `postgres` con `created_at` fijado (t0 = ahora − 3 h) en orden cronológico y
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260928120300_frescura_lectura.sql"), "utf8");
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
/** ¿`public` (grantee 0) tiene EXECUTE? Un proacl nulo es el valor por defecto: sí. */
const aPublic = (firma) =>
  `(select p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
      from pg_proc p where p.oid = '${firma}'::regprocedure)`;
const veces = (firma, texto) =>
  `(select (length(d) - length(replace(d, '${texto}', ''))) / length('${texto}') from (select pg_get_functiondef('${firma}'::regprocedure) as d) x)`;

// ---------------------------------------------------------------------------
correr(
  "T0 · forma: una versión de cada una, security definer y plan a medida, quién la ejecuta, una llamada al libro y al núcleo",
  `${k("N", "(select string_agg(proname || '=' || n, ',' order by proname) from (select proname, count(*) as n from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_es_llegada', 'fn_frescura_sede', 'fn_confianza_registro') group by proname) x)")}
${k("F_SEDE", `(select p.prosecdef || ',' || p.provolatile::text || ',' || array_to_string(p.proconfig, ';') from pg_proc p where p.oid = '${FIRMA_SEDE}'::regprocedure)`)}
${k("F_CONF", `(select p.prosecdef || ',' || p.provolatile::text || ',' || array_to_string(p.proconfig, ';') from pg_proc p where p.oid = '${FIRMA_CONF}'::regprocedure)`)}
${k("F_LLEG", `(select p.prosecdef || ',' || p.provolatile::text from pg_proc p where p.oid = '${FIRMA_LLEG}'::regprocedure)`)}
${k("P_SEDE", `has_function_privilege('authenticated', '${FIRMA_SEDE}', 'execute') || ',' || has_function_privilege('anon', '${FIRMA_SEDE}', 'execute') || ',' || ${aPublic(FIRMA_SEDE)}`)}
${k("P_CONF", `has_function_privilege('authenticated', '${FIRMA_CONF}', 'execute') || ',' || has_function_privilege('anon', '${FIRMA_CONF}', 'execute') || ',' || ${aPublic(FIRMA_CONF)}`)}
${k("P_LLEG", `has_function_privilege('authenticated', '${FIRMA_LLEG}', 'execute') || ',' || has_function_privilege('anon', '${FIRMA_LLEG}', 'execute') || ',' || ${aPublic(FIRMA_LLEG)}`)}
${k("LLAMADAS", `${veces(FIRMA_SEDE, "fn_ledger_puntos(")} || ',' || ${veces(FIRMA_SEDE, "fn_bajadas_del_piso_nucleo(")}`)}
${k("LIBRO_CON_LISTA", `(select d ~ 'fn_ledger_puntos\\(p_ubicacion_id, v_desde, v_ids\\)'
    and d ~ 'coalesce\\(array_agg\\(i\\.variante_id\\), ''\\{\\}''::uuid\\[\\]\\) into v_ids'
    and (length(d) - length(replace(d, 'into v_ids', ''))) / length('into v_ids') = 1
    and d !~ 'v_ids\\s*:='
  from (select pg_get_functiondef('${FIRMA_SEDE}'::regprocedure) as d) x)`)}
${k("COLUMNAS_CONF", `(select array_to_string(p.proargnames, ',') from pg_proc p where p.oid = '${FIRMA_CONF}'::regprocedure)`)}
${k("MD5", "(select string_agg(proname || '=' || md5(prosrc), ',' order by proname) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_es_llegada', 'fn_frescura_sede', 'fn_confianza_registro'))")}`,
  (o) => {
    afirmar("una sola versión de cada una", o.N === "fn_confianza_registro=1,fn_es_llegada=1,fn_frescura_sede=1", `N=${o.N}`);
    const conf = "true,s,search_path=retail, public, extensions;plan_cache_mode=force_custom_plan";
    afirmar("fn_frescura_sede: security definer, stable, search_path y plan a medida", o.F_SEDE === conf, `F_SEDE=${o.F_SEDE}`);
    afirmar("fn_confianza_registro: security definer, stable, search_path y plan a medida", o.F_CONF === conf, `F_CONF=${o.F_CONF}`);
    afirmar("fn_es_llegada: immutable, sin security definer", o.F_LLEG === "false,i", `F_LLEG=${o.F_LLEG}`);
    afirmar("fn_frescura_sede: authenticated sí, anon no, public no", o.P_SEDE === "true,false,false", `P_SEDE=${o.P_SEDE}`);
    afirmar("fn_confianza_registro: authenticated sí, anon no, public no", o.P_CONF === "true,false,false", `P_CONF=${o.P_CONF}`);
    afirmar("fn_es_llegada: nadie de afuera (ni authenticated, ni anon, ni public)", o.P_LLEG === "false,false,false", `P_LLEG=${o.P_LLEG}`);
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
      ["fn_es_llegada", "fn_frescura_sede", "fn_confianza_registro"].every((f) => md5[f] && MIGRACION.includes(`'${md5[f]}'`)),
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
${k("SIN_LLEGADA", "(select pg_temp.temporada(:'j', 'ZZ-FL-T4-SIN-LLEGADA') || '|' || coalesce(x ->> 'ultima_llegada', 'null') || '|' || coalesce(x ->> 'fin_estacion', 'null') || '|' || ((x ->> 'en_estacion_ahora') = pg_temp.hoy_en('invierno')) from (select pg_temp.prenda(:'j', 'ZZ-FL-T4-SIN-LLEGADA') as x) y)")}`,
  (o) => {
    afirmar("chompa: invierno, del producto, no clásica", o.CHOMPA === "invierno|producto|false", `CHOMPA=${o.CHOMPA}`);
    afirmar("chompa: última llegada = la carga del 26-set", o.CHOMPA_LLEGADA === "true", `CHOMPA_LLEGADA=${o.CHOMPA_LLEGADA}`);
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
    afirmar("sin ninguna llegada: sin fin_estacion (pero sí sabe si hoy es su estación)", o.SIN_LLEGADA === "invierno|producto|false|null|null|true", `SIN_LLEGADA=${o.SIN_LLEGADA}`);
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
      o.CLAVES_PRENDA === "almacen_hoy,categoria_id,categoria_nombre,codigo,color_codigo,color_nombre,en_estacion_ahora,es_clasico,fin_estacion,piso_hoy,primera_exhibicion,producto_id,producto_nombre,talla,temporada,temporada_origen,ultima_llegada,variante_id",
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
const MD5S = `(select string_agg(proname || '=' || md5(prosrc), ',' order by proname) from pg_proc
  where pronamespace = 'retail'::regnamespace and proname in ('fn_es_llegada', 'fn_frescura_sede', 'fn_confianza_registro'))`;
correr(
  "T12 · la guarda: pegada otra vez deja lo mismo; con una función parchada en vivo aborta y no la pisa",
  `select ${MD5S} as antes \\gset
${k("OTRA_VEZ", `pg_temp.intento(${comoLiteral(MIGRACION)})`)}
${k("MISMOS", `${MD5S} = :'antes'`)}
${["fn_es_llegada", "fn_frescura_sede", "fn_confianza_registro"]
  .map((f, i) => {
    const firma = { fn_es_llegada: FIRMA_LLEG, fn_frescura_sede: FIRMA_SEDE, fn_confianza_registro: FIRMA_CONF }[f];
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
    afirmar("…y los tres md5 no cambian", o.MISMOS === "true", `MISMOS=${o.MISMOS}`);
    ["fn_es_llegada", "fn_frescura_sede", "fn_confianza_registro"].forEach((f, i) => {
      const e = json(o[`PARCHE_${i}`]);
      afirmar(`${f} parchada en vivo: la migración aborta nombrándola`, e?.ok === false && (e?.msg ?? "").includes(`${f} ya existe con otro cuerpo`), o[`PARCHE_${i}`]);
      afirmar(`…y el parche de ${f} sigue ahí`, o[`SIGUE_${i}`] === "true", `SIGUE_${i}=${o[`SIGUE_${i}`]}`);
    });
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
-- se rehaga el archivo) y se colgó al día siguiente, en dos tallas; se vendió 1.
select pg_temp.producto('FX Chompa invierno', 'invierno', :'cat_b') as pch \\gset
select pg_temp.talla(pg_temp.variante('ZZ-FX-CHOMPA-S', :'pch', :'c1'), :'t_s') as vchs \\gset
select pg_temp.talla(pg_temp.variante('ZZ-FX-CHOMPA-M', :'pch', :'c1'), :'t_m') as vchm \\gset
select count(pg_temp.llega(v, 3, '2026-08-15 10:00-05')) as _h1 from unnest(array[:'vchs', :'vchm']::uuid[]) v \\gset
select count(pg_temp.bajada(v, 2, '2026-08-16 10:00-05')) as _h2 from unnest(array[:'vchs', :'vchm']::uuid[]) v \\gset
select pg_temp.vende(:'vchs', 1, '2026-09-07 10:00-05') as _h3 \\gset
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
