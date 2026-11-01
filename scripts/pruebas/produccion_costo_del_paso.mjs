#!/usr/bin/env node
/**
 * Prueba del costo de un paso del Taller: `20261101033000_produccion_costo_de_un_paso_del_taller.sql` (Producción, ADR-0597).
 *
 * EL PROBLEMA QUE PRUEBA. El costo de un paso vivía solo en los servicios de afuera. Habilitado lo hace el Taller, así que lo que costó prepararlo no entraba al costo de la prenda, y como la base no
 * deja cambiar quién hace un paso que ya empezó, no había cómo corregirlo. Ahora un paso del Taller puede llevar tarifa por prenda y fijo por orden (`poner_costo_a_fase`), devenga como un
 * servicio y entra al costo de cada prenda al pasar al stock. Aquí: el devengado (antes, durante y después de hacerse), el estimado y el total de «Costo», el cierre al stock, los topes, las puertas
 * (servicio, hito, orden cerrada, quien no opera ese Taller), el rastro en Actividad, que los estados imposibles del CHECK sigan imposibles, y el camino de vuelta.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK, con la migración cargada dentro (idempotente): corre con la base al día (CI) o sin ella.
 * USO: node scripts/pruebas/produccion_costo_del_paso.mjs [--contenedor supabase_db_x]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)
const SIN_CANDADO = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "");
const ARCHIVO = "20261101033000_produccion_costo_de_un_paso_del_taller.sql";
const MIGRACION = SIN_CANDADO(readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${ARCHIVO}`, import.meta.url)), "utf8"));

// El inverso exacto de los reemplazos anclados de la migración (sacado de su propio archivo), más la función de costo con su filtro de antes, la RPC y el CHECK de antes.
const REEMPLAZOS = [...MIGRACION.matchAll(/reemplazar_anclado\(\s*'([^']+)',\s*\$v\$(.*?)\$v\$,\s*\$v\$(.*?)\$v\$\s*\)/gs)].map(([, firma, viejo, nuevo]) => ({ firma, viejo, nuevo }));
const DESHACER = `
do $deshacer_costo_del_paso$
declare v_def text;
begin
${REEMPLAZOS.map(({ firma, viejo, nuevo }) => `  v_def := pg_get_functiondef('${firma}'::regprocedure);\n  execute replace(v_def,\n    $q$${nuevo}$q$,\n    $q$${viejo}$q$);`).join("\n")}
end
$deshacer_costo_del_paso$;
create or replace function retail.fn_costo_servicios_orden(p_produccion_id uuid) returns numeric
language sql stable security definer set search_path = retail, public, extensions
as $$
  select coalesce(sum((f ->> 'devengado')::numeric), 0)
    from jsonb_array_elements(coalesce(retail.fn_fases_de_orden(p_produccion_id), '[]'::jsonb)) f
   where f ->> 'quien' = 'servicio';
$$;
drop function if exists retail.poner_costo_a_fase(uuid, numeric, numeric);
alter table retail.produccion_fases drop constraint if exists produccion_fases_quien;
alter table retail.produccion_fases add constraint produccion_fases_quien check (
  case when quien = 'servicio'
    then (proveedor_id is not null and (tarifa_prenda is not null or (clave = 'ploteo' and fijo_orden > 0)))
      or (proveedor_id is null and (clave <> 'ploteo' or tarifa_prenda is null))
    else proveedor_id is null and tarifa_prenda is null and fecha_prometida is null and cantidad_minima is null
  end
);
`;

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// Envolturas que nunca abortan el caso: devuelven «SIN_ERROR» o «<sqlstate>|<hint>|<mensaje>».
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
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.intento(format('select retail.registrar_avance(%L, %L::jsonb, null)', p_fase, p_lineas)) $f$;
create function pg_temp.marca(p_fase uuid) returns text language sql as $f$ select pg_temp.intento(format('select retail.marcar_fase_hecha(%L)', p_fase)) $f$;
create function pg_temp.costo(p_fase uuid, p_tarifa numeric, p_fijo numeric) returns text language sql as $f$
  select pg_temp.intento(format('select retail.poner_costo_a_fase(%L, %L, %L)', p_fase, p_tarifa, p_fijo)) $f$;
create function pg_temp.cierra(p_oid uuid, p_buenas jsonb) returns text language sql as $f$
  select pg_temp.intento(format('select retail.cerrar_produccion(%L, %L::jsonb, 1400, 200, null, true)', p_oid, p_buenas)) $f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${MIGRACION}
set local search_path = retail, public, extensions;
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
${como(FELIPE)}
`;

// La orden de siempre: 30 del primer color (v1) y 20 del segundo (v2) = 50 prendas, con los cinco pasos en el Taller.
const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASES = (costura = "jsonb_build_object('clave', 'costura', 'quien', 'taller')") =>
  `jsonb_build_array(${["ploteo", "corte", "habilitado"].map((c) => `jsonb_build_object('clave', '${c}', 'quien', 'taller')`).join(", ")}, ${costura}, jsonb_build_object('clave', 'planchado', 'quien', 'taller'))`;
const ABRE = (costura) => `select pg_temp.abre(${APERTURA}, ${FASES(costura)}) as r \\gset
select id as oid from pg_temp.ultima \\gset
select id as f_plot from retail.produccion_fases where produccion_id = :'oid' and clave = 'ploteo' \\gset
select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
select id as f_hab from retail.produccion_fases where produccion_id = :'oid' and clave = 'habilitado' \\gset
select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
select id as f_planch from retail.produccion_fases where produccion_id = :'oid' and clave = 'planchado' \\gset`;
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
const HASTA_CORTE = `
   select pg_temp.marca(:'f_plot') as m \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset`;
const FASE = (clave) => `(select f from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f where f ->> 'clave' = '${clave}')`;
const DEVENGADO = (clave) => `(${FASE(clave)} ->> 'devengado')`;
const COSTOS = (campo) => `((retail.fn_orden_produccion(:'oid') -> 'costos' ->> '${campo}')::numeric)`;
const ACTIVIDAD = `(select count(*) from retail.actividad where accion = 'produccion_fase_costo_taller' and (detalle ->> 'produccion_id') = :'oid')`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) fallas++;
  console.log(`${bien ? "✓" : "✗"} ${nombre}${bien ? "" : `\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`}`);
}

// A. EL DEVENGADO Y EL ESTIMADO ------------------------------------------------------------------------------------------------
caso(
  "A1 ponerle costo a Habilitado (0.40 por prenda y 5 fijos) antes de que empiece: devenga 0, y el estimado de la orden suma 0.40 × 50 + 5 = 25.00",
  `${ABRE()}
   select pg_temp.costo(:'f_hab', 0.40, 5) as c \\gset
   select concat_ws(',', :'c', ${DEVENGADO("habilitado")}, ${COSTOS("servicios_estimado")}, ${COSTOS("servicios_devengado")});`,
  "SIN_ERROR,0,25.00,0.00"
);
caso(
  "A2 con 20 de las 50 terminadas en Habilitado devenga 0.40 × 20 + 5 = 13.00; con las 50, 25.00 (el costo sigue a lo que se hizo, no a lo que se tecleó)",
  `${ABRE()}
   ${HASTA_CORTE}
   select pg_temp.costo(:'f_hab', 0.40, 5) as c \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 20])}) as h1 \\gset
   select ${DEVENGADO("habilitado")} as d1 \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 10], ["v2", 20])}) as h2 \\gset
   select concat_ws(',', :'c', :'d1', ${DEVENGADO("habilitado")}, ${COSTOS("servicios_devengado")});`,
  "SIN_ERROR,13.00,25.00,25.00"
);
caso(
  "A3 el costo se puede poner DESPUÉS de hacerse el paso (el caso de OP-000004: ya terminó 69 de 69 y la base no deja cambiar quién lo hizo)",
  `${ABRE()}
   ${HASTA_CORTE}
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as h \\gset
   select coalesce(${DEVENGADO("habilitado")}, 'null') as antes \\gset
   select pg_temp.costo(:'f_hab', 1.00, 0) as c \\gset
   select concat_ws(',', :'antes', :'c', ${DEVENGADO("habilitado")}, ${COSTOS("servicios_devengado")}, ${COSTOS("total_real_hasta_hoy")} - ${COSTOS("tela_real")} - ${COSTOS("avios_real")});`,
  "null,SIN_ERROR,50.00,50.00,50.00"
);
caso(
  "A4 un paso del Taller SIN costo sigue sin devengar nada (null, como hasta hoy) y no suma al estimado",
  `${ABRE()}
   ${HASTA_CORTE}
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as h \\gset
   select concat_ws(',', coalesce(${DEVENGADO("habilitado")}, 'null'), ${COSTOS("servicios_estimado")}, ${COSTOS("servicios_devengado")});`,
  "null,0.00,0.00"
);
caso(
  "A5 solo el fijo (sin tarifa por prenda): 60 por toda la orden, tal como lo dijo la nota de Claudia («el corte fueron 60 soles»)",
  `${ABRE()}
   ${HASTA_CORTE}
   select pg_temp.costo(:'f_hab', null, 60) as c \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as h \\gset
   select concat_ws(',', :'c', ${DEVENGADO("habilitado")}, ${COSTOS("servicios_estimado")});`,
  "SIN_ERROR,60.00,60.00"
);
caso(
  "A6 un costo de Habilitado y uno de afuera en Costura suman los dos al cuadro (estimado 25.00 + 4.50 × 50 = 250.00)",
  `${ABRE("jsonb_build_object('clave', 'costura', 'quien', 'servicio', 'proveedor_pendiente', true, 'tarifa_prenda', '4.50')")}
   select pg_temp.costo(:'f_hab', 0.40, 5) as c \\gset
   select concat_ws(',', :'c', ${COSTOS("servicios_estimado")});`,
  "SIN_ERROR,250.00"
);
caso(
  "A7 quitar el costo (tarifa y fijo en blanco) devuelve el paso a «sin costo»: devengado null y el estimado vuelve a 0",
  `${ABRE()}
   select pg_temp.costo(:'f_hab', 0.40, 5) as c1 \\gset
   select pg_temp.costo(:'f_hab', null, null) as c2 \\gset
   select concat_ws(',', :'c1', :'c2', coalesce(${DEVENGADO("habilitado")}, 'null'), ${COSTOS("servicios_estimado")}, (select count(*) from retail.produccion_fases where id = :'f_hab' and tarifa_prenda is null and fijo_orden = 0));`,
  "SIN_ERROR,SIN_ERROR,null,0.00,1"
);

// B. AL PASAR AL STOCK ---------------------------------------------------------------------------------------------------------
caso(
  "B1 el costo del paso entra al costo de cada prenda al cerrar: tela 1400 + avíos 200 + Habilitado 25 = 1625 entre 50 buenas = 32.50, y costo_maquila queda en 25",
  `${ABRE()}
   ${HASTA_CORTE}
   select pg_temp.costo(:'f_hab', 0.40, 5) as c \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as h \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as k \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 30], ["v2", 20])}) as p \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as z \\gset
   select concat_ws(',', :'c', :'z', (select costo_maquila from retail.producciones where id = :'oid'), (select costo_unitario from retail.producciones where id = :'oid'));`,
  "SIN_ERROR,SIN_ERROR,25.00,32.50"
);
caso(
  "B2 con la orden ya pasada al stock el costo se congela: poner o cambiar el costo se rechaza (orden_cerrada) y lo cobrado a las prendas no cambia",
  `${ABRE()}
   ${HASTA_CORTE}
   select pg_temp.avanza(:'f_hab', ${L(["v1", 30], ["v2", 20])}) as h \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as k \\gset
   select pg_temp.avanza(:'f_planch', ${L(["v1", 30], ["v2", 20])}) as p \\gset
   select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as z \\gset
   select pg_temp.costo(:'f_hab', 9, 9) as c \\gset
   select concat_ws(',', pg_temp.eh(:'c'), (select costo_maquila from retail.producciones where id = :'oid'));`,
  "P0001|orden_cerrada,0.00"
);

// C. LAS PUERTAS ---------------------------------------------------------------------------------------------------------------
caso(
  "C1 un paso que sale afuera no se cuesta por aquí (su costo es el del servicio): fase_no_es_del_taller",
  `${ABRE("jsonb_build_object('clave', 'costura', 'quien', 'servicio', 'proveedor_pendiente', true, 'tarifa_prenda', '4.50')")}
   select pg_temp.eh(pg_temp.costo(:'f_cost', 9, 9));`,
  "P0001|fase_no_es_del_taller"
);
caso("C2 el Ploteo se marca con un toque y no cuenta prendas: no lleva costo por prenda (fase_es_hito)", `${ABRE()}\n   select pg_temp.eh(pg_temp.costo(:'f_plot', 1, 1));`, "P0001|fase_es_hito");
caso("C3 una tarifa en cero o negativa se rechaza (fase_tarifa_invalida)", `${ABRE()}\n   select concat_ws(',', pg_temp.eh(pg_temp.costo(:'f_hab', 0, 5)), pg_temp.eh(pg_temp.costo(:'f_hab', -1, 5)));`, "P0001|fase_tarifa_invalida,P0001|fase_tarifa_invalida");
caso(
  "C4 los topes: tarifa de 10 000 y fijo negativo o de 100 000 se rechazan; el tope exacto (9999.99 y 99999.99) pasa",
  `${ABRE()}
   select concat_ws(',', pg_temp.eh(pg_temp.costo(:'f_hab', 10000, 0)), pg_temp.eh(pg_temp.costo(:'f_hab', 1, -1)), pg_temp.eh(pg_temp.costo(:'f_hab', 1, 100000)), pg_temp.costo(:'f_hab', 9999.99, 99999.99));`,
  "P0001|fase_tarifa_invalida,P0001|fase_tarifa_invalida,P0001|fase_tarifa_invalida,SIN_ERROR"
);
caso("C5 una fase que no existe se rechaza con su hint", `select pg_temp.eh(pg_temp.costo('00000000-0000-4000-8000-000000000000', 1, 1));`, "P0001|fase_inexistente");
caso(
  "C6 una orden anulada ya no cambia de costo: orden_cerrada",
  `${ABRE()}
   select pg_temp.intento(format('select retail.anular_produccion(%L, %L)', :'oid', 'Prueba de costo')) as an \\gset
   select pg_temp.eh(pg_temp.costo(:'f_hab', 1, 1));`,
  "P0001|orden_cerrada"
);
caso(
  "C7 quien no opera ese Taller (una integrante de Tienda Trujillo) no pone costos: 42501",
  `${ABRE()}
   ${como(MICAELA)}
   select substr(pg_temp.costo(:'f_hab', 1, 1), 1, 5);`,
  "42501"
);

// D. EL RASTRO -----------------------------------------------------------------------------------------------------------------
caso(
  "D1 cada cambio deja su fila en Actividad (poner, cambiar, quitar) y repetir el mismo costo no deja otra",
  `${ABRE()}
   select pg_temp.costo(:'f_hab', 0.40, 5) as c1 \\gset
   select pg_temp.costo(:'f_hab', 0.40, 5) as c2 \\gset
   select ${ACTIVIDAD} as n1 \\gset
   select pg_temp.costo(:'f_hab', 0.50, 5) as c3 \\gset
   select pg_temp.costo(:'f_hab', null, null) as c4 \\gset
   select concat_ws(',', :'n1', ${ACTIVIDAD}, (select string_agg(x, ';' order by x) from (select split_part(descripcion, ' ', 1) || ' ' || split_part(descripcion, ' ', 2) as x from retail.actividad where accion = 'produccion_fase_costo_taller' and (detalle ->> 'produccion_id') = :'oid') t));`,
  "1,3,cambió el;le puso;le quitó"
);

// E. LOS ESTADOS IMPOSIBLES SIGUEN IMPOSIBLES (el CHECK) ----------------------------------------------------------------------
const CHECK = (parche) => `${ABRE()}\n   select pg_temp.eh(pg_temp.intento(format('update retail.produccion_fases set ${parche} where id = %L', :'f_hab')));`;
caso("E1 un paso del Taller con tarifa y fijo es válido para el CHECK", `${ABRE()}\n   select pg_temp.intento(format('update retail.produccion_fases set tarifa_prenda = 0.4, fijo_orden = 5 where id = %L', :'f_hab'));`, "SIN_ERROR");
caso("E2 un paso del Taller con proveedor sigue siendo imposible", `${ABRE()}\n   insert into retail.proveedores_produccion (nombre, rubro) values ('Proveedor del CHECK', 'maquila') returning id as prov \\gset\n   select pg_temp.eh(pg_temp.intento(format('update retail.produccion_fases set proveedor_id = %L where id = %L', :'prov', :'f_hab')));`, "23514|");
caso("E3 un paso del Taller con fecha prometida sigue siendo imposible", CHECK("fecha_prometida = current_date"), "23514|");
caso("E4 un paso del Taller con cantidad mínima sigue siendo imposible", CHECK("cantidad_minima = 5"), "23514|");

// F. CAMBIAR QUIÉN -------------------------------------------------------------------------------------------------------------
caso(
  "F1 un paso con costo del Taller que se manda afuera (pendiente de registrar, 4.50) deja el costo del servicio, no la suma de los dos: estimado 4.50 × 50 = 225.00 y fijo en 0",
  `${ABRE()}
   select pg_temp.costo(:'f_hab', 0.40, 5) as c \\gset
   select pg_temp.intento(format('select retail.dejar_fase_pendiente_de_registrar(%L, null, 4.50)', :'f_hab')) as q \\gset
   select concat_ws(',', :'c', :'q', ${COSTOS("servicios_estimado")}, (select fijo_orden from retail.produccion_fases where id = :'f_hab'));`,
  "SIN_ERROR,SIN_ERROR,225.00,0.00"
);

// V. EL CAMINO DE VUELTA --------------------------------------------------------------------------------------------------------
caso(
  "V1 el camino de vuelta deshace los reemplazos, la RPC y el costo de los pasos del Taller, y volver a pegar la migración los deja igual que antes de deshacerlos",
  `create function pg_temp.huella() returns text language sql as $f$
     select md5(pg_get_functiondef('retail.fn_fases_de_orden(uuid)'::regprocedure) || pg_get_functiondef('retail.fn_orden_produccion(uuid)'::regprocedure) || pg_get_functiondef('retail.fn_costo_servicios_orden(uuid)'::regprocedure)) $f$;
   select pg_temp.huella() as h0 \\gset
   ${ABRE()}
   update retail.produccion_fases set tarifa_prenda = null, fijo_orden = 0 where produccion_id = :'oid';
   ${DESHACER}
   select pg_temp.huella() as h1 \\gset
   select (to_regprocedure('retail.poner_costo_a_fase(uuid,numeric,numeric)') is null) as rpc_fuera \\gset
   ${MIGRACION}
   select concat_ws(',', (:'h0' <> :'h1'), :'rpc_fuera', (:'h0' = pg_temp.huella()));`,
  "t,t,t"
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
process.exit(fallas === 0 ? 0 : 1);
