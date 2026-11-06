#!/usr/bin/env node
/**
 * Prueba de la tarea 14 de «Las 36 de Finanzas» (`20261106012000_comision_de_maquina_en_su_mes.sql`, ADR-0552).
 *
 * QUÉ CUBRE
 *   · LA COMISIÓN ENTRA EN SU MES: un lote pendiente lleva lo estimado, operación por operación, el día que se cobró (6392 | 4691).
 *   · SE AJUSTA AL DEPOSITAR: el día del depósito sale lo estimado y entra lo real; la 4691 vuelve a cero y el mes del lote no cambia.
 *   · «CUADRAR DEPÓSITOS»: con vista previa, solo lo vencido, solo con banco, idempotente, y frena si algo cambió desde la vista previa.
 *   · LO ESTIMADO SE CAMBIA POR LO REAL en una sola transacción, con los mismos días.
 *   · ANULAR devuelve el lote a pendiente. Solo el líder. Pegar dos veces no cambia nada.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK.
 *
 * USO
 *   pnpm pruebas:comision-estimada
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261106012000_comision_de_maquina_en_su_mes.sql"), "utf8");

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

// Dos cobros con tarjeta en Trujillo, en días que ya vencieron del mes pasado. 2,30 % + IGV por operación: 133.33 no da lo mismo que por día.
const ESCENA = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
${MIGRACION}
update retail.parametros_finanzas set inicio_finanzas = '2019-01-01';
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as ibk from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null \\gset
select id as puente from retail.cuentas_dinero where nombre = 'Por depositar Vendemás' and archivada_en is null \\gset
select id as maq from retail.pos_maquinas where nombre = 'Vendemás' and archivada_en is null \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = 'piso_venta');
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT96' when 'factura' then 'FT96' else serie end, siguiente_numero = 1 where ubicacion_id = :'tru' and tipo in ('boleta', 'factura');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'tru', retail.fn_sububicacion_por_defecto(:'tru', 'venta'), 'entrada', 50, 'colchón de prueba');
select count(*) as _st from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m where m.variante_id = :'v' and m.motivo = 'colchón de prueba' and m.created_at = now()) x \\gset
-- La base local compartida puede traer cobros de esta máquina: la escena empieza sin ninguno.
update retail.ventas set es_prueba = true where id in (select venta_id from retail.venta_pagos where cuenta_dinero_id = :'puente');
${venta("v1", [["tarjeta", 100]])}
${venta("v2", [["tarjeta", 33.33]])}
select (date_trunc('month', retail.fn_hoy_lima()) - interval '3 days')::date as lote \\gset
update retail.ventas set created_at = (:'lote'::date + time '12:00') at time zone 'America/Lima' where id in (:'v1', :'v2');
`;
const CUENTA = (c, desde, hasta) => `coalesce((select sum(debe - haber) from retail.fn_asientos(${desde}, ${hasta}, null) where cuenta = '${c}'), 0)`;
const LOTE = `:'lote'::date`;
const HOY = `retail.fn_hoy_lima()`;

// 100 → 2.30 + 0.41 = 2.71. 33.33 → 0.77 + 0.14 = 0.91. Juntos 3.62; por día saldrían 3.61.
verificar("en su mes", correr(`${ESCENA}
select 'tarifa_sembrada|' || t.tasa_pct || ',' || t.igv_sobre_tasa from retail.pos_tarifas t where t.maquina_id = :'maq' and t.medio = 'tarjeta';
select 'pendiente_6392|' || ${CUENTA("6392", LOTE, LOTE)};
select 'pendiente_4691|' || ${CUENTA("4691", LOTE, LOTE)};
select 'nada_real_aun|' || ${CUENTA("639", LOTE, HOY)};
select 'puente_intacta|' || ${CUENTA("105", LOTE, LOTE)};
select 'cuadra|' || (sum(debe) = sum(haber)) from retail.fn_asientos(${LOTE}, ${LOTE}, null);
`), {
  tarifa_sembrada: "2.30,true",
  pendiente_6392: "3.62",
  pendiente_4691: "-3.62",
  nada_real_aun: "0",
  puente_intacta: "133.33",
  cuadra: "true",
});

verificar("cuadrar", correr(`${ESCENA}
select 'sin_banco|' || falta from retail.fn_cuadrar_depositos_vista() where cuenta_id = :'puente';
${debeFallar("no_cuadra_sin_banco", `perform retail.cuadrar_deposito_maquina((select id from retail.cuentas_dinero where nombre = 'Por depositar Vendemás' and archivada_en is null), (select claves from retail.fn_cuadrar_depositos_vista() where maquina = 'Vendemás'), (select neto from retail.fn_cuadrar_depositos_vista() where maquina = 'Vendemás'))`, "P0001")}
select retail.guardar_banco_de_maquina(:'maq', :'ibk');
select 'vista|' || dias || ',' || bruto || ',' || comision || ',' || neto || ',' || coalesce(falta, '-') from retail.fn_cuadrar_depositos_vista() where cuenta_id = :'puente';
select claves as claves from retail.fn_cuadrar_depositos_vista() where cuenta_id = :'puente' \\gset
${debeFallar("frena_si_cambio", `perform retail.cuadrar_deposito_maquina((select id from retail.cuentas_dinero where nombre = 'Por depositar Vendemás' and archivada_en is null), (select claves from retail.fn_cuadrar_depositos_vista() where maquina = 'Vendemás'), 1)`, "P0001")}
select retail.cuadrar_deposito_maquina(:'puente', :'claves'::text[], 129.71, '00000000-0000-4000-8000-0000000000c1') as dep \\gset
select 'mismo_token|' || (retail.cuadrar_deposito_maquina(:'puente', :'claves'::text[], 129.71, '00000000-0000-4000-8000-0000000000c1') = :'dep');
select 'deposito|' || monto || ',' || comision || ',' || referencia from retail.movimientos_dinero where id = :'dep';
select 'marcado|' || count(*) from retail.fn_depositos_estimados() where movimiento_id = :'dep';
select 'ya_no_vence|' || count(*) from retail.fn_cuadrar_depositos_vista() where cuenta_id = :'puente';
-- El mes del lote no cambia; el del depósito lleva 3.62 de real menos 3.62 de reversa.
select 'mes_del_lote_igual|' || ${CUENTA("6392", LOTE, LOTE)};
select 'reversa_hoy|' || ${CUENTA("6392", HOY, HOY)};
select 'real_hoy|' || ${CUENTA("639", HOY, HOY)};
select 'gasto_del_mes_de_hoy|' || (${CUENTA("6392", HOY, HOY)} + ${CUENTA("639", HOY, HOY)});
select 'cuatro_seis_nueve_uno_en_cero|' || ${CUENTA("4691", LOTE, HOY)};
-- Llegó menos de lo estimado: se reemplaza, con los mismos días, y solo cambia lo real.
select retail.reemplazar_deposito_estimado(:'dep', 129.00, null, 'OP-77', '00000000-0000-4000-8000-0000000000c2') as real \\gset
select 'reemplazo_mismo|' || (retail.reemplazar_deposito_estimado(:'dep', 129.00, null, 'OP-77', '00000000-0000-4000-8000-0000000000c2') = :'real');
select 'viejo_anulado|' || estado from retail.movimientos_dinero where id = :'dep';
select 'nuevo|' || monto || ',' || comision || ',' || referencia from retail.movimientos_dinero where id = :'real';
select 'mismos_dias|' || count(*) from retail.pos_abonos_lotes where movimiento_dinero_id = :'real';
select 'ya_no_estimado|' || count(*) from retail.fn_depositos_estimados();
select 'diferencia_en_el_mes|' || (${CUENTA("6392", HOY, HOY)} + ${CUENTA("639", HOY, HOY)});
select 'sigue_en_cero|' || ${CUENTA("4691", LOTE, HOY)};
-- Anular lo real devuelve el lote a pendiente y la deuda estimada.
select retail.anular_movimiento_dinero(:'real', 'Prueba');
select 'anular_devuelve|' || ${CUENTA("4691", LOTE, HOY)};
select 'vuelve_a_vencer|' || count(*) from retail.fn_cuadrar_depositos_vista() where cuenta_id = :'puente';
${debeFallar("no_es_estimado", `perform retail.reemplazar_deposito_estimado('00000000-0000-4000-8000-0000000000c9', 10)`, "P0001")}
set local request.jwt.claim.sub = '${MICAELA}';
${debeFallar("vista_solo_lider", `perform * from retail.fn_cuadrar_depositos_vista()`, "42501")}
${debeFallar("estimados_solo_lider", `perform * from retail.fn_depositos_estimados()`, "42501")}
${debeFallar("cuadrar_solo_lider", `perform retail.cuadrar_deposito_maquina('00000000-0000-4000-8000-0000000000c9', '{}', 1)`, "42501")}
`), {
  sin_banco: "banco",
  no_cuadra_sin_banco: "ok",
  vista: "1,133.33,3.62,129.71,-",
  frena_si_cambio: "ok",
  mismo_token: "true",
  deposito: "129.71,3.62,Estimado con «Cuadrar depósitos»",
  marcado: "1",
  ya_no_vence: "0",
  mes_del_lote_igual: "3.62",
  reversa_hoy: "-3.62",
  real_hoy: "3.62",
  gasto_del_mes_de_hoy: "0.00",
  cuatro_seis_nueve_uno_en_cero: "0.00",
  reemplazo_mismo: "true",
  viejo_anulado: "anulado",
  nuevo: "129.00,4.33,OP-77",
  mismos_dias: "1",
  ya_no_estimado: "0",
  diferencia_en_el_mes: "0.71",
  sigue_en_cero: "0.00",
  anular_devuelve: "-3.62",
  vuelve_a_vencer: "1",
  no_es_estimado: "ok",
  vista_solo_lider: "ok",
  estimados_solo_lider: "ok",
  cuadrar_solo_lider: "ok",
});

verificar("el día de hoy no vence", correr(`${ESCENA}
select retail.guardar_banco_de_maquina(:'maq', :'ibk');
update retail.ventas set created_at = now() where id in (:'v1', :'v2');
select 'hoy_no|' || count(*) from retail.fn_cuadrar_depositos_vista() where cuenta_id = :'puente';
select 'pero_devenga|' || ${CUENTA("6392", HOY, HOY)};
`), { hoy_no: "0", pero_devenga: "3.62" });

verificar("pegar dos veces", correr(`begin;
${MIGRACION}
create temp table antes as select md5(pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure)) h, (select count(*) from retail.pos_tarifas) n, (select count(*) from retail.cuentas) c;
${MIGRACION}
select 'igual|' || (a.h = md5(pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure)) and a.n = (select count(*) from retail.pos_tarifas) and a.c = (select count(*) from retail.cuentas)) from antes a;
`), { igual: "true" });

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
process.exit(fallos ? 1 : 0);
