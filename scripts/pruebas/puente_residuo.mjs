#!/usr/bin/env node
/**
 * Prueba del ADR-0629, Fase A (`20261107214000_puente_por_residuo_y_qr_gratis.sql`).
 *
 * QUÉ CUBRE
 *   · EL RESIDUO: un día ya depositado que siguió vendiendo vuelve a «pendiente» con lo que falta (`ya_depositado` dice cuánto se
 *     cubrió); se deposita aparte, con su propia comisión real, y el día queda en cero. Antes desaparecía y quedaba en la puente.
 *   · EL DIARIO revierte la comisión estimada de un día UNA sola vez: la 4691 vuelve a cero aunque el día tenga dos depósitos.
 *   · «CUADRAR DEPÓSITOS» propone el residuo, dice cuánto es (`residuo`) y le pone la parte de la comisión del día que le toca.
 *   · Anular el primer depósito devuelve su parte; un residuo negativo (venta anulada después del depósito) no es «pendiente».
 *   · LA VENTANA GRATIS: el QR de Izipay no cobra del 1 al 10 de cada mes desde noviembre de 2026; la tarjeta sí; y lo de antes
 *     sigue con sus tarifas de siempre.
 *   · Solo el líder. Pegar dos veces no cambia nada.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK: nada queda escrito en la base.
 *
 * USO
 *   pnpm pruebas:puente-residuo                                  → contra el local compartido
 *   pnpm pruebas:puente-residuo -- --contenedor supabase_db_<pila> → contra una pila propia
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const a = process.argv.indexOf("--contenedor");
const CONTENEDOR = a > 0 ? process.argv[a + 1] : "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261107214000_puente_por_residuo_y_qr_gratis.sql"), "utf8");

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
    const ok = r.ok && lineas[caso] === valor;
    console.log(`${ok ? "✓" : "✗"} ${titulo}: ${caso}`);
    if (!ok) {
      fallos++;
      console.log(r.ok ? `    esperado ${valor}, salió ${lineas[caso]}` : `    ${r.mensaje.slice(0, 1200)}`);
    }
  }
}
const debeFallar = (nombre, sql, codigo) => `
do $$
begin
  ${sql};
  raise exception '${nombre}: tendría que haber fallado';
exception when others then
  if sqlstate <> '${codigo}' then raise; end if;
end $$;
select '${nombre}|ok';`;

const venta = (nombre, pagos) => `
update retail.variantes set precio = ${pagos.reduce((x, [, m]) => x + m, 0)} where id = :'v';
select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', ${pagos.reduce((x, [, m]) => x + m, 0)}, 'descuento_unitario', 0)),
  jsonb_build_array(${pagos.map(([m, monto]) => `jsonb_build_object('metodo', '${m}', 'monto', ${monto})`).join(", ")}),
  null, gen_random_uuid(), p_descuento_pct => 0) as ${nombre} \\gset
`;

// Trujillo cobra con Vendemás (tarjeta, 2,30 % + IGV por operación). Un cobro de 100 en un día que ya venció (el mes pasado).
const ESCENA = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
${MIGRACION}
reset lock_timeout;
update retail.parametros_finanzas set inicio_finanzas = '2019-01-01';
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as ibk from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null \\gset
select id as puente from retail.cuentas_dinero where nombre = 'Por depositar Vendemás' and archivada_en is null \\gset
select id as maq from retail.pos_maquinas where nombre = 'Vendemás' and archivada_en is null \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = 'piso_venta');
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT95' when 'factura' then 'FT95' else serie end, siguiente_numero = 1 where ubicacion_id = :'tru' and tipo in ('boleta', 'factura');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'tru', retail.fn_sububicacion_por_defecto(:'tru', 'venta'), 'entrada', 50, 'colchón de prueba');
select count(*) as _st from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m where m.variante_id = :'v' and m.motivo = 'colchón de prueba' and m.created_at = now()) x \\gset
-- La base local compartida puede traer cobros de estas máquinas: la escena empieza sin ninguno.
update retail.ventas set es_prueba = true where id in (select venta_id from retail.venta_pagos where cuenta_dinero_id in (select cuenta_id from retail.pos_maquinas));
${venta("v1", [["tarjeta", 100]])}
select (date_trunc('month', retail.fn_hoy_lima()) - interval '3 days')::date as lote \\gset
update retail.ventas set created_at = (:'lote'::date + time '12:00') at time zone 'America/Lima' where id = :'v1';
select 'cobros:' || :'lote' || ':' || :'tru' || ':tarjeta' as clave \\gset
`;
const CUENTA = (c, desde, hasta) => `coalesce((select sum(debe - haber) from retail.fn_asientos(${desde}, ${hasta}, null) where cuenta = '${c}'), 0)`;
const LOTE = `:'lote'::date`;
const HOY = `retail.fn_hoy_lima()`;
// El primer depósito, del día siguiente al lote, cubre el día cuando solo tenía el cobro de 100: llegan 97.29 (100 − 2.30 − 0.41).
const DIA_DEP1 = `(:'lote'::date + 1)`;
const PRIMER_DEPOSITO = `
select (retail.registrar_abono_pos(:'puente', :'ibk', ${DIA_DEP1}, 97.29, array[:'clave'], 'primero', '00000000-0000-4000-8000-0000000000d1') ->> 'movimiento_id') as dep1 \\gset
-- Después del depósito la tienda cobró otros 33.33 ese mismo día.
${venta("v2", [["tarjeta", 33.33]])}
update retail.ventas set created_at = (:'lote'::date + time '19:00') at time zone 'America/Lima' where id = :'v2';
`;

verificar("el residuo vuelve", correr(`${ESCENA}
select 'antes_sin_deposito|' || bruto || ',' || ya_depositado from retail.fn_pos_pendientes(:'puente') where clave = :'clave';
${PRIMER_DEPOSITO}
select 'residuo|' || bruto || ',' || ya_depositado from retail.fn_pos_pendientes(:'puente') where clave = :'clave';
-- Contra la plata que de verdad salió de la puente (el movimiento de dinero, no el rastro de días): lo cobrado ese día menos lo depositado.
select 'es_lo_que_queda_en_la_puente|' || ((select bruto from retail.fn_pos_pendientes(:'puente') where clave = :'clave')
  = ((select sum(monto) from retail.fn_dinero_libro(${HOY}) where clave = :'clave' and cuenta_id = :'puente')
     - (select sum(d.monto + d.comision) from retail.movimientos_dinero d where d.cuenta_origen_id = :'puente' and d.estado = 'vigente' and d.created_at = now())));
-- El residuo se deposita aparte: 33.33 − 0.77 − 0.14 = 32.42, con su comisión real.
select (retail.registrar_abono_pos(:'puente', :'ibk', ${HOY}, 32.42, array[:'clave'], 'residuo', '00000000-0000-4000-8000-0000000000d2') ->> 'movimiento_id') as dep2 \\gset
select 'deposito_residuo|' || monto || ',' || comision from retail.movimientos_dinero where id = :'dep2';
select 'dos_depositos_del_dia|' || count(*) from retail.pos_abonos_lotes a join retail.movimientos_dinero d on d.id = a.movimiento_dinero_id and d.estado = 'vigente' where a.clave = :'clave';
select 'ya_no_pendiente|' || count(*) from retail.fn_pos_pendientes(:'puente') where clave = :'clave';
${debeFallar("no_deposita_dos_veces", `perform retail.registrar_abono_pos((select id from retail.cuentas_dinero where nombre = 'Por depositar Vendemás' and archivada_en is null), (select id from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null), retail.fn_hoy_lima(), 1, array['${"cobros:"}' || ((date_trunc('month', retail.fn_hoy_lima()) - interval '3 days')::date)::text || ':' || (select id from retail.ubicaciones where nombre = 'Tienda Trujillo')::text || ':tarjeta'], null, null)`, "P0001")}
-- El diario: lo estimado del día (3.62 por operación) entra el día del lote y se revierte UNA vez, con el PRIMER depósito (el del día
-- siguiente), no con el del residuo (hoy); lo real son 2.71 + 0.91.
select 'estimado_del_dia|' || ${CUENTA("6392", LOTE, LOTE)};
select 'reversa_con_el_primero|' || ${CUENTA("6392", DIA_DEP1, DIA_DEP1)};
select 'nada_revierte_el_residuo|' || ${CUENTA("6392", HOY, HOY)};
select 'real|' || ${CUENTA("639", LOTE, HOY)};
select 'cuatro_seis_nueve_uno_en_cero|' || ${CUENTA("4691", LOTE, HOY)};
select 'cuadra|' || (sum(debe) = sum(haber)) from retail.fn_asientos(${LOTE}, ${HOY}, null);
-- Anular el primero devuelve su parte (100) y deja al residuo como el que revierte lo estimado.
select retail.anular_movimiento_dinero(:'dep1', 'Prueba');
select 'anular_devuelve|' || bruto || ',' || ya_depositado from retail.fn_pos_pendientes(:'puente') where clave = :'clave';
select 'sigue_en_cero_tras_anular|' || ${CUENTA("4691", LOTE, HOY)} || ',' || ${CUENTA("6392", HOY, HOY)};
`), {
  antes_sin_deposito: "100.00,0",
  residuo: "33.33,100.00",
  es_lo_que_queda_en_la_puente: "true",
  deposito_residuo: "32.42,0.91",
  dos_depositos_del_dia: "2",
  ya_no_pendiente: "0",
  no_deposita_dos_veces: "ok",
  estimado_del_dia: "3.62",
  reversa_con_el_primero: "-3.62",
  nada_revierte_el_residuo: "0",
  real: "3.62",
  cuatro_seis_nueve_uno_en_cero: "0.00",
  cuadra: "true",
  anular_devuelve: "100.00,33.33",
  // El residuo pasa a ser el primero y revierte lo estimado del día, una sola vez (ADR-0629: lo que quedó pendiente ya no lleva estimado).
  sigue_en_cero_tras_anular: "0.00,-3.62",
});

verificar("cuadrar depósitos con el residuo", correr(`${ESCENA}
select retail.guardar_banco_de_maquina(:'maq', :'ibk');
${PRIMER_DEPOSITO}
-- Otro día vencido, sin ningún depósito: 50 el día anterior al lote (1.15 + 0.21 de comisión).
${venta("v3", [["tarjeta", 50]])}
update retail.ventas set created_at = (:'lote'::date - 1 + time '12:00') at time zone 'America/Lima' where id = :'v3';
-- El residuo lleva 3.62 del día × 33.33 / 133.33 = 0.90; el otro día, su 1.36. «residuo» cuenta solo lo cobrado después de un depósito.
select 'vista|' || dias || ',' || bruto || ',' || comision || ',' || neto || ',' || residuo || ',' || coalesce(falta, '-') from retail.fn_cuadrar_depositos_vista() where cuenta_id = :'puente';
select claves as claves, neto as neto from retail.fn_cuadrar_depositos_vista() where cuenta_id = :'puente' \\gset
select retail.cuadrar_deposito_maquina(:'puente', :'claves'::text[], :'neto'::numeric, '00000000-0000-4000-8000-0000000000d3') as dep \\gset
select 'cuadrado|' || monto || ',' || comision from retail.movimientos_dinero where id = :'dep';
select 'nada_vencido|' || count(*) from retail.fn_cuadrar_depositos_vista() where cuenta_id = :'puente';
`), {
  vista: "2,83.33,2.26,81.07,33.33,-",
  cuadrado: "81.07,2.26",
  nada_vencido: "0",
});

// El candado: un abono de máquina SIN días en o después de un día con residuo se contaría dos veces, así que la migración no se pega.
// Uno de antes de ese día no estorba (no puede cubrir lo cobrado después).
const ABONO_A_MANO = (fecha) => `
select retail.registrar_movimiento_dinero(p_tipo => 'abono_tarjeta', p_monto => 20, p_cuenta_origen_id => :'puente', p_cuenta_destino_id => :'ibk',
  p_fecha => ${fecha}, p_referencia => 'cuadrado a mano', p_comision => 0) as a_mano \\gset
`;
{
  const antes = correr(`${ESCENA}
${PRIMER_DEPOSITO}
${ABONO_A_MANO(`(:'lote'::date - 1)`)}
${MIGRACION}
select 'pega|ok';`);
  const despues = correr(`${ESCENA}
${PRIMER_DEPOSITO}
${ABONO_A_MANO(DIA_DEP1)}
${MIGRACION}
select 'pega|ok';`);
  for (const [caso, ok] of [
    ["un abono sin días de antes del residuo no frena el pegado", antes.ok && antes.salida.includes("pega|ok")],
    ["un abono sin días en el día del residuo o después frena el pegado y dice cuál", !despues.ok && /sin días que se contarían dos veces/.test(despues.mensaje) && /S\/ 20/.test(despues.mensaje)],
  ]) {
    casos++;
    console.log(`${ok ? "✓" : "✗"} candado: ${caso}`);
    if (!ok) {
      fallos++;
      console.log(`    ${(antes.ok ? "" : antes.mensaje.slice(0, 600))} ${(despues.ok ? despues.salida.slice(-300) : despues.mensaje.slice(0, 600))}`);
    }
  }
}

verificar("un residuo negativo no es pendiente", correr(`${ESCENA}
${PRIMER_DEPOSITO}
select (retail.registrar_abono_pos(:'puente', :'ibk', ${HOY}, 32.42, array[:'clave'], 'residuo', null) ->> 'movimiento_id') as dep2 \\gset
-- La venta de la tarde se anula después de depositar: el día cobró menos de lo que se depositó.
-- (en la escena basta con sacarla de las ventas que cuentan: el libro deja fuera las de prueba)
update retail.ventas set es_prueba = true where id = :'v2';
select 'no_pendiente|' || count(*) from retail.fn_pos_pendientes(:'puente') where clave = :'clave';
`), { no_pendiente: "0" });

// La ventana gratis: las tarifas del QR de Izipay. Las fechas son fijas: la fila nueva rige desde el 1-nov-2026.
verificar("QR gratis los primeros días", correr(`${ESCENA}
select id as izi from retail.pos_maquinas where nombre ilike 'izipay%' and archivada_en is null \\gset
select id as puente_izi from retail.cuentas_dinero where nombre = 'Por depositar Izipay' and archivada_en is null \\gset
select 'tarifa|' || tasa_pct || ',' || igv_sobre_tasa || ',' || gratis_hasta_dia from retail.pos_tarifas where maquina_id = :'izi' and medio = 'qr' and vigente_desde = date '2026-11-01';
select 'qr_dia_5|' || retail.fn_pos_comision_estimada(:'izi', 'qr', 100, 1, date '2026-11-05');
select 'qr_dia_10|' || retail.fn_pos_comision_estimada(:'izi', 'qr', 100, 1, date '2026-11-10');
select 'qr_dia_11|' || retail.fn_pos_comision_estimada(:'izi', 'qr', 100, 1, date '2026-11-11');
select 'qr_diciembre_3|' || retail.fn_pos_comision_estimada(:'izi', 'qr', 100, 1, date '2026-12-03');
select 'tarjeta_dia_5|' || retail.fn_pos_comision_estimada(:'izi', 'tarjeta', 100, 1, date '2026-11-05');
select 'octubre_igual|' || retail.fn_pos_comision_estimada(:'izi', 'qr', 100, 1, date '2026-10-05') || ',' || retail.fn_pos_comision_estimada(:'izi', 'qr', 100, 1, date '2026-10-15');
${venta("q1", [["qr", 100]])}
${venta("q2", [["qr", 100]])}
update retail.ventas set created_at = (date '2026-11-05' + time '12:00') at time zone 'America/Lima' where id = :'q1';
update retail.ventas set created_at = (date '2026-11-12' + time '12:00') at time zone 'America/Lima' where id = :'q2';
select 'lote_dia_5|' || retail.fn_pos_comision_lote(:'puente_izi', date '2026-11-05', :'tru', 'qr');
select 'lote_dia_12|' || retail.fn_pos_comision_lote(:'puente_izi', date '2026-11-12', :'tru', 'qr');
-- Cambiar la tarifa desde Configuración (otros días de abono) abre una fila nueva desde hoy que HEREDA la ventana gratis.
select retail.guardar_pos_tarifa(:'izi', 'qr', 2.38, true, 0, 1) as nueva_tarifa \\gset
select 'hereda_la_ventana|' || t.dias_abono || ',' || t.gratis_hasta_dia from retail.pos_tarifas t where t.id = :'nueva_tarifa';
select 'diciembre_sigue_gratis|' || retail.fn_pos_comision_estimada(:'izi', 'qr', 100, 1, date '2026-12-03');
`), {
  tarifa: "2.38,true,10",
  qr_dia_5: "0",
  qr_dia_10: "0",
  qr_dia_11: "2.81",
  qr_diciembre_3: "0",
  tarjeta_dia_5: "2.81",
  octubre_igual: "0.00,2.81",
  lote_dia_5: "0",
  lote_dia_12: "2.81",
  hereda_la_ventana: "1,10",
  diciembre_sigue_gratis: "0",
});

verificar("solo el líder", correr(`${ESCENA}
set local request.jwt.claim.sub = '${MICAELA}';
${debeFallar("pendientes_solo_lider", `perform * from retail.fn_pos_pendientes((select id from retail.cuentas_dinero where nombre = 'Por depositar Vendemás' and archivada_en is null))`, "42501")}
${debeFallar("vista_solo_lider", `perform * from retail.fn_cuadrar_depositos_vista()`, "42501")}
`), { pendientes_solo_lider: "ok", vista_solo_lider: "ok" });

verificar("pegar dos veces", correr(`begin;
${MIGRACION}
create temp table antes as select
  md5(pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure)) a,
  md5(pg_get_functiondef('retail.fn_pos_pendientes(uuid)'::regprocedure)) p,
  (select count(*) from retail.pos_tarifas) n;
${MIGRACION}
select 'igual|' || (x.a = md5(pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure))
  and x.p = md5(pg_get_functiondef('retail.fn_pos_pendientes(uuid)'::regprocedure))
  and x.n = (select count(*) from retail.pos_tarifas)) from antes x;
select 'una_sola_reversa|' || (length(pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure))
  - length(replace(pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure), 'ADR-0629', ''))) / length('ADR-0629');
`), { igual: "true", una_sola_reversa: "1" });

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
if (fallos > 0) process.exit(1);
