#!/usr/bin/env node
/**
 * Pruebas de la tela pendiente de una orden (ADR-0400, actividad 7) — migración `20261015165000_produccion_tela_pendiente_de_la_orden.sql`, sobre 154000, 155000, 20261015160000 y
 * 20261015005000. CAYLA V2.
 *
 * LO QUE VIGILA. Que `fn_tela_pendiente_de_la_orden` diga, por cada tela y avío de la orden, cuánto reservan las OTRAS órdenes abiertas del Taller (su plan menos lo ya descontado; nunca la
 * propia orden, nunca una anulada o terminada) y qué órdenes de insumos generadas hay de esa tela (con destino el Taller, de los últimos 60 días, sin las anuladas); que la lista de Órdenes
 * traiga lo MISMO que la página; que solo quien ve `produccion` en ese Taller la lea; y que sea de solo lectura.
 *
 * USO
 *   node scripts/pruebas/produccion_tela.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_tela.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_tela.mjs --base otra                 → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const leer = (nombre) => sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8"));
const MIGRACION_FASES = leer("20261014154000_produccion_fases_y_tela_de_la_orden.sql");
const MIGRACION_AVANCES = leer("20261014155000_produccion_avance_salida_y_vuelta.sql");
const MIGRACION_ANULAR = leer("20261015160000_produccion_anular_salida_y_vuelta.sql");
const MIGRACION_LISTA = leer("20261015005000_produccion_lista_de_ordenes.sql");
const MIGRACION_TELA = leer("20261015165000_produccion_tela_pendiente_de_la_orden.sql");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// Envolturas que nunca abortan el caso: devuelven «OK» o «<sqlstate>|<hint>|<mensaje>». Un error dentro de una envoltura deshace lo que
// esa llamada escribió (es una subtransacción), igual que lo haría la transacción propia de una RPC.
const ENVOLTURAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb, p_insumos jsonb default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, p_insumos) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK:' || v_fila.numero;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_avance(p_fase, p_lineas, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.deshace(p_avance uuid) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.deshacer_avance(p_avance);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.sale(p_fase uuid, p_lineas jsonb, p_guia text default null, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_salida(p_fase, p_lineas, p_guia, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.vuelve(p_fase uuid, p_lineas jsonb, p_guia text default null, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_vuelta(p_fase, p_lineas, p_guia, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.anula_s(p_id uuid, p_motivo text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.anular_salida(p_id, p_motivo);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.anula_v(p_id uuid, p_motivo text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.anular_vuelta(p_id, p_motivo);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.cambia(p_fase uuid, p_quien text, p_prov uuid, p_tarifa numeric) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.cambiar_quien_fase(p_fase, p_quien, p_prov, p_tarifa, null, null, null);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

// Datos propios: un proveedor de maquila, lino (tela, 5 % de merma) y el modelo del seed con sus variantes (dos colores distintos).
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION_FASES}
set local search_path = retail, public, extensions;
${MIGRACION_AVANCES}
set local search_path = retail, public, extensions;
${MIGRACION_ANULAR}
set local search_path = retail, public, extensions;
${MIGRACION_LISTA}
set local search_path = retail, public, extensions;
${MIGRACION_TELA}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Confecciones Lista Prueba', 'maquila') returning id as maquila \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('Otro Taller Lista Prueba', 'maquila') returning id as otro \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('LI-LINO', 'Lino Lista Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
select v.id as v_ajena from retail.variantes v where v.producto_id <> :'prod' and v.activo order by v.id limit 1 \\gset
${como(FELIPE)}
`;

// La apertura de siempre: 30 del primer color (v1) y 20 del segundo (v2), entrega en 10 días.
const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const COSTURA_AFUERA = FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_id: `:'maquila'`, tarifa_prenda: `'4.50'`, cantidad_minima: `'50'`,
  fecha_prometida: `(retail.fn_hoy_lima() + 7)::text` });
const ESPINA = `jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA}, ${TALLER("acabado")})`;
const ESPINA_TALLER = `jsonb_build_array(${TALLER("corte")}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const LINO = `jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'color_codigo', :'c1', 'consumo_por_prenda', '1.2'))`;

// La orden abierta y los ids que todos los casos usan: :oid, :f_corte, :f_cost, :f_acab.
const ORDEN = (fases = ESPINA, insumos = "null") => `
select pg_temp.abre(${APERTURA}, ${fases}, ${insumos}) as r \\gset
select id as oid from pg_temp.ultima \\gset
select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
select id as f_acab from retail.produccion_fases where produccion_id = :'oid' and clave = 'acabado' \\gset
`;
// [[variante, cantidad], …] → [{variante_id, cantidad}, …]
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
// Una línea de Vuelta.
const VL = (v, buenas, segundas, faltantes, motivo) =>
  `jsonb_build_object('variante_id', :'${v}', 'buenas', '${buenas}', 'segundas', '${segundas}', 'faltantes', '${faltantes}', 'motivo', ${motivo ? `'${motivo}'` : "null"})`;
// Un campo de una fase de un jsonb de fases (lo que devuelven las funciones de escritura): FASE_DE(:'j'::jsonb, 'corte', ['estado', 'hechas']).
const FASE_DE = (j, clave, campos) =>
  `(select ${campos.map((c) => `coalesce(f ->> '${c}', '-')`).join(" || ':' || ")} from jsonb_array_elements(${j}) f where f ->> 'clave' = '${clave}')`;
// Un campo de una fase DE LA LECTURA ÚNICA, por variante.
const POR_VARIANTE = (clave, v, campos) =>
  `(select ${campos.map((c) => `coalesce(pv ->> '${c}', '-')`).join(" || ':' || ")} from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'fases') f, jsonb_array_elements(f -> 'por_variante') pv
     where f ->> 'clave' = '${clave}' and (pv ->> 'variante_id')::uuid = :'${v}')`;
const ACTIVIDAD = (accion, patron) =>
  `(select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = '${accion}' and a.descripcion like '${patron}')`;
const FILAS_AVANCE = (fase, extra = "") => `(select count(*) from retail.produccion_avances where fase_id = :'${fase}' ${extra})`;

let fallas = 0;
let casos = 0;
function anotar(nombre, bien, esperado, obtenido) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  anotar(nombre, bien, typeof esperado === "function" ? "(condición)" : esperado, obtenido);
}

// Lo pendiente de la tela de una orden (la lectura que la página llama): lo que reservan las otras y lo pedido.
const PENDIENTE = (id) => `(select e from jsonb_array_elements(retail.fn_tela_pendiente_de_la_orden(:'${id}')) e where e ->> 'insumo_id' = :'lino')`;
const OTRA = (nombre) => `
   select pg_temp.abre(${APERTURA}, ${ESPINA}, ${LINO}) as r_${nombre} \\gset
   select id as ${nombre} from pg_temp.ultima \\gset`;
const PEDIDO = (nombre, cantidad) => `
   insert into retail.ordenes_insumo (proveedor_id, ubicacion_destino_id, creada_por) values (:'maquila', :'taller', :'felipe_p') returning id as ${nombre} \\gset
   insert into retail.orden_insumo_items (orden_insumo_id, posicion, insumo_id, cantidad, unidad_medida, precio_unitario) values (:'${nombre}', 1, :'lino', ${cantidad}, 'metro', 12) returning id as ${nombre}_it \\gset`;
// Lo que ya llegó de esa línea: lo que deja la recepción de main (ADR-0362) —una recepción de la orden y un lote ligado a su línea—, que es de lo que `queda` descuenta.
const RECIBIDO = (nombre, cantidad) => `
   insert into retail.orden_insumo_recepciones (orden_insumo_id, ubicacion_id, usuario_id) values (:'${nombre}', :'taller', :'felipe_p') returning id as ${nombre}_rec \\gset
   insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen, orden_insumo_item_id, orden_insumo_recepcion_id) values (:'lino', :'taller', ${cantidad}, 12, 'compra', :'${nombre}_it', :'${nombre}_rec');`;
// Cuándo debía llegar, contado en días desde hoy (negativo = ya pasó). Una orden no puede prometer la entrega antes de emitirse (`ordenes_insumo_entrega`): si la fecha ya pasó, la orden se emitió antes.
const ENTREGA = (nombre, dias) => `
   update retail.ordenes_insumo set fecha_emision = least(fecha_emision, retail.fn_hoy_lima() + (${dias}) - 5), fecha_entrega_estimada = retail.fn_hoy_lima() + (${dias}) where id = :'${nombre}';`;

// M. LA MIGRACIÓN ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 la migración se vuelve a cargar sin error (idempotente) y la función sigue siendo una",
  `${MIGRACION_TELA}
   set local search_path = retail, public, extensions;
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_tela_pendiente_de_la_orden';`,
  "1"
);

// R. LO QUE RESERVAN LAS OTRAS --------------------------------------------------------------------------------------------------
caso(
  "R1 con una sola orden, nadie más reserva su tela (0) y no hay pedidos; la orden sin tela declarada devuelve una lista vacía",
  `${ORDEN(ESPINA, LINO)}
   ${OTRA("sin_tela").replace(`${LINO}`, "null")}
   select concat_ws(',', (${PENDIENTE("oid")} ->> 'comprometido_otras'), (${PENDIENTE("oid")} -> 'pedidos')::text, retail.fn_tela_pendiente_de_la_orden(:'sin_tela')::text);`,
  "0,[],[]"
);
caso(
  "R2 otra orden abierta con el mismo lino reserva todo su plan (37.8 m), y se ve desde cada una; descontarle tela a la otra baja lo que reserva",
  `${ORDEN(ESPINA, LINO)}
   ${OTRA("otra")}
   insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'lino', :'taller', 100, 12.50, 'compra') returning id as lote \\gset
   insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id) values (:'lino', :'lote', :'taller', 'compra', 100, 12.50, :'felipe_p');
   select (${PENDIENTE("oid")} ->> 'comprometido_otras') as de_la_primera, (${PENDIENTE("otra")} ->> 'comprometido_otras') as de_la_otra \\gset
   select retail.registrar_consumo_insumo(:'otra', :'lino', 10, 'tendido') as consumo \\gset
   select concat_ws(',', :'de_la_primera', :'de_la_otra', (${PENDIENTE("oid")} ->> 'comprometido_otras'), (${PENDIENTE("otra")} ->> 'comprometido_otras'));`,
  "37.800,37.800,27.800,37.800"
);
caso(
  "R3 una orden anulada o terminada ya no reserva nada",
  `${ORDEN(ESPINA, LINO)}
   ${OTRA("otra")}
   update retail.producciones set estado = 'anulada' where id = :'otra';
   select (${PENDIENTE("oid")} ->> 'comprometido_otras');`,
  "0"
);

// P. LO PEDIDO ------------------------------------------------------------------------------------------------------------------
caso(
  "P1 las órdenes de insumos generadas de esa tela, con destino el Taller, aparecen con su número, proveedor, cantidad y entrega; la más nueva primero",
  `${ORDEN(ESPINA, LINO)}
   ${PEDIDO("oi1", 50)}
   ${PEDIDO("oi2", 20)}
   update retail.ordenes_insumo set fecha_emision = retail.fn_hoy_lima() - 3 where id = :'oi1';
   select concat_ws(',', jsonb_array_length(${PENDIENTE("oid")} -> 'pedidos'), (${PENDIENTE("oid")} -> 'pedidos' -> 0 ->> 'cantidad'), (${PENDIENTE("oid")} -> 'pedidos' -> 1 ->> 'cantidad'),
     (${PENDIENTE("oid")} -> 'pedidos' -> 0 ->> 'numero_texto') like 'OI-%', (${PENDIENTE("oid")} -> 'pedidos' -> 0 ->> 'proveedor'), (${PENDIENTE("oid")} -> 'pedidos' -> 0 ->> 'unidad'));`,
  "2,20.000,50.000,t,Confecciones Lista Prueba,metro"
);
caso(
  "P2 una orden de insumos anulada o con destino a otra sede no cuenta; una de hace más de 60 días que todavía falta recibir SÍ (ya no hay ventana: la recepción dice lo que falta de verdad)",
  `${ORDEN(ESPINA, LINO)}
   ${PEDIDO("oi_anulada", 10)}
   ${PEDIDO("oi_vieja", 10)}
   ${PEDIDO("oi_ajena", 10)}
   ${PEDIDO("oi_buena", 7)}
   update retail.ordenes_insumo set estado = 'anulada', anulada_por = :'felipe_p', anulada_en = now(), motivo_anulacion = 'x' where id = :'oi_anulada';
   update retail.ordenes_insumo set fecha_emision = retail.fn_hoy_lima() - 61 where id = :'oi_vieja';
   update retail.ordenes_insumo set ubicacion_destino_id = (select id from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1) where id = :'oi_ajena';
   select concat_ws(',', jsonb_array_length(${PENDIENTE("oid")} -> 'pedidos'), (${PENDIENTE("oid")} -> 'pedidos' -> 0 ->> 'cantidad'), (${PENDIENTE("oid")} ->> 'en_camino'));`,
  "2,7.000,17.000"
);

// E. LO QUE VIENE EN CAMINO (regla de Felipe, 2026-10-16): cuenta lo que FALTA RECIBIR de cada pedido, salvo los atrasados -------------
caso(
  "E1 lo recibido baja lo que viene: de 50 pedidos llegaron 30 → faltan 20 y eso es lo que se ve y lo que cuenta",
  `${ORDEN(ESPINA, LINO)}
   ${PEDIDO("oi1", 50)}
   ${RECIBIDO("oi1", 30)}
   select concat_ws(',', jsonb_array_length(${PENDIENTE("oid")} -> 'pedidos'), (${PENDIENTE("oid")} -> 'pedidos' -> 0 ->> 'cantidad'), (${PENDIENTE("oid")} ->> 'en_camino'), (${PENDIENTE("oid")} ->> 'atrasado'));`,
  "1,20.000,20.000,0"
);
caso(
  "E2 un pedido recibido por completo ya no viene: no aparece y no suma",
  `${ORDEN(ESPINA, LINO)}
   ${PEDIDO("oi1", 50)}
   ${RECIBIDO("oi1", 50)}
   select concat_ws(',', jsonb_array_length(${PENDIENTE("oid")} -> 'pedidos'), (${PENDIENTE("oid")} ->> 'en_camino'));`,
  "0,0"
);
caso(
  "E3 un pedido con la fecha vencida NO cuenta y sale aparte como atrasado; el que llega hoy, el que llega después y el que no tiene fecha SÍ cuentan",
  `${ORDEN(ESPINA, LINO)}
   ${PEDIDO("oi_tarde", 30)}
   ${PEDIDO("oi_hoy", 5)}
   ${PEDIDO("oi_luego", 20)}
   ${PEDIDO("oi_sin_fecha", 1)}
   ${ENTREGA("oi_tarde", -1)}
   ${ENTREGA("oi_hoy", 0)}
   ${ENTREGA("oi_luego", 5)}
   select concat_ws(',', jsonb_array_length(${PENDIENTE("oid")} -> 'pedidos'), (${PENDIENTE("oid")} ->> 'en_camino'), (${PENDIENTE("oid")} ->> 'atrasado'),
     (${PENDIENTE("oid")} -> 'pedidos' -> 3 ->> 'atrasado'), (${PENDIENTE("oid")} -> 'pedidos' -> 3 ->> 'cantidad'), (${PENDIENTE("oid")} -> 'pedidos' -> 0 ->> 'atrasado'));`,
  "4,26.000,30.000,true,30.000,false"
);
caso(
  "E4 un pedido atrasado al que ya le llegó parte cuenta lo que falta como atrasado (no como en camino)",
  `${ORDEN(ESPINA, LINO)}
   ${PEDIDO("oi_tarde", 30)}
   ${RECIBIDO("oi_tarde", 10)}
   ${ENTREGA("oi_tarde", -3)}
   select concat_ws(',', (${PENDIENTE("oid")} ->> 'en_camino'), (${PENDIENTE("oid")} ->> 'atrasado'));`,
  "0,20.000"
);

// L. LA LISTA DICE LO MISMO -----------------------------------------------------------------------------------------------------
caso(
  "L1 la lista de Órdenes trae de cada orden la MISMA tela pendiente que la página (una sola cuenta para «la tela no alcanza»)",
  `${ORDEN(ESPINA, LINO)}
   ${OTRA("otra")}
   ${PEDIDO("oi1", 50)}
   select (select e -> 'tela_pendiente' from jsonb_array_elements(retail.fn_ordenes_produccion_lista(:'taller', 5) -> 'ordenes') e where e -> 'orden' ->> 'id' = :'oid') = retail.fn_tela_pendiente_de_la_orden(:'oid');`,
  "t"
);

// Q. PUERTAS Y FORMA ------------------------------------------------------------------------------------------------------------
caso(
  "Q1 sin el módulo «produccion», parada en Trujillo, o con una orden que no existe, la lectura recibe NULL; el líder la recibe",
  `${ORDEN(ESPINA, LINO)}
   delete from retail.rol_modulos where modulo = 'produccion' and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   ${como(MICAELA)}
   select coalesce(retail.fn_tela_pendiente_de_la_orden(:'oid')::text, 'NULL') as sin_modulo \\gset
   reset role;
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   ${como(MICAELA)}
   select coalesce(retail.fn_tela_pendiente_de_la_orden(:'oid')::text, 'NULL') as en_trujillo \\gset
   ${como(FELIPE)}
   select concat_ws(',', :'sin_modulo', :'en_trujillo', coalesce(retail.fn_tela_pendiente_de_la_orden(gen_random_uuid())::text, 'NULL'), jsonb_typeof(retail.fn_tela_pendiente_de_la_orden(:'oid')));`,
  "NULL,NULL,NULL,array"
);
caso(
  "Q2 la forma: security definer con search_path, de solo lectura (stable), authenticated sí y anon no; no escribe en ninguna tabla",
  `reset role;
   select concat_ws(',',
     p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%',
     p.provolatile = 's',
     has_function_privilege('authenticated', p.oid, 'execute'),
     has_function_privilege('anon', p.oid, 'execute'),
     p.prosrc ~* '(insert|update|delete)\\s+(into|from)?\\s*retail\\.')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_tela_pendiente_de_la_orden';`,
  "t,t,t,f,f"
);
caso(
  "Q3 la lectura compartida `fn_tela_en_camino`: devuelve NULL a quien no puede leer ese Taller y una lista al líder; es de solo lectura (stable), authenticated sí y anon no",
  `${ORDEN(ESPINA, LINO)}
   ${PEDIDO("oi1", 50)}
   ${como(MICAELA)}
   select coalesce(retail.fn_tela_en_camino(:'taller')::text, 'NULL') as de_micaela \\gset
   ${como(FELIPE)}
   select concat_ws(',', :'de_micaela', jsonb_typeof(retail.fn_tela_en_camino(:'taller')), (select (e ->> 'cuenta') from jsonb_array_elements(retail.fn_tela_en_camino(:'taller')) e where e ->> 'insumo_id' = :'lino'),
     (select concat_ws('/', p.prosecdef, p.provolatile = 's', has_function_privilege('authenticated', p.oid, 'execute'), has_function_privilege('anon', p.oid, 'execute'))
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_tela_en_camino'));`,
  "NULL,array,50.000,t/t/t/f"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
