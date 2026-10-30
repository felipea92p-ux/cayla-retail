#!/usr/bin/env node
/**
 * Pruebas de «agregar un paso a una orden abierta» (ADR-0566, actividad 1) — migración `20261029051000_produccion_agregar_paso_a_la_orden.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que a una orden en proceso se le pueda sumar un paso opcional (Ojales y botones, el que pidió Felipe) y que quede en su lugar de la ruta, entre Costura y Planchado;
 * que la ruta resultante pase la MISMA validación que al abrir (paso repetido, clave que no existe, servicio sin proveedor ni tarifa, la ruta anterior mezclada con la nueva);
 * que NO se pueda agregar si un paso posterior ya empezó (aunque lo anotado esté deshecho); que no mueva dinero; que sea todo o nada; y que la orden con el paso nuevo
 * se trabaje y CIERRE de punta a punta como cualquier otra.
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y la migración se carga dentro de cada caso (así se prueba que se puede pegar otra vez). Contra la base tal como queda con
 * TODAS las migraciones aplicadas (la misma de CI).
 *
 * QUÉ PRUEBA
 *   A  AGREGAR: en el Taller, con servicio y tarifa de la lista, con tarifa escrita, «pendiente de registrar», bordado sobre la prenda (su posición), y la orden del Chaleco (Costura hecha).
 *   R  REGLAS: repetido, clave desconocida, servicio sin proveedor o sin tarifa, paso posterior empezado (y deshecho), paso anterior empezado (no frena), ruta anterior, orden cerrada,
 *      orden inexistente, una integrante de otra sede.
 *   D  DATOS: Actividad con el nombre del proveedor, sin dinero movido, todo o nada.
 *   F  DE PUNTA A PUNTA: con el paso nuevo, Planchado espera a Ojales y botones y la orden pasa al stock; un servicio devenga su costo al volver, no al agregarse.
 *   S  LA FORMA: security definer con search_path, authenticated sí y anon no, y el mismo candado por orden que las demás.
 *
 * LO QUE ESTA PRUEBA NO HACE: dos sesiones a la vez. Es una sola transacción por caso; el candado se comprueba por su forma (S2). Con dos sesiones habría que hacer COMMIT, y eso queda
 * fuera del job (ver `ci-paridad.test.ts`).
 *
 * USO
 *   node scripts/pruebas/produccion_agregar_paso.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_agregar_paso.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_agregar_paso.mjs --base otra                 → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)
const SIN_CANDADO = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "");
const MIGRACION = SIN_CANDADO(readFileSync(fileURLToPath(new URL("../../supabase/migrations/20261029051000_produccion_agregar_paso_a_la_orden.sql", import.meta.url)), "utf8"));

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

// Envolturas que nunca abortan el caso: devuelven «SIN_ERROR»/«OK» o «<sqlstate>|<hint>|<mensaje>».
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
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, null) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK';
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
-- Agrega un paso a la última orden: «OK» o «<sqlstate>|<hint>|<mensaje>».
create function pg_temp.agrega(p_clave text, p_quien text default 'taller', p_prov uuid default null, p_tarifa numeric default null, p_fijo numeric default null, p_min integer default null,
  p_fecha date default null, p_pend boolean default false, p_pos text default null, p_orden uuid default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.agregar_paso_orden(coalesce(p_orden, (select id from pg_temp.ultima)), p_clave, p_quien, p_prov, p_tarifa, p_fijo, p_min, p_fecha, p_pend, p_pos);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.intento(format('select retail.registrar_avance(%L, %L::jsonb, null)', p_fase, p_lineas)) $f$;
create function pg_temp.marca(p_fase uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.marcar_fase_hecha(%L)', p_fase)) $f$;
create function pg_temp.deshace(p_avance uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.deshacer_avance(%L)', p_avance)) $f$;
create function pg_temp.sale(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.intento(format('select retail.registrar_salida(%L, %L::jsonb, ''001-1'', null)', p_fase, p_lineas)) $f$;
create function pg_temp.vuelve(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.intento(format('select retail.registrar_vuelta(%L, %L::jsonb, ''001-2'', null)', p_fase, p_lineas)) $f$;
create function pg_temp.cierra(p_oid uuid, p_buenas jsonb) returns text language sql as $f$
  select pg_temp.intento(format('select retail.cerrar_produccion(%L, %L::jsonb, 1400, 200, null, true)', p_oid, p_buenas)) $f$;
create function pg_temp.anula(p_oid uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.anular_produccion(%L, ''prueba'')', p_oid)) $f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${MIGRACION}
insert into retail.proveedores_produccion (nombre, rubro) values ('Ojales y Botones Prueba SAC', 'maquila') returning id as ojalero \\gset
insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, cantidad_minima, fijo_orden, vigente_desde) values (:'ojalero', 'ojales_botones', 1.80, 20, 0, retail.fn_hoy_lima() - 1);
insert into retail.proveedores_produccion (nombre, rubro) values ('Solo Telas Prueba SAC', 'tela') returning id as teleria \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
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
const TALLER = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const RUTA = (...claves) => `jsonb_build_array(${claves.map(TALLER).join(", ")})`;
const CINCO = ["ploteo", "corte", "habilitado", "costura", "planchado"];
const ANTERIOR = ["corte", "costura", "acabado"];
const ABRE = (...claves) => `select pg_temp.abre(${APERTURA}, ${RUTA(...claves)}) as r \\gset`;
const IDS = `
select id as oid from pg_temp.ultima \\gset
select id as f_plot from retail.produccion_fases where produccion_id = :'oid' and clave = 'ploteo' \\gset
select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
select id as f_hab from retail.produccion_fases where produccion_id = :'oid' and clave = 'habilitado' \\gset
select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
select id as f_planch from retail.produccion_fases where produccion_id = :'oid' and clave = 'planchado' \\gset
`;
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
const VL = (v, buenas) => `jsonb_build_object('variante_id', :'${v}', 'buenas', '${buenas}', 'segundas', '0', 'faltantes', '0', 'motivo', null)`;
const SECUENCIAS = `(select string_agg(clave || ':' || secuencia, ' ' order by secuencia) from retail.produccion_fases where produccion_id = :'oid')`;
const ESTADOS = `(select string_agg((f ->> 'clave') || ':' || (f ->> 'estado'), ' ' order by (f ->> 'secuencia')::int) from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f)`;
const ESTADO = `(select estado from retail.producciones where id = :'oid')`;
const FILAS_FASES = `(select count(*) from retail.produccion_fases where produccion_id = :'oid')`;
const ACTIVIDAD = (patron) =>
  `(select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = 'produccion_paso_agregado' and a.descripcion like '${patron}')`;
const FILA_OJALES = (campos) => `(select ${campos.map((c) => `(${c})::text`).join(" || ':' || ")} from retail.produccion_fases where produccion_id = :'oid' and clave = 'ojales_botones')`;
const MOV_ENTRADA = `(select coalesce(sum(cantidad), 0) from retail.movimientos where produccion_id = :'oid' and motivo = 'produccion')`;
// Lo que la orden del Chaleco ya hizo: Ploteo marcado, Corte, Habilitado y Costura de las 50.
const HASTA_COSTURA = `
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a3 \\gset`;

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

// A. AGREGAR --------------------------------------------------------------------------------------------------------------------
caso(
  "A1 a una orden de cinco pasos se le agrega Ojales y botones en el Taller: entra entre Costura (30) y Planchado (65) con secuencia 35, y nace pendiente",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.agrega('ojales_botones') as ag \\gset
   select concat_ws(',', :'r', :'ag', ${SECUENCIAS}, ${ESTADOS}, ${FILA_OJALES(["quien", "coalesce(proveedor_id::text, '-')", "fijo_orden::text"])});`,
  "OK,OK,ploteo:5 corte:10 habilitado:15 costura:30 ojales_botones:35 planchado:65,ploteo:pendiente corte:pendiente habilitado:pendiente costura:pendiente ojales_botones:pendiente planchado:pendiente,taller:-:0.00"
);
caso(
  "A2 la orden del Chaleco (Costura ya hecha, Planchado en 0): el paso se puede agregar y queda como el siguiente a trabajar; Planchado espera",
  `${ABRE(...CINCO)}
   ${IDS}
   ${HASTA_COSTURA}
   select pg_temp.agrega('ojales_botones') as ag \\gset
   select concat_ws(',', :'ag', ${ESTADOS});`,
  "OK,ploteo:hecha corte:hecha habilitado:hecha costura:hecha ojales_botones:pendiente planchado:pendiente"
);
caso(
  "A3 con un servicio de afuera y SIN escribir la tarifa: toma la de la lista de precios del proveedor (1.80 por prenda, mínimo 20)",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.agrega('ojales_botones', 'servicio', :'ojalero') as ag \\gset
   select concat_ws(',', :'ag', ${FILA_OJALES(["quien", "(proveedor_id = :'ojalero')::text", "tarifa_prenda::text", "cantidad_minima::text"])});`,
  "OK,servicio:true:1.80:20"
);
caso(
  "A4 con la tarifa escrita (4.50), su mínimo (30) y su fecha prometida: se guarda lo escrito, no lo de la lista",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.agrega('ojales_botones', 'servicio', :'ojalero', 4.50, null, 30, retail.fn_hoy_lima() + 5) as ag \\gset
   select concat_ws(',', :'ag', ${FILA_OJALES(["tarifa_prenda::text", "cantidad_minima::text", "(fecha_prometida = retail.fn_hoy_lima() + 5)::text"])});`,
  "OK,4.50:30:true"
);
caso(
  "A5 «pendiente de registrar» (sale afuera pero todavía no se sabe con quién): sin proveedor, y con la tarifa si la hay",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.agrega('ojales_botones', 'servicio', null, 2.00, null, null, null, true) as ag \\gset
   select concat_ws(',', :'ag', ${FILA_OJALES(["quien", "coalesce(proveedor_id::text, 'sin_proveedor')", "tarifa_prenda::text"])});`,
  "OK,servicio:sin_proveedor:2.00"
);
caso(
  "A6 un bordado sobre la prenda dice su posición: queda en su lugar de la ruta (40, después de Ojales y botones), y sin posición se rechaza (fase_sin_posicion)",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.agrega('bordado') as sin_pos \\gset
   select pg_temp.agrega('ojales_botones') as a1 \\gset
   select pg_temp.agrega('bordado', 'taller', null, null, null, null, null, false, 'prenda') as a2 \\gset
   select concat_ws(',', pg_temp.eh(:'sin_pos'), :'a1', :'a2', ${SECUENCIAS});`,
  "P0001|fase_sin_posicion,OK,OK,ploteo:5 corte:10 habilitado:15 costura:30 ojales_botones:35 bordado:40 planchado:65"
);

// R. REGLAS ---------------------------------------------------------------------------------------------------------------------
caso(
  "R1 un paso que ya está en la orden no se agrega otra vez (fase_repetida) y no se escribe nada",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.agrega('ojales_botones') as a1 \\gset
   select pg_temp.agrega('ojales_botones') as a2 \\gset
   select pg_temp.agrega('planchado') as a3 \\gset
   select concat_ws(',', :'a1', pg_temp.eh(:'a2'), pg_temp.eh(:'a3'), ${FILAS_FASES});`,
  "OK,P0001|fase_repetida,P0001|fase_repetida,6"
);
caso(
  "R2 una clave que no existe se rechaza (fase_desconocida)",
  `${ABRE(...CINCO)}
   ${IDS}
   select concat_ws(',', pg_temp.eh(pg_temp.agrega('zapatos')), pg_temp.eh(pg_temp.agrega('')), ${FILAS_FASES});`,
  "P0001|fase_desconocida,P0001|fase_desconocida,5"
);
caso(
  "R3 un servicio sin proveedor (y sin la marca de pendiente) se rechaza (fase_sin_proveedor); sin tarifa ni lista, también (fase_sin_tarifa); un proveedor de telas no hace servicios (fase_proveedor_rubro)",
  `${ABRE(...CINCO)}
   ${IDS}
   insert into retail.proveedores_produccion (nombre, rubro) values ('Sin lista Prueba SAC', 'maquila') returning id as sinlista \\gset
   select concat_ws(',', pg_temp.eh(pg_temp.agrega('ojales_botones', 'servicio')), pg_temp.eh(pg_temp.agrega('ojales_botones', 'servicio', :'sinlista')),
     pg_temp.eh(pg_temp.agrega('ojales_botones', 'servicio', :'teleria', 3)), ${FILAS_FASES});`,
  "P0001|fase_sin_proveedor,P0001|fase_sin_tarifa,P0001|fase_proveedor_rubro,5"
);
caso(
  "R4 si un paso POSTERIOR ya empezó (Planchado con 10 hechas), Ojales y botones iría antes de esas prendas: se rechaza (paso_despues_empezado) con la frase y no se escribe nada",
  `${ABRE(...CINCO)}
   ${IDS}
   ${HASTA_COSTURA}
   select pg_temp.avanza(:'f_planch', ${L(["v1", 10])}) as pl \\gset
   select pg_temp.agrega('ojales_botones') as ag \\gset
   select concat_ws(',', :'pl', pg_temp.eh(:'ag'), :'ag' like '%La fase «Planchado» ya tiene algo anotado: «Ojales y botones» iría antes de ella y no se puede agregar', ${FILAS_FASES});`,
  "SIN_ERROR,P0001|paso_despues_empezado,t,5"
);
caso(
  "R5 aunque lo anotado en Planchado se haya DESHECHO sigue siendo historia: se rechaza igual",
  `${ABRE(...CINCO)}
   ${IDS}
   ${HASTA_COSTURA}
   select pg_temp.avanza(:'f_planch', ${L(["v1", 10])}) as pl \\gset
   select id as av from retail.produccion_avances where fase_id = :'f_planch' order by created_at limit 1 \\gset
   select pg_temp.deshace(:'av') as dh \\gset
   select concat_ws(',', :'dh', pg_temp.eh(pg_temp.agrega('ojales_botones')), ${FILAS_FASES});`,
  "SIN_ERROR,P0001|paso_despues_empezado,5"
);
caso(
  "R6 un paso ANTERIOR empezado no frena nada: con Costura a medias (10 de 50) el paso se agrega",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 10])}) as a3 \\gset
   select pg_temp.agrega('ojales_botones') as ag \\gset
   select concat_ws(',', :'ag', ${FILAS_FASES});`,
  "OK,6"
);
caso(
  "R7 una orden de la ruta ANTERIOR (Corte · Costura · Acabado) no mezcla con las fases nuevas (fases_mezcla)",
  `${ABRE(...ANTERIOR)}
   select concat_ws(',', :'r', pg_temp.eh(pg_temp.agrega('ojales_botones')), (select count(*) from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima)));`,
  "OK,P0001|fases_mezcla,3"
);
caso(
  "R8 una orden terminada o anulada no recibe pasos (orden_cerrada) y una orden que no existe responde orden_inexistente",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.anula(:'oid') as an \\gset
   select concat_ws(',', :'an', ${ESTADO}, pg_temp.eh(pg_temp.agrega('ojales_botones')), pg_temp.eh(pg_temp.agrega('ojales_botones', 'taller', null, null, null, null, null, false, null, gen_random_uuid())));`,
  "SIN_ERROR,anulada,P0001|orden_cerrada,P0001|orden_inexistente"
);
caso(
  "R9 una integrante de Trujillo no agrega pasos a una orden del Taller (42501) y la ruta queda igual",
  `${ABRE(...CINCO)}
   ${IDS}
   ${como(MICAELA)}
   select pg_temp.agrega('ojales_botones') as ag \\gset
   select concat_ws(',', left(:'ag', 5), ${FILAS_FASES});`,
  "42501,5"
);

// D. DATOS ----------------------------------------------------------------------------------------------------------------------
caso(
  "D1 queda en Actividad con el número de la orden y con quién lo hace: «en el Taller», «afuera con <proveedor>» o «afuera, pendiente de registrar»; una fila por paso agregado",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.agrega('ojales_botones') as a1 \\gset
   select concat_ws(',', ${ACTIVIDAD("agregó el paso Ojales y botones a la OP-% (en el Taller)")}, (select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = 'produccion_paso_agregado'));`,
  "1,1"
);
caso(
  "D2 con un servicio, Actividad dice a quién; pendiente, lo dice también",
  `${ABRE(...CINCO)}
   ${IDS}
   select pg_temp.agrega('ojales_botones', 'servicio', :'ojalero') as a1 \\gset
   select concat_ws(',', ${ACTIVIDAD("agregó el paso Ojales y botones a la OP-% (afuera con Ojales y Botones Prueba SAC)")});`,
  "1"
);
caso(
  "D3 todo o nada: un paso que se rechaza no deja fila, ni actividad, ni dinero (caja y movimientos de proveedor intactos)",
  `${ABRE(...CINCO)}
   ${IDS}
   select count(*) as act_antes from retail.actividad where accion = 'produccion_paso_agregado' \\gset
   select pg_temp.agrega('ojales_botones', 'servicio') as ag \\gset
   select concat_ws(',', pg_temp.eh(:'ag'), ${FILAS_FASES}, (select count(*) from retail.actividad where accion = 'produccion_paso_agregado') - :act_antes,
     retail.fn_costo_servicios_orden(:'oid'));`,
  "P0001|fase_sin_proveedor,5,0,0"
);
caso(
  "D4 agregar un servicio NO mueve dinero: el costo de servicios de la orden sigue en cero hasta que el servicio devuelva prendas",
  `${ABRE(...CINCO)}
   ${IDS}
   ${HASTA_COSTURA}
   select pg_temp.agrega('ojales_botones', 'servicio', :'ojalero') as ag \\gset
   select concat_ws(',', :'ag', retail.fn_costo_servicios_orden(:'oid'));`,
  "OK,0"
);
caso(
  "D5 la migración se vuelve a cargar sin error (idempotente) y sigue habiendo UNA sola función con ese nombre",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'agregar_paso_orden';`,
  "1"
);

// F. DE PUNTA A PUNTA -----------------------------------------------------------------------------------------------------------
caso(
  "F1 con el paso nuevo, Planchado ESPERA a Ojales y botones (no entran prendas que no terminaron el ojal: avance_excede), y la orden pasa al stock de punta a punta con Planchado como última fase",
  `${ABRE(...CINCO)}
   ${IDS}
   ${HASTA_COSTURA}
   select pg_temp.agrega('ojales_botones') as ag \\gset
   select id as f_ojal from retail.produccion_fases where produccion_id = :'oid' and clave = 'ojales_botones' \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 10])}) as espera \\gset
   select pg_temp.avanza(:'f_ojal', ${L(["v1", 30], ["v2", 20])}) as o1 \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 30], ["v2", 20])}) as p1 \\gset
   update retail.variantes set costo = 4.50 where id in (:'v1', :'v2');
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c \\gset
   select concat_ws(',', pg_temp.eh(:'espera'), :'o1', :'p1', :'c', ${ESTADO}, ${MOV_ENTRADA});`,
  "P0001|avance_excede,SIN_ERROR,SIN_ERROR,SIN_ERROR,terminada,50"
);
caso(
  "F2 un servicio agregado devenga su costo al VOLVER, no al agregarse: salen 50, vuelven 50 buenas a 1.80 de la lista = 90.00",
  `${ABRE(...CINCO)}
   ${IDS}
   ${HASTA_COSTURA}
   select pg_temp.agrega('ojales_botones', 'servicio', :'ojalero') as ag \\gset
   select id as f_ojal from retail.produccion_fases where produccion_id = :'oid' and clave = 'ojales_botones' \\gset
   select retail.fn_costo_servicios_orden(:'oid') as antes \\gset
   select pg_temp.sale(:'f_ojal', ${L(["v1", 30], ["v2", 20])}) as s \\gset
   select pg_temp.vuelve(:'f_ojal', jsonb_build_array(${VL("v1", 30)}, ${VL("v2", 20)})) as w \\gset
   select concat_ws(',', :'ag', :'antes', :'s', :'w', retail.fn_costo_servicios_orden(:'oid'));`,
  "OK,0,SIN_ERROR,SIN_ERROR,90.00"
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la forma: una sola función con ese nombre, security definer con search_path, authenticated sí y anon no",
  `select concat_ws(',',
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'agregar_paso_orden'),
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'agregar_paso_orden'),
     (select has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'agregar_paso_orden'),
     (select has_function_privilege('anon', p.oid, 'execute') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'agregar_paso_orden'));`,
  "1,t,t,f"
);
caso(
  "S2 el candado: toma la MISMA llave por orden que registrar avance, salida, vuelta y marcar hecha (la una espera a la otra), antes de mirar lo que hay anotado",
  `select concat_ws(',',
     (select bool_and(pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock(hashtextextended(''produccion:'' || %') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname in ('agregar_paso_orden', 'registrar_avance', 'registrar_salida', 'registrar_vuelta', 'marcar_fase_hecha')),
     (select position('pg_advisory_xact_lock' in pg_get_functiondef(p.oid)) < position('produccion_avances' in pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname = 'agregar_paso_orden'));`,
  "t,t"
);

console.log(`\n${casos - fallas}/${casos} casos bien (contenedor: ${CONTENEDOR})`);
process.exit(fallas === 0 ? 0 : 1);
