#!/usr/bin/env node
/**
 * Prueba de los cuatro chequeos de pendientes del Cierre de mes (`20261023121500_cierre_mes_chequeos_de_pendientes.sql`;
 * Felipe 2026-10-22: AVISAN en octubre de 2026 y BLOQUEAN desde noviembre de 2026).
 *
 * QUÉ CUBRE
 *   · A  `envios_con_diferencia`: un faltante «no vino» o «devuelta» que nadie resolvió, por la sede que recibió el envío; lo
 *        resuelto (en parte o del todo) baja la cuenta; «se perdió», «a otra sede», los sobrantes y lo que ya no es vigente
 *        (un envío reabierto) no cuentan; un envío con dos faltantes cuenta UNA vez; lo abierto después del mes no frena ese mes.
 *   · B  `conteos_abiertos`: el conteo sin cerrar de la sede, con desde cuándo y cuál; cerrado, anulado, de prueba o abierto
 *        después del mes no cuentan.
 *   · C  `sobrantes_traslado`: lo de más de un traslado «por revisar», por la sede que lo recibió; el ya revisado no cuenta.
 *   · D  `facturas_sin_recibir`: facturas de mercadería vigentes sin recibir o recibidas en parte, por la sede que las gestiona;
 *        recibida, recibida por cierre de línea, anulada o emitida después del mes no cuentan; al llegar la mercadería, sale.
 *   · E  AVISA EN OCTUBRE, BLOQUEA EN NOVIEMBRE: con la fecha de fábrica, los cuatro avisan en septiembre y octubre (0 bloqueantes,
 *        4 avisos) y bloquean en noviembre y diciembre (4 bloqueantes, 0 avisos); los que pasan llevan la misma marca;
 *        el consolidado y las demás unidades no cambian; y también lo ve una cuenta autenticada (la pantalla de verdad).
 *   · F  LA FECHA ES UN PARÁMETRO, no una línea de la función: `parametros_finanzas.cierre_pendientes_bloquean_desde` mueve el
 *        corte (antes y después), solo día 1, no admite vacío, sin fila frena, y nadie la lee directo.
 *   · G  `cerrar_periodo` solo cuenta lo que bloquea: con aviso cierra y deja los cuatro avisos GUARDADOS en el cierre; con
 *        bloqueo no cierra, nombra cada pendiente en palabras de tienda (nunca la clave) y, al resolver, cierra; el borde del
 *        corte es exacto (el mes del corte frena, el anterior no).
 *   · H  UN MES CERRADO CONSERVA SU FOTO: lo que aparece después (pendientes nuevos, el corte movido a bloquear) no cambia su
 *        huella, sus líneas, su diario congelado ni sus avisos, y no se vuelve a cerrar.
 *   · I  LOS DEMÁS CHEQUEOS, INTACTOS: el orden (cajas, egresos, …, diario, huella), sus marcas de bloqueo, los de «de la empresa»
 *        y el panel (`fn_cierre_panel`) que lee la pantalla. (La batería completa de los viejos sigue en `cierre_mes.mjs`.)
 *
 * CÓMO. Cada bloque en su transacción con ROLLBACK (otros agentes prueban a la vez), sesión simulada con
 * `request.jwt.claim.sub` y cada verificación es una línea `select 'caso', <verdadero>`. Las tres sedes (A, B y C) son NUEVAS en cada
 * bloque: así ningún dato de siembra mancha los conteos. Lo pendiente se arma insertando las filas directo con los disparadores
 * apagados (`session_replication_role = replica`, solo dentro de las funciones que arman la escena): lo que se prueba es QUÉ LEE el
 * chequeo, no cómo se llegó a esas filas (eso lo prueban las pruebas de cada flujo: `nos_debe`, `conteo_rediseno`,
 * `traslado_sobrantes`). Los meses son fijos (septiembre a diciembre de 2026 y junio de 2025) y las fechas de cada fila también:
 * la prueba no depende del día en que corre.
 *
 * USO
 *   pnpm pruebas:cierre-diferencias    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
/** Cada verificación sale como una línea `caso|t`. Se exige que estén TODAS y en verdadero. */
function verificar(titulo, r, esperados) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  const lineas = new Map(
    r.salida
      .split("\n")
      .filter((l) => l.includes("|"))
      .map((l) => {
        const i = l.lastIndexOf("|");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
  for (const caso of esperados) esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-800) });
}
/** Los nombres de caso de un bloque SQL: cada `select 'NOMBRE',` de verificación. */
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

// Las cuatro claves nuevas, tal como las mide la base.
const CUATRO = `('envios_con_diferencia', 'conteos_abiertos', 'sobrantes_traslado', 'facturas_sin_recibir')`;

// ============================================================================================================================
// LAS AYUDAS (funciones temporales; mueren con el ROLLBACK). Armar lo pendiente = insertar filas con los disparadores apagados.
// ============================================================================================================================
const AYUDANTES = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
-- Lo mismo, pero devuelve el SQLSTATE (no depende del idioma en que el servidor escribe sus mensajes).
create function pg_temp.codigo(p_sql text) returns text language plpgsql as $f$
declare v_estado text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate;
  return v_estado;
end;
$f$;
grant execute on function pg_temp.codigo(text) to authenticated;
-- Los ids que las ayudas necesitan (una función no ve las variables de psql).
create temp table ctx (n text primary key, id uuid not null);
create function pg_temp.c(p text) returns uuid language sql as $f$ select id from ctx where n = p $f$;
create function pg_temp.apagar() returns void language plpgsql as $f$ begin perform set_config('session_replication_role', 'replica', true); end $f$;
create function pg_temp.prender() returns void language plpgsql as $f$ begin perform set_config('session_replication_role', 'origin', true); end $f$;

-- Un envío ya recibido (cerrado) en la sede, cuya recepción se abrió en p_abierto.
create function pg_temp.envio(p_ubic uuid, p_abierto timestamptz) returns uuid language plpgsql as $f$
declare v_id uuid;
begin
  perform pg_temp.apagar();
  insert into retail.despachos (ubicacion_destino_id, despachado_por, estado, abierto_por, abierto_en, cerrado_por, cerrado_en)
  values (p_ubic, pg_temp.c('felipe'), 'cerrado', pg_temp.c('felipe'), p_abierto, pg_temp.c('felipe'), p_abierto + interval '1 hour')
  returning id into v_id;
  perform pg_temp.prender();
  return v_id;
