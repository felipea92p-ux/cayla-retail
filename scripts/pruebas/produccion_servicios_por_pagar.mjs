#!/usr/bin/env node
/**
 * Pruebas de «lo que se le debe a un servicio llega a Por pagar» (ADR-0614, actividad 3) — migración
 * `20261105221000_servicios_del_taller_por_pagar.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que la deuda sea devengado menos lo documentado, que cambie sola con otra vuelta o una anulación, que se sume a la deuda de Producción,
 * que quien no es líder no la vea, y que el nombre de un servicio se registre con la orden cerrada sin tocar el monto.
 *
 * USO
 *   node scripts/pruebas/produccion_servicios_por_pagar.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_servicios_por_pagar.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_servicios_por_pagar.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261105221000_servicios_del_taller_por_pagar.sql"), "utf8"));

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

caso(
  "M1 la migración se vuelve a cargar sin error (idempotente), y la lectura la llama la cuenta pero no quien no entró",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws(',', has_function_privilege('authenticated', 'retail.fn_servicios_por_pagar()', 'execute'), has_function_privilege('anon', 'retail.fn_servicios_por_pagar()', 'execute'));`,
  "t,f"
);
caso(
  "D1 sin vuelta no se debe nada; con una vuelta de 12 se deben 12 × 5, y otra de 8 lo sube solo a 100",
  `${ABRIR()}
   select coalesce(${FILA}, 'nada') as antes \\gset
   ${SALE_Y_VUELVE(12)}
   select ${FILA} as primera \\gset
   ${SALE_Y_VUELVE(8)}
   select concat_ws(',', :'antes', :'primera', ${FILA});`,
  "nada,60.00/0/60.00,100.00/0/100.00"
);
caso(
  "D2 una factura salda la deuda por su subtotal, porque la tarifa es sin IGV: 100 de tarifa contra una factura de 100 + 18",
  `${ABRIR()}
   ${SALE_Y_VUELVE(20)}
   ${FACTURA(100, 18)}
   select coalesce(${FILA}, 'saldada');`,
  "saldada"
);
caso(
  "D3 una factura parcial deja el resto; anularla devuelve toda la deuda",
  `${ABRIR()}
   ${SALE_Y_VUELVE(20)}
   ${FACTURA(60, 0)}
   select ${FILA} as parcial \\gset
   update retail.comprobantes_produccion set estado = 'anulada', motivo_anulacion = 'prueba' where id = :'comp';
   select concat_ws(',', :'parcial', ${FILA});`,
  "100.00/60.00/40.00,100.00/0/100.00"
);
caso(
  "D4 una orden anulada no se debe aquí",
  `${ABRIR()}
   ${SALE_Y_VUELVE(20)}
   update retail.producciones set estado = 'anulada' where id = :'oid';
   select coalesce(${FILA}, 'nada');`,
  "nada"
);
caso(
  "D5 se suma a la deuda de Producción, junto con las facturas de ese mismo servicio, en una sola fila",
  `${ABRIR()}
   ${SALE_Y_VUELVE(20)}
   insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, fecha_vencimiento, subtotal, igv, total)
     values (:'maquila', 'factura', 'F001', '88', 'credito', retail.fn_hoy_lima() + 7, 30, 0, 30);
   select concat_ws(',', count(*), sum(d.saldo), sum(d.comprobantes)) from retail.fn_deuda_consolidada() d where d.origen = 'produccion' and d.proveedor_id = :'maquila';`,
  "1,130.00,2"
);
caso(
  "D6 un servicio sin nombre también es deuda, en su propia fila",
  `select coalesce((select d.saldo from retail.fn_deuda_consolidada() d where d.origen = 'produccion' and d.proveedor_id is null), 0) as antes \\gset
   ${ABRIR(COSTURA_SIN_NOMBRE)}
   ${SALE_Y_VUELVE(20)}
   select concat_ws(',', d.proveedor, d.saldo - :'antes'::numeric) from retail.fn_deuda_consolidada() d where d.origen = 'produccion' and d.proveedor_id is null;`,
  "Servicios sin nombre,100.00"
);
caso(
  "P1 quien no es líder no ve ninguna fila",
  `${ABRIR()}
   ${SALE_Y_VUELVE(20)}
   ${como(MICAELA)}
   select count(*) from retail.fn_servicios_por_pagar();`,
  "0"
);
caso(
  "R1 con la orden cerrada se registra quién fue, sin mover el monto ni el costo",
  `${ABRIR(COSTURA_SIN_NOMBRE)}
   ${SALE_Y_VUELVE(20)}
   ${CERRAR}
   select costo as c0 from retail.variantes where id = :'v1' \\gset
   select pg_temp.intento(format('select retail.registrar_proveedor_de_fase(%L, %L, null, null, null, null)', :'f_cost', :'maquila')) as r \\gset
   select concat_ws(',', :'r', (select proveedor_id = :'maquila' from retail.produccion_fases where id = :'f_cost'), ${FILA},
     (select costo = :'c0'::numeric from retail.variantes where id = :'v1'));`,
  "OK,t,100.00/0/100.00,t"
);
caso(
  "R2 con la orden cerrada no se cambia la tarifa, y no queda nada escrito",
  `${ABRIR(COSTURA_SIN_NOMBRE)}
   ${SALE_Y_VUELVE(20)}
   ${CERRAR}
   select pg_temp.intento(format('select retail.registrar_proveedor_de_fase(%L, %L, 9.00, null, null, null)', :'f_cost', :'maquila')) as r \\gset
   select concat_ws(',', :'r', (select proveedor_id is null from retail.produccion_fases where id = :'f_cost'));`,
  "orden_cerrada_costo,t"
);
caso(
  "R3 con la orden en proceso se sigue pudiendo registrar y fijar la tarifa, como siempre",
  `${ABRIR(COSTURA_SIN_NOMBRE)}
   select pg_temp.intento(format('select retail.registrar_proveedor_de_fase(%L, %L, 6.00, null, null, null)', :'f_cost', :'maquila')) as r \\gset
   select concat_ws(',', :'r', (select tarifa_prenda from retail.produccion_fases where id = :'f_cost'));`,
  "OK,6.00"
);
caso(
  "R4 una orden anulada sigue rechazada",
  `${ABRIR(COSTURA_SIN_NOMBRE)}
   update retail.producciones set estado = 'anulada' where id = :'oid';
   select pg_temp.intento(format('select retail.registrar_proveedor_de_fase(%L, %L, null, null, null, null)', :'f_cost', :'maquila'));`,
  "orden_cerrada"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR}, base: ${BASE})`);
process.exit(fallas ? 1 : 0);
