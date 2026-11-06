#!/usr/bin/env node
/**
 * Pruebas de «datos al abrir y cambiar una orden abierta» (ADR-0614, actividades 11 y 12) — migración `20261105234000_datos_al_abrir_y_cambiar_orden.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que la orden guarde sus datos sin frenar la apertura; que el plan cambie con motivo, nunca por debajo de lo cortado; que sume o quite tallas; que los candados lean el plan nuevo;
 * que cada cambio quede en la historia; y que una orden cerrada no cambie.
 *
 * USO: node scripts/pruebas/produccion_datos_y_plan.mjs [--contenedor supabase_db_x] [--base otra]
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261105234000_datos_al_abrir_y_cambiar_orden.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;


const ENVOLTURAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return coalesce(nullif(v_hint, ''), v_estado || ':' || v_msg);
end;
$f$;
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb) returns text language plpgsql as $f$
declare v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, null) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK';
  end loop;
  return 'SIN_FILA';
end;
$f$;
`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Costura Prueba Por Pagar', 'maquila') returning id as maquila \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(*) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 1
  order by p.created_at limit 1 \\gset
select v.id as v1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.id limit 1 \\gset
update retail.variantes set costo = 8.00 where id = :'v1';
${como(FELIPE)}
`;

const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const COSTURA = FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_id: `:'maquila'`, tarifa_prenda: `'5.00'` });
const COSTURA_SIN_NOMBRE = FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_pendiente: "true", tarifa_prenda: `'5.00'` });
const APERTURA = `jsonb_build_object('ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '20')))`;
const L = (n) => `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '${n}'))`;
const VUELTA = (n) => `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'buenas', '${n}'))`;

/** Una orden con Corte hecho y la costura afuera: deja :oid y :f_cost. */
const ABRIR = (costura = COSTURA) => `select pg_temp.abre(${APERTURA}, jsonb_build_array(${TALLER("corte")}, ${costura}, ${TALLER("acabado")})) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
   select id as f_acab from retail.produccion_fases where produccion_id = :'oid' and clave = 'acabado' \\gset
   select retail.registrar_avance(:'f_corte', ${L(20)}, null) as _a \\gset`;
const SALE_Y_VUELVE = (n) => `select retail.registrar_salida(:'f_cost', ${L(n)}, null, null) as _s \\gset
   select retail.registrar_vuelta(:'f_cost', ${VUELTA(n)}, null, null) as _v \\gset`;
const CERRAR = `select retail.registrar_avance(:'f_acab', ${L(20)}, null) as _ac \\gset
   select retail.cerrar_produccion_con_motivo(:'oid', ${L(20)}, 0, 0, null, true, 'motivo de prueba') as _c \\gset`;
const FILA = `(select concat_ws('/', s.devengado, s.documentado, s.falta) from retail.fn_servicios_por_pagar() s where s.fase_id = :'f_cost')`;
/** Una factura, con su línea apuntando a la fase. */
const FACTURA = (subtotal, igv) => `insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, fecha_vencimiento, subtotal, igv, total)
     values (:'maquila', 'factura', 'F001', '77', 'credito', retail.fn_hoy_lima() + 7, ${subtotal}, ${igv}, ${subtotal + igv}) returning id as comp \\gset
   insert into retail.comprobantes_produccion_items (comprobante_id, descripcion, cantidad, costo_unitario, fase_id) values (:'comp', 'Costura', 1, ${subtotal}, :'f_cost');`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  if (obtenido === esperado) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  }
}

const ESPINA = `jsonb_build_array(${TALLER("corte")}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const ABRE = (extra = "") => `select pg_temp.abre(jsonb_build_object('ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text${extra},
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '20'))), ${ESPINA}) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset`;
const V2 = `select v.id as v2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.id <> :'v1' order by v.id limit 1 \\gset`;
const LINEA = (v, n) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`;
const PLAN = (lineas, motivo = "pidió más la tienda") => `pg_temp.intento(format('select retail.cambiar_plan_de_orden(%L, %L::jsonb, %L)', :'oid', jsonb_build_array(${lineas.join(", ")}), '${motivo}'))`;
const PLAN_TOTAL = `(select cantidad_plan from retail.producciones where id = :'oid')`;
const LINEA_DE = (v) => `(select cantidad_plan from retail.produccion_lineas where produccion_id = :'oid' and variante_id = :'${v}')`;
const CORTA = (n) => `select retail.registrar_avance(:'f_corte', jsonb_build_array(${LINEA("v1", n)}), null) as _c \\gset`;
const TIENDA = `select id as tru from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset`;

