#!/usr/bin/env node
/**
 * Pruebas de pasar la orden al stock y de los costos del Taller (ADR-0400, actividad 6; OK de Felipe, 2026-10-15) — migración
 * `20261014160000_produccion_cierre_al_stock_y_costos_del_taller.sql`, sobre 154000, 155000 y 20261015160000, y `20261026150000` (ADR-0513: lo medido no pisa lo declarado). CAYLA V2.
 *
 * LO QUE VIGILA. Que `cerrar_produccion` no deje entrar al stock más prendas de una talla y color que las terminadas en la última fase, ni cierre con prendas todavía en un
 * servicio; que solo las BUENAS entren (las segundas y las faltantes no) y el costo se reparta entre ellas; que el costo de los servicios salga de lo devengado; que lo medido
 * quede aparte (una fila por orden cerrada) sin pisar lo declarado, y mande solo con 3 órdenes cerradas; que lo rechazado no deje nada escrito; que una orden de ANTES de las fases cierre como siempre; que `anular_produccion` no anule con prendas afuera; y
 * que los costos del Taller los vea el líder o quien ve `produccion` parado en ese Taller, y nadie más.
 *
 * USO
 *   node scripts/pruebas/produccion_cierre.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_cierre.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_cierre.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = leer("20261014160000_produccion_cierre_al_stock_y_costos_del_taller.sql");
const MIGRACION_MEDIDO = leer("20261026150000_produccion_lo_medido_no_pisa_lo_declarado.sql"); // ADR-0513: lo medido ya no pisa lo declarado

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

// Datos propios: un proveedor de maquila, lino (tela, 5 % de merma) y el modelo del seed con sus variantes (dos colores distintos).
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION_FASES}
set local search_path = retail, public, extensions;
${MIGRACION_AVANCES}
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${MIGRACION_MEDIDO}
set local search_path = retail, public, extensions;
${MIGRACION_ANULAR}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Confecciones Cierre Prueba', 'maquila') returning id as maquila \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('Otro Taller Cierre Prueba', 'maquila') returning id as otro \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('CI-LINO', 'Lino Cierre Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
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

// La orden de siempre con su tela: corte 30 y 20, todo a Costura (afuera), la Vuelta con 2 segundas y 2 faltantes, Acabado de lo que volvió bueno. Deja :oid y las fases en estado «lista para pasar al stock».
const FLUJO = `${ORDEN(ESPINA, LINO)}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a0 \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 30], ["v2", 20])}, '001-1') as s0 \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 27, 2, 1, "salieron con mancha y una se perdió")}, ${VL("v2", 19, 0, 1, "se perdió en el servicio")}), '001-2') as w0 \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 27], ["v2", 19])}) as b0 \\gset
   update retail.variantes set costo = 4.50 where id in (:'v1', :'v2');`;

// ADR-0513 · LO MEDIDO: lo que se necesita para cerrar varias órdenes del MISMO modelo. El lote de lino (300 m) alcanza para tres.
const LOTE_LINO = `insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'lino', :'taller', 300, 12.50, 'compra') returning id as lote \\gset
   insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id)
     values (:'lino', :'lote', :'taller', 'compra', 300, 12.50, :'felipe_p');`;
// Una orden más del modelo, de punta a punta, que gastó `metros` de lino y se pasa al stock. Deja en :efe lo que manda a esa altura («manda:órdenes:cifra»).
const UNA_CERRADA = (metros) => `${FLUJO}
   select retail.registrar_consumo_insumo(:'oid', :'lino', ${metros}, 'tendido') as consumo \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 19])}, null, null, null, true) as cc \\gset
   select manda || ':' || ordenes_medidas || ':' || coalesce(medido_por_prenda::text, '-') as efe from retail.fn_consumo_efectivo(:'prod') \\gset`;
const DECLARADO = `(select fuente || ':' || tela_por_prenda from retail.producto_consumos where producto_id = :'prod')`;

const MOV_ENTRADA = `(select coalesce(sum(cantidad), 0) from retail.movimientos where produccion_id = :'oid' and motivo = 'produccion')`;
const ESTADO = `(select estado from retail.producciones where id = :'oid')`;

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

// M. LA MIGRACIÓN ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 la migración se vuelve a cargar sin error (idempotente) y las dos nuevas y las dos de siempre siguen siendo una cada una",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname in ('fn_costo_servicios_orden','fn_ve_costos_del_taller','cerrar_produccion','anular_produccion');`,
  "4"
);

// C. PASAR AL STOCK -------------------------------------------------------------------------------------------------------------
caso(
  "C1 el flujo completo: solo las BUENAS entran al stock (46; las 2 segundas y las 2 faltantes no), cada talla en su movimiento, y la orden queda terminada con esas buenas",
  `${FLUJO}
   select (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'taller') as stock_v1_antes \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 19])}) as c \\gset
   select concat_ws(',', :'c', ${ESTADO}, (select cantidad_buenas from retail.producciones where id = :'oid'), ${MOV_ENTRADA},
     (select count(*) from retail.movimientos where produccion_id = :'oid' and motivo = 'produccion' and tipo = 'entrada'),
     (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'taller') - :stock_v1_antes,
     (select inventariado_at is not null from retail.producciones where id = :'oid'));`,
  "OK,terminada,46,46,2,27,t"
);
caso(
  "C2 el costo de los servicios sale de lo DEVENGADO (46 buenas × 4.50 = 207.00), sin que nadie lo teclee, y el costo por prenda se reparte entre las buenas (4.50)",
  `${FLUJO}
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 19])}) as c \\gset
   select concat_ws(',', :'c', (select costo_maquila from retail.producciones where id = :'oid'), (select costo_unitario from retail.producciones where id = :'oid'),
     retail.fn_costo_servicios_orden(:'oid'));`,
  "OK,207.00,4.50,207.00"
);
caso(
  "C3 si alguien manda su propio monto de servicios, manda ese (la base no lo pisa); y pasar al stock menos buenas de las terminadas está bien (el costo se reparte entre las que entran)",
  `${FLUJO}
   select pg_temp.cierra(:'oid', ${L(["v1", 20], ["v2", 10])}, null, null, 200) as c \\gset
   select concat_ws(',', :'c', (select costo_maquila from retail.producciones where id = :'oid'), (select cantidad_buenas from retail.producciones where id = :'oid'), ${MOV_ENTRADA});`,
  "OK,200.00,30,30"
);
caso(
  "C4 el candado de las buenas: no entran más de una talla y color que las terminadas en la última fase (cierre_buenas_exceden, con la talla y la fase); no queda NADA escrito",
  `${FLUJO}
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 20])}) as c \\gset
   select concat_ws(',', pg_temp.eh(:'c'), :'c' like '%No puedes pasar al stock 20 de %: en Acabado se terminaron 19', ${ESTADO}, ${MOV_ENTRADA},
     (select count(*) from retail.produccion_lineas where produccion_id = :'oid' and cantidad_buenas is not null));`,
  "P0001|cierre_buenas_exceden,t,en_proceso,0,0"
);
caso(
  "C5 una talla que no es de la orden se rechaza con su motivo de siempre; y cero buenas sigue sin cerrarse (se anula)",
  `${FLUJO}
   select pg_temp.cierra(:'oid', ${L(["v_ajena", 1])}) as c1 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 0], ["v2", 0])}) as c2 \\gset
   select concat_ws(',', split_part(:'c1', '|', 3), split_part(:'c2', '|', 3), ${ESTADO});`,
  "Una de las tallas no pertenece a esta orden,No salió ninguna prenda buena — si la corrida se perdió, anula la orden en vez de cerrarla,en_proceso"
);
caso(
  "C6 no se cierra con prendas todavía en un servicio (cierre_con_prendas_afuera, con cuántas, en qué fase y con quién); con la Vuelta completa, sí",
  `${ORDEN(ESPINA, LINO)}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a0 \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 30], ["v2", 20])}, '001-1') as s0 \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 10, 0, 0, null)}), '001-2') as w0 \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 10])}) as b0 \\gset
   update retail.variantes set costo = 4.50 where id in (:'v1', :'v2');
   select pg_temp.cierra(:'oid', ${L(["v1", 10])}) as c1 \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 20, 0, 0, null)}, ${VL("v2", 20, 0, 0, null)}), '001-3') as w1 \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 20], ["v2", 20])}) as b1 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c2 \\gset
   select concat_ws(',', pg_temp.eh(:'c1'), :'c1' like '%Hay 40 prendas de Costura afuera con Confecciones Cierre Prueba: anota primero su vuelta%', :'c2', ${ESTADO});`,
  "P0001|cierre_con_prendas_afuera,t,OK,terminada"
);
caso(
  "C7 lo MEDIDO: al pasar un lote al stock, los metros de tela usados ÷ las buenas quedan en SU fila (producto_consumo_medido) y lo declarado del modelo NO se toca",
  `${FLUJO}
   insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'lino', :'taller', 100, 12.50, 'compra') returning id as lote \\gset
   insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id)
     values (:'lino', :'lote', :'taller', 'compra', 100, 12.50, :'felipe_p');
   select retail.registrar_consumo_insumo(:'oid', :'lino', 69, 'tendido') as consumo \\gset
   select (select fuente || ':' || tela_por_prenda from retail.producto_consumos where producto_id = :'prod') as antes \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 19])}, null, null, null, true) as c \\gset
   select concat_ws(',', :'c', :'antes', (select fuente || ':' || tela_por_prenda from retail.producto_consumos where producto_id = :'prod'),
     (select buenas || ':' || metros from retail.producto_consumo_medido where produccion_id = :'oid'),
     (select costo_tela from retail.producciones where id = :'oid'));`,
  (o) => /^OK,(declarado:1\.200),\1,46:69\.000,862\.50$/.test(o)
);
caso(
  "C7b lo medido manda SOLO desde la 3.ª orden cerrada del modelo (P-21): con 1 y con 2 sigue mandando lo declarado; con 3, la cifra es Σ metros ÷ Σ buenas; lo declarado nunca se toca",
  `${LOTE_LINO}
   ${UNA_CERRADA(69)}
   select :'efe' as e1 \\gset
   ${UNA_CERRADA(60)}
   select :'efe' as e2 \\gset
   ${UNA_CERRADA(70)}
   select concat_ws('|', :'e1', :'e2', :'efe', ${DECLARADO});`,
  "declarado:1:1.500|declarado:2:1.402|medido:3:1.442|declarado:1.200"
);
caso(
  "C7c Nueva orden recibe lo que manda con la forma de siempre (tela_por_prenda y fuente) y además lo declarado, lo medido y cuántas órdenes lo respaldan: con 2 cerradas manda lo declarado; con 3, lo medido",
  `${LOTE_LINO}
   ${UNA_CERRADA(69)}
   ${UNA_CERRADA(60)}
   select (select (e ->> 'tela_por_prenda') || ':' || (e ->> 'fuente') || ':' || (e ->> 'declarado_por_prenda') || ':' || (e ->> 'medido_por_prenda') || ':' || (e ->> 'ordenes_medidas')
             from jsonb_array_elements(retail.fn_nueva_orden_opciones(:'taller') -> 'consumos') e where e ->> 'producto_id' = :'prod') as con2 \\gset
   ${UNA_CERRADA(70)}
   select concat_ws('|', :'con2', (select (e ->> 'tela_por_prenda') || ':' || (e ->> 'fuente') || ':' || (e ->> 'declarado_por_prenda') || ':' || (e ->> 'medido_por_prenda') || ':' || (e ->> 'ordenes_medidas')
             from jsonb_array_elements(retail.fn_nueva_orden_opciones(:'taller') -> 'consumos') e where e ->> 'producto_id' = :'prod'));`,
  (o) => /^1\.200:declarado:1\.200:1\.402:2\|1\.442:medido:1\.200:1\.442:3$/.test(o)
);
caso(
  "C7d declarar otra vez («Dejar como el del modelo») reinicia la cuenta: lo medido deja de mandar y vuelve lo declarado, que es volver a Audaces a propósito",
  `${LOTE_LINO}
   ${UNA_CERRADA(69)}
   ${UNA_CERRADA(60)}
   ${UNA_CERRADA(70)}
   select :'efe' as antes \\gset
   -- En la vida real cada RPC es su transacción: lo cerrado ya quedó atrás. Aquí todo es una sola, así que se lo manda un día atrás.
   update retail.producto_consumo_medido set cerrada_en = cerrada_en - interval '1 day' where producto_id = :'prod';
   select pg_temp.abre(${APERTURA.replace("'fecha_entrega'", "'fijar_consumo_modelo', true, 'fecha_entrega'")}, ${ESPINA}, ${LINO.replace("'1.2'", "'1.3'")}) as r4 \\gset
   select concat_ws('|', :'antes', (select manda || ':' || ordenes_medidas || ':' || coalesce(medido_por_prenda::text, '-') from retail.fn_consumo_efectivo(:'prod')), ${DECLARADO});`,
  "medido:3:1.442|declarado:0:-|declarado:1.300"
);
caso(
  "C7e una orden que se revierte deja de contar sola (vuelve a 2 y manda lo declarado); al volver a cerrarla, su fila se reescribe y no se duplica (siguen 3 filas)",
  `${LOTE_LINO}
   ${UNA_CERRADA(69)}
   ${UNA_CERRADA(60)}
   ${UNA_CERRADA(70)}
   select retail.revertir_produccion(:'oid') as _r \\gset
   select manda || ':' || ordenes_medidas as tras_revertir from retail.fn_consumo_efectivo(:'prod') \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 27], ["v2", 19])}, null, null, null, true) as c2 \\gset
   select concat_ws('|', :'tras_revertir', :'c2', (select manda || ':' || ordenes_medidas from retail.fn_consumo_efectivo(:'prod')),
     (select count(*) from retail.producto_consumo_medido where producto_id = :'prod'));`,
  "declarado:2|OK|medido:3|3"
);
caso(
  "C8 una muestra se da por terminada sin tocar el stock ni lo medido (pero el candado de las buenas vale igual: antes de terminar Acabado, no)",
  `${ORDEN(ESPINA, LINO).replace("'es_muestra', false", "'es_muestra', true")}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a0 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30])}) as c1 \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 30], ["v2", 20])}, '001-1') as s0 \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 30, 0, 0, null)}, ${VL("v2", 20, 0, 0, null)}), '001-2') as w0 \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 30], ["v2", 20])}) as b0 \\gset
   select count(*) as consumos_antes from retail.producto_consumo_medido where producto_id = :'prod' \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c2 \\gset
   select concat_ws(',', pg_temp.eh(:'c1'), :'c2', ${ESTADO}, ${MOV_ENTRADA}, (select inventariado_at is null from retail.producciones where id = :'oid'),
     (select count(*) from retail.producto_consumo_medido where producto_id = :'prod') - :consumos_antes);`,
  "P0001|cierre_buenas_exceden,OK,terminada,0,t,0"
);
caso(
  "C9 una orden de ANTES de las fases (sin ninguna) cierra como siempre: sin candado de buenas, con el monto de servicios que se le mande, y el costo de siempre",
  `${ORDEN(ESPINA, LINO)}
   delete from retail.produccion_fases where produccion_id = :'oid';
   update retail.variantes set costo = 4.50 where id in (:'v1', :'v2');
   select pg_temp.cierra(:'oid', ${L(["v1", 35], ["v2", 20])}, null, null, 225) as c \\gset
   select concat_ws(',', :'c', ${ESTADO}, (select cantidad_buenas from retail.producciones where id = :'oid'), (select costo_maquila from retail.producciones where id = :'oid'), ${MOV_ENTRADA});`,
  "OK,terminada,55,225.00,55"
);
caso(
  "C10 el techo de las buenas que main ya tiene en producción (ADR-0415, 20261015153000): una talla no pasa del doble de lo pedido (o de 5 más si es chica) —buenas_de_mas, sin dejar nada escrito—; en el techo mismo, sí cierra",
  `${ORDEN(ESPINA, LINO)}
   delete from retail.produccion_fases where produccion_id = :'oid';
   update retail.variantes set costo = 4.50 where id in (:'v1', :'v2');
   select pg_temp.cierra(:'oid', ${L(["v1", 61], ["v2", 20])}, null, null, 225) as c1 \\gset
   select concat_ws(',', pg_temp.eh(:'c1'), :'c1' like '%más del doble de lo pedido%', ${ESTADO}, ${MOV_ENTRADA}) as r1 \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 60], ["v2", 40])}, null, null, 225, true) as c2 \\gset
   select concat_ws(',', :'r1', :'c2', ${ESTADO});`,
  "P0001|buenas_de_mas,t,en_proceso,0,OK,terminada"
);

// A. ANULAR CON PRENDAS AFUERA --------------------------------------------------------------------------------------------------
caso(
  "A1 no se anula una orden con prendas afuera (anular_con_prendas_afuera, con cuántas y con quién); tampoco queda nada escrito. Con la Vuelta completa, sí",
  `${ORDEN(ESPINA, LINO)}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a0 \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 30])}, '001-1') as s0 \\gset
   select pg_temp.anula_o(:'oid', 'me equivoqué') as r1 \\gset
   select pg_temp.vuelve(:'f_cost', jsonb_build_array(${VL("v1", 30, 0, 0, null)}), '001-2') as w0 \\gset
   select pg_temp.anula_o(:'oid', 'me equivoqué') as r2 \\gset
   select concat_ws(',', pg_temp.eh(:'r1'), :'r1' like '%Hay 30 prendas de Costura afuera con Confecciones Cierre Prueba: anota primero su vuelta%', :'r2', ${ESTADO});`,
  "P0001|anular_con_prendas_afuera,t,OK,anulada"
);
caso(
  "A2 una orden que no mandó nada afuera se anula como siempre (y devuelve la tela usada)",
  `${ORDEN(ESPINA, LINO)}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 10])}) as a0 \\gset
   select pg_temp.anula_o(:'oid', 'se abrió por error') as r \\gset
   select concat_ws(',', :'r', ${ESTADO});`,
  "OK,anulada"
);

// V. QUIÉN VE LOS COSTOS ---------------------------------------------------------------------------------------------------------
caso(
  "V1 los costos del Taller: el líder los ve; una integrante parada en Trujillo, no; parada en el Taller con el módulo «produccion», sí; sin el módulo, no (otra vez)",
  `${ORDEN(ESPINA, LINO)}
   insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'lino', :'taller', 10, 12.50, 'compra') returning id as lote \\gset
   select (select count(*) from retail.fn_costos_producciones(:'taller') where produccion_id = :'oid')::text || '/' || (select count(*) from retail.fn_costos_insumos_taller(:'taller') where lote_id = :'lote')::text as lider \\gset
   ${como(MICAELA)}
   select (select count(*) from retail.fn_costos_producciones(:'taller') where produccion_id = :'oid')::text || '/' || (select count(*) from retail.fn_costos_insumos_taller(:'taller') where lote_id = :'lote')::text as en_trujillo \\gset
   reset role;
   update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = :'micaela_p';
   ${como(MICAELA)}
   select (select count(*) from retail.fn_costos_producciones(:'taller') where produccion_id = :'oid')::text || '/' || (select count(*) from retail.fn_costos_insumos_taller(:'taller') where lote_id = :'lote')::text as en_el_taller \\gset
   reset role;
   delete from retail.rol_modulos where modulo = 'produccion' and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   ${como(MICAELA)}
   select (select count(*) from retail.fn_costos_producciones(:'taller') where produccion_id = :'oid')::text || '/' || (select count(*) from retail.fn_costos_insumos_taller(:'taller') where lote_id = :'lote')::text as sin_modulo \\gset
   select concat_ws(' ', :'lider', :'en_trujillo', :'en_el_taller', :'sin_modulo');`,
  "1/1 0/0 1/1 0/0"
);

// F. LA FORMA -------------------------------------------------------------------------------------------------------------------
const DE = (nombres) => `from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in (${nombres})`;
caso(
  "F1 la forma: cerrar, anular y los dos de costos siguen siendo security definer con search_path y no se abren a anon; las dos internas nuevas, cerradas a la API",
  `reset role;
   select concat_ws(',',
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%') ${DE("'cerrar_produccion','anular_produccion','fn_costos_producciones','fn_costos_insumos_taller','fn_costo_servicios_orden','fn_ve_costos_del_taller'")}),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) ${DE("'cerrar_produccion','anular_produccion','fn_costos_producciones','fn_costos_insumos_taller'")}),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) ${DE("'cerrar_produccion','anular_produccion','fn_costos_producciones','fn_costos_insumos_taller'")}),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) ${DE("'fn_costo_servicios_orden','fn_ve_costos_del_taller'")}),
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'cerrar_produccion'));`,
  "t,f,t,f,1"
);

caso(
  "F2 ADR-0513: la tabla de lo medido tiene RLS encendido y ninguna política (solo las funciones la leen), y fn_consumo_efectivo está cerrada a la API",
  `reset role;
   select concat_ws(',',
     (select relrowsecurity from pg_class where oid = 'retail.producto_consumo_medido'::regclass),
     (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'producto_consumo_medido'),
     (select has_function_privilege('authenticated', 'retail.fn_consumo_efectivo(uuid)', 'execute') or has_function_privilege('anon', 'retail.fn_consumo_efectivo(uuid)', 'execute')),
     (select prosecdef from pg_proc where oid = 'retail.fn_consumo_efectivo(uuid)'::regprocedure));`,
  "t,0,f,t"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
