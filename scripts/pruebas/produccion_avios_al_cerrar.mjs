#!/usr/bin/env node
/**
 * Pruebas de «los avíos se descuentan solos al cerrar» (ADR-0614, actividad 13) — migración `20261106003000_avios_se_descuentan_al_cerrar.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que al cerrar se descuente lo que faltaba de cada avío declarado y entre al costo; que respete lo ya anotado y el color; que no alcance sin frenar, y quede escrito; y que revertir y
 * volver a cerrar no descuente dos veces.
 *
 * USO: node scripts/pruebas/produccion_avios_al_cerrar.mjs [--contenedor supabase_db_x] [--base otra]
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261106003000_avios_se_descuentan_al_cerrar.sql"), "utf8"));

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
/** Un avío con :stock unidades y la orden :oid de 20 buenas, con todos sus pasos hechos y 1 avío por prenda declarado (de 2 costó 1 sol cada uno). */
const PREPARA = (stock = 100, por = 1, color = "null") => `insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('AC-A', 'Botón cierre prueba', 'avio', 'unidad') returning id as avio \\gset
   select retail.recibir_insumo(:'avio', :'taller', ${stock}::numeric, ${stock}::numeric, p_origen => 'saldo_inicial') as _t \\gset
   select pg_temp.abre(${APERTURA}, ${ESPINA}) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   insert into retail.produccion_insumos (produccion_id, insumo_id, color_codigo, consumo_por_prenda, cantidad_plan) values (:'oid', :'avio', ${color}, ${por}, 20);
   select retail.registrar_avance(f.id, ${L(20)}, null) as _a from retail.produccion_fases f where f.produccion_id = :'oid' and f.clave = 'corte' \\gset
   select retail.registrar_avance(f.id, ${L(20)}, null) as _b from retail.produccion_fases f where f.produccion_id = :'oid' and f.clave = 'costura' \\gset
   select retail.registrar_avance(f.id, ${L(20)}, null) as _c from retail.produccion_fases f where f.produccion_id = :'oid' and f.clave = 'acabado' \\gset`;
const CIERRA = `pg_temp.intento(format('select retail.cerrar_produccion_con_motivo(%L, %L::jsonb, null, null, null, true, %L)', :'oid', ${L(20)}, 'motivo de prueba'))`;
const NETO = `(select coalesce(sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end), 0) from retail.movimientos_insumo mi where mi.produccion_id = :'oid' and mi.insumo_id = :'avio')`;
const COSTO_AVIOS = `(select costo_avios from retail.producciones where id = :'oid')`;

caso(
  "C1 al cerrar sale lo que tocaba y entra al costo de la orden",
  `${PREPARA()}
   select ${CIERRA} as r \\gset
   select concat_ws(',', :'r', ${NETO}, ${COSTO_AVIOS});`,
  "OK,20.000,20.00"
);
caso(
  "C2 lo ya anotado cuenta: solo sale lo que falta",
  `${PREPARA()}
   select retail.fn_insumo_consumir_peps(:'oid', :'avio', :'taller', 15, 'a mano', null) as _m \\gset
   select ${CIERRA} as r \\gset
   select concat_ws(',', :'r', ${NETO});`,
  "OK,20.000"
);
caso(
  "C3 una fracción se redondea hacia arriba en un avío por unidad",
  `${PREPARA(100, 0.33)}
   select ${CIERRA} as r \\gset
   select concat_ws(',', :'r', ${NETO});`,
  "OK,7.000"
);
caso(
  "C4 un avío de otro color no se descuenta",
  `${PREPARA(100, 1, "(select c.codigo from retail.colores c where c.codigo <> (select v.color_codigo from retail.variantes v where v.id = :'v1') limit 1)")}
   select ${CIERRA} as r \\gset
   select concat_ws(',', :'r', ${NETO});`,
  "OK,0"
);
caso(
  "F1 si no alcanza, descuenta lo que hay, no frena, y lo deja escrito",
  `${PREPARA(5)}
   select ${CIERRA} as r \\gset
   select concat_ws(',', :'r', ${NETO}, (select estado from retail.producciones where id = :'oid'), (select nota like '%No alcanzó el estante para: Botón cierre prueba (15)%' from retail.producciones where id = :'oid'));`,
  "OK,5.000,terminada,t"
);
caso(
  "R1 revertir no devuelve los avíos, y volver a cerrar no los descuenta dos veces",
  `${PREPARA()}
   select ${CIERRA} as a \\gset
   select pg_temp.intento(format('select retail.revertir_produccion(%L)', :'oid')) as b \\gset
   select ${NETO} as tras \\gset
   select ${CIERRA} as c \\gset
   select concat_ws(',', :'a', :'b', :'tras', :'c', ${NETO});`,
  "OK,OK,20.000,OK,20.000"
);
caso(
  "M1 sin avíos declarados, cerrar no cambia, y la migración se vuelve a cargar",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select pg_temp.abre(${APERTURA}, ${ESPINA}) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select retail.registrar_avance(f.id, ${L(20)}, null) as _a from retail.produccion_fases f where f.produccion_id = :'oid' and f.clave = 'corte' \\gset
   select retail.registrar_avance(f.id, ${L(20)}, null) as _b from retail.produccion_fases f where f.produccion_id = :'oid' and f.clave = 'costura' \\gset
   select retail.registrar_avance(f.id, ${L(20)}, null) as _c from retail.produccion_fases f where f.produccion_id = :'oid' and f.clave = 'acabado' \\gset
   select ${CIERRA} as r2 \\gset
   select concat_ws(',', :'r2', has_function_privilege('authenticated', 'retail.fn_descontar_avios_al_cerrar(uuid)', 'execute'));`,
  "OK,f"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR}, base: ${BASE})`);
process.exit(fallas ? 1 : 0);
