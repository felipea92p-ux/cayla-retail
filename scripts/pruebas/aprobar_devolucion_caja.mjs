#!/usr/bin/env node
/**
 * Prueba puntual de `retail.aprobar_devolucion` — CAYLA V2.
 *
 * NO es una suite completa de Devoluciones (ese módulo no es el que tocó esta sesión).
 * Verifica solo el candado nuevo de
 * `20260916180000_cambio_y_devolucion_exigen_caja_si_hay_efectivo.sql`: un reembolso en
 * efectivo sin caja abierta se rechaza (antes quedaba con `caja_id` null, invisible para
 * siempre en cualquier `cerrar_caja` — mismo hueco que `registrar_cambio` tenía, cerrado
 * en la misma migración). Y su contraparte: una devolución SIN reembolso en efectivo
 * sigue funcionando sin caja abierta — el candado no debe frenar lo que nunca tocó el
 * cajón.
 *
 * Mismo mecanismo que `scripts/pruebas/registrar_cambio.mjs` (`docker exec ... psql` +
 * `set local request.jwt.claim.sub` + `ROLLBACK` siempre) — ver ese archivo para el
 * razonamiento completo y ADR-0066/ADR-0064.
 *
 * USO
 *   pnpm pruebas:aprobar-devolucion-caja    → necesita el stack local levantado
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/**
 * Venta de una unidad de BLU-EMMA-NEG-M en Tienda Lima, con caja fresca ya abierta —
 * deja `:venta_item` listo para armar una devolución. Precio ajustado al vigente del
 * catálogo (candado ADR-0048) igual que en `registrar_cambio.mjs`.
 */
const FIXTURE_VENTA = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';

select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset

insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');

select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00) as caja_id \\gset

select id as v_old from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select precio as precio_viejo from retail.variantes where id = :'v_old' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_old', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov_old \\gset
select retail.fn_aplicar_movimiento(:'mov_old') as _d1 \\gset

select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', :'precio_viejo', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :'precio_viejo')),
  null, gen_random_uuid()) as venta_id \\gset

select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset

select retail.crear_devolucion(:'venta_id', :'ubic',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'venta_item', 'cantidad', 1, 'condicion', 'vendible')),
  'prueba automatizada') as devolucion_id \\gset

-- cierra la caja que se abrió para poder vender: a partir de acá, NINGUNA caja
-- está abierta en Lima — el escenario que el candado nuevo debe cubrir.
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_para_probar \\gset
`;

let fallos = 0;

function esperar(nombre, ok) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) fallos++;
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  const conEfectivo = correr(`${FIXTURE_VENTA}
select retail.aprobar_devolucion(:'devolucion_id', 25.00, 'efectivo');
`);
  esperar(
    "sin caja abierta, aprobar con reembolso en efectivo se rechaza",
    !conEfectivo.ok && conEfectivo.mensaje.includes("No hay una caja abierta en esta ubicación")
  );

  const sinReembolso = correr(`${FIXTURE_VENTA}
select retail.aprobar_devolucion(:'devolucion_id', null, null) as _ok \\gset
select estado, caja_id from retail.devoluciones where id = :'devolucion_id';
rollback;
`);
  esperar(
    "sin caja abierta, aprobar SIN reembolso en efectivo sigue funcionando",
    sinReembolso.ok && sinReembolso.salida.split("|")[0] === "aprobada"
  );

  console.log(`\n${2 - fallos}/2 pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
