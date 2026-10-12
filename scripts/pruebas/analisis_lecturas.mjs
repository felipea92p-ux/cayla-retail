#!/usr/bin/env node
/**
 * Pruebas de las dos lecturas nuevas de Análisis v4 (ADR-0357) — `retail.fn_analisis_sede(p_ubicacion_id)` (migración
 * `20261006214000_analisis_prendas_de_sede.sql`, actividad 2) y `retail.fn_analisis_por_llegar(p_ubicacion_id)` (migración
 * `20261006215000_analisis_por_llegar.sql`, actividad 3). CAYLA V2.
 *
 * LO QUE VIGILA. Análisis decide con estas cifras qué se compra, qué se manda a otra tienda y qué se liquida. El error caro es
 * contar mal: una venta devuelta que sigue contando hace «acabarse» una prenda que no se vende; un día sin venderse que se corta
 * en la ventana manda a «vigilar» lo que lleva 3 meses quieto; una compra anulada que sigue «por llegar» hace no comprar lo que
 * falta. Y la puerta: la encargada y el líder ven lo mismo (decisión 8), pero quien no puede analizar no ve nada.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; una sede NUEVA por caso, así nada del seed se mezcla).
 *   F  FORMA: una firma cada una, SECURITY DEFINER, STABLE, search_path fijo, devuelven jsonb; anon sin EXECUTE y authenticated
 *      con EXECUTE; las claves del contrato (las que lee `apps/web/lib/analisis-sede-lectura.ts`).
 *   P  PUERTAS: el líder lee cualquier tienda; una integrante SIN Análisis recibe NULL (también de su propia tienda); CON Análisis
 *      lee una tienda que no opera (decisión 8); sin sesión, NULL; sede nula, 22004.
 *   V  VENTAS por prenda: 30 días de Lima (el día 29 entra, el 30 no), 8 semanas (la semana k termina hoy − 7·(7−k); la de hace 56
 *      días ya no entra); anulada, de prueba, de otra sede y la liquidación de una dañada no cuentan; un cambio cuenta como la
 *      prenda nueva en el día de la venta y lo devuelto con devolución aprobada (no la pendiente) no cuenta.
 *   U  QUÉ PRENDAS SALEN: libres, vendidas en 8 semanas, llegadas en 30 días o en camino; no la vendida hace 60 días sin stock, ni
 *      un producto de prueba, ni la centinela, ni lo que solo está en Cuarentena.
 *   S  STOCK: lo libre en piso y en almacén (lo que no tiene lugar va al almacén).
 *   D  DÍAS EN EL PISO SIN VENDERSE (20261007120000): desde la última venta o desde que salió al piso de ESTA tienda, lo que pasó
 *      después; NULL si nunca salió al piso (aunque lleve semanas guardada) o si solo viene en camino. Salir al piso es un movimiento
 *      en un piso de la tienda (bajarla, entrar directo, venderla, subirla de vuelta) o su primera venta; el piso de otra tienda no
 *      cuenta. Con cada fila, `salio_al_piso` (la primera vez) y `llego` (la primera entrada, no la de Cuarentena).
 *   L  LLEGADAS de 30 días (`fn_es_llegada`): carga inicial y traslado recibido sí; bajar al piso, ajustes y devoluciones no; y de
 *      eso, lo vendido desde la primera llegada, nunca más de lo que llegó.
 *   R  REBAJA: de cada 100 líneas de 30 días, las que llevaron un descuento de línea (no el regalo del club) o un descuento a toda
 *      la venta; la «sin registrar» cuenta; NULL si la tienda no vendió.
 *   O  ORIGEN: de `fn_origen_producto` (compra vigente → terceros con su proveedor; producción terminada → taller; nada → NULL).
 *   C  CATÁLOGO: la foto de su color (nunca la de otro color), categoría con prefijo y familia, costo 0 → NULL.
 *   X  POR LLEGAR: traslados en tránsito (de = tipo del origen, fecha en día de Lima) y compras repartidas a la tienda que faltan
 *      recibir (lo recibido y lo cerrado restan); no cuentan traslados recibidos, cerrados ni de otra tienda, compras anuladas,
 *      agrupadas (sin talla) ni repartidas a otra tienda, ni la producción que no salió del Taller. Toda prenda por llegar es
 *      también una fila de `fn_analisis_sede`.
 *   M  LAS MIGRACIONES: se pueden pegar dos veces.
 *   N  NÚMEROS: 200 prendas con stock y 600 ventas en la sede; mediana de 5 lecturas.
 *
 * USO
 *   node scripts/pruebas/analisis_lecturas.mjs                → contra la base `postgres` del stack local
 *   node scripts/pruebas/analisis_lecturas.mjs --base otra    → contra otra base del mismo contenedor
 * Las migraciones se cargan dentro de cada caso (son `create or replace`): corre igual con la base al día o sin ellas.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const leerMigracion = (nombre) =>
  readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8").replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "");
const MIGRACION_SEDE = leerMigracion("20261006214000_analisis_prendas_de_sede.sql");
const MIGRACION_LLEGAR = leerMigracion("20261006215000_analisis_por_llegar.sql");
const MIGRACION_PISO = leerMigracion("20261007120000_analisis_salio_al_piso.sql");
const MIGRACION_ULTIMA = leerMigracion("20261010120000_analisis_ultima_venta.sql");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed), su rol sin Análisis
const CENTINELA = "22222222-2222-4222-8222-222222222222"; // «Prenda sin registrar» (ADR-0179)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const SIN_SESION = `set local request.jwt.claim.sub = '';\nset local request.jwt.claims = '{}';\n`;

/**
 * Todo caso empieza igual: una tienda NUEVA («Sede AN», con piso, almacén y Cuarentena) y otra («Sede AN Otra»), una categoría
 * propia, Felipe en sesión y las piezas para armar stock, ventas, traslados y compras con hora fijada.
 */
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${MIGRACION_SEDE}
${MIGRACION_LLEGAR}
${MIGRACION_PISO}
${MIGRACION_ULTIMA}
set local search_path = retail, public, extensions;

