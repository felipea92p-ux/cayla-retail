#!/usr/bin/env node
/**
 * Prueba puntual de `retail.crear_devolucion` — motivo estructurado (D-79, ADR-0158).
 *
 * NO es una suite completa de Devoluciones (esa la cubre `aprobar_devolucion_caja.mjs`).
 * Verifica solo el candado nuevo de `20260922180000_devoluciones_motivo_estructurado.sql`:
 *
 * 1. Sin `p_motivo_codigo` (null) se rechaza — el motivo ya no es opcional en la base.
 * 2. Con un código que no está en la lista cerrada se rechaza, con un mensaje que dice cuál
 *    llegó (para que caja entienda el error, no un 42883 críptico).
 * 3. Con cada uno de los seis códigos válidos (talla, calce, defecto, no_le_gusto, regalo,
 *    otro) la devolución se registra exactamente igual que antes: mismos ítems, mismo
 *    `motivo` de texto libre intacto, y el código queda guardado tal cual en
 *    `devoluciones.motivo_codigo`.
 *
 * Mismo mecanismo que `scripts/pruebas/aprobar_devolucion_caja.mjs` (`docker exec ... psql`
 * + `set local request.jwt.claim.sub` + `ROLLBACK` siempre) — ver ese archivo para el
 * razonamiento completo.
 *
 * USO
 *   pnpm pruebas:crear-devolucion-motivo    → necesita el stack local levantado
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
 * Venta de una unidad de BLU-EMMA-NEG-M en Tienda Lima, con caja fresca ya abierta — deja
 * `:venta_item` listo para armar una devolución. Precio ajustado al vigente del catálogo
 * (candado ADR-0048) igual que en `registrar_cambio.mjs`/`aprobar_devolucion_caja.mjs`.
 */
const FIXTURE = `
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
  values (:'v_old', :'ubic', :'sub_piso', 'entrada', 10, 'colchón de prueba') returning id as mov_old \\gset
select retail.fn_aplicar_movimiento(:'mov_old') as _d1 \\gset

select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', :'precio_viejo', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :'precio_viejo')),
  null, gen_random_uuid()) as venta_id \\gset

select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset
`;

const ITEMS = `jsonb_build_array(jsonb_build_object('venta_item_id', :'venta_item', 'cantidad', 1, 'condicion', 'vendible'))`;

let fallos = 0;

function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 400)}`);
  }
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- 1. sin motivo_codigo, se rechaza ----
  const sinMotivo = correr(`${FIXTURE}
select retail.crear_devolucion(:'venta_id', :'ubic', ${ITEMS}, 'la clienta no dio detalle', null);
`);
  esperar("sin motivo_codigo (null) se rechaza", !sinMotivo.ok && sinMotivo.mensaje.includes("Motivo de la devolución desconocido"), sinMotivo);

  // ---- 2. motivo_codigo fuera de la lista cerrada, se rechaza ----
  const motivoInventado = correr(`${FIXTURE}
select retail.crear_devolucion(:'venta_id', :'ubic', ${ITEMS}, 'la clienta no dio detalle', 'no_le_convencio');
`);
  esperar(
    "un motivo_codigo que no está en la lista se rechaza y dice cuál llegó",
    !motivoInventado.ok && motivoInventado.mensaje.includes("Motivo de la devolución desconocido: no_le_convencio"),
    motivoInventado
  );

  // ---- 3. cada uno de los seis códigos válidos se registra igual que antes ----
  const CODIGOS = ["talla", "calce", "defecto", "no_le_gusto", "regalo", "otro"];
  for (const codigo of CODIGOS) {
    const r = correr(`${FIXTURE}
select retail.crear_devolucion(:'venta_id', :'ubic', ${ITEMS}, 'texto libre de prueba', '${codigo}') as devolucion_id \\gset
select motivo, motivo_codigo, estado from retail.devoluciones where id = :'devolucion_id';
select count(*) from retail.devolucion_items where devolucion_id = :'devolucion_id';
rollback;
`);
    const filas = r.ok ? r.salida.split("\n") : [];
    const [motivo, motivoCodigo, estado] = (filas[0] ?? "").split("|");
    const cantidadItems = filas[1] ?? "";
    esperar(
      `motivo_codigo='${codigo}': se registra, guarda el texto libre intacto y un ítem`,
      r.ok && motivo === "texto libre de prueba" && motivoCodigo === codigo && estado === "pendiente" && cantidadItems === "1",
      r
    );
  }

  console.log(`\n${8 - fallos}/8 pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