caso(
  "M1 la migración se vuelve a cargar sin error; la cuenta lee las columnas nuevas, y quien no entró no llama nada",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws(',', has_column_privilege('authenticated', 'retail.producciones', 'urgente', 'select'), has_function_privilege('anon', 'retail.cambiar_plan_de_orden(uuid,jsonb,text)', 'execute'));`,
  "t,f"
);
caso(
  "A1 una orden sin esos datos se abre igual",
  `${ABRE()}
   select concat_ws(',', :'r', (select urgente from retail.producciones where id = :'oid'), coalesce((select motivo_orden from retail.producciones where id = :'oid'), 'sin'));`,
  "OK,f,sin"
);
caso(
  "A2 con los datos, los guarda, y la lectura de la orden los devuelve con el nombre de la tienda",
  `${TIENDA}
   ${ABRE(", 'motivo_orden', 'reposicion', 'tienda_destino_id', :'tru', 'urgente', true, 'muestra_aprobada_por', 'Lizzeloth'")}
   select concat_ws(',', (select o ->> 'motivo_orden' from retail.fn_orden_produccion(:'oid') r, lateral (select r -> 'orden' as o) x),
     (select o ->> 'urgente' from retail.fn_orden_produccion(:'oid') r, lateral (select r -> 'orden' as o) x),
     (select o ->> 'muestra_aprobada_por' from retail.fn_orden_produccion(:'oid') r, lateral (select r -> 'orden' as o) x),
     (select (o ->> 'tienda_destino') is not null from retail.fn_orden_produccion(:'oid') r, lateral (select r -> 'orden' as o) x));`,
  "reposicion,true,Lizzeloth,t"
);
caso(
  "A3 un motivo inventado rechaza la apertura",
  `create function pg_temp.abre_mal(p_a jsonb, p_f jsonb) returns text language plpgsql as $f$ begin perform retail.abrir_orden_produccion(p_a, p_f, null); return 'OK'; exception when check_violation then return 'rechazada'; end; $f$;
   select pg_temp.abre_mal(jsonb_build_object('ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text, 'motivo_orden', 'capricho',
     'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '20'))), ${ESPINA});`,
  "rechazada"
);
caso(
  "D1 los datos se cambian después, y queda en la historia",
  `${TIENDA}
   ${ABRE()}
   select pg_temp.intento(format('select retail.cambiar_datos_de_orden(%L, %L, %L, true, %L)', :'oid', 'novedad', :'tru', 'Claudia')) as r \\gset
   select concat_ws(',', :'r', (select motivo_orden || '/' || urgente || '/' || muestra_aprobada_por from retail.producciones where id = :'oid'), (select count(*) from retail.produccion_cambios where produccion_id = :'oid' and accion = 'datos'));`,
  "OK,novedad/true/Claudia,1"
);
caso(
  "D2 una tienda que no es tienda se rechaza",
  `${ABRE()}
   select pg_temp.intento(format('select retail.cambiar_datos_de_orden(%L, null, %L, false, null)', :'oid', :'taller'));`,
  "dato_tienda_invalida"
);
caso(
  "P1 subir el plan: la línea y el total cambian, y queda en la historia con su motivo",
  `${ABRE()}
   select ${PLAN([LINEA("v1", 30)])} as r \\gset
   select concat_ws(',', :'r', ${LINEA_DE("v1")}, ${PLAN_TOTAL}, (select texto like 'Cambió el plan de 20 a 30 prendas: pidió más%' from retail.produccion_cambios where produccion_id = :'oid' and accion = 'plan'));`,
  "OK,30,30,t"
);
caso(
  "P2 sumar otra talla o color del mismo modelo",
  `${ABRE()}
   ${V2}
   select ${PLAN([LINEA("v2", 10)])} as r \\gset
   select concat_ws(',', :'r', ${LINEA_DE("v1")}, ${LINEA_DE("v2")}, ${PLAN_TOTAL});`,
  "OK,20,10,30"
);
caso(
  "P3 no baja de lo cortado, y sí puede quedar justo en lo cortado",
  `${ABRE()}
   ${CORTA(15)}
   select ${PLAN([LINEA("v1", 14)])} as a \\gset
   select ${PLAN([LINEA("v1", 15)])} as b \\gset
   select concat_ws(',', :'a', :'b', ${PLAN_TOTAL});`,
  "plan_menor_que_lo_cortado,OK,15"
);
caso(
  "P4 quitar una línea sin cortar; con corte no se puede",
  `${ABRE()}
   ${V2}
   select ${PLAN([LINEA("v2", 10)])} as a \\gset
   select ${PLAN([LINEA("v2", 0)])} as b \\gset
   ${CORTA(5)}
   select ${PLAN([LINEA("v1", 0)])} as c \\gset
   select concat_ws(',', :'a', :'b', :'c', coalesce(${LINEA_DE("v2")}::text, 'quitada'), ${PLAN_TOTAL});`,
  "OK,OK,plan_menor_que_lo_cortado,quitada,20"
);
caso(
  "P5 el tope de corte lee el plan nuevo",
  `${ABRE()}
   select ${PLAN([LINEA("v1", 30)])} as a \\gset
   select pg_temp.intento(format('select retail.registrar_avance(%L, %L::jsonb, null)', :'f_corte', jsonb_build_array(${LINEA("v1", 34)}))) as b \\gset
   select pg_temp.intento(format('select retail.registrar_avance(%L, %L::jsonb, null)', :'f_corte', jsonb_build_array(${LINEA("v1", 33)}))) as c \\gset
   select concat_ws(',', :'b', :'c');`,
  "avance_excede,OK"
);
caso(
  "E1 sin motivo, sin cambios, sin líneas o con otra prenda se rechaza, y no queda nada",
  `${ABRE()}
   select id as ajena from retail.variantes where producto_id <> :'prod' and activo limit 1 \\gset
   select ${PLAN([LINEA("v1", 30)], "  ")} as a \\gset
   select ${PLAN([LINEA("v1", 20)])} as b \\gset
   select ${PLAN([LINEA("ajena", 2)])} as c \\gset
   select ${PLAN([LINEA("v1", 0)])} as d \\gset
   select concat_ws(',', :'a', :'b', :'c', :'d', ${PLAN_TOTAL});`,
  "plan_sin_motivo,plan_sin_cambios,plan_variante_ajena,plan_sin_lineas,20"
);
caso(
  "C1 con la orden cerrada no se cambia",
  `${ABRE()}
   update retail.producciones set estado = 'anulada' where id = :'oid';
   select ${PLAN([LINEA("v1", 30)])};`,
  "orden_cerrada"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR}, base: ${BASE})`);
process.exit(fallas ? 1 : 0);