end $f$;
-- Una diferencia de ese envío. Cada una trae su propia línea pedida (un faltante es siempre de una línea de la guía). «devuelta»
-- lleva su prenda de la cuarentena, como pide la base.
create function pg_temp.dif(p_despacho uuid, p_tipo text, p_causa text, p_cant integer, p_costo numeric,
                            p_vigente boolean default true, p_creado timestamptz default null) returns uuid language plpgsql as $f$
declare v_ubic uuid; v_orden uuid; v_oci uuid; v_di uuid; v_pd uuid; v_id uuid;
begin
  perform pg_temp.apagar();
  select d.ubicacion_destino_id into v_ubic from retail.despachos d where d.id = p_despacho;
  insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (pg_temp.c('prov'), v_ubic, pg_temp.c('felipe')) returning id into v_orden;
  insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (v_orden, 1, pg_temp.c('cat'), pg_temp.c('marca'), 50, p_costo) returning id into v_oci;
  if p_tipo = 'faltante' then
    insert into retail.despacho_items (despacho_id, orden_compra_item_id, cantidad, categoria_id, marca_id, precio_unitario)
    values (p_despacho, v_oci, 50, pg_temp.c('cat'), pg_temp.c('marca'), p_costo) returning id into v_di;
  end if;
  if p_causa = 'devuelta' then
    insert into retail.prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte)
    values (pg_temp.c('va'), v_ubic, p_cant, gen_random_uuid(), 'llegó rota en la caja') returning id into v_pd;
  end if;
  insert into retail.despacho_diferencias (despacho_id, despacho_item_id, extra_posicion, proveedor_id, categoria_id, marca_id, tipo, causa,
                                           cantidad, costo_unitario, creado_por, creado_en, vigente, prenda_danada_id)
  values (p_despacho, v_di,
          case when p_tipo = 'sobrante' then (select coalesce(max(x.extra_posicion), 0) + 1 from retail.despacho_diferencias x where x.despacho_id = p_despacho) end,
          pg_temp.c('prov'), pg_temp.c('cat'), pg_temp.c('marca'), p_tipo, p_causa, p_cant, p_costo, pg_temp.c('felipe'),
          coalesce(p_creado, (select d.abierto_en + interval '1 hour' from retail.despachos d where d.id = p_despacho)), p_vigente, v_pd)
  returning id into v_id;
  perform pg_temp.prender();
  return v_id;
end $f$;
-- Compras repone (o resuelve) p_cant prendas de esa deuda.
create function pg_temp.resolver(p_dif uuid, p_cant integer) returns void language plpgsql as $f$
begin
  perform pg_temp.apagar();
  insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, nota, creado_por)
  values (p_dif, 'repuesta', p_cant, 'llegó la reposición', pg_temp.c('felipe'));
  perform pg_temp.prender();
end $f$;
-- Un conteo de inventario de la sede; devuelve su número.
create function pg_temp.conteo(p_ubic uuid, p_estado text, p_creado timestamptz, p_prueba boolean default false) returns integer language plpgsql as $f$
declare v_n integer;
begin
  perform pg_temp.apagar();
  insert into retail.conteos (ubicacion_id, estado, created_at, es_prueba, abierto_por)
  values (p_ubic, p_estado, p_creado, p_prueba, pg_temp.c('felipe')) returning numero into v_n;
  perform pg_temp.prender();
  return v_n;
end $f$;
-- Una prenda de más al recibir un traslado de p_orig a p_dest.
create function pg_temp.sobrante(p_dest uuid, p_orig uuid, p_cant integer, p_creado timestamptz, p_estado text default 'por_revisar') returns uuid language plpgsql as $f$
declare v_t uuid; v_r uuid; v_id uuid;
begin
  perform pg_temp.apagar();
  insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id) values (p_orig, p_dest) returning id into v_t;
  insert into retail.transferencia_recepciones (transferencia_id, variante_id, cantidad_recibida) values (v_t, pg_temp.c('va'), p_cant) returning id into v_r;
  insert into retail.traslado_sobrantes (transferencia_id, transferencia_recepcion_id, variante_id, ubicacion_id, ubicacion_origen_id, cantidad, estado, creado_en, revisado_en)
  values (v_t, v_r, pg_temp.c('va'), p_dest, p_orig, p_cant, p_estado, p_creado, case when p_estado = 'por_revisar' then null else p_creado + interval '1 day' end)
  returning id into v_id;
  perform pg_temp.prender();
  return v_id;
end $f$;
-- Una factura de mercadería gestionada por la sede: p_fact prendas facturadas, p_rec recibidas y p_cerr cerradas a propósito.
create function pg_temp.factura(p_ubic uuid, p_fecha date, p_fact integer, p_rec integer, p_cerr integer default 0,
                                p_total numeric default 1180, p_estado text default 'vigente') returns uuid language plpgsql as $f$
declare v_id uuid; v_sub numeric := round(p_total / 1.18, 2);
begin
  perform pg_temp.apagar();
  insert into retail.compras (proveedor_id, serie, numero, condicion, fecha_emision, subtotal, igv, total, ubicacion_gestion_id,
                              facturado_cantidad, recibido_cantidad, cerrado_cantidad, estado)
  values (pg_temp.c('prov'), 'FCD', substr(gen_random_uuid()::text, 1, 8), 'contado', p_fecha, v_sub, p_total - v_sub, p_total, p_ubic,
          p_fact, p_rec, p_cerr, p_estado)
  returning id into v_id;
  perform pg_temp.prender();
  return v_id;
end $f$;
-- Un chequeo de una sede en un mes (jsonb: clave, ok, bloquea, datos).
create function pg_temp.chq(p_mes date, p_ubic uuid, p_clave text) returns jsonb language sql as $f$
  select x from retail.fn_cierre_mes_estado(p_mes) e, jsonb_array_elements(e.chequeos) x
   where e.alcance = 'ubicacion' and e.ubicacion_id = p_ubic and x ->> 'clave' = p_clave