create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;

insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede AN', 'tienda', true), ('Sede AN Otra', 'tienda', true);
select id as sede from retail.ubicaciones where nombre = 'Sede AN' \\gset
select id as otra from retail.ubicaciones where nombre = 'Sede AN Otra' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values
  (:'sede', 'Piso de venta', 'piso_venta'), (:'sede', 'Almacén de tienda', 'almacen_tienda'), (:'sede', 'Cuarentena', 'cuarentena'),
  (:'otra', 'Piso de venta', 'piso_venta'), (:'otra', 'Almacén de tienda', 'almacen_tienda');
insert into retail.categorias (nombre, familia, prefijo) values ('AN Polos', 'indumentaria', 'ZQX');
select id as cat from retail.categorias where nombre = 'AN Polos' \\gset
select codigo as color1 from retail.colores where hex is not null and activo order by codigo limit 1 \\gset
select codigo as color2 from retail.colores where hex is not null and activo order by codigo offset 1 limit 1 \\gset
select id as prov from retail.proveedores where activo order by created_at limit 1 \\gset

-- psql no sustituye variables dentro de cuerpos entre $$: viajan como parámetros de sesión.
select set_config('an.sede', :'sede', true) as _1, set_config('an.otra', :'otra', true) as _2, set_config('an.taller', :'taller', true) as _3,
       set_config('an.cat', :'cat', true) as _4, set_config('an.color1', :'color1', true) as _5, set_config('an.prov', :'prov', true) as _6 \\gset

-- Una prenda nueva: su propio producto en la categoría AN, con talla y color.
create function pg_temp.prenda(p_sku text, p_talla text default 'M', p_color text default null, p_precio numeric default 100,
                               p_costo numeric default 40) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id)
    select 'ZZ AN ' || p_sku, current_setting('an.cat')::uuid, mp.marca_id, mp.proveedor_id
      from retail.marca_proveedores mp order by mp.created_at limit 1
    returning id into p;
  insert into retail.variantes (producto_id, sku, precio, costo, talla_id, color_codigo)
    values (p, 'ZZ-AN-' || p_sku, p_precio, p_costo, (select id from retail.tallas where valor = p_talla), coalesce(p_color, current_setting('an.color1')))
    returning id into v;
  return v;
end $$;
create function pg_temp.producto(v uuid) returns uuid language sql as $$ select producto_id from retail.variantes where id = v $$;

-- Una entrada aplicada (mueve el stock) con su hora y su motivo: al piso, al almacén, a Cuarentena o sin lugar (p_lugar null).
create function pg_temp.entra(v uuid, n int, cuando timestamptz, p_motivo text default 'prueba', p_lugar text default 'almacen_tienda',
                              p_sede uuid default null, p_tipo text default 'entrada') returns uuid language plpgsql as $$
declare m uuid; u uuid := coalesce(p_sede, current_setting('an.sede')::uuid);
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
    values (v, u, (select id from retail.sububicaciones where ubicacion_id = u and tipo = p_lugar), p_tipo, n, p_motivo, cuando)
    returning id into m;
  perform retail.fn_aplicar_movimiento(m);
  return m;
end $$;
-- Bajar al piso dentro de la misma tienda (un traslado interno), aplicado.
create function pg_temp.baja(v uuid, n int, cuando timestamptz) returns void language plpgsql as $$
declare m uuid; u uuid := current_setting('an.sede')::uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
    values (v, u, (select id from retail.sububicaciones where ubicacion_id = u and tipo = 'almacen_tienda'), u,
            (select id from retail.sububicaciones where ubicacion_id = u and tipo = 'piso_venta'), 'traslado', n, 'movimiento_interno', cuando)
    returning id into m;
  perform retail.fn_aplicar_movimiento(m);
end $$;
-- Las 12:00 de Lima de hace k días (0 = hoy).
create function pg_temp.dia(k int) returns timestamptz language sql stable as $$
  select ((retail.fn_hoy_lima() - k) + time '12:00') at time zone 'America/Lima'
$$;
-- Una venta de una línea, con su hora y su descuento; devuelve la línea. No mueve stock (la lectura no lo necesita).
create function pg_temp.vende(v uuid, n int, cuando timestamptz, p_estado text default 'completada', p_sede uuid default null,
                              p_prueba boolean default false, p_desc numeric default 0, p_club numeric default 0,
                              p_pct numeric default 0) returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := coalesce(p_sede, current_setting('an.sede')::uuid);
begin
  if p_estado = 'anulada' then
    insert into retail.ventas (ubicacion_id, estado, anulado_en, motivo_anulacion, created_at, es_prueba, descuento_pct)
      values (u, 'anulada', cuando + interval '1 hour', 'prueba', cuando, p_prueba, p_pct) returning id into vt;
  else
    insert into retail.ventas (ubicacion_id, estado, created_at, es_prueba, descuento_pct)
      values (u, 'completada', cuando, p_prueba, p_pct) returning id into vt;
  end if;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario, descuento_unitario,
                                  descuento_club_unitario, motivo_descuento)
    values (vt, v, n, 100, 40, p_desc, p_club, case when p_desc - p_club > 0 then 'liquidacion_temporada' end)
    returning id into li;
  return li;
end $$;
-- Una devolución de una línea, aprobada o pendiente.
create function pg_temp.devuelve(li uuid, n int, p_estado text default 'aprobada') returns void language plpgsql as $$
declare d uuid; vt uuid := (select venta_id from retail.venta_items where id = li);
begin
  insert into retail.devoluciones (venta_id, ubicacion_id, estado, motivo, aprobado_en)
    values (vt, (select ubicacion_id from retail.ventas where id = vt), p_estado, 'prueba', case when p_estado <> 'pendiente' then now() end)
    returning id into d;
  insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (d, li, n, 'vendible');
