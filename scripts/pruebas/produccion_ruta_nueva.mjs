#!/usr/bin/env node
/**
 * Una orden COMPLETA con la ruta nueva, de punta a punta (ADR-0400 act. k y l, paquete R1, actividad 6): Ploteo · Corte · Habilitado · Costura · Limpiar hilos y revisar ·
 * Planchado · Etiquetar y embolsar, con el ploteo, la costura y el planchado afuera. CAYLA V2.
 *
 * LO QUE VIGILA. Que lo que ya mandaba al cerrar la orden (`cerrar_produccion`, `anular_produccion`, `revertir_produccion`, el costo devengado de los servicios) siga mandando cuando
 * la última fase es «Etiquetar y embolsar» y no «Acabado»: que solo las BUENAS entren al stock; que el costo de los servicios sea lo devengado (el fijo del ploteo cuando se marca,
 * más lo que volvió bueno × la tarifa de cada servicio) repartido entre las buenas; que el candado de las buenas mire la ÚLTIMA fase; que no se cierre ni se anule con prendas todavía
 * en un servicio; que un ploteo sin marcar no impida pasar al stock (y no devengue); y que revertir devuelva el stock sin tocar lo marcado.
 *
 * NO PRUEBA LAS FUNCIONES NUEVAS UNA POR UNA (eso lo hacen `produccion_fases_nuevas.mjs` y `produccion_ploteo.mjs`) sino el flujo que las junta, contra la base tal como queda con
 * TODAS las migraciones aplicadas (la misma de CI). Cada caso en su transacción con ROLLBACK.
 *
 * USO
 *   node scripts/pruebas/produccion_ruta_nueva.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_ruta_nueva.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_ruta_nueva.mjs --base otra                 → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");

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
create function pg_temp.cierra(p_oid uuid, p_buenas jsonb, p_tela numeric default null, p_avios numeric default null, p_maquila numeric default null, p_confirma boolean default false) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.cerrar_produccion(p_oid, p_buenas, p_tela, p_avios, p_maquila, p_confirma);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.anula_o(p_oid uuid, p_motivo text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.anular_produccion(p_oid, p_motivo);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

// Más envolturas: marcar el ploteo y revertir el cierre.
const ENVOLTURAS_RUTA = `
create function pg_temp.marca(p_fase uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.marcar_fase_hecha(%L)', p_fase)) $f$;
create function pg_temp.revierte(p_oid uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.revertir_produccion(%L)', p_oid)) $f$;
`;

// Datos propios: tres servicios (el ploteo, la costura y el planchado) y el modelo del seed con sus variantes (dos colores distintos).
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${ENVOLTURAS_RUTA}
insert into retail.proveedores_produccion (nombre, rubro) values ('Confecciones Ruta Prueba', 'maquila') returning id as maquila \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('Plancha Ruta Prueba', 'maquila') returning id as plancha \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('Plotter Ruta Prueba', 'otro') returning id as plotter \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
${como(FELIPE)}
`;

// La apertura de siempre: 30 del primer color (v1) y 20 del segundo (v2), entrega en 10 días.
const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const AFUERA = (clave, proveedor, tarifa) =>
  FASE({ clave: `'${clave}'`, quien: `'servicio'`, proveedor_id: `:'${proveedor}'`, tarifa_prenda: `'${tarifa}'`, fecha_prometida: `(retail.fn_hoy_lima() + 7)::text` });
const PLOTEO_AFUERA = FASE({ clave: `'ploteo'`, quien: `'servicio'`, proveedor_id: `:'plotter'`, fijo_orden: `'40'` });
// La ruta nueva con tres servicios: ploteo (40 por la orden), costura (4.50) y planchado (1.20).
const RUTA = `jsonb_build_array(${PLOTEO_AFUERA}, ${TALLER("corte")}, ${TALLER("habilitado")}, ${AFUERA("costura", "maquila", "4.50")}, ${TALLER("limpieza_revision")},
  ${AFUERA("planchado", "plancha", "1.20")}, ${TALLER("etiquetado_embolsado")})`;

// La orden abierta y los ids que todos los casos usan.
const ORDEN = `
select pg_temp.abre(${APERTURA}, ${RUTA}) as r \\gset
select id as oid from pg_temp.ultima \\gset
select id as f_plot from retail.produccion_fases where produccion_id = :'oid' and clave = 'ploteo' \\gset
select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
select id as f_hab from retail.produccion_fases where produccion_id = :'oid' and clave = 'habilitado' \\gset
select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
select id as f_limp from retail.produccion_fases where produccion_id = :'oid' and clave = 'limpieza_revision' \\gset
select id as f_planch from retail.produccion_fases where produccion_id = :'oid' and clave = 'planchado' \\gset
select id as f_etiq from retail.produccion_fases where produccion_id = :'oid' and clave = 'etiquetado_embolsado' \\gset
`;
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
const VL = (v, buenas, segundas, faltantes, motivo) =>
  `jsonb_build_object('variante_id', :'${v}', 'buenas', '${buenas}', 'segundas', '${segundas}', 'faltantes', '${faltantes}', 'motivo', ${motivo ? `'${motivo}'` : "null"})`;

// Los pasos del flujo, por tramos: corte y habilitado de 50; costura afuera con 2 segundas y 2 faltantes (46 buenas); limpiar 46; planchado afuera, todo bueno; etiquetar 46.
const HASTA_HABILITADO = `${ORDEN}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset`;
const HASTA_SALIDA_COSTURA = `${HASTA_HABILITADO}
   select pg_temp.sale(:'f_cost', ${L(["v1", 30], ["v2", 20])}, '001-1') as s1 \\gset`;
const HASTA_VUELTA_COSTURA = `${HASTA_SALIDA_COSTURA}
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 27, 2, 1, "salieron con mancha y una se perdió")}, ${VL("v2", 19, 0, 1, "se perdió en el servicio")}), '001-2') as w1 \\gset`;
const HASTA_SALIDA_PLANCHADO = `${HASTA_VUELTA_COSTURA}
   select pg_temp.avanza(:'f_limp', ${L(["v1", 27], ["v2", 19])}) as a3 \\gset
   select pg_temp.sale(:'f_planch', ${L(["v1", 27], ["v2", 19])}, '002-1') as s2 \\gset`;
const HASTA_ETIQUETADO = `${HASTA_SALIDA_PLANCHADO}
   select pg_temp.vuelve(:'f_planch', jsonb_build_array(${VL("v1", 27, 0, 0)}, ${VL("v2", 19, 0, 0)}), '002-2') as w2 \\gset
   select pg_temp.avanza(:'f_etiq', ${L(["v1", 27], ["v2", 19])}) as a4 \\gset
   update retail.variantes set costo = 4.50 where id in (:'v1', :'v2');`;
const MOV_ENTRADA = `(select coalesce(sum(cantidad), 0) from retail.movimientos where produccion_id = :'oid' and motivo = 'produccion')`;
const ESTADO = `(select estado from retail.producciones where id = :'oid')`;
const STOCK_V1 = `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'taller')`;
const DEVENGADO = (clave) => `(select f ->> 'devengado' from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f where f ->> 'clave' = '${clave}')`;
const ESTADOS = `(select string_agg((f ->> 'clave') || ':' || (f ->> 'estado'), ' ' order by (f ->> 'secuencia')::int) from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f)`;

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

// R. LA RUTA NUEVA, DE PUNTA A PUNTA ---------------------------------------------------------------------------------------------
caso(
  "R1 el flujo completo: ploteo marcado, corte y habilitado de 50, costura afuera (2 segundas y 2 faltantes: 46 buenas), planchado afuera, etiquetado de 46 y pasar al stock: entran 46 (27 de la primera talla), la orden queda terminada",
  `${HASTA_ETIQUETADO}
   select pg_temp.marca(:'f_plot') as m \\gset
   select ${STOCK_V1} as stock_antes \\gset
   select ${ESTADOS} as estados \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 19])}) as c \\gset
   select concat_ws(',', :'m', :'estados', :'c', ${ESTADO}, (select cantidad_buenas from retail.producciones where id = :'oid'), ${MOV_ENTRADA}, ${STOCK_V1} - :stock_antes);`,
  "SIN_ERROR,ploteo:hecha corte:hecha habilitado:hecha costura:hecha limpieza_revision:hecha planchado:hecha etiquetado_embolsado:hecha,OK,terminada,46,46,27"
);
caso(
  "R2 el costo de los servicios es lo DEVENGADO y se reparte entre las buenas: ploteo 40.00 (el fijo, marcado) + costura 46 × 4.50 + planchado 46 × 1.20 = 302.20, a 6.57 por prenda",
  `${HASTA_ETIQUETADO}
   select pg_temp.marca(:'f_plot') as m \\gset
   select concat_ws(',', ${DEVENGADO("ploteo")}, ${DEVENGADO("costura")}, ${DEVENGADO("planchado")}, retail.fn_costo_servicios_orden(:'oid')) as antes \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 19])}) as c \\gset
   select concat_ws(',', :'antes', :'c', (select costo_maquila from retail.producciones where id = :'oid'), (select costo_unitario from retail.producciones where id = :'oid'));`,
  "40.00,207.00,55.20,302.20,OK,302.20,6.57"
);
caso(
  "R3 el candado de las buenas mira la ÚLTIMA fase (Etiquetar y embolsar): una de más se rechaza con su frase y no deja nada escrito (la orden sigue en proceso, sin movimientos)",
  `${HASTA_ETIQUETADO}
   select pg_temp.cierra(:'oid', ${L(["v1", 28], ["v2", 19])}) as c \\gset
   select concat_ws(',', pg_temp.eh(:'c'), :'c' like '%en Etiquetar y embolsar se terminaron 27%', ${ESTADO}, ${MOV_ENTRADA});`,
  "P0001|cierre_buenas_exceden,t,en_proceso,0"
);
caso(
  "R4 con prendas todavía en un servicio no se cierra ni se anula (cierre_con_prendas_afuera, anular_con_prendas_afuera): ni con la costura afuera ni con el planchado afuera",
  `${HASTA_SALIDA_COSTURA}
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 19])}) as c1 \\gset
   select pg_temp.anula_o(:'oid', 'prueba') as a1 \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 27, 2, 1, "con mancha y una se perdió")}, ${VL("v2", 19, 0, 1, "se perdió")}), '001-2') as w1 \\gset
   select pg_temp.avanza(:'f_limp', ${L(["v1", 27], ["v2", 19])}) as a3 \\gset
   select pg_temp.sale(:'f_planch', ${L(["v1", 27], ["v2", 19])}, '002-1') as s2 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 19])}) as c2 \\gset
   select pg_temp.anula_o(:'oid', 'prueba') as a2 \\gset
   select concat_ws(',', pg_temp.eh(:'c1'), pg_temp.eh(:'a1'), pg_temp.eh(:'c2'), pg_temp.eh(:'a2'), ${ESTADO});`,
  "P0001|cierre_con_prendas_afuera,P0001|anular_con_prendas_afuera,P0001|cierre_con_prendas_afuera,P0001|anular_con_prendas_afuera,en_proceso"
);
caso(
  "R5 un ploteo sin marcar no impide pasar al stock ni devenga: el servicio de ploteo no cobra lo que nadie dio por hecho (costo de los servicios 262.20 = 207.00 + 55.20)",
  `${HASTA_ETIQUETADO}
   select ${DEVENGADO("ploteo")} as dev_plot \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 19])}) as c \\gset
   select concat_ws(',', :'dev_plot', :'c', ${ESTADO}, (select costo_maquila from retail.producciones where id = :'oid'));`,
  "0,OK,terminada,262.20"
);
caso(
  "R6 revertir el cierre devuelve el stock y reabre la orden, y lo marcado se queda (una marca, la de Ploteo)",
  `${HASTA_ETIQUETADO}
   select pg_temp.marca(:'f_plot') as m \\gset
   select ${STOCK_V1} as stock_antes \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 19])}) as c \\gset
   select ${STOCK_V1} - :stock_antes as con_cierre \\gset
   select pg_temp.revierte(:'oid') as r2 \\gset
   select concat_ws(',', :'c', :'con_cierre', :'r2', ${STOCK_V1} - :stock_antes, ${ESTADO},
     (select count(*) from retail.produccion_fase_marcas where fase_id = :'f_plot'));`,
  "OK,27,SIN_ERROR,0,en_proceso,1"
);
caso(
  "R7 anular una orden con el ploteo marcado y el corte hecho (nada afuera) se puede: queda anulada y la marca queda escrita (solo se agrega)",
  `${HASTA_HABILITADO}
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.anula_o(:'oid', 'el modelo se cambió') as a \\gset
   select concat_ws(',', :'a', ${ESTADO}, (select count(*) from retail.produccion_fase_marcas where fase_id = :'f_plot'));`,
  "OK,anulada,1"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