$f$;
`;

// Tres tiendas NUEVAS (A, B y C), un proveedor, una categoría y una marca: nada de la siembra entra a las cuentas.
const ESCENA = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select p.id as felipe from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select v.id as va from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' order by v.id limit 1 \\gset
insert into retail.ubicaciones (nombre, tipo) values ('Tienda Prueba Cierre A', 'tienda') returning id as ua \\gset
insert into retail.ubicaciones (nombre, tipo) values ('Tienda Prueba Cierre B', 'tienda') returning id as ub \\gset
insert into retail.ubicaciones (nombre, tipo) values ('Tienda Prueba Cierre C', 'tienda') returning id as uc \\gset
insert into retail.proveedores (nombre, activo) values ('Proveedor prueba cierre diferencias', true) returning id as prov \\gset
insert into retail.categorias (nombre, familia) values ('Polos prueba cierre diferencias', 'accesorios') returning id as cat \\gset
insert into retail.marcas (nombre) values ('Marca prueba cierre diferencias') returning id as marca \\gset
insert into ctx values ('felipe', :'felipe'), ('va', :'va'), ('prov', :'prov'), ('cat', :'cat'), ('marca', :'marca');
`;

// Atajos para escribir los casos.
const chq = (mes, u, clave) => `pg_temp.chq('${mes}', :'${u}', '${clave}')`;
const dato = (mes, u, clave, campo) => `(${chq(mes, u, clave)} -> 'datos' ->> '${campo}')`;
const pasa = (mes, u, clave) => `(${chq(mes, u, clave)} ->> 'ok')::boolean`;
const frena = (mes, u, clave) => `(${chq(mes, u, clave)} ->> 'bloquea')::boolean`;
const OCT = "2026-10-01";
const NOV = "2026-11-01";

// ---- A · envios_con_diferencia ----------------------------------------------------------------------------------------------
const CASOS_ENVIOS = `
select pg_temp.envio(:'ua', '2026-10-05 10:00-05') as e1 \\gset
select pg_temp.dif(:'e1', 'faltante', 'no_vino', 5, 20) as x1 \\gset
select 'A0 sin nada pendiente la sede pasa (0 envíos, 0 prendas, S/ 0)',
  ${pasa(OCT, "ub", "envios_con_diferencia")} and ${dato(OCT, "ub", "envios_con_diferencia", "n")}::int = 0 and ${dato(OCT, "ub", "envios_con_diferencia", "monto")}::numeric = 0;
select 'A1 un faltante «no vino» sin resolver aparece: 1 envío, 5 prendas, S/ 100 al costo',
  not ${pasa(OCT, "ua", "envios_con_diferencia")} and ${dato(OCT, "ua", "envios_con_diferencia", "n")}::int = 1
  and ${dato(OCT, "ua", "envios_con_diferencia", "unidades")}::int = 5 and ${dato(OCT, "ua", "envios_con_diferencia", "monto")}::numeric = 100;
select pg_temp.dif(:'e1', 'faltante', 'se_perdio', 2, 20);
select pg_temp.dif(:'e1', 'faltante', 'otra_sede', 2, 20);
select pg_temp.dif(:'e1', 'sobrante', 'regalo', 1, 20);
select 'A2 «se perdió», «a otra sede» y un sobrante no son deuda del proveedor: no cuentan',
  ${dato(OCT, "ua", "envios_con_diferencia", "n")}::int = 1 and ${dato(OCT, "ua", "envios_con_diferencia", "unidades")}::int = 5;
select pg_temp.dif(:'e1', 'faltante', 'devuelta', 3, 20) as x2 \\gset
select 'A3 «devuelta» (llegó dañada y se devolvió) sí cuenta, y un envío con dos faltantes cuenta UNA vez',
  ${dato(OCT, "ua", "envios_con_diferencia", "n")}::int = 1 and ${dato(OCT, "ua", "envios_con_diferencia", "unidades")}::int = 8
  and ${dato(OCT, "ua", "envios_con_diferencia", "monto")}::numeric = 160;
select pg_temp.envio(:'ua', '2026-10-08 10:00-05') as e2 \\gset
select pg_temp.dif(:'e2', 'faltante', 'no_vino', 4, 10) as x3 \\gset
select 'A4 otro envío con faltante suma: 2 envíos, 12 prendas, S/ 200',
  ${dato(OCT, "ua", "envios_con_diferencia", "n")}::int = 2 and ${dato(OCT, "ua", "envios_con_diferencia", "unidades")}::int = 12
  and ${dato(OCT, "ua", "envios_con_diferencia", "monto")}::numeric = 200;
select pg_temp.resolver(:'x1', 2);
select 'A5 resolver una parte baja lo pendiente (2 de 5 repuestas): 10 prendas, S/ 160, los mismos 2 envíos',
  ${dato(OCT, "ua", "envios_con_diferencia", "n")}::int = 2 and ${dato(OCT, "ua", "envios_con_diferencia", "unidades")}::int = 10
  and ${dato(OCT, "ua", "envios_con_diferencia", "monto")}::numeric = 160;
select pg_temp.resolver(:'x1', 3);
select pg_temp.resolver(:'x2', 3);
select 'A6 resuelto todo lo del primer envío, ese envío sale: queda 1 envío, 4 prendas, S/ 40',
  ${dato(OCT, "ua", "envios_con_diferencia", "n")}::int = 1 and ${dato(OCT, "ua", "envios_con_diferencia", "unidades")}::int = 4
  and ${dato(OCT, "ua", "envios_con_diferencia", "monto")}::numeric = 40;
select pg_temp.resolver(:'x3', 4);
select 'A7 con todo resuelto el chequeo pasa y vuelve a cero',
  ${pasa(OCT, "ua", "envios_con_diferencia")} and ${dato(OCT, "ua", "envios_con_diferencia", "n")}::int = 0 and ${dato(OCT, "ua", "envios_con_diferencia", "monto")}::numeric = 0;
select pg_temp.envio(:'ua', '2026-10-12 10:00-05') as e3 \\gset
select pg_temp.dif(:'e3', 'faltante', 'no_vino', 6, 20, false);
select 'A8 una diferencia que ya no es vigente (el envío se reabrió) no cuenta', ${pasa(OCT, "ua", "envios_con_diferencia")};
select pg_temp.envio(:'ub', '2026-10-15 10:00-05') as e4 \\gset
select pg_temp.dif(:'e4', 'faltante', 'no_vino', 2, 30);
select 'A9 es de la sede que RECIBIÓ el envío: B tiene 1 (S/ 60) y A sigue en cero',
  ${dato(OCT, "ub", "envios_con_diferencia", "n")}::int = 1 and ${dato(OCT, "ub", "envios_con_diferencia", "monto")}::numeric = 60
  and ${pasa(OCT, "ua", "envios_con_diferencia")};
select pg_temp.envio(:'ua', '2026-11-10 10:00-05') as e5 \\gset
select pg_temp.dif(:'e5', 'faltante', 'no_vino', 3, 20);
select 'A10 un envío recibido en noviembre no frena octubre (si no, cerrar octubre esperaría a noviembre)',
  ${pasa(OCT, "ua", "envios_con_diferencia")} and ${dato(OCT, "ua", "envios_con_diferencia", "n")}::int = 0;
select 'A10 y en noviembre sí cuenta', not ${pasa(NOV, "ua", "envios_con_diferencia")} and ${dato(NOV, "ua", "envios_con_diferencia", "n")}::int = 1;
select pg_temp.envio(:'uc', '2026-10-31 20:00-05') as e6 \\gset
select pg_temp.dif(:'e6', 'faltante', 'no_vino', 2, 50, true, '2026-11-02 09:00-05');
select 'A11 un envío reabierto y vuelto a cerrar en noviembre (diferencia con fecha de noviembre) sigue siendo de octubre: se fecha por cuándo se abrió',
  not ${pasa(OCT, "uc", "envios_con_diferencia")} and ${dato(OCT, "uc", "envios_con_diferencia", "monto")}::numeric = 100;
`;