end $$;
-- Un traslado de una línea hacia la sede (o hacia p_destino), en el estado pedido; devuelve el traslado.
create function pg_temp.traslado(p_origen uuid, v uuid, n int, p_estado text default 'en_transito', p_llega timestamptz default null,
                                 p_destino uuid default null) returns uuid language plpgsql as $$
declare t uuid;
begin
  insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado, fecha_estimada_llegada)
    values (p_origen, coalesce(p_destino, current_setting('an.sede')::uuid), p_estado, p_llega) returning id into t;
  insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (t, v, n);
  return t;
end $$;
-- Lo que entra al stock de la sede al recibir una línea de un traslado (como confirmar_traslado): recepción + entrada aplicada.
create function pg_temp.recibe(t uuid, v uuid, n int, cuando timestamptz) returns void language plpgsql as $$
declare r uuid; m uuid; u uuid := current_setting('an.sede')::uuid;
begin
  insert into retail.transferencia_recepciones (transferencia_id, variante_id, cantidad_recibida, created_at) values (t, v, n, cuando)
    returning id into r;
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_recepcion_id, created_at)
    values (v, u, (select id from retail.sububicaciones where ubicacion_id = u and tipo = 'almacen_tienda'), 'entrada', n,
            'traslado_entrada', r, cuando)
    returning id into m;
  perform retail.fn_aplicar_movimiento(m);
  update retail.transferencia_recepciones set movimiento_id = m where id = r;
end $$;
-- Una factura de la sede con una línea (de la prenda, o agrupada si p_variante es null) repartida a p_reparto; devuelve la línea.
create function pg_temp.compra(p_producto uuid, p_variante uuid, n int, p_reparto uuid, p_llega date default null,
                               p_estado text default 'vigente') returns uuid language plpgsql as $$
declare c uuid; li uuid;
begin
  insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total,
                              estado, ubicacion_gestion_id, naturaleza, fecha_estimada_llegada)
    values (current_setting('an.prov')::uuid, 'factura', 'ZAN', substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
            retail.fn_hoy_lima(), 'credito', retail.fn_hoy_lima() + 30, 100, 18, 118, p_estado, current_setting('an.sede')::uuid,
            'mercaderia', p_llega)
    returning id into c;
  insert into retail.compra_items (compra_id, producto_id, variante_id, cantidad, costo_unitario) values (c, p_producto, p_variante, n, 40)
    returning id into li;
  insert into retail.compra_item_destinos (compra_item_id, ubicacion_id, cantidad) values (li, p_reparto, n);
  return li;
end $$;

-- La lectura y sus pedazos.
create function pg_temp.lee(u uuid default null) returns jsonb language sql as $$
  select retail.fn_analisis_sede(coalesce(u, current_setting('an.sede')::uuid))
$$;
create function pg_temp.fila(v uuid, u uuid default null) returns jsonb language sql as $$
  select p from jsonb_array_elements(retail.fn_analisis_sede(coalesce(u, current_setting('an.sede')::uuid)) -> 'prendas') p
   where p ->> 'variante_id' = v::text
$$;
create function pg_temp.dato(v uuid, campo text) returns text language sql as $$
  select coalesce(pg_temp.fila(v) ->> campo, 'null')
$$;
create function pg_temp.esta(v uuid) returns boolean language sql as $$ select pg_temp.fila(v) is not null $$;
create function pg_temp.llega(v uuid, u uuid default null) returns text language sql as $$
  select coalesce(string_agg((x ->> 'de') || ':' || (x ->> 'cantidad') || ':' || coalesce(x ->> 'fecha', '-'), ';'
                             order by x ->> 'fecha' nulls last, x ->> 'de'), 'nada')
    from jsonb_array_elements(retail.fn_analisis_por_llegar(coalesce(u, current_setting('an.sede')::uuid))) x
   where x ->> 'variante_id' = v::text
$$;

