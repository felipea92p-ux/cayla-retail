#!/usr/bin/env node
/**
 * Prueba del ADR-0629, Fase B, actividad 4 (`20261108023000_depositos_de_maquina_pago_por_pago.sql`).
 *
 * QUÉ CUBRE
 *   · PAGO POR PAGO: de tres QR de un día llegan dos; se registra el depósito de esos dos (bruto parcial del día), queda pendiente
 *     exactamente el tercero, y la lista dice cuáles están depositados.
 *   · LA COMISIÓN DE UN PAGO es la de la máquina: 0 en los días gratis y, el resto, comisión e IGV redondeados por separado (100 → 2.81).
 *   · FRENOS QUE DEBEN BLOQUEAR: el mismo pago en dos depósitos, un pago dos veces en la lista, un día que ya tiene un depósito sin
 *     detalle, un pago de otra máquina, llegar más de lo cobrado, quien no es líder.
 *   · Doble clic (mismo token) devuelve el mismo depósito; anular el depósito libera sus pagos.
 *   · El diario cuadra y la puente baja por lo cobrado.
 *
 * CONTROL (`--mutante`): la misma prueba con la migración SIN el freno «ya está en otro depósito». El caso que lo prueba TIENE que caer:
 * si no cae, la prueba no estaba probando nada.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK: nada queda escrito en la base.
 *
 * USO
 *   pnpm pruebas:pos-pagos                                    → contra el local compartido
 *   pnpm pruebas:pos-pagos -- --contenedor supabase_db_<pila>  → contra una pila propia
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const a = process.argv.indexOf("--contenedor");
const CONTENEDOR = a > 0 ? process.argv[a + 1] : "supabase_db_cayla-retail";
const MUTANTE = process.argv.includes("--mutante");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORIGINAL = readFileSync(join(RAIZ, "supabase", "migrations", "20261108023000_depositos_de_maquina_pago_por_pago.sql"), "utf8");
const FRENO = "  if exists (select 1 from pg_temp.pagos_del_abono where depositado) then";
if (!ORIGINAL.includes(FRENO)) throw new Error("La prueba no encuentra el freno que muta: actualiza FRENO.");
const MIGRACION = MUTANTE ? ORIGINAL.replace(FRENO, "  if false then") : ORIGINAL;

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
// Un freno: lo de adentro TIENE que fallar con ese código. Si pasa, la línea no se imprime y el caso falla. El aviso «tendría que
// haber fallado» lleva su propio código (XX999): con el mismo P0001 de los frenos, el bloque se tragaba su propio aviso y todo freno
// «pasaba» aunque no frenara (lo destapó el control con `--mutante`).
const debeFallar = (nombre, sql, codigo) => `
do $$
begin
  ${sql};
  raise exception '${nombre}: tendría que haber fallado' using errcode = 'XX999';
exception when others then
  if sqlstate <> '${codigo}' then raise; end if;
end $$;
select '${nombre}|ok';`;

const venta = (nombre, metodo, monto, dia, hora) => `
update retail.variantes set precio = ${monto} where id = :'v';
select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', ${monto}, 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', '${metodo}', 'monto', ${monto})),
  null, gen_random_uuid(), p_descuento_pct => 0) as ${nombre} \\gset
update retail.ventas set created_at = (date '${dia}' + time '${hora}') at time zone 'America/Lima' where id = :'${nombre}';
select id as ${nombre}_pago from retail.venta_pagos where venta_id = :'${nombre}' \\gset
`;
const pago = (n) => `jsonb_build_object('origen', 'venta_pago', 'origen_id', :'${n}_pago')`;
const pagos = (...ns) => `jsonb_build_array(${ns.map(pago).join(", ")})`;

// Trujillo cobra el QR con Izipay. El 5-nov es gratis (la ventana del 1 al 10); el 12-nov cobra 2,38 % + IGV.
const ESCENA = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
${MIGRACION}
reset lock_timeout;
update retail.parametros_finanzas set inicio_finanzas = '2019-01-01';
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as ibk from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null \\gset
select id as izi from retail.cuentas_dinero where nombre = 'Por depositar Izipay' and archivada_en is null \\gset
select id as ven from retail.cuentas_dinero where nombre = 'Por depositar Vendemás' and archivada_en is null \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = 'piso_venta');
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT96' when 'factura' then 'FT96' else serie end, siguiente_numero = 1 where ubicacion_id = :'tru' and tipo in ('boleta', 'factura');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'tru', retail.fn_sububicacion_por_defecto(:'tru', 'venta'), 'entrada', 50, 'colchón de prueba');
select count(*) as _st from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m where m.variante_id = :'v' and m.motivo = 'colchón de prueba' and m.created_at = now()) x \\gset
-- La base local puede traer cobros de estas máquinas: la escena empieza sin ninguno.
update retail.ventas set es_prueba = true where id in (select venta_id from retail.venta_pagos where cuenta_dinero_id in (select cuenta_id from retail.pos_maquinas));
${venta("q1", "qr", 45.90, "2026-11-05", "10:15")}
${venta("q2", "qr", 89.90, "2026-11-05", "11:40")}
${venta("q3", "qr", 139.80, "2026-11-05", "18:55")}
${venta("t1", "tarjeta", 250.00, "2026-11-05", "16:00")}
${venta("p1", "qr", 100.00, "2026-11-12", "12:00")}
select 'cobros:2026-11-05:' || :'tru' || ':qr' as clave \\gset
`;
const DESDE = "date '2026-11-01'";
const HASTA = "date '2026-11-30'";
const LISTA = `retail.fn_pos_pagos_por_depositar(:'izi', ${DESDE}, ${HASTA})`;
const PENDIENTE = `(select bruto from retail.fn_pos_pendientes(:'izi') where clave = :'clave')`;
// Llegan dos de los tres QR del 5-nov (gratis: llega lo cobrado).
const DEPOSITO_DE_DOS = `select (retail.registrar_abono_pos_pagos(:'izi', :'ibk', date '2026-11-05', 135.80, ${pagos("q1", "q2")}, 'dos de tres', '00000000-0000-4000-8000-0000000000e1') ->> 'movimiento_id') as dep \\gset`;

verificar("pago por pago", correr(`${ESCENA}
select 'lista|' || string_agg(medio || ':' || monto || ':' || neto_esperado || ':' || neto_tarjeta || ':' || depositado, ',' order by hora) from ${LISTA} where fecha = date '2026-11-05';
select 'comision_dia_pagado|' || neto_esperado from ${LISTA} where origen_id = :'p1_pago';
select 'antes|' || ${PENDIENTE};
${DEPOSITO_DE_DOS}
select 'deposito|' || monto || ',' || comision from retail.movimientos_dinero where id = :'dep';
select 'lote_parcial|' || bruto from retail.pos_abonos_lotes where movimiento_dinero_id = :'dep';
select 'queda_el_tercero|' || ${PENDIENTE};
select 'depositados|' || string_agg(monto::text, ',' order by monto) from ${LISTA} where depositado;
select 'sin_detalle|' || bool_or(dia_sin_detalle) from ${LISTA};
-- El tercero llega después: se deposita aparte y el día queda en cero.
select (retail.registrar_abono_pos_pagos(:'izi', :'ibk', date '2026-11-06', 139.80, ${pagos("q3")}, 'el tercero', null) ->> 'movimiento_id') as dep3 \\gset
select 'dia_en_cero|' || count(*) from retail.fn_pos_pendientes(:'izi') where clave = :'clave';
select 'cuadra|' || (sum(debe) = sum(haber)) from retail.fn_asientos(date '2026-11-01', retail.fn_hoy_lima(), null);
`), {
  lista: "qr:45.90:45.90:44.61:false,qr:89.90:89.90:87.37:false,qr:139.80:139.80:135.87:false",
  comision_dia_pagado: "97.19",
  antes: "275.60",
  deposito: "135.80,0.00",
  lote_parcial: "135.80",
  queda_el_tercero: "139.80",
  depositados: "45.90,89.90",
  sin_detalle: "false",
  dia_en_cero: "0",
  cuadra: "true",
});

verificar("el mismo pago no entra a dos depósitos", correr(`${ESCENA}
${DEPOSITO_DE_DOS}
-- El mismo pago no entra a otro depósito (el freno que muta el control).
${debeFallar("no_dos_depositos", `perform retail.registrar_abono_pos_pagos((select id from retail.cuentas_dinero where nombre = 'Por depositar Izipay' and archivada_en is null), (select id from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null), date '2026-11-05', 45.90, jsonb_build_array(jsonb_build_object('origen', 'venta_pago', 'origen_id', (select vp.id from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id where vp.monto = 45.90 and not v.es_prueba and v.created_at::date between '2026-11-04' and '2026-11-06' limit 1))), null, null)`, "P0001")}
-- Solo lo que escribió esta escena (la base local puede traer depósitos de otras pruebas): now() es el mismo en toda la transacción.
select 'nada_mas_se_escribio|' || count(*) from retail.pos_abonos_pagos where created_at = now();
`), { no_dos_depositos: "ok", nada_mas_se_escribio: "2" });

verificar("frenos", correr(`${ESCENA}
${debeFallar("no_repetido_en_la_lista", `perform retail.registrar_abono_pos_pagos((select id from retail.cuentas_dinero where nombre = 'Por depositar Izipay' and archivada_en is null), (select id from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null), date '2026-11-05', 279.60, jsonb_build_array(jsonb_build_object('origen', 'venta_pago', 'origen_id', (select vp.id from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id where vp.monto = 139.80 and not v.es_prueba limit 1)), jsonb_build_object('origen', 'venta_pago', 'origen_id', (select vp.id from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id where vp.monto = 139.80 and not v.es_prueba limit 1))), null, null)`, "P0001")}
-- La tarjeta de Trujillo es de Vendemás: no se deposita como Izipay.
${debeFallar("no_otra_maquina", `perform retail.registrar_abono_pos_pagos((select id from retail.cuentas_dinero where nombre = 'Por depositar Izipay' and archivada_en is null), (select id from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null), date '2026-11-05', 240, jsonb_build_array(jsonb_build_object('origen', 'venta_pago', 'origen_id', (select vp.id from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id where vp.metodo = 'tarjeta' and vp.monto = 250 and not v.es_prueba limit 1))), null, null)`, "P0001")}
${debeFallar("no_mas_de_lo_cobrado", `perform retail.registrar_abono_pos_pagos((select id from retail.cuentas_dinero where nombre = 'Por depositar Izipay' and archivada_en is null), (select id from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null), date '2026-11-12', 100.01, jsonb_build_array(jsonb_build_object('origen', 'venta_pago', 'origen_id', (select vp.id from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id where vp.monto = 100 and not v.es_prueba limit 1))), null, null)`, "P0001")}
select 'nada_se_escribio|' || count(*) from retail.pos_abonos_pagos where created_at = now();
`), { no_repetido_en_la_lista: "ok", no_otra_maquina: "ok", no_mas_de_lo_cobrado: "ok", nada_se_escribio: "0" });

verificar("un día con un depósito sin detalle", correr(`${ESCENA}
-- Un depósito de antes (por día, sin decir qué pagos): ese día ya no entra al pago por pago.
select retail.registrar_abono_pos(:'izi', :'ibk', date '2026-11-05', 100, array[:'clave'], 'por día', null);
select 'marcado|' || bool_and(dia_sin_detalle) from ${LISTA} where fecha = date '2026-11-05';
${debeFallar("no_dia_sin_detalle", `perform retail.registrar_abono_pos_pagos((select id from retail.cuentas_dinero where nombre = 'Por depositar Izipay' and archivada_en is null), (select id from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null), date '2026-11-05', 45.90, jsonb_build_array(jsonb_build_object('origen', 'venta_pago', 'origen_id', (select vp.id from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id where vp.monto = 45.90 and not v.es_prueba limit 1))), null, null)`, "P0001")}
select 'otro_dia_si|' || bool_or(dia_sin_detalle) from ${LISTA} where fecha = date '2026-11-12';
`), { marcado: "true", no_dia_sin_detalle: "ok", otro_dia_si: "false" });

verificar("doble clic y anular", correr(`${ESCENA}
${DEPOSITO_DE_DOS}
select (retail.registrar_abono_pos_pagos(:'izi', :'ibk', date '2026-11-05', 135.80, ${pagos("q1", "q2")}, 'dos de tres', '00000000-0000-4000-8000-0000000000e1') ->> 'movimiento_id') as otra_vez \\gset
select 'mismo_deposito|' || (:'dep' = :'otra_vez');
select 'uno_solo|' || count(*) from retail.movimientos_dinero where cuenta_origen_id = :'izi' and estado = 'vigente' and created_at = now();
select retail.anular_movimiento_dinero(:'dep', 'Prueba');
select 'libera|' || count(*) filter (where depositado) || ',' || ${PENDIENTE} from ${LISTA};
-- Ya libres, los dos pagos se pueden volver a depositar.
select 'se_vuelve_a_depositar|' || ((retail.registrar_abono_pos_pagos(:'izi', :'ibk', date '2026-11-06', 135.80, ${pagos("q1", "q2")}, 'otra vez', null)) ->> 'pagos');
`), { mismo_deposito: "true", uno_solo: "1", libera: "0,275.60", se_vuelve_a_depositar: "2" });

verificar("solo el líder", correr(`${ESCENA}
set local request.jwt.claim.sub = '${MICAELA}';
${debeFallar("lista_solo_lider", `perform * from retail.fn_pos_pagos_por_depositar((select id from retail.cuentas_dinero where nombre = 'Por depositar Izipay' and archivada_en is null), date '2026-11-01', date '2026-11-30')`, "42501")}
${debeFallar("registrar_solo_lider", `perform retail.registrar_abono_pos_pagos((select id from retail.cuentas_dinero where nombre = 'Por depositar Izipay' and archivada_en is null), (select id from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null), date '2026-11-05', 1, '[]'::jsonb, null, null)`, "42501")}
`), { lista_solo_lider: "ok", registrar_solo_lider: "ok" });

console.log(`\n${casos - fallos} de ${casos} casos${MUTANTE ? " (CONTROL: con el freno quitado, «no_dos_depositos» TIENE que caer)" : ""}.`);
if (MUTANTE) {
  process.exit(fallos > 0 ? 0 : 1);
}
process.exit(fallos > 0 ? 1 : 0);