// ---- B · conteos_abiertos ---------------------------------------------------------------------------------------------------
const CASOS_CONTEOS = `
select pg_temp.conteo(:'ua', 'abierto', '2026-10-03 09:00-05') as n1 \\gset
select 'B0 sin conteos la sede pasa', ${pasa(OCT, "ub", "conteos_abiertos")} and ${dato(OCT, "ub", "conteos_abiertos", "n")}::int = 0;
select 'B1 un conteo abierto aparece, con desde cuándo y cuál es',
  not ${pasa(OCT, "ua", "conteos_abiertos")} and ${dato(OCT, "ua", "conteos_abiertos", "n")}::int = 1
  and ${dato(OCT, "ua", "conteos_abiertos", "desde")} = '2026-10-03' and ${dato(OCT, "ua", "conteos_abiertos", "numero")}::int = :n1;
select pg_temp.conteo(:'ub', 'cerrado', '2026-10-02 09:00-05');
select pg_temp.conteo(:'ub', 'anulado', '2026-10-04 09:00-05');
select 'B2 un conteo cerrado o anulado no cuenta', ${pasa(OCT, "ub", "conteos_abiertos")};
select pg_temp.conteo(:'uc', 'abierto', '2026-10-06 09:00-05', true);
select 'B3 un conteo de prueba no frena el cierre', ${pasa(OCT, "uc", "conteos_abiertos")};
select pg_temp.conteo(:'ub', 'abierto', '2026-11-05 09:00-05') as n2 \\gset
select 'B4 un conteo abierto en noviembre no frena octubre', ${pasa(OCT, "ub", "conteos_abiertos")};
select 'B4 y en noviembre sí: abierto desde el 5 de noviembre',
  not ${pasa(NOV, "ub", "conteos_abiertos")} and ${dato(NOV, "ub", "conteos_abiertos", "desde")} = '2026-11-05' and ${dato(NOV, "ub", "conteos_abiertos", "numero")}::int = :n2;
select 'B5 el conteo de A no mancha a las demás en octubre (B y C pasan)',
  ${pasa(OCT, "ub", "conteos_abiertos")} and ${pasa(OCT, "uc", "conteos_abiertos")};
`;

// ---- C · sobrantes_traslado -------------------------------------------------------------------------------------------------
const CASOS_SOBRANTES = `
select pg_temp.sobrante(:'ua', :'ub', 2, '2026-10-06 10:00-05');
select pg_temp.sobrante(:'ua', :'ub', 3, '2026-10-07 10:00-05');
select 'C0 sin sobrantes la sede pasa', ${pasa(OCT, "uc", "sobrantes_traslado")} and ${dato(OCT, "uc", "sobrantes_traslado", "n")}::int = 0;
select 'C1 dos traslados con prendas de más por revisar: 2 traslados, 5 prendas',
  not ${pasa(OCT, "ua", "sobrantes_traslado")} and ${dato(OCT, "ua", "sobrantes_traslado", "n")}::int = 2 and ${dato(OCT, "ua", "sobrantes_traslado", "unidades")}::int = 5;
select pg_temp.sobrante(:'ua', :'ub', 4, '2026-10-08 10:00-05', 'error_de_conteo');
select 'C2 un sobrante ya revisado (era un error de conteo) no cuenta', ${dato(OCT, "ua", "sobrantes_traslado", "n")}::int = 2 and ${dato(OCT, "ua", "sobrantes_traslado", "unidades")}::int = 5;
select 'C3 es de la sede que RECIBIÓ: la que envió (B) pasa', ${pasa(OCT, "ub", "sobrantes_traslado")} and ${dato(OCT, "ub", "sobrantes_traslado", "n")}::int = 0;
select pg_temp.sobrante(:'ua', :'ub', 1, '2026-11-03 10:00-05');
select 'C4 un sobrante de noviembre no frena octubre', ${dato(OCT, "ua", "sobrantes_traslado", "n")}::int = 2;
select 'C4 y en noviembre cuentan los tres: 3 traslados, 6 prendas', ${dato(NOV, "ua", "sobrantes_traslado", "n")}::int = 3 and ${dato(NOV, "ua", "sobrantes_traslado", "unidades")}::int = 6;
`;

