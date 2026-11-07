#!/usr/bin/env node
/**
 * Pruebas de «lo que se le debe a un servicio del Taller sale en Finanzas ▸ Por pagar» (ADR-0614, actualización 2026-11-06) — migración
 * `20261106162000_servicios_en_por_pagar_de_finanzas.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que la deuda sea la misma cifra que en Taller ▸ Por pagar, que sin papel nunca salga vencida, que lo que ya tiene papel no se cuente
 * dos veces, que solo la vea el líder, como en el Taller, y que llegue a la proyección de caja.
 *
 * USO
 *   node scripts/pruebas/finanzas_servicios_por_pagar.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/finanzas_servicios_por_pagar.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/finanzas_servicios_por_pagar.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261106162000_servicios_en_por_pagar_de_finanzas.sql"), "utf8"));

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
const COMO_MICAELA = `${como(MICAELA)}set local role authenticated;\n`;
/** Le da, dentro de la transacción, esos módulos al rol «integrante», que es el de Micaela, y solo esos de los que importan. */
const MODULOS = (...claves) => `reset role;
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo in ('cuentas_dinero', 'reportes_financieros');
${claves.map((c) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${c}');`).join("\n")}
`;

const ENVOLTURAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return coalesce(nullif(v_hint, ''), v_estado);
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
insert into retail.proveedores_produccion (nombre, rubro) values ('Costura Prueba Finanzas', 'maquila') returning id as maquila \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by created_at limit 1 \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(*) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 1
  order by p.created_at limit 1 \\gset
select v.id as v1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.id limit 1 \\gset
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

/** Una orden con Corte hecho y la costura de vuelta con 20 buenas (S/ 100): deja :oid y :f_cost. */
const ORDEN = (costura = COSTURA) => `select pg_temp.abre(${APERTURA}, jsonb_build_array(${TALLER("corte")}, ${costura}, ${TALLER("acabado")})) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
   select retail.registrar_avance(:'f_corte', ${L(20)}, null) as _a \\gset
   select retail.registrar_salida(:'f_cost', ${L(20)}, null, null) as _s \\gset
   select retail.registrar_vuelta(:'f_cost', ${VUELTA(20)}, null, null) as _v \\gset`;
/** Una factura, con su línea apuntando a la fase. Deja :comp. */
const FACTURA = (subtotal, igv) => `insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, fecha_vencimiento, subtotal, igv, total)
     values (:'maquila', 'factura', 'F001', '77', 'credito', retail.fn_hoy_lima() + 7, ${subtotal}, ${igv}, ${subtotal + igv}) returning id as comp \\gset
   insert into retail.comprobantes_produccion_items (comprobante_id, descripcion, cantidad, costo_unitario, fase_id) values (:'comp', 'Costura', 1, ${subtotal}, :'f_cost');`;
/** La fila del servicio, sin papel. */
const FILA = (args = "") => `(select concat_ws('/', d.origen, d.naturaleza, d.total, d.pagado, d.saldo) from retail.fn_por_pagar_consolidado(${args}) d where d.id = :'f_cost')`;

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
  "M1 la migración se vuelve a cargar sin error y no agrega una segunda fila por servicio",
  `${ORDEN()}
   ${MIGRACION}
   set local search_path = retail, public, extensions;
   select count(*) from retail.fn_por_pagar_consolidado() d where d.id = :'f_cost';`,
  "1"
);
caso(
  "S1 el servicio de vuelta sale en Finanzas con la misma cifra que en el Taller",
  `${ORDEN()}
   select concat_ws(',', ${FILA()}, (select s.falta from retail.fn_servicios_por_pagar() s where s.fase_id = :'f_cost'));`,
  "servicio/servicio/100.00/0.00/100.00,100.00"
);
caso(
  "S2 nunca sale vencido: se debe hoy y no tiene fecha de vencimiento, aunque haya pasado tiempo",
  `${ORDEN()}
   select concat_ws(',', d.vence = retail.fn_hoy_lima(), d.fecha_vencimiento is null, d.fecha_emision is null, d.condicion is null)
     from retail.fn_por_pagar_consolidado() d where d.id = :'f_cost';`,
  "t,t,t,t"
);
caso(
  "S3 dice de qué orden es y de qué prenda, y es de la unidad Taller",
  `${ORDEN()}
   select concat_ws(',', d.documento = retail.fn_produccion_numero_texto(p.numero) || ' · ' || retail.fn_fase_nombre('costura'), d.concepto = pr.referencia, d.ubicacion_id = :'taller'::uuid, d.proveedor = 'Costura Prueba Finanzas')
     from retail.fn_por_pagar_consolidado() d
     join retail.producciones p on p.id = :'oid'::uuid join retail.productos pr on pr.id = p.producto_id
    where d.id = :'f_cost';`,
  "t,t,t,t"
);
caso(
  "S4 un servicio sin nombre sale como «Servicios sin nombre», con su monto",
  `${ORDEN(COSTURA_SIN_NOMBRE)}
   select concat_ws('/', d.proveedor, d.proveedor_id is null, d.saldo) from retail.fn_por_pagar_consolidado() d where d.id = :'f_cost';`,
  "Servicios sin nombre/t/100.00"
);
caso(
  "S5 mirando el Taller sí; mirando una tienda o la empresa, no",
  `${ORDEN()}
   select concat_ws(',', coalesce(${FILA(":'taller'")}, 'nada'), coalesce(${FILA(":'tru'")}, 'nada'), coalesce(${FILA("null, null, true")}, 'nada'));`,
  "servicio/servicio/100.00/0.00/100.00,nada,nada"
);
caso(
  "S6 p_hasta no lo esconde en una fecha de hoy en adelante, y sí antes de hoy",
  `${ORDEN()}
   select concat_ws(',', coalesce(${FILA("null, retail.fn_hoy_lima()")}, 'nada'), coalesce(${FILA("null, retail.fn_hoy_lima() - 1")}, 'nada'));`,
  "servicio/servicio/100.00/0.00/100.00,nada"
);
caso(
  "P1 una factura parcial deja el resto sin papel, y las dos filas suman lo que se debe: nada se cuenta dos veces",
  `${ORDEN()}
   ${FACTURA(60, 0)}
   select concat_ws(',', ${FILA()},
     (select concat_ws('/', d.origen, d.naturaleza, d.saldo) from retail.fn_por_pagar_consolidado() d where d.id = :'comp'),
     (select sum(d.saldo) from retail.fn_por_pagar_consolidado() d where d.id in (:'f_cost', :'comp')));`,
  "servicio/servicio/100.00/60.00/40.00,produccion/servicio/60.00,100.00"
);
caso(
  "P2 con todo el papel, la fila sin papel se va y queda la factura, con el IGV que sí se paga",
  `${ORDEN()}
   ${FACTURA(100, 18)}
   select concat_ws(',', coalesce(${FILA()}, 'nada'), (select concat_ws('/', d.naturaleza, d.saldo) from retail.fn_por_pagar_consolidado() d where d.id = :'comp'));`,
  "nada,servicio/118.00"
);
caso(
  "P3 la factura de la tela, que no apunta a ningún paso, sigue siendo un insumo",
  `insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, fecha_vencimiento, subtotal, igv, total)
     values (:'maquila', 'factura', 'F001', '78', 'credito', retail.fn_hoy_lima() + 7, 50, 0, 50) returning id as comp \\gset
   insert into retail.comprobantes_produccion_items (comprobante_id, descripcion, cantidad, costo_unitario) values (:'comp', 'Lino', 1, 50);
   select d.naturaleza from retail.fn_por_pagar_consolidado() d where d.id = :'comp';`,
  "insumo"
);
caso(
  "A1 una orden anulada no se debe aquí",
  `${ORDEN()}
   update retail.producciones set estado = 'anulada' where id = :'oid';
   select coalesce(${FILA()}, 'nada');`,
  "nada"
);
caso(
  "C1 quien tiene Estados financieros y no es líder pasa la lectura y ve la tela, pero no los servicios: esos son del líder",
  `${ORDEN()}
   insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, fecha_vencimiento, subtotal, igv, total)
     values (:'maquila', 'factura', 'F001', '79', 'credito', retail.fn_hoy_lima() + 7, 50, 0, 50) returning id as comp \\gset
   ${MODULOS("reportes_financieros")}${COMO_MICAELA}
   select concat_ws(',', coalesce(${FILA()}, 'nada'), (select d.naturaleza from retail.fn_por_pagar_consolidado() d where d.id = :'comp'));`,
  "nada,insumo"
);
caso(
  "C2 con Cuentas y dinero, solo su tienda: el servicio del Taller no le toca",
  `${ORDEN()}
   ${MODULOS("cuentas_dinero")}${COMO_MICAELA}
   select coalesce(${FILA()}, 'nada');`,
  "nada"
);
caso(
  "C3 sin módulo, la base lo dice; y anon no la llama",
  `${ORDEN()}
   ${MODULOS()}${COMO_MICAELA}
   select pg_temp.intento('select * from retail.fn_por_pagar_consolidado()') as sin \\gset
   reset role;
   set local role anon;
   select concat_ws(',', :'sin', pg_temp.intento('select * from retail.fn_por_pagar_consolidado()'));`,
  "42501,42501"
);
caso(
  "F1 la proyección de caja cuenta esa salida, en el primer bloque y sin marcarla atrasada",
  `${ORDEN()}
   select concat_ws('/', s ->> 'monto', s ->> 'atrasada')
     from jsonb_array_elements(retail.fn_flujo_caja_proyeccion(30) -> 'salidas') s
    where s ->> 'id' = 'servicio:' || :'f_cost';`,
  "100.00/false"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR}, base: ${BASE})`);
process.exit(fallas ? 1 : 0);
