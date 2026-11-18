#!/usr/bin/env node
/**
 * Prueba de `20261109162000_comision_de_lotes_en_una_pasada.sql`: la comisión estimada de las máquinas, en una sola pasada.
 *
 * QUÉ CUBRE
 *   · IDÉNTICA A LA REFERENCIA: cada asiento `comision_est` (6392) y cada reversa `comision_rev` (4691) que arma `fn_asientos_dinero_y_caja` vale lo que da
 *     `fn_pos_comision_lote` para su lote (cuenta, día, sede y medio), y no falta ni sobra ninguno. Con tarjeta y QR, varios días, un día
 *     gratis del QR (ADR-0629) y una venta de prueba que no cuenta.
 *   · LA CUENTA DE SIEMPRE: 100 + 33,33 con tarjeta el mismo día dan 3,62 (2,30 % + IGV por operación), como en la tarea 14.
 *   · EL DIARIO CUADRA y la función quedó con la versión nueva.
 *   · PEGAR DOS VECES no cambia nada.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK, y pega la migración adentro (si la base ya la tiene, no hace nada).
 *
 * USO
 *   pnpm pruebas:comision-lotes
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const a = process.argv.indexOf("--contenedor");
const CONTENEDOR = a > 0 ? process.argv[a + 1] : "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261109162000_comision_de_lotes_en_una_pasada.sql"), "utf8");

function correr(sql) {
  try {
    const salida = execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
      input: `${sql}\nrollback;\n`,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let casos = 0;
function verificar(titulo, r, esperados) {
  const lineas = r.ok ? Object.fromEntries(r.salida.split("\n").filter((l) => l.includes("|")).map((l) => [l.slice(0, l.indexOf("|")), l.slice(l.indexOf("|") + 1)])) : {};
  for (const [caso, valor] of Object.entries(esperados)) {
    casos++;
    const ok = r.ok && (typeof valor === "function" ? valor(lineas[caso]) : lineas[caso] === valor);
    console.log(`${ok ? "✓" : "✗"} ${titulo}: ${caso}`);
    if (!ok) {
      fallos++;
      console.log(r.ok ? `    esperado ${typeof valor === "function" ? "(condición)" : valor}, salió ${lineas[caso]}` : `    ${r.mensaje.slice(0, 1500)}`);
    }
  }
}

// Una venta en Trujillo con sus pagos, puesta el día `dia` (a mediodía de Lima). `prueba`: la marca como venta de prueba (no cuenta).
const venta = (nombre, dia, pagos, prueba = false) => {
  const total = pagos.reduce((x, [, m]) => x + m, 0);
  return `
update retail.variantes set precio = ${total} where id = :'v';
select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', ${total}, 'descuento_unitario', 0)),
  jsonb_build_array(${pagos.map(([m, monto]) => `jsonb_build_object('metodo', '${m}', 'monto', ${monto})`).join(", ")}),
  null, gen_random_uuid(), p_descuento_pct => 0) as ${nombre} \\gset
update retail.ventas set created_at = (date '${dia}' + time '12:00') at time zone 'America/Lima'${prueba ? ", es_prueba = true" : ""} where id = :'${nombre}';
`;
};

const ESCENA = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
${MIGRACION}
update retail.parametros_finanzas set inicio_finanzas = '2019-01-01';
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = 'piso_venta');
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT97' when 'factura' then 'FT97' else serie end, siguiente_numero = 1 where ubicacion_id = :'tru' and tipo in ('boleta', 'factura');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'tru', retail.fn_sububicacion_por_defecto(:'tru', 'venta'), 'entrada', 50, 'colchón de prueba');
select count(*) as _st from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m where m.variante_id = :'v' and m.motivo = 'colchón de prueba' and m.created_at = now()) x \\gset
-- La base local compartida puede traer cobros con máquina: la escena empieza sin ninguno.
update retail.ventas set es_prueba = true where id in (select vp.venta_id from retail.venta_pagos vp join retail.pos_maquinas m on m.cuenta_id = vp.cuenta_dinero_id);
${venta("v1", "2026-10-20", [["tarjeta", 100]])}
${venta("v2", "2026-10-20", [["tarjeta", 33.33]])}
${venta("v3", "2026-10-20", [["qr", 50]])}
${venta("v4", "2026-10-25", [["tarjeta", 80], ["qr", 20]])}
${venta("v5", "2026-11-05", [["qr", 40]])}
${venta("v6", "2026-10-20", [["tarjeta", 70]], true)}
-- Un depósito de Vendemás con «Cuadrar depósitos» (los días ya vencidos): el diario revierte lo estimado de esos lotes el día del depósito.
select id as ibk from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null \\gset
select id as puente from retail.cuentas_dinero where nombre = 'Por depositar Vendemás' and archivada_en is null \\gset
select id as maq from retail.pos_maquinas where nombre = 'Vendemás' and archivada_en is null \\gset
select retail.guardar_banco_de_maquina(:'maq', :'ibk');
select claves as claves, neto as neto from retail.fn_cuadrar_depositos_vista() where cuenta_id = :'puente' \\gset
select retail.cuadrar_deposito_maquina(:'puente', :'claves'::text[], :'neto'::numeric, '00000000-0000-4000-8000-0000000000c2') as dep \\gset
`;

const DESDE = "date '2026-10-01'";
const HASTA = "date '2026-11-30'";
// Lo que arma el diario nuevo, por lote, y lo que da la referencia (`fn_pos_comision_lote`) para los mismos lotes que ve la base.
const NUEVO = `select split_part(asiento, ':', 2) c, split_part(asiento, ':', 3) f, split_part(asiento, ':', 4) u, split_part(asiento, ':', 5) m, debe
  from retail.fn_asientos_dinero_y_caja(${DESDE}, ${HASTA}, true, null) where asiento like 'comision_est:%' and cuenta = '6392'`;
const LOTES = `select distinct vp.cuenta_dinero_id as cuenta_id, (v.created_at at time zone 'America/Lima')::date as f, v.ubicacion_id, vp.metodo as medio
  from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id join retail.pos_maquinas mq on mq.cuenta_id = vp.cuenta_dinero_id
 where v.estado = 'completada' and not coalesce(v.es_prueba, false)
   and v.created_at >= (${DESDE}::timestamp at time zone 'America/Lima') and v.created_at < ((${HASTA} + 1)::timestamp at time zone 'America/Lima')`;
const REFERENCIA = `select l.cuenta_id::text c, l.f::text f, l.ubicacion_id::text u, l.medio m, retail.fn_pos_comision_lote(l.cuenta_id, l.f, l.ubicacion_id, l.medio) debe from (${LOTES}) l`;
// La reversa: el depósito es de hoy, así que el rango llega lejos. La referencia repite el filtro de `rev_est` (ADR-0629: solo el primer
// depósito vigente de cada día revierte) y pide la comisión de cada abono a `fn_pos_comision_lote`, como antes de 20261109162000.
const HASTA_REV = "date '2099-12-31'";
const NUEVO_REV = `select split_part(asiento, ':', 2) mov, regexp_replace(asiento, '^comision_rev:[^:]+:', '') clave, debe
  from retail.fn_asientos_dinero_y_caja(${DESDE}, ${HASTA_REV}, true, null) where asiento like 'comision_rev:%' and cuenta = '4691'`;
const REFERENCIA_REV = `select d.id::text mov, a.clave, retail.fn_pos_comision_lote(a.cuenta_id, a.fecha, a.ubicacion_id, a.medio) debe
  from retail.pos_abonos_lotes a
  join retail.movimientos_dinero d on d.id = a.movimiento_dinero_id and d.estado = 'vigente'
 where d.fecha between ${DESDE} and ${HASTA_REV} and a.fecha >= coalesce(retail.fn_finanzas_desde(), a.fecha)
   and not exists (select 1 from retail.pos_abonos_lotes a2 join retail.movimientos_dinero d2 on d2.id = a2.movimiento_dinero_id and d2.estado = 'vigente'
                    where a2.cuenta_id = a.cuenta_id and a2.clave = a.clave and (d2.fecha, a2.created_at, a2.id) < (d.fecha, a.created_at, a.id))`;

verificar("igual a la referencia", correr(`${ESCENA}
select 'version_nueva|' || (position('20261109162000: TODAS las comisiones' in pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure)) > 0);
select 'solo_en_el_diario|' || count(*) from ((${NUEVO}) except all (select * from (${REFERENCIA}) r where r.debe > 0)) x;
select 'solo_en_la_referencia|' || count(*) from ((select * from (${REFERENCIA}) r where r.debe > 0) except all (${NUEVO})) x;
select 'lotes_con_comision|' || count(*) from (${NUEVO}) n;
select 'lote_sin_comision|' || count(*) from (${REFERENCIA}) r where r.debe = 0;
select 'tarjeta_del_20|' || coalesce((select sum(debe) from (${NUEVO}) n where n.f = '2026-10-20' and n.m = 'tarjeta'), 0);
select 'la_de_prueba_no_cuenta|' || (select count(*) from retail.venta_pagos where venta_id = :'v6' and cuenta_dinero_id is not null) || ',' || coalesce((select sum(debe) from (${NUEVO}) n where n.f = '2026-10-20' and n.m = 'tarjeta'), 0);
select 'cuadra|' || (sum(debe) = sum(haber)) from retail.fn_asientos_dinero_y_caja(${DESDE}, ${HASTA_REV}, true, null);
select 'reversa_solo_en_el_diario|' || count(*) from ((${NUEVO_REV}) except all (select * from (${REFERENCIA_REV}) r where r.debe > 0)) x;
select 'reversa_solo_en_la_referencia|' || count(*) from ((select * from (${REFERENCIA_REV}) r where r.debe > 0) except all (${NUEVO_REV})) x;
select 'reversa_del_20|' || coalesce((select sum(debe) from (${NUEVO_REV}) n where n.clave like '%2026-10-20%'), 0);
`), {
  version_nueva: "true",
  solo_en_el_diario: "0",
  solo_en_la_referencia: "0",
  // Vendemás el 20 y el 25 con tarjeta, como mínimo: si la escena no armó lotes, la igualdad de arriba no probaría nada.
  lotes_con_comision: (v) => Number(v) >= 2,
  // 100 → 2.30 + 0.41 = 2.71. 33.33 → 0.77 + 0.14 = 0.91. Juntos 3.62 (la venta de prueba de 70 no entra).
  tarjeta_del_20: "3.62",
  la_de_prueba_no_cuenta: (v) => v?.endsWith(",3.62") ?? false,
  cuadra: "true",
  reversa_solo_en_el_diario: "0",
  reversa_solo_en_la_referencia: "0",
  // El depósito cubre el día 20: lo estimado de ese día (3.62) sale el día del depósito.
  reversa_del_20: "3.62",
});

verificar("pegar dos veces", correr(`begin;
${MIGRACION}
create temp table antes as select md5(pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure)) h;
${MIGRACION}
select 'igual|' || (a.h = md5(pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure))) from antes a;
`), { igual: "true" });

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
process.exit(fallos ? 1 : 0);