// ---- D · facturas_sin_recibir -----------------------------------------------------------------------------------------------
const CASOS_FACTURAS = `
select pg_temp.factura(:'ua', '2026-10-04', 10, 0, 0, 1180) as f1 \\gset
select pg_temp.factura(:'ua', '2026-10-10', 10, 4, 0, 590) as f2 \\gset
select 'D0 sin facturas pendientes la sede pasa', ${pasa(OCT, "ub", "facturas_sin_recibir")} and ${dato(OCT, "ub", "facturas_sin_recibir", "n")}::int = 0;
select 'D1 una factura sin recibir y otra recibida en parte: 2 facturas, 16 prendas por recibir, S/ 1,770 en facturas',
  not ${pasa(OCT, "ua", "facturas_sin_recibir")} and ${dato(OCT, "ua", "facturas_sin_recibir", "n")}::int = 2
  and ${dato(OCT, "ua", "facturas_sin_recibir", "unidades")}::int = 16 and ${dato(OCT, "ua", "facturas_sin_recibir", "monto")}::numeric = 1770;
select pg_temp.factura(:'ua', '2026-10-11', 10, 10, 0, 300);
select pg_temp.factura(:'ua', '2026-10-12', 10, 6, 4, 300);
select pg_temp.factura(:'ua', '2026-10-13', 10, 0, 0, 300, 'anulada');
select 'D2 recibida, recibida con una línea cerrada a propósito y anulada no cuentan', ${dato(OCT, "ua", "facturas_sin_recibir", "n")}::int = 2;
select pg_temp.factura(:'ub', '2026-10-14', 5, 0, 0, 236);
select 'D3 es de la sede que gestiona la factura: B tiene 1 (S/ 236) y A sigue con 2',
  ${dato(OCT, "ub", "facturas_sin_recibir", "n")}::int = 1 and ${dato(OCT, "ub", "facturas_sin_recibir", "monto")}::numeric = 236
  and ${dato(OCT, "ua", "facturas_sin_recibir", "n")}::int = 2;
select pg_temp.factura(:'ua', '2026-11-02', 10, 0, 0, 118);
select 'D4 una factura emitida en noviembre no frena octubre', ${dato(OCT, "ua", "facturas_sin_recibir", "n")}::int = 2;
select 'D4 y en noviembre cuentan las tres (las de octubre siguen sin llegar)', ${dato(NOV, "ua", "facturas_sin_recibir", "n")}::int = 3;
update retail.compras set recibido_cantidad = facturado_cantidad where id = :'f1';
select 'D5 al llegar la mercadería la factura sale: queda 1 factura, 6 prendas, S/ 590',
  ${dato(OCT, "ua", "facturas_sin_recibir", "n")}::int = 1 and ${dato(OCT, "ua", "facturas_sin_recibir", "unidades")}::int = 6
  and ${dato(OCT, "ua", "facturas_sin_recibir", "monto")}::numeric = 590;
`;

// ---- E · avisa en octubre, bloquea en noviembre (con la fecha de fábrica) -----------------------------------------------------
// La sede A tiene los cuatro pendientes con fecha de octubre; B no tiene nada.
const PENDIENTES_DE_OCTUBRE = `
select pg_temp.conteo(:'ua', 'abierto', '2026-10-03 09:00-05');
select pg_temp.envio(:'ua', '2026-10-05 10:00-05') as e1 \\gset
select pg_temp.dif(:'e1', 'faltante', 'no_vino', 5, 20);
select pg_temp.sobrante(:'ua', :'ub', 2, '2026-10-06 10:00-05');
select pg_temp.factura(:'ua', '2026-10-04', 10, 0, 0, 1180);
`;
const CASOS_AVISA_Y_BLOQUEA = `
${PENDIENTES_DE_OCTUBRE}
select 'E1 octubre: los cuatro pendientes fallan y NINGUNO bloquea (solo avisan)',
  (select count(*) = 4 from retail.fn_cierre_mes_estado('${OCT}') e, jsonb_array_elements(e.chequeos) x
    where e.ubicacion_id = :'ua' and x ->> 'clave' in ${CUATRO} and not (x ->> 'ok')::boolean and not (x ->> 'bloquea')::boolean);
select 'E2 octubre: la sede queda lista para cerrar con 4 avisos (0 bloqueantes)',
  (select bloqueantes = 0 and avisos = 4 and estado = 'abierto' from retail.fn_cierre_mes_estado('${OCT}') where ubicacion_id = :'ua');
select 'E3 noviembre: los cuatro fallan y los cuatro BLOQUEAN',
  (select count(*) = 4 from retail.fn_cierre_mes_estado('${NOV}') e, jsonb_array_elements(e.chequeos) x
    where e.ubicacion_id = :'ua' and x ->> 'clave' in ${CUATRO} and not (x ->> 'ok')::boolean and (x ->> 'bloquea')::boolean);
select 'E4 noviembre: la sede ya no está lista (4 bloqueantes, 0 avisos de estos)',
  (select bloqueantes = 4 and avisos = 0 from retail.fn_cierre_mes_estado('${NOV}') where ubicacion_id = :'ua');
select 'E5 la sede sin pendientes pasa los cuatro en los dos meses y lleva la misma marca (octubre avisa, noviembre bloquea)',
  (select count(*) = 4 from retail.fn_cierre_mes_estado('${OCT}') e, jsonb_array_elements(e.chequeos) x
    where e.ubicacion_id = :'uc' and x ->> 'clave' in ${CUATRO} and (x ->> 'ok')::boolean and not (x ->> 'bloquea')::boolean)
  and (select count(*) = 4 from retail.fn_cierre_mes_estado('${NOV}') e, jsonb_array_elements(e.chequeos) x
    where e.ubicacion_id = :'uc' and x ->> 'clave' in ${CUATRO} and (x ->> 'ok')::boolean and (x ->> 'bloquea')::boolean);
select 'E6 la frontera es el 1 de noviembre: septiembre y octubre avisan; noviembre y diciembre bloquean',
  not ${frena("2026-09-01", "ua", "conteos_abiertos")} and not ${frena(OCT, "ua", "conteos_abiertos")}
  and ${frena(NOV, "ua", "conteos_abiertos")} and ${frena("2026-12-01", "ua", "conteos_abiertos")};
select 'E6 y es igual para los cuatro chequeos',
  (select count(*) filter (where (x ->> 'bloquea')::boolean) = 0 from retail.fn_cierre_mes_estado('${OCT}') e, jsonb_array_elements(e.chequeos) x
    where e.alcance = 'ubicacion' and x ->> 'clave' in ${CUATRO})
  and (select count(*) filter (where not (x ->> 'bloquea')::boolean) = 0 from retail.fn_cierre_mes_estado('${NOV}') e, jsonb_array_elements(e.chequeos) x
    where e.alcance = 'ubicacion' and x ->> 'clave' in ${CUATRO});
select 'E7 la empresa y el consolidado no llevan estos chequeos (son por sede)',
  (select count(*) = 0 from retail.fn_cierre_mes_estado('${NOV}') e, jsonb_array_elements(e.chequeos) x
    where e.alcance <> 'ubicacion' and x ->> 'clave' in ${CUATRO});
select 'E8 los pendientes de una sede no cambian a las otras: C en noviembre sigue lista (0 bloqueantes)',
  (select bloqueantes = 0 from retail.fn_cierre_mes_estado('${NOV}') where ubicacion_id = :'uc');
select 'E9 el consolidado de noviembre cuenta unidades sin cerrar, no pendientes (no cambia)',
  (select bloqueantes = (select count(*) from retail.fn_cierre_mes_estado('${NOV}') e where e.alcance <> 'consolidado' and e.estado <> 'cerrado')
     from retail.fn_cierre_mes_estado('${NOV}') where alcance = 'consolidado');
select set_config('request.jwt.claims', '{"sub":"${FELIPE}","role":"authenticated"}', true) \\g /dev/null
set local role authenticated;
select 'E10 con una cuenta autenticada (lo que usa la pantalla) los cuatro chequeos se leen igual: 4 en A, y noviembre bloquea',
  (select count(*) = 4 from retail.fn_cierre_mes_estado('${NOV}') e, jsonb_array_elements(e.chequeos) x
    where e.ubicacion_id = :'ua' and x ->> 'clave' in ${CUATRO} and (x ->> 'bloquea')::boolean and not (x ->> 'ok')::boolean);
reset role;
`;

