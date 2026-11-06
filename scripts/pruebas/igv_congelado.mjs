#!/usr/bin/env node
/**
 * Prueba de la tarea 19 de «Las 36 de Finanzas» — el IGV de un mes cerrado deja una foto (`20261106164000_igv_congelado_al_cerrar.sql`).
 *
 * QUÉ CUBRE
 *   · CANDADOS: un comprobante del Taller no entra, no cambia y no se anula con el mes del Taller cerrado; el saldo a favor no se cambia desde un mes cerrado.
 *   · FOTO: cerrar CAYLA entera guarda débito, crédito y a pagar del mes. Cerrar una sola unidad, no.
 *   · AVISO: anular una boleta de ese mes no toca la foto y el mes sale en `fn_igv_cambios_desde_cierre`. Sin cambios, no sale nada.
 *   · REABRIR Y CERRAR: vale la foto del último cierre, y el aviso desaparece.
 *   · PEGAR DOS VECES no cambia ninguna función.
 *
 * CÓMO. Cada escena corre en UNA transacción con ROLLBACK, con meses de marzo de 2025 (ya terminó y nadie tiene datos).
 *
 * USO
 *   pnpm pruebas:igv-congelado
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261106164000_igv_congelado_al_cerrar.sql"), "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1500)}`);
  }
}
function verificar(titulo, r) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  for (const linea of r.salida.split("\n").filter((l) => l.includes("|"))) {
    const i = linea.lastIndexOf("|");
    esperar(`${titulo}: ${linea.slice(0, i)}`, linea.slice(i + 1) === "true", linea);
  }
}

const AYUDANTES = `
set local request.jwt.claim.sub = '${FELIPE}';
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
update retail.parametros_finanzas set inicio_finanzas = '2025-03-01' where id;
${MIGRACION}
insert into retail.proveedores_produccion (nombre, rubro) values ('ZZ IGV congelado', 'maquila') returning id as prov \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by created_at, id limit 1 \\gset
-- Marzo: una boleta de S/ 118 (S/ 18 de IGV) y una factura del Taller con S/ 9 de IGV.
insert into retail.comprobantes (ubicacion_id, tipo, serie, numero, estado, subtotal, igv, total, created_at)
values (:'tru', 'boleta', 'BZZ1', 900001, 'pendiente', 100, 18, 118, '2025-03-10 12:00-05') returning id as boleta \\gset
insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total)
values (:'prov', 'factura', 'FZZ1', '77', '2025-03-05', 'contado', 50, 9, 59) returning id as cp \\gset
`;
const CERRAR = `
select e.alcance, e.ubicacion_id, retail.cerrar_periodo('2025-03-01', e.alcance, e.ubicacion_id) from retail.fn_cierre_mes_estado('2025-03-01') e where e.alcance <> 'consolidado' \\g /dev/null
select retail.cerrar_periodo('2025-03-01', 'consolidado') \\g /dev/null
`;

verificar("candados", correr(`
begin;
${AYUDANTES}
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'taller') \\g /dev/null
select 'un comprobante nuevo del Taller no entra a un mes cerrado|' || (pg_temp.intento(format($s$insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total) values (%L, 'factura', 'FZZ1', '78', '2025-03-06', 'contado', 10, 1.8, 11.8)$s$, :'prov')) like '%está cerrado%');
select 'tampoco cambia uno de ese mes|' || (pg_temp.intento(format('update retail.comprobantes_produccion set igv = 1 where id = %L', :'cp')) like '%está cerrado%');
select 'ni se anula|' || (pg_temp.intento(format($s$update retail.comprobantes_produccion set estado = 'anulado', motivo_anulacion = 'x' where id = %L$s$, :'cp')) like '%está cerrado%');
select 'en un mes abierto sí entra|' || (pg_temp.intento(format($s$insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, fecha_emision, condicion, subtotal, igv, total) values (%L, 'factura', 'FZZ1', '79', '2025-04-06', 'contado', 10, 1.8, 11.8)$s$, :'prov')) = 'SIN_ERROR');
select 'el saldo a favor no se cambia desde un mes cerrado|' || (pg_temp.intento($s$select retail.fn_exigir_vigencia_sin_meses_cerrados('saldo_favor_igv', '2025-03-01')$s$) like '%el saldo a favor del IGV%');
select 'desde un mes abierto, sí|' || (pg_temp.intento($s$select retail.fn_exigir_vigencia_sin_meses_cerrados('saldo_favor_igv', '2025-04-01')$s$) = 'SIN_ERROR');
`));

verificar("foto y aviso", correr(`
begin;
${AYUDANTES}
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') \\g /dev/null
select 'cerrar una unidad no saca foto|' || (select count(*) = 0 from retail.periodo_igv);
select e.alcance, e.ubicacion_id, retail.cerrar_periodo('2025-03-01', e.alcance, e.ubicacion_id) from retail.fn_cierre_mes_estado('2025-03-01') e where e.alcance <> 'consolidado' and e.estado <> 'cerrado' \\g /dev/null
select retail.cerrar_periodo('2025-03-01', 'consolidado') \\g /dev/null
select 'cerrar CAYLA entera guarda el IGV del mes|' || (select debito = 18 and credito >= 9 from retail.periodo_igv where mes = '2025-03-01');
select 'sin cambios no se avisa nada|' || (select count(*) = 0 from retail.fn_igv_cambios_desde_cierre());
set local session_replication_role = replica;
update retail.comprobantes set estado = 'anulado', motivo_anulacion = 'prueba', entorno_transmision = 'produccion' where id = :'boleta';
set local session_replication_role = origin;
select 'anulada la boleta, la foto sigue igual|' || (select debito = 18 from retail.periodo_igv where mes = '2025-03-01');
select 'y el mes sale en el aviso, con lo de la foto y lo de hoy|' || (select count(*) = 1 and bool_and(mes = '2025-03-01' and debito_foto = 18 and debito_hoy = 0) from retail.fn_igv_cambios_desde_cierre());
`));

verificar("reabrir", correr(`
begin;
${AYUDANTES}
${CERRAR}
set local session_replication_role = replica;
update retail.comprobantes set estado = 'anulado', motivo_anulacion = 'prueba', entorno_transmision = 'produccion' where id = :'boleta';
set local session_replication_role = origin;
select retail.reabrir_periodo('2025-03-01', 'ubicacion', :'tru', 'se anuló una boleta') \\g /dev/null
select 'reabierto el mes, no hay foto vigente que comparar|' || (select count(*) = 0 from retail.fn_igv_cambios_desde_cierre());
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') \\g /dev/null
select retail.cerrar_periodo('2025-03-01', 'consolidado') \\g /dev/null
select 'al cerrar de nuevo vale la foto nueva|' || (select debito = 0 from retail.periodo_igv f join retail.periodos p on p.cierre_id = f.cierre_id where p.alcance = 'consolidado' and p.mes = '2025-03-01');
select 'y el aviso desaparece|' || (select count(*) = 0 from retail.fn_igv_cambios_desde_cierre());
select 'la foto vieja no se borra|' || (select count(*) = 2 from retail.periodo_igv where mes = '2025-03-01');
`));

verificar("pegar dos veces", correr(`
begin;
${AYUDANTES}
create temp table zz_defs as select p.oid::regprocedure::text as f, md5(pg_get_functiondef(p.oid)) as h from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('cerrar_periodo', 'fn_impuestos_igv_meses', 'fn_exigir_vigencia_sin_meses_cerrados', 'fn_igv_cambios_desde_cierre', 'fn_candado_comprobantes_produccion');
${MIGRACION.replace(/create or replace function pg_temp\.reemplazar/, "create or replace function pg_temp.reemplazar")}
select 'pegarla otra vez no cambia ninguna función|' || (select bool_and(md5(pg_get_functiondef(z.f::regprocedure)) = z.h) from zz_defs z);
select 'quien no entra no ve el aviso|' || (select not has_function_privilege('anon', 'retail.fn_igv_cambios_desde_cierre()', 'execute'));
`));

console.log(`\n${casos - fallos}/${casos} verificaciones pasaron.`);
if (fallos) process.exit(1);