${como(FELIPE)}
`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.AN_DEBUG && !r.ok) console.log(r.mensaje);
  // Solo la última línea: lo que arma un caso imprime ids antes de la respuesta.
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
  return obtenido;
}
/** La respuesta trae «obtenido|esperado» calculados en la base (fechas relativas a hoy en Lima): tienen que ser iguales. */
const iguales = (o) => {
  const [a, b] = o.split("|");
  return a !== undefined && a === b;
};

const OID_SEDE = `'retail.fn_analisis_sede(uuid)'::regprocedure`;
const OID_LLEGAR = `'retail.fn_analisis_por_llegar(uuid)'::regprocedure`;
const forma = (oid, nombre) => `select concat_ws(',',
   (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = '${nombre}'),
   (select prosecdef from pg_proc where oid = ${oid}),
   (select provolatile = 's' from pg_proc where oid = ${oid}),
   (select coalesce(array_to_string(proconfig, ';') like '%search_path=retail, public, extensions%', false) from pg_proc where oid = ${oid}),
   (select pg_get_function_result(oid) from pg_proc where oid = ${oid}),
   has_function_privilege('anon', ${oid}, 'execute'),
   has_function_privilege('authenticated', ${oid}, 'execute'));`;

// F. FORMA ---------------------------------------------------------------------------------------------------------------
caso("F1 fn_analisis_sede: una firma, SECURITY DEFINER, STABLE, search_path fijo, jsonb; anon no la ejecuta y authenticated sí", forma(OID_SEDE, "fn_analisis_sede"), "1,t,t,t,jsonb,f,t");
caso("F2 fn_analisis_por_llegar: lo mismo", forma(OID_LLEGAR, "fn_analisis_por_llegar"), "1,t,t,t,jsonb,f,t");
const CLAVES_FILA = [
  "variante_id", "producto_id", "nombre", "color", "color_hex", "talla", "categoria", "categoria_prefijo", "categoria_familia",
  "foto_url", "precio", "costo", "origen", "proveedor_id", "piso", "almacen", "vendidas_30", "semanas", "dias_sin_vender",
  "llegaron_30", "vendidas_de_llegadas_30", "salio_al_piso", "llego", "ultima_venta",
].sort();
caso(
  "F3 las claves del contrato: arriba (tienda, hoy, rebaja, prendas) y en cada fila (las que lee analisis-sede-lectura.ts)",
  `select pg_temp.prenda('F3') as v \\gset
   select pg_temp.entra(:'v', 1, pg_temp.dia(3));
   select (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(pg_temp.lee()) k) || ';' ||
          (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(pg_temp.fila(:'v')) k);`,
  `hoy,prendas,rebaja_de_100,ubicacion_id;${CLAVES_FILA.join(",")}`
);

// P. PUERTAS -------------------------------------------------------------------------------------------------------------
caso(
  "P1 el líder lee una tienda: su id, hoy en Lima y (sin historia) ninguna prenda",
  `select concat_ws(',', pg_temp.lee() ->> 'ubicacion_id' = :'sede', (pg_temp.lee() ->> 'hoy')::date = retail.fn_hoy_lima(),
     jsonb_array_length(pg_temp.lee() -> 'prendas'), jsonb_array_length(retail.fn_analisis_por_llegar(:'sede')));`,
  "t,t,0,0"
);
caso(
  "P2 una integrante SIN Análisis recibe NULL, también de su propia tienda (Trujillo), en las dos lecturas",
  `${como(MICAELA)}select concat_ws(',',
     retail.fn_analisis_sede((select id from retail.ubicaciones where nombre = 'Tienda Trujillo')) is null,
     retail.fn_analisis_sede(:'sede') is null,
     retail.fn_analisis_por_llegar((select id from retail.ubicaciones where nombre = 'Tienda Trujillo')) is null,
     retail.fn_analisis_por_llegar(:'sede') is null);`,
  "t,t,t,t"
);
caso(
  "P3 con Análisis en su rol (encargada) lee una tienda que NO opera: decisión 8, la encargada ve lo mismo que el líder",
  `insert into retail.rol_modulos (rol_id, modulo)
     select c.rol_id, 'analisis' from retail.colaboradores c join public.personas p on p.id = c.persona_id
      where p.auth_user_id = '${MICAELA}' on conflict do nothing;
   select pg_temp.prenda('P3') as v \\gset
   select pg_temp.entra(:'v', 2, pg_temp.dia(3));
   ${como(MICAELA)}select concat_ws(',', retail.fn_puede_operar_ubicacion(:'sede'),
     (select count(*) from jsonb_array_elements(retail.fn_analisis_sede(:'sede') -> 'prendas') p where p ->> 'variante_id' = :'v'),
     retail.fn_analisis_por_llegar(:'sede') is not null);`,
  "f,1,t"
);
caso(
  "P4 sin sesión, NULL en las dos (nunca un jsonb vacío que diga «sin ventas»)",
  `${SIN_SESION}select concat_ws(',', retail.fn_analisis_sede(:'sede') is null, retail.fn_analisis_por_llegar(:'sede') is null);`,
  "t,t"
);
caso(
  "P5 sede nula: error 22004 en las dos",
  `select split_part(pg_temp.intento('select retail.fn_analisis_sede(null)'), '|', 1) || ',' ||
          split_part(pg_temp.intento('select retail.fn_analisis_por_llegar(null)'), '|', 1);`,
  "22004,22004"
);

// V. VENTAS --------------------------------------------------------------------------------------------------------------
caso(
  "V1 30 días (el día 29 entra, el 30 no) y 8 semanas (la de hace 56 días ya no); anulada, de prueba, de otra sede y la liquidación de una dañada no cuentan",
  `select pg_temp.prenda('V1') as v \\gset
   select pg_temp.entra(:'v', 2, pg_temp.dia(100), 'prueba', 'piso_venta'); select pg_temp.entra(:'v', 3, pg_temp.dia(100));
   select pg_temp.vende(:'v', 1, pg_temp.dia(0)); select pg_temp.vende(:'v', 2, pg_temp.dia(6)); select pg_temp.vende(:'v', 1, pg_temp.dia(7));
   select pg_temp.vende(:'v', 1, pg_temp.dia(29)); select pg_temp.vende(:'v', 4, pg_temp.dia(30));
   select pg_temp.vende(:'v', 1, pg_temp.dia(55)); select pg_temp.vende(:'v', 5, pg_temp.dia(56));
   select pg_temp.vende(:'v', 5, pg_temp.dia(2), 'anulada');
   select pg_temp.vende(:'v', 5, pg_temp.dia(2), 'completada', null, true);
   select pg_temp.vende(:'v', 5, pg_temp.dia(2), 'completada', :'otra');
   select pg_temp.vende(:'v', 1, pg_temp.dia(2)) as li \\gset
   insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id)
     values (:'v', :'sede', (select id from retail.sububicaciones where ubicacion_id = :'sede' and tipo = 'cuarentena'), 'salida', 1,
             'cuarentena_liquidada', :'li');
   select concat_ws(';', pg_temp.dato(:'v', 'vendidas_30'), pg_temp.fila(:'v') -> 'semanas', pg_temp.dato(:'v', 'dias_sin_vender'),
                    pg_temp.dato(:'v', 'piso'), pg_temp.dato(:'v', 'almacen'));`,
  "5;[1, 0, 0, 5, 0, 0, 1, 3];0;2;3"
);
caso(
  "V2 un cambio cuenta como la prenda NUEVA en el día de la venta; lo devuelto con devolución aprobada no cuenta y la pendiente todavía no resta",
  `select pg_temp.prenda('V2B') as b \\gset
   select pg_temp.prenda('V2C', 'L') as c \\gset
   select pg_temp.vende(:'b', 3, pg_temp.dia(10)) as li \\gset
   insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, created_at) values (:'li', :'sede', :'c', 1, now());
   select pg_temp.devuelve(:'li', 1, 'aprobada'); select pg_temp.devuelve(:'li', 1, 'pendiente');
   select concat_ws(';', pg_temp.dato(:'b', 'vendidas_30'), pg_temp.dato(:'c', 'vendidas_30'), pg_temp.fila(:'c') -> 'semanas',
                    pg_temp.dato(:'c', 'dias_sin_vender'), pg_temp.dato(:'b', 'dias_sin_vender'));`,
  "1;1;[0, 0, 0, 0, 0, 0, 1, 0];10;10"
);

// U. QUÉ PRENDAS SALEN ---------------------------------------------------------------------------------------------------
caso(
  "U1 sale la vendida hace 50 días sin stock; no la vendida hace 60, ni un producto de prueba, ni la centinela, ni lo que solo está en Cuarentena",
  `select pg_temp.prenda('U1A') as a \\gset
   select pg_temp.prenda('U1B') as b \\gset
   select pg_temp.prenda('U1C') as c \\gset
   select pg_temp.prenda('U1D') as d \\gset
   select pg_temp.vende(:'a', 1, pg_temp.dia(50)); select pg_temp.vende(:'b', 1, pg_temp.dia(60));
   select pg_temp.entra(:'c', 4, pg_temp.dia(5)); update retail.productos set es_prueba = true where id = pg_temp.producto(:'c');
   select pg_temp.vende('${CENTINELA}', 1, pg_temp.dia(1));
   select pg_temp.entra(:'d', 2, pg_temp.dia(5), 'devolucion', 'cuarentena');
   select concat_ws(',', pg_temp.esta(:'a'), pg_temp.dato(:'a', 'dias_sin_vender'), pg_temp.esta(:'b'), pg_temp.esta(:'c'),
                    pg_temp.esta('${CENTINELA}'), pg_temp.esta(:'d'));`,
  "t,50,f,f,f,f"
);

// S. STOCK ---------------------------------------------------------------------------------------------------------------
caso(
  "S1 lo libre: colgado en el piso y guardado en el almacén; lo que no tiene lugar cuenta como guardado",
  `select pg_temp.prenda('S1') as v \\gset
   select pg_temp.entra(:'v', 1, pg_temp.dia(9), 'prueba', 'piso_venta'); select pg_temp.entra(:'v', 2, pg_temp.dia(9));
   select pg_temp.entra(:'v', 3, pg_temp.dia(9), 'prueba', null);
   select pg_temp.dato(:'v', 'piso') || ',' || pg_temp.dato(:'v', 'almacen');`,
  "1,5"
);

// D. DÍAS SIN VENDERSE ---------------------------------------------------------------------------------------------------
caso(
  "D1 desde la última venta (sin tope: 70 días; vender es salir al piso); lo que nunca salió al piso queda en NULL aunque lleve 20 días guardado (entrada, ajuste a favor o con Cuarentena); NULL si solo viene en camino",
  `select pg_temp.prenda('D1') as d1 \\gset
   select pg_temp.prenda('D2') as d2 \\gset
   select pg_temp.prenda('D3') as d3 \\gset
   select pg_temp.prenda('D4') as d4 \\gset
   select pg_temp.prenda('D5') as d5 \\gset
   select pg_temp.prenda('D6') as d6 \\gset
   select pg_temp.entra(:'d1', 2, pg_temp.dia(40)); select pg_temp.vende(:'d1', 1, pg_temp.dia(12));
   select pg_temp.entra(:'d2', 2, pg_temp.dia(20));
   select pg_temp.entra(:'d3', 2, pg_temp.dia(15), 'conteo', 'almacen_tienda', null, 'ajuste');
   select pg_temp.entra(:'d4', 2, pg_temp.dia(100)); select pg_temp.vende(:'d4', 1, pg_temp.dia(70));
   select pg_temp.compra(pg_temp.producto(:'d5'), :'d5', 4, :'sede');
   select pg_temp.entra(:'d6', 1, pg_temp.dia(30), 'devolucion', 'cuarentena'); select pg_temp.entra(:'d6', 1, pg_temp.dia(9));
   select concat_ws(',', pg_temp.dato(:'d1', 'dias_sin_vender'), pg_temp.dato(:'d2', 'dias_sin_vender'), pg_temp.dato(:'d3', 'dias_sin_vender'),
                    pg_temp.dato(:'d4', 'dias_sin_vender'), pg_temp.dato(:'d5', 'dias_sin_vender'), pg_temp.dato(:'d6', 'dias_sin_vender'));`,
  "12,null,null,70,null,null"
);
caso(
  "D2 desde que salió al piso: bajada hace 6 (llegó hace 20), directo al piso hace 10, bajada hace 25 + venta hace 5 + subida hace 3, vendida desde el almacén hace 8; el piso de OTRA tienda no cuenta",
  `select pg_temp.prenda('D2A') as a \\gset
   select pg_temp.prenda('D2B') as b \\gset
   select pg_temp.prenda('D2C') as c \\gset
   select pg_temp.prenda('D2D') as d \\gset
   select pg_temp.prenda('D2E') as e \\gset
   select pg_temp.entra(:'a', 2, pg_temp.dia(20)); select pg_temp.baja(:'a', 1, pg_temp.dia(6));
   select pg_temp.entra(:'b', 2, pg_temp.dia(10), 'prueba', 'piso_venta');
   select pg_temp.entra(:'c', 3, pg_temp.dia(30)); select pg_temp.baja(:'c', 2, pg_temp.dia(25)); select pg_temp.vende(:'c', 1, pg_temp.dia(5));
   insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
     values (:'c', :'sede', (select id from retail.sububicaciones where ubicacion_id = :'sede' and tipo = 'piso_venta'), :'sede',
             (select id from retail.sububicaciones where ubicacion_id = :'sede' and tipo = 'almacen_tienda'), 'traslado', 1, 'movimiento_interno', pg_temp.dia(3))
     returning id as m \\gset
   select retail.fn_aplicar_movimiento(:'m');
   select pg_temp.entra(:'d', 2, pg_temp.dia(15)); select pg_temp.vende(:'d', 1, pg_temp.dia(8));
   select pg_temp.entra(:'e', 2, pg_temp.dia(12)); select pg_temp.entra(:'e', 1, pg_temp.dia(6), 'prueba', 'piso_venta', :'otra');
   select concat_ws(',', pg_temp.dato(:'a', 'dias_sin_vender'), pg_temp.dato(:'a', 'salio_al_piso') = (retail.fn_hoy_lima() - 6)::text,
                    pg_temp.dato(:'a', 'llego') = (retail.fn_hoy_lima() - 20)::text,
                    pg_temp.dato(:'b', 'dias_sin_vender'), pg_temp.dato(:'b', 'salio_al_piso') = (retail.fn_hoy_lima() - 10)::text,
                    pg_temp.dato(:'c', 'dias_sin_vender'), pg_temp.dato(:'c', 'salio_al_piso') = (retail.fn_hoy_lima() - 25)::text,
                    pg_temp.dato(:'d', 'dias_sin_vender'), pg_temp.dato(:'d', 'salio_al_piso') = (retail.fn_hoy_lima() - 8)::text,
                    pg_temp.dato(:'e', 'dias_sin_vender'), pg_temp.dato(:'e', 'salio_al_piso'), pg_temp.dato(:'e', 'llego') = (retail.fn_hoy_lima() - 12)::text);`,
  "6,t,t,10,t,5,t,8,t,null,null,t"
);
caso(
  "D3 colgada sin ningún movimiento al piso (un dato viejo sin lugar): cuenta desde que llegó; y sin entrada, desde hoy",
  `select pg_temp.prenda('D3A') as a \\gset
   select pg_temp.prenda('D3B') as b \\gset
   select pg_temp.entra(:'a', 1, pg_temp.dia(9));
   insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada, updated_at)
     values (:'a', :'sede', (select id from retail.sububicaciones where ubicacion_id = :'sede' and tipo = 'piso_venta'), 2, 0, now()),
            (:'b', :'sede', (select id from retail.sububicaciones where ubicacion_id = :'sede' and tipo = 'piso_venta'), 1, 0, now());
   select concat_ws(',', pg_temp.dato(:'a', 'dias_sin_vender'), pg_temp.dato(:'a', 'salio_al_piso') = (retail.fn_hoy_lima() - 9)::text,
                    pg_temp.dato(:'b', 'dias_sin_vender'), pg_temp.dato(:'b', 'llego'));`,
  "9,t,0,null"
);

caso(
  "D4 la última venta de cada prenda, sin tope (20261010120000): vendida hace 70 y hace 12 → la de hace 12; colgada sin venderse → NULL. Huella del cuerpo",
  `select pg_temp.prenda('D4A') as a \\gset
   select pg_temp.prenda('D4B') as b \\gset
   select pg_temp.entra(:'a', 3, pg_temp.dia(100)); select pg_temp.vende(:'a', 1, pg_temp.dia(70)); select pg_temp.vende(:'a', 1, pg_temp.dia(12));
   select pg_temp.entra(:'b', 1, pg_temp.dia(9), 'prueba', 'piso_venta');
   select concat_ws(',', pg_temp.dato(:'a', 'ultima_venta') = (retail.fn_hoy_lima() - 12)::text, pg_temp.dato(:'b', 'ultima_venta'),
                    (select md5(prosrc) from pg_proc where oid = 'retail.fn_analisis_sede(uuid)'::regprocedure));`,
  (o) => o.startsWith("t,null,") && o.split(",")[2].length === 32
);

// L. LLEGADAS ------------------------------------------------------------------------------------------------------------
caso(
  "L1 carga inicial y traslado recibido llegan; bajar al piso, ajuste y devolución no; lo vendido desde la primera llegada, nunca más de lo que llegó",
  `select pg_temp.prenda('L1') as l1 \\gset
   select pg_temp.prenda('L2') as l2 \\gset
   select pg_temp.prenda('L3') as l3 \\gset
   select pg_temp.entra(:'l1', 5, pg_temp.dia(10), 'carga_inicial');
   select pg_temp.vende(:'l1', 1, pg_temp.dia(12)); select pg_temp.vende(:'l1', 2, pg_temp.dia(8));
   select pg_temp.traslado(:'otra', :'l2', 3, 'completada') as t \\gset
   select pg_temp.recibe(:'t', :'l2', 3, pg_temp.dia(5));
   select pg_temp.entra(:'l2', 2, pg_temp.dia(40), 'carga_inicial');
   select pg_temp.baja(:'l2', 1, pg_temp.dia(3));
   select pg_temp.entra(:'l2', 1, pg_temp.dia(2), 'conteo', 'almacen_tienda', null, 'ajuste');
   select pg_temp.entra(:'l2', 1, pg_temp.dia(2), 'devolucion');
   select pg_temp.vende(:'l2', 2, pg_temp.dia(4)); select pg_temp.vende(:'l2', 2, pg_temp.dia(1));
   select pg_temp.entra(:'l3', 4, pg_temp.dia(31), 'carga_inicial');
   select concat_ws(';', pg_temp.dato(:'l1', 'llegaron_30') || ',' || pg_temp.dato(:'l1', 'vendidas_de_llegadas_30'),
                    pg_temp.dato(:'l2', 'llegaron_30') || ',' || pg_temp.dato(:'l2', 'vendidas_de_llegadas_30'),
                    pg_temp.dato(:'l3', 'llegaron_30') || ',' || pg_temp.dato(:'l3', 'vendidas_de_llegadas_30'));`,
  "5,2;3,3;0,0"
);

// R. REBAJA --------------------------------------------------------------------------------------------------------------
caso(
  "R1 de 5 líneas de 30 días llevaron rebaja 3 (descuento de línea, a toda la venta y una «sin registrar»); el regalo del club no; anulada, de prueba, devuelta y de hace 31 días no cuentan; sin ventas, NULL",
  `select pg_temp.prenda('R1') as v \\gset
   select pg_temp.prenda('R1P') as p \\gset
   update retail.productos set es_prueba = true where id = pg_temp.producto(:'p');
   select pg_temp.vende(:'v', 1, pg_temp.dia(1));
   select pg_temp.vende(:'v', 1, pg_temp.dia(2), 'completada', null, false, 10);
   select pg_temp.vende(:'v', 1, pg_temp.dia(3), 'completada', null, false, 10, 10);
   select pg_temp.vende(:'v', 1, pg_temp.dia(4), 'completada', null, false, 0, 0, 10);
   select pg_temp.vende('${CENTINELA}', 1, pg_temp.dia(5), 'completada', null, false, 5);
   select pg_temp.vende(:'v', 1, pg_temp.dia(1), 'anulada', null, false, 10);
   select pg_temp.vende(:'v', 1, pg_temp.dia(1), 'completada', null, true, 10);
   select pg_temp.vende(:'p', 1, pg_temp.dia(1), 'completada', null, false, 10);
   select pg_temp.vende(:'v', 1, pg_temp.dia(31), 'completada', null, false, 10);
   select pg_temp.vende(:'v', 1, pg_temp.dia(2), 'completada', null, false, 10) as li \\gset
   select pg_temp.devuelve(:'li', 1, 'aprobada');
   select coalesce(pg_temp.lee() ->> 'rebaja_de_100', 'null') || ',' || coalesce(pg_temp.lee(:'otra') ->> 'rebaja_de_100', 'null');`,
  "60,null"
);

// O. ORIGEN --------------------------------------------------------------------------------------------------------------
caso(
  "O1 de dónde se repone: compra vigente → terceros con su proveedor; producción terminada → taller; nada o solo una compra anulada → NULL",
  `select pg_temp.prenda('O1') as o1 \\gset
   select pg_temp.prenda('O2') as o2 \\gset
   select pg_temp.prenda('O3') as o3 \\gset
   select pg_temp.prenda('O4') as o4 \\gset
   select pg_temp.entra(:'o1', 1, pg_temp.dia(3)); select pg_temp.entra(:'o2', 1, pg_temp.dia(3));
   select pg_temp.entra(:'o3', 1, pg_temp.dia(3)); select pg_temp.entra(:'o4', 1, pg_temp.dia(3));
   select pg_temp.compra(pg_temp.producto(:'o1'), :'o1', 2, :'otra');
   insert into retail.producciones (ubicacion_id, producto_id, estado, cantidad_plan, cantidad_buenas, inventariado_at)
     values (:'taller', pg_temp.producto(:'o2'), 'terminada', 10, 10, now());
   select pg_temp.compra(pg_temp.producto(:'o4'), :'o4', 2, :'otra', null, 'anulada');
   select concat_ws(';',
     pg_temp.dato(:'o1', 'origen') || ',' || (pg_temp.dato(:'o1', 'proveedor_id') = :'prov'),
     pg_temp.dato(:'o2', 'origen') || ',' || pg_temp.dato(:'o2', 'proveedor_id'),
     pg_temp.dato(:'o3', 'origen') || ',' || pg_temp.dato(:'o3', 'proveedor_id'),
     pg_temp.dato(:'o4', 'origen'));`,
  "terceros,true;taller,null;null,null;null"
);

// C. CATÁLOGO ------------------------------------------------------------------------------------------------------------
caso(
  "C1 la foto de SU color (aunque la principal sea de otro), nunca la de otro color; categoría con prefijo y familia; costo 0 → NULL; el nombre es la referencia del modelo",
  `select pg_temp.prenda('C1') as c1 \\gset
   select pg_temp.prenda('C2', 'M', null, 120, 0) as c2 \\gset
   select pg_temp.entra(:'c1', 1, pg_temp.dia(3)); select pg_temp.entra(:'c2', 1, pg_temp.dia(3));
   insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo) values
     (pg_temp.producto(:'c1'), 'https://fotos.test/otro-color.jpg', 0, true, :'color2'),
     (pg_temp.producto(:'c1'), 'https://fotos.test/su-color.jpg', 1, false, :'color1'),
     (pg_temp.producto(:'c2'), 'https://fotos.test/solo-otro.jpg', 0, true, :'color2');
   select concat_ws(';', pg_temp.dato(:'c1', 'foto_url'), pg_temp.dato(:'c2', 'foto_url'),
     pg_temp.dato(:'c1', 'categoria') || ',' || pg_temp.dato(:'c1', 'categoria_prefijo') || ',' || pg_temp.dato(:'c1', 'categoria_familia'),
     pg_temp.dato(:'c1', 'talla') || ',' || (pg_temp.dato(:'c1', 'color_hex') = (select hex from retail.colores where codigo = :'color1')),
     pg_temp.dato(:'c2', 'precio') || ',' || pg_temp.dato(:'c2', 'costo'),
     pg_temp.dato(:'c1', 'nombre') = (select referencia from retail.productos where id = pg_temp.producto(:'c1')));`,
  "https://fotos.test/su-color.jpg;null;AN Polos,ZQX,indumentaria;M,true;120.00,null;t"
);

// X. POR LLEGAR ----------------------------------------------------------------------------------------------------------
caso(
  "X1 traslado en tránsito del Taller y de otra tienda, y compra repartida a la tienda: cada parte con su origen y su fecha (día de Lima)",
  `select pg_temp.prenda('X1') as v \\gset
   select pg_temp.traslado(:'taller', :'v', 4, 'en_transito', ((retail.fn_hoy_lima() + 3) + time '23:30') at time zone 'America/Lima');
   select pg_temp.traslado(:'otra', :'v', 2);
   select pg_temp.compra(pg_temp.producto(:'v'), :'v', 5, :'sede', retail.fn_hoy_lima() + 9);
   select pg_temp.llega(:'v') || '|' || format('taller:4:%s;compra:5:%s;tienda:2:-', retail.fn_hoy_lima() + 3, retail.fn_hoy_lima() + 9);`,
  iguales
);
caso(
  "X2 no llegan: traslados recibidos, con diferencia, cerrados o hacia otra tienda; compras anuladas, agrupadas (sin talla) o repartidas a otra tienda; producción que no salió del Taller",
  `select pg_temp.prenda('X2') as v \\gset
   select pg_temp.traslado(:'otra', :'v', 1, 'completada'); select pg_temp.traslado(:'otra', :'v', 1, 'recibido_con_diferencia');
   select pg_temp.traslado(:'otra', :'v', 1, 'cerrada'); select pg_temp.traslado(:'taller', :'v', 1, 'en_transito', null, :'otra');
   select pg_temp.compra(pg_temp.producto(:'v'), :'v', 3, :'sede', null, 'anulada');
   select pg_temp.compra(pg_temp.producto(:'v'), null, 3, :'sede');
   select pg_temp.compra(pg_temp.producto(:'v'), :'v', 3, :'otra');
   insert into retail.producciones (ubicacion_id, producto_id, estado, cantidad_plan) values (:'taller', pg_temp.producto(:'v'), 'en_proceso', 12);
   select pg_temp.llega(:'v') || ',' || jsonb_array_length(retail.fn_analisis_por_llegar(:'sede')) || ',' || pg_temp.esta(:'v');`,
  "nada,0,false"
);
caso(
  "X3 de una compra se resta lo ya recibido en la tienda y lo cerrado allí; recibida entera, ya no llega",
  `select pg_temp.prenda('X3') as v \\gset
   select pg_temp.prenda('X3B') as w \\gset
   select pg_temp.compra(pg_temp.producto(:'v'), :'v', 6, :'sede') as li \\gset
   insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, compra_item_id)
     values (:'v', :'sede', (select id from retail.sububicaciones where ubicacion_id = :'sede' and tipo = 'almacen_tienda'), 'entrada', 2, 'recepcion', :'li');
   insert into retail.compra_item_cierres (compra_item_id, cantidad, motivo, ubicacion_id) values (:'li', 1, 'no_llego', :'sede');
   select pg_temp.compra(pg_temp.producto(:'w'), :'w', 2, :'sede') as lw \\gset
   insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, compra_item_id)
     values (:'w', :'sede', (select id from retail.sububicaciones where ubicacion_id = :'sede' and tipo = 'almacen_tienda'), 'entrada', 2, 'recepcion', :'lw');
   select pg_temp.llega(:'v') || ',' || pg_temp.llega(:'w');`,
  "compra:3:-,nada"
);
caso(
  "X4 toda prenda que llega es también una fila de la tienda (con su stock en 0 si no tiene) y la misma prenda y origen con la misma fecha se suma en una parte",
  `select pg_temp.prenda('X4') as v \\gset
   select pg_temp.traslado(:'otra', :'v', 1, 'en_transito', pg_temp.dia(-2)); select pg_temp.traslado(:'otra', :'v', 2, 'en_transito', pg_temp.dia(-2));
   select pg_temp.compra(pg_temp.producto(:'v'), :'v', 1, :'sede');
   select concat_ws(',',
     (select count(*) from jsonb_array_elements(retail.fn_analisis_por_llegar(:'sede')) x
       where not exists (select 1 from jsonb_array_elements(pg_temp.lee() -> 'prendas') p where p ->> 'variante_id' = x ->> 'variante_id')),
     pg_temp.dato(:'v', 'piso'), pg_temp.dato(:'v', 'almacen'), pg_temp.dato(:'v', 'dias_sin_vender'),
     (select count(*) from jsonb_array_elements(retail.fn_analisis_por_llegar(:'sede')) x where x ->> 'de' = 'tienda'),
     (select x ->> 'cantidad' from jsonb_array_elements(retail.fn_analisis_por_llegar(:'sede')) x where x ->> 'de' = 'tienda'));`,
  "0,0,0,null,1,3"
);

// M. LAS MIGRACIONES -----------------------------------------------------------------------------------------------------
caso(
  "M1 las cuatro migraciones se pueden pegar dos veces: una sola firma de cada función",
  `${MIGRACION_SEDE}\n${MIGRACION_LLEGAR}\n${MIGRACION_PISO}\n${MIGRACION_ULTIMA}\nset local search_path = retail, public, extensions;
   select (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_analisis_sede') || ',' ||
          (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_analisis_por_llegar');`,
  "1,1"
);

// N. NÚMEROS -------------------------------------------------------------------------------------------------------------
const tiempo = caso(
  "N1 200 prendas con stock y 600 ventas en la tienda: la lectura responde en menos de un segundo (mediana de 5)",
  `create function pg_temp.carga() returns void language plpgsql as $$
   declare v uuid; k int;
   begin
     for k in 1..200 loop
       v := pg_temp.prenda('N' || k, (array['S', 'M', 'L'])[1 + k % 3]);
       perform pg_temp.entra(v, 1 + k % 4, pg_temp.dia(20 + k % 60), 'prueba', 'piso_venta');
       perform pg_temp.entra(v, 2 + k % 3, pg_temp.dia(20 + k % 60));
       perform pg_temp.vende(v, 1, pg_temp.dia(k % 90)); perform pg_temp.vende(v, 1, pg_temp.dia((k * 7) % 45));
       perform pg_temp.vende(v, 1, pg_temp.dia((k * 13) % 30), 'completada', null, false, case when k % 10 = 0 then 5 else 0 end);
     end loop;
   end $$;
   select pg_temp.carga();
   create function pg_temp.mide() returns numeric language plpgsql as $$
   declare t0 timestamptz; ms numeric[] := '{}'; j jsonb;
   begin
     for k in 1..5 loop
       t0 := clock_timestamp();
       j := retail.fn_analisis_sede(current_setting('an.sede')::uuid);
       ms := ms || extract(epoch from clock_timestamp() - t0) * 1000;
     end loop;
     return (select percentile_cont(0.5) within group (order by x) from unnest(ms) x);
   end $$;
   select round(pg_temp.mide(), 1) || '|' || jsonb_array_length(pg_temp.lee() -> 'prendas');`,
  (o) => {
    const [ms, filas] = o.split("|").map(Number);
    return Number.isFinite(ms) && ms < 1000 && filas === 200;
  }
);
console.log(`    (mediana: ${tiempo.split("|")[0]} ms con ${tiempo.split("|")[1]} prendas)`);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);