// ---- F · la fecha de corte es un parámetro -----------------------------------------------------------------------------------
const CASOS_PARAMETRO = `
${PENDIENTES_DE_OCTUBRE}
select 'F1 la fecha de corte NO está escrita en la función (ninguna fecha literal en fn_cierre_mes_estado)',
  pg_get_functiondef('retail.fn_cierre_mes_estado(date)'::regprocedure) !~ '[0-9]{4}-[0-9]{2}-[0-9]{2}';
select 'F2 la fecha de fábrica es el 1 de noviembre de 2026',
  (select p.cierre_pendientes_bloquean_desde = date '2026-11-01' from retail.parametros_finanzas p where p.id);
update retail.parametros_finanzas set cierre_pendientes_bloquean_desde = date '2026-10-01' where id;
select 'F3 con el corte en octubre, octubre ya bloquea (y septiembre sigue avisando)',
  ${frena(OCT, "ua", "facturas_sin_recibir")} and not ${frena("2026-09-01", "ua", "facturas_sin_recibir")}
  and (select bloqueantes = 4 from retail.fn_cierre_mes_estado('${OCT}') where ubicacion_id = :'ua');
update retail.parametros_finanzas set cierre_pendientes_bloquean_desde = date '2027-06-01' where id;
select 'F4 con el corte en junio de 2027, noviembre y diciembre todavía avisan',
  not ${frena(NOV, "ua", "facturas_sin_recibir")} and not ${frena("2026-12-01", "ua", "conteos_abiertos")}
  and (select bloqueantes = 0 and avisos = 4 from retail.fn_cierre_mes_estado('${NOV}') where ubicacion_id = :'ua');
select 'F5 solo se admite el día 1: un 15 de noviembre se rechaza',
  pg_temp.codigo($$update retail.parametros_finanzas set cierre_pendientes_bloquean_desde = date '2026-11-15' where id$$) = '23514';
select 'F6 no admite vacío (una fecha vacía dejaría el cierre sin regla)',
  pg_temp.codigo($$update retail.parametros_finanzas set cierre_pendientes_bloquean_desde = null where id$$) = '23502';
delete from retail.parametros_finanzas;
select 'F7 sin fila de parámetros los pendientes FRENAN (una diferencia congelada en un mes cerrado no se arregla)',
  ${frena(OCT, "ua", "conteos_abiertos")} and ${frena("2026-09-01", "ua", "conteos_abiertos")};
set local role authenticated;
select 'F8 nadie la lee directo: ni la tabla ni la función de uso interno',
  pg_temp.codigo('select cierre_pendientes_bloquean_desde from retail.parametros_finanzas') = '42501'
  and pg_temp.codigo('select retail.fn_cierre_pendientes_bloquean_desde()') = '42501';
reset role;
`;

