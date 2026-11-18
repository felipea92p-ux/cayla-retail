#!/usr/bin/env node
/**
 * Pruebas del tope de corte (ADR-0614, actividad 8) — migración `20261105232000_tope_de_corte_tres_prendas.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que en la primera fase se pueda cortar hasta el plan + 3 por talla y color, ni uno más; que valga igual en un plan chico y en uno grande; y que las demás fases sigan
 * tomando lo que salió de la anterior.
 *
 * USO: node scripts/pruebas/produccion_tope_de_corte.mjs [--contenedor supabase_db_x] [--base otra]
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261105232000_tope_de_corte_tres_prendas.sql"), "utf8"));

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
const ABRIR_DE = (plan) => `select pg_temp.abre(jsonb_build_object('ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '${plan}'))), ${ESPINA}) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset`;
const AVANZA = (fase, n) => `pg_temp.intento(format('select retail.registrar_avance(%L, %L::jsonb, null)', :'${fase}', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '${n}'))))`;

caso(
  "T1 plan chico: de 5 se pueden cortar 8, no 9 (con el 10 % eran 6)",
  `${ABRIR_DE(5)}
   select ${AVANZA("f_corte", 9)} as a \\gset
   select ${AVANZA("f_corte", 8)} as b \\gset
   select concat_ws(',', :'a', :'b');`,
  "avance_excede,OK"
);
caso(
  "T2 plan grande: de 200 se pueden cortar 203, no 204 (con el 10 % eran 220)",
  `${ABRIR_DE(200)}
   select ${AVANZA("f_corte", 204)} as a \\gset
   select ${AVANZA("f_corte", 203)} as b \\gset
   select concat_ws(',', :'a', :'b');`,
  "avance_excede,OK"
);
caso(
  "T3 las demás fases toman lo que salió de la anterior, sin margen",
  `${ABRIR_DE(10)}
   select ${AVANZA("f_corte", 11)} as a \\gset
   select ${AVANZA("f_cost", 12)} as b \\gset
   select ${AVANZA("f_cost", 11)} as c \\gset
   select concat_ws(',', :'a', :'b', :'c');`,
  "OK,avance_excede,OK"
);
caso(
  "T4 la migración se vuelve a cargar sin error",
  `${MIGRACION}
   select position('+ 3' in pg_get_functiondef('retail.fn_produccion_entrada_variante'::regproc)) > 0;`,
  "t"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR}, base: ${BASE})`);
process.exit(fallas ? 1 : 0);
