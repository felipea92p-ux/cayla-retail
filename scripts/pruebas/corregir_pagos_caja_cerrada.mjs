#!/usr/bin/env node
/**
 * Prueba de «corregir un pago con la caja cerrada, sin tocar el efectivo» (`20261107223000_…`, ADR-0630).
 *
 * EL PROBLEMA QUE PRUEBA. Un cobro anotado con el medio o la máquina equivocados (el cliente paga «con Yape» el QR de Izipay; una
 * tarjeta pasa por Izipay y se anota en Vendemás) se descubre al cuadrar, con la caja ya cerrada. Desde ahora un líder lo corrige si el
 * efectivo queda igual céntimo por céntimo, y puede elegir la máquina. Los frenos se prueban con casos que DEBEN bloquear: cambiar el
 * efectivo, alguien que no es líder, el efectivo con cuenta, una máquina que no cobra en esa tienda y un mes cerrado.
 *
 * EL CONTROL. `--sin-migracion` corre lo mismo sobre la función de antes: los casos nuevos (Yape → QR y cambiar de máquina con la
 * caja cerrada) tienen que caer; si pasan, la prueba no mide nada.
 *
 * CÓMO. Cada caso es una transacción con ROLLBACK contra el Postgres local: nada queda escrito. La migración se aplica dentro de la
 * transacción (así prueba el archivo, no lo que la base ya tenga).
 *
 * QUÉ DA POR SENTADO. `Tienda Trujillo` con las máquinas de ADR-0429 (Izipay cobra QR y tarjeta, Vendemás tarjeta; la tarjeta va a
 * Vendemás por defecto) y la variante `BLU-EMMA-NEG-M` del seed; Felipe (líder) y Micaela (colaboradora fija en Trujillo).
 *
 * USO: pnpm pruebas:corregir-pagos-caja-cerrada [-- --sin-migracion]   (CONTENEDOR=<nombre> para otra pila; por defecto la local)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR = process.env.CONTENEDOR || "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const MIGRACION = SIN_MIGRACION ? "" : readFileSync(join(RAIZ, "supabase/migrations/20261107223000_corregir_pagos_caja_cerrada_sin_efectivo.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo
const ARGS = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

// Caja propia en Trujillo, una venta cobrada con `pagos`, y la caja CERRADA (salvo `cerrar: false`). Deja :venta, :caja, :ubic,
// :izipay y :vendemas. Al final, la sesión es `quien`.
function preparar(pagos, { quien = FELIPE, cerrar = true } = {}) {
  return `
begin;
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select m.cuenta_id as izipay from retail.pos_maquinas m where m.nombre = 'Izipay' \\gset
select m.cuenta_id as vendemas from retail.pos_maquinas m where m.nombre = 'Vendemás' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100, 'prueba automatizada') as caja \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT96' when 'factura' then 'FT96' when 'nota_credito' then 'BC96' else serie end, siguiente_numero = 1
 where ubicacion_id = :'ubic' and tipo in ('boleta', 'factura', 'nota_credito');
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
update retail.variantes set precio = 100 where id = :'v';
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'piso', 'entrada', 5, 'colchón de prueba') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1 \\gset
select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', 100, 'descuento_unitario', 0)),
  '${JSON.stringify(pagos)}'::jsonb, null, gen_random_uuid(), null) as venta \\gset
${cerrar ? "select retail.cerrar_caja(:'caja', 100) as _cc \\gset" : ""}
set local request.jwt.claim.sub = '${quien}';
`;
}

const corregir = (pagos) => `select retail.corregir_pagos_venta(:'venta', '${JSON.stringify(pagos)}'::jsonb, 'prueba') as _co \\gset\n`;
const conCuenta = (pagos) =>
  `select retail.corregir_pagos_venta(:'venta', ${pagos}, 'prueba') as _co \\gset\n`;
const pagos = `select 'pagos|' || string_agg(p.metodo || ':' || p.monto || ':' || coalesce((select c.nombre from retail.cuentas_dinero c where c.id = p.cuenta_dinero_id), '-'), ',' order by p.metodo)
  from retail.venta_pagos p where p.venta_id = :'venta';
select 'fotos|' || count(*) from retail.venta_pagos_correcciones where venta_id = :'venta';`;

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 6).join("\n    ")}`);
  }
}
const rechazaCon = (r, hint) => !r.ok && new RegExp(hint).test(r.error);

if (SIN_MIGRACION) {
  // EL CONTROL: con la función de antes, los dos casos nuevos caen.
  const r1 = correr(`${preparar([{ metodo: "yape", monto: 100 }])}${corregir([{ metodo: "qr", monto: 100 }])}`);
  esperar("CONTROL: sin la migración, Yape → QR con la caja cerrada se rechaza (caja_cerrada)", rechazaCon(r1, "caja_cerrada"), r1.ok ? "pasó" : r1.error);
  const r2 = correr(`${preparar([{ metodo: "tarjeta", monto: 100 }], { cerrar: false })}${conCuenta(`jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 100, 'cuenta_dinero_id', :'izipay'))`)}${pagos}`);
  esperar(
    "CONTROL: sin la migración, pasar la tarjeta de Vendemás a Izipay (caja abierta) no cambia de máquina",
    !r2.ok || !/tarjeta:100\.00:Por depositar Izipay/.test(r2.salida),
    r2.salida || r2.error,
  );
} else {
  {
    const r = correr(`${preparar([{ metodo: "yape", monto: 100 }])}${corregir([{ metodo: "qr", monto: 100 }])}${pagos}`);
    esperar(
      "caja cerrada: el líder pasa un Yape a QR y el cobro queda en la puente de Izipay, con su foto",
      r.ok && /pagos\|qr:100\.00:Por depositar Izipay/.test(r.salida) && /fotos\|1/.test(r.salida),
      r.salida || r.error,
    );
  }
  {
    const r = correr(`${preparar([{ metodo: "tarjeta", monto: 100 }])}${pagos}
${conCuenta(`jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 100, 'cuenta_dinero_id', :'izipay'))`)}${pagos}`);
    esperar(
      "caja cerrada: una tarjeta anotada en Vendemás pasa a la máquina de Izipay",
      r.ok && /pagos\|tarjeta:100\.00:Por depositar Vendemás/.test(r.salida) && /pagos\|tarjeta:100\.00:Por depositar Izipay/.test(r.salida),
      r.salida || r.error,
    );
  }
  {
    const r = correr(`${preparar([{ metodo: "efectivo", monto: 40 }, { metodo: "yape", monto: 60 }])}${corregir([{ metodo: "efectivo", monto: 40 }, { metodo: "qr", monto: 60 }])}${pagos}`);
    esperar("caja cerrada: con el efectivo igual (40), el Yape de 60 pasa a QR", r.ok && /efectivo:40\.00/.test(r.salida) && /qr:60\.00/.test(r.salida), r.salida || r.error);
  }
  // --- Los frenos: cada uno DEBE bloquear ---
  {
    const r = correr(`${preparar([{ metodo: "efectivo", monto: 40 }, { metodo: "yape", monto: 60 }])}${corregir([{ metodo: "efectivo", monto: 50 }, { metodo: "yape", monto: 50 }])}`);
    esperar("FRENO caja cerrada: subir el efectivo de 40 a 50 se rechaza", rechazaCon(r, "caja_cerrada"), r.ok ? "pasó" : r.error);
    const r2 = correr(`${preparar([{ metodo: "efectivo", monto: 100 }])}${corregir([{ metodo: "yape", monto: 100 }])}`);
    esperar("FRENO caja cerrada: pasar todo el efectivo a Yape se rechaza", rechazaCon(r2, "caja_cerrada"), r2.ok ? "pasó" : r2.error);
    const r3 = correr(`${preparar([{ metodo: "yape", monto: 100 }])}${corregir([{ metodo: "efectivo", monto: 100 }])}`);
    esperar("FRENO caja cerrada: pasar un Yape a efectivo se rechaza (el cajón ya se contó)", rechazaCon(r3, "caja_cerrada"), r3.ok ? "pasó" : r3.error);
  }
  {
    // Micaela, con un rol de prueba que ve el Historial: solo dentro de esta transacción.
    const r = correr(`${preparar([{ metodo: "yape", monto: 100 }], { quien: MICAELA })}
set local request.jwt.claim.sub = '${FELIPE}';
insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000c7', 'Historial (prueba)', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000c7', 'historial');
update retail.colaboradores set rol_id = '44444444-4444-4444-8444-0000000000c7'
  where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
set local request.jwt.claim.sub = '${MICAELA}';
${corregir([{ metodo: "qr", monto: 100 }])}`);
    esperar("FRENO caja cerrada: una colaboradora de la tienda no la corrige (solo un líder)", rechazaCon(r, "caja_cerrada"), r.ok ? "pasó" : r.error);
    const r2 = correr(`${preparar([{ metodo: "yape", monto: 100 }], { quien: MICAELA, cerrar: false })}
set local request.jwt.claim.sub = '${FELIPE}';
insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000c7', 'Historial (prueba)', 'temporal');
insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000c7', 'historial');
update retail.colaboradores set rol_id = '44444444-4444-4444-8444-0000000000c7'
  where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
set local request.jwt.claim.sub = '${MICAELA}';
${corregir([{ metodo: "qr", monto: 100 }])}${pagos}`);
    esperar("caja abierta: la colaboradora sigue corrigiendo como antes", r2.ok && /qr:100\.00/.test(r2.salida), r2.salida || r2.error);
  }
  {
    const r = correr(`${preparar([{ metodo: "yape", monto: 100 }])}${conCuenta(`jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 100, 'cuenta_dinero_id', :'izipay'))`)}`);
    esperar("FRENO: el efectivo con cuenta se rechaza (va siempre al cajón)", rechazaCon(r, "pagos_invalidos"), r.ok ? "pasó" : r.error);
    const r2 = correr(`${preparar([{ metodo: "yape", monto: 100 }])}${corregir([{ metodo: "qr", monto: 100, cuenta_dinero_id: "no-es-uuid" }])}`);
    esperar("FRENO: una cuenta que no es uuid se rechaza con su motivo, no con un error crudo", rechazaCon(r2, "pagos_invalidos"), r2.ok ? "pasó" : r2.error);
    const r3 = correr(`${preparar([{ metodo: "yape", monto: 100 }])}${conCuenta(`jsonb_build_array(jsonb_build_object('metodo', 'qr', 'monto', 100, 'cuenta_dinero_id', :'vendemas'))`)}`);
    esperar("FRENO: un QR a la máquina de Vendemás (no cobra QR en Trujillo) se rechaza", !r3.ok && /no cobra con QR/.test(r3.error), r3.ok ? "pasó" : r3.error);
    const r4 = correr(`${preparar([{ metodo: "tarjeta", monto: 100 }])}${conCuenta(`jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 100, 'cuenta_dinero_id', :'vendemas'))`)}`);
    esperar("misma máquina y mismo monto: «no hubo nada que cambiar»", rechazaCon(r4, "pagos_sin_cambios"), r4.ok ? "pasó" : r4.error);
  }
  {
    // Un mes cerrado: la venta se lleva al mes pasado y ese mes se cierra para la tienda (como las demás funciones, el candado mira la sede).
    const r = correr(`${preparar([{ metodo: "yape", monto: 100 }])}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.ventas set created_at = date_trunc('month', now()) - interval '10 days' where id = :'venta';
-- Un cierre de verdad exige el diario completo del mes; aquí basta la marca que lee fn_primer_mes_cerrado (dentro del ROLLBACK).
alter table retail.periodos drop constraint periodos_cerrado_con_cierre;
insert into retail.periodos (mes, alcance, ubicacion_id, estado) values ((date_trunc('month', now()) - interval '1 month')::date, 'ubicacion', :'ubic', 'cerrado');
${corregir([{ metodo: "qr", monto: 100 }])}`);
    esperar("FRENO: una venta de un mes cerrado no se corrige (periodo_cerrado)", rechazaCon(r, "periodo_cerrado"), r.ok ? "pasó" : r.error);
  }
}

console.log(`\n${total - fallas}/${total} ${SIN_MIGRACION ? "(control, sin la migración)" : ""}`);
process.exit(fallas ? 1 : 0);