// ---- G · cerrar_periodo solo cuenta lo que bloquea ---------------------------------------------------------------------------
// Junio de 2025: ya terminó, la sede A es nueva y no tiene nada más; los cuatro pendientes son de junio.
const PENDIENTES_DE_JUNIO = `
select pg_temp.conteo(:'ua', 'abierto', '2025-06-10 09:00-05');
select pg_temp.envio(:'ua', '2025-06-12 10:00-05') as e1 \\gset
select pg_temp.dif(:'e1', 'faltante', 'no_vino', 5, 20) as x1 \\gset
select pg_temp.sobrante(:'ua', :'ub', 2, '2025-06-14 10:00-05') as s1 \\gset
select pg_temp.factura(:'ua', '2025-06-16', 10, 0, 0, 1180) as f1 \\gset
`;
const CASOS_CERRAR_AVISA = `
${PENDIENTES_DE_JUNIO}
select 'G1 con la fecha de fábrica junio de 2025 AVISA: la sede está lista para cerrar (0 bloqueantes, 4 avisos)',
  (select bloqueantes = 0 and avisos = 4 from retail.fn_cierre_mes_estado('2025-06-01') where ubicacion_id = :'ua');
select retail.cerrar_periodo('2025-06-01', 'ubicacion', :'ua') as r \\gset
select 'G2 cierra aunque haya pendientes que avisan', (select estado = 'cerrado' from retail.periodos where mes = '2025-06-01' and alcance = 'ubicacion' and ubicacion_id = :'ua');
select 'G3 los cuatro avisos quedan GUARDADOS en el cierre, sin bloquear y con su cifra',
  (select jsonb_array_length(c.avisos) = 4
      and (select count(*) = 4 from jsonb_array_elements(c.avisos) a where a ->> 'clave' in ${CUATRO} and not (a ->> 'ok')::boolean and not (a ->> 'bloquea')::boolean)
      and (select (a -> 'datos' ->> 'n')::int = 1 from jsonb_array_elements(c.avisos) a where a ->> 'clave' = 'conteos_abiertos')
      and (select (a -> 'datos' ->> 'monto')::numeric = 100 from jsonb_array_elements(c.avisos) a where a ->> 'clave' = 'envios_con_diferencia')
     from retail.periodo_cierres c where c.id = (:'r'::jsonb ->> 'cierre_id')::uuid);
`;
const CASOS_CERRAR_BLOQUEA = `
${PENDIENTES_DE_JUNIO}
update retail.parametros_finanzas set cierre_pendientes_bloquean_desde = date '2025-06-01' where id;
select 'G4 con el corte en junio de 2025 la sede NO está lista: 4 bloqueantes',
  (select bloqueantes = 4 and avisos = 0 from retail.fn_cierre_mes_estado('2025-06-01') where ubicacion_id = :'ua');
select pg_temp.intento(format('select retail.cerrar_periodo(%L, %L, %L)', '2025-06-01', 'ubicacion', :'ua')) as m \\gset
select 'G5 no cierra, y dice cada pendiente en palabras de tienda',
  :'m' like 'Todavía no se puede cerrar%' and :'m' like '%resolver con el proveedor lo que faltó en los envíos%' and :'m' like '%cerrar el conteo de inventario abierto%'
  and :'m' like '%revisar los sobrantes de traslado%' and :'m' like '%recibir la mercadería de las facturas%';
select 'G5 y nunca la clave en crudo', :'m' not like '%envios_con_diferencia%' and :'m' not like '%conteos_abiertos%' and :'m' not like '%sobrantes_traslado%' and :'m' not like '%facturas_sin_recibir%';
select 'G6 no quedó nada a medias: ni período ni cierre', not exists (select 1 from retail.periodos where mes = '2025-06-01' and ubicacion_id = :'ua');
select pg_temp.resolver(:'x1', 5);
select pg_temp.apagar();
update retail.compras set recibido_cantidad = facturado_cantidad where id = :'f1';
update retail.traslado_sobrantes set estado = 'error_de_conteo', revisado_en = now() where id = :'s1';
select pg_temp.prender();
select pg_temp.intento(format('select retail.cerrar_periodo(%L, %L, %L)', '2025-06-01', 'ubicacion', :'ua')) as m2 \\gset
select 'G7 resueltos tres, el mensaje nombra solo el que falta (el conteo abierto)',
  :'m2' like '%cerrar el conteo de inventario abierto%' and :'m2' not like '%sobrantes%' and :'m2' not like '%facturas%' and :'m2' not like '%proveedor%';
select pg_temp.apagar();
update retail.conteos set estado = 'cerrado', cerrado_en = now() where ubicacion_id = :'ua' and estado = 'abierto';
select pg_temp.prender();
select retail.cerrar_periodo('2025-06-01', 'ubicacion', :'ua') as r \\gset
select 'G8 resuelto lo último, cierra; y como nada falló, el cierre no guarda avisos',
  (select estado = 'cerrado' from retail.periodos where mes = '2025-06-01' and ubicacion_id = :'ua')
  and (select jsonb_array_length(c.avisos) = 0 from retail.periodo_cierres c where c.id = (:'r'::jsonb ->> 'cierre_id')::uuid);
`;
const CASOS_CERRAR_BORDE = `
${PENDIENTES_DE_JUNIO}
update retail.parametros_finanzas set cierre_pendientes_bloquean_desde = date '2025-07-01' where id;
select 'G9 el corte en julio de 2025 NO frena junio (el mes del corte frena; el anterior, no)',
  (select bloqueantes = 0 and avisos = 4 from retail.fn_cierre_mes_estado('2025-06-01') where ubicacion_id = :'ua')
  and pg_temp.intento(format('select retail.cerrar_periodo(%L, %L, %L)', '2025-06-01', 'ubicacion', :'ua')) = 'SIN_ERROR';
`;

// ---- H · un mes cerrado conserva su foto --------------------------------------------------------------------------------------
const CASOS_FOTO = `
${PENDIENTES_DE_JUNIO}
select retail.cerrar_periodo('2025-06-01', 'ubicacion', :'ua') as r \\gset
select c.id as c0, c.huella as h0, c.lineas as l0, md5(c.avisos::text) as a0, md5(c.total_debe::text || c.total_haber::text) as t0,
       (select count(*) from retail.diario_cerrado d where d.cierre_id = c.id) as d0
  from retail.periodo_cierres c where c.id = (:'r'::jsonb ->> 'cierre_id')::uuid \\gset
select 'H0 recién cerrado: la huella de hoy coincide con la congelada', (${pasa("2025-06-01", "ua", "huella")});
-- Después del cierre aparece de todo con fecha de junio (llegó tarde, o se grabó con una fecha vieja): otro envío con faltante, otro
-- sobrante, y el corte se mueve a «bloquea». (Una FACTURA nueva con fecha de junio no se puede grabar: el candado del mes cerrado la
-- rechaza; las que ya estaban antes de cerrar siguen en el diario congelado.)
select pg_temp.envio(:'ua', '2025-06-25 10:00-05') as e2 \\gset
select pg_temp.dif(:'e2', 'faltante', 'no_vino', 7, 15);
select pg_temp.sobrante(:'ua', :'ub', 4, '2025-06-26 10:00-05');
update retail.parametros_finanzas set cierre_pendientes_bloquean_desde = date '2025-06-01' where id;
select 'H1 los chequeos nuevos se leen en vivo sobre el mes cerrado (ya son 2 envíos y 2 sobrantes) y ahora bloquean',
  ${dato("2025-06-01", "ua", "envios_con_diferencia", "n")}::int = 2 and ${dato("2025-06-01", "ua", "sobrantes_traslado", "n")}::int = 2
  and ${frena("2025-06-01", "ua", "envios_con_diferencia")} and ${frena("2025-06-01", "ua", "sobrantes_traslado")};
select 'H2 la huella del diario NO se mueve: sigue coincidiendo con la congelada', ${pasa("2025-06-01", "ua", "huella")};
select 'H3 el cierre no cambió: mismo cierre, misma huella, mismas líneas, mismos totales, mismos avisos, mismo diario congelado',
  (select c.id = :'c0' and c.huella = :'h0' and c.lineas = :'l0'::int and md5(c.avisos::text) = :'a0' and md5(c.total_debe::text || c.total_haber::text) = :'t0'
          and (select count(*) from retail.diario_cerrado d where d.cierre_id = c.id) = :'d0'::int
     from retail.periodo_cierres c where c.id = :'c0');
select 'H4 la huella recalculada de las líneas congeladas es la misma de siempre', (select retail.fn_huella_congelada(:'c0') = :'h0');
select 'H5 el mes sigue cerrado y no se puede volver a cerrar',
  (select estado = 'cerrado' and cierre_id = :'c0' from retail.periodos where mes = '2025-06-01' and ubicacion_id = :'ua')
  and pg_temp.intento(format('select retail.cerrar_periodo(%L, %L, %L)', '2025-06-01', 'ubicacion', :'ua')) like '%ya está cerrado%';
select 'H6 un mes cerrado nunca cuenta como «lista para cerrar» ni pide cerrarse otra vez: su estado sigue siendo cerrado',
  (select estado = 'cerrado' from retail.fn_cierre_mes_estado('2025-06-01') where ubicacion_id = :'ua');
`;

// ---- I · los demás chequeos, intactos ----------------------------------------------------------------------------------------
const CASOS_VIEJOS = `
select retail.cerrar_periodo('2025-06-01', 'ubicacion', :'ua') as r \\gset
select 'I1 el orden de los chequeos de una sede cerrada: los de siempre, los cuatro nuevos antes del diario, y la huella al final',
  (select string_agg(x ->> 'clave', ',' order by i) = 'cajas,egresos,envios_con_diferencia,conteos_abiertos,sobrantes_traslado,facturas_sin_recibir,diario,huella'
     from retail.fn_cierre_mes_estado('2025-06-01') e, jsonb_array_elements(e.chequeos) with ordinality t(x, i) where e.ubicacion_id = :'ua');
select 'I2 los de siempre conservan su marca: cajas, egresos y diario bloquean; la huella solo avisa',
  ${frena("2025-06-01", "ua", "cajas")} and ${frena("2025-06-01", "ua", "egresos")} and ${frena("2025-06-01", "ua", "diario")} and not ${frena("2025-06-01", "ua", "huella")};
select 'I3 «de la empresa» conserva los suyos (conciliación y diario) y ninguno nuevo',
  (select string_agg(x ->> 'clave', ',' order by i) = 'conciliacion,diario'
     from retail.fn_cierre_mes_estado('2025-06-01') e, jsonb_array_elements(e.chequeos) with ordinality t(x, i) where e.alcance = 'empresa');
select 'I4 el panel (lo que lee la pantalla) trae los cuatro en cada tienda, con su n',
  (select count(*) = 4 from jsonb_array_elements(retail.fn_cierre_panel('2025-06-01') -> 'unidades') u, jsonb_array_elements(u -> 'chequeos') x
    where u ->> 'ubicacion_id' = :'ua' and x ->> 'clave' in ${CUATRO} and x -> 'datos' ? 'n');
select 'I5 el diario, los asientos y las huellas no leen estas tablas: cerrar con pendientes no cambió el diario (cuadra)',
  (select (x ->> 'ok')::boolean from pg_temp.chq('2025-06-01', :'ua', 'diario') x);
`;

// ---- Correr todo -------------------------------------------------------------------------------------------------------------
const BLOQUES = [
  ["A · envios_con_diferencia: faltantes del proveedor sin resolver", CASOS_ENVIOS],
  ["B · conteos_abiertos", CASOS_CONTEOS],
  ["C · sobrantes_traslado", CASOS_SOBRANTES],
  ["D · facturas_sin_recibir", CASOS_FACTURAS],
  ["E · avisa en octubre, bloquea en noviembre", CASOS_AVISA_Y_BLOQUEA],
  ["F · la fecha de corte es un parámetro", CASOS_PARAMETRO],
  ["G1 · cerrar con avisos: guarda los avisos", CASOS_CERRAR_AVISA],
  ["G2 · cerrar con bloqueo: no cierra, y dice qué falta", CASOS_CERRAR_BLOQUEA],
  ["G3 · el borde del corte", CASOS_CERRAR_BORDE],
  ["H · un mes cerrado conserva su foto", CASOS_FOTO],
  ["I · los demás chequeos, intactos", `${PENDIENTES_DE_JUNIO}\n${CASOS_VIEJOS}`],
];

for (const [titulo, sql] of BLOQUES) {
  console.log(`\n── ${titulo}`);
  verificar(titulo, correr(`${ESCENA}\n${sql}`), casosDe(sql));
}

console.log(`\n${casos - fallos}/${casos} verificaciones en verde`);
if (fallos > 0) {
  console.log(`✗ ${fallos} fallaron`);
  process.exit(1);
}
console.log("✓ los cuatro chequeos de pendientes del cierre de mes cumplen su contrato");
