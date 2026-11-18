#!/usr/bin/env node
/**
 * Prueba puntual de `retail.aprobar_devolucion` — CAYLA V2.
 *
 * NO es una suite completa de Devoluciones. Verifica estos candados:
 *
 * 1. `20260916180000_cambio_y_devolucion_exigen_caja_si_hay_efectivo.sql`: un reembolso en
 *    efectivo sin caja abierta se rechaza (antes quedaba con `caja_id` null, invisible para
 *    siempre en cualquier `cerrar_caja` — mismo hueco que `registrar_cambio` tenía, cerrado
 *    en la misma migración). Y su contraparte: una devolución SIN reembolso en efectivo
 *    sigue funcionando sin caja abierta — el candado no debe frenar lo que nunca tocó el
 *    cajón.
 * 2. `20260916214500_anular_venta_sin_huecos.sql` (ya en producción, traída al repo el
 *    2026-09-18): una venta ANULADA no admite devolución (trigger sobre `devolucion_items`)
 *    porque `anular_venta` ya devolvió sus prendas al stock — aprobar encima las volvía a
 *    sumar. La devolución que quedó pendiente se rechaza, y eso sigue funcionando. Y
 *    `cerrar_caja` no espera en el cajón el efectivo de una venta anulada: ya volvió a la
 *    clienta, contarlo dejaba un faltante fantasma en el arqueo.
 * 3. La nota de crédito de una boleta ACEPTADA: sale por lo que la clienta pagó, no por el
 *    precio de lista, y ninguna nota acredita más de lo cobrado (`20261012120100`, ADR-0380);
 *    y declara SOLO lo devuelto, con el texto de la boleta si era una prenda sin registrar
 *    (`20261012200000`, ADR-0382).
 *
 * Otra base del mismo Postgres (una copia desechable con las migraciones de tu rama):
 * `PRUEBAS_BASE=mi_copia node scripts/pruebas/aprobar_devolucion_caja.mjs`.
 *
 * 3. `20261012221000_devolucion_espera_la_boleta_aceptada.sql` (Felipe, 2026-10-12): con la boleta de la venta en camino a
 *    SUNAT (pendiente, en cola, enviada) o rechazada, aprobar se niega —sin nota de crédito, la boleta llegaría después por el
 *    total—; con la boleta liberada (no_emitido) se aprueba como siempre.
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
// Otra base del mismo Postgres (p. ej. una copia desechable con las migraciones de esta rama): `PRUEBAS_BASE=mi_copia node …`.
const BASE = process.env.PRUEBAS_BASE ?? "postgres";
const FELIPE = "22222222-2222-4222-8222-000000000001";
// Segunda líder (seed.sql), usada para aprobar. Nació porque 20260922235000 prohibía que quien
// registró una devolución la aprobara; ADR-0534 (20261027164000) quitó esa regla, así que hoy
// Felipe también podría aprobarla. Se conserva otra cuenta a propósito: este archivo prueba OTRO
// candado (caja/efectivo), y que apruebe alguien distinto de quien registró sigue siendo un camino real.
const SANDRA = "22222222-2222-4222-8222-000000000005";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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
const FIXTURE_BASE = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';

select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset

insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');

select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset

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
`;

const ITEMS_DEVOLUCION = `jsonb_build_array(jsonb_build_object('venta_item_id', :'venta_item', 'cantidad', 1, 'condicion', 'vendible'))`;

/**
 * La base + una devolución pendiente + la caja cerrada (ninguna abierta en Lima). Termina la
 * sesión en SANDRA (no Felipe, que la registró). Hasta ADR-0534 era para sacar del camino el
 * candado de auto-aprobación de 20260922235000 (ya no existe: la misma persona puede aprobar,
 * lo prueba candado_dinero_caja_cambios_devoluciones.mjs); se deja así porque no cambia lo que
 * este archivo prueba (caja/efectivo).
 */
const FIXTURE_VENTA = `${FIXTURE_BASE}
select retail.crear_devolucion(:'venta_id', :'ubic', ${ITEMS_DEVOLUCION}, 'prueba automatizada', 'otro') as devolucion_id \\gset

-- cierra la caja que se abrió para poder vender: a partir de acá, NINGUNA caja
-- está abierta en Lima — el escenario que el candado nuevo debe cubrir.
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_para_probar \\gset

set local request.jwt.claim.sub = '${SANDRA}';
`;

let fallos = 0;
let total = 0;

// `resultado` (lo que devolvió `correr`) se imprime solo si falla: distingue "el candado
// no existe" de "el fixture se rompió antes de llegar al candado".
function esperar(nombre, ok, resultado) {
  total++;
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

  const conEfectivo = correr(`${FIXTURE_VENTA}
select retail.aprobar_devolucion(:'devolucion_id', 25.00, 'efectivo');
`);
  esperar(
    "sin caja abierta, aprobar con reembolso en efectivo se rechaza",
    !conEfectivo.ok && conEfectivo.mensaje.includes("No hay una caja abierta en esta ubicación"),
    conEfectivo
  );

  const sinReembolso = correr(`${FIXTURE_VENTA}
select retail.aprobar_devolucion(:'devolucion_id', null, null) as _ok \\gset
select estado, caja_id from retail.devoluciones where id = :'devolucion_id';
rollback;
`);
  esperar(
    "sin caja abierta, aprobar SIN reembolso en efectivo sigue funcionando",
    sinReembolso.ok && sinReembolso.salida.split("|")[0] === "aprobada",
    sinReembolso
  );

  // ---- la boleta de la venta todavía no está aceptada por SUNAT (20261012221000) ----
  // La boleta se escribe a mano dentro de la transacción que se revierte: el estado es lo que se prueba, no cómo se emitió.
  const conBoleta = (estado) => `${FIXTURE_VENTA}
reset request.jwt.claim.sub;
insert into retail.comprobantes (ubicacion_id, tipo, serie, numero, total, venta_id, estado, motivo_no_emitido, entorno_transmision)
  values (:'ubic', 'boleta', 'ZPRU', 990000 + (random() * 9999)::int, :'precio_viejo', :'venta_id', '${estado}',
          ${estado === "no_emitido" ? "'prueba automatizada'" : "null"}, ${["enviado", "rechazado"].includes(estado) ? "'sandbox'" : "null"});
set local request.jwt.claim.sub = '${SANDRA}';
`;
  const conPendiente = correr(`${conBoleta("pendiente")}
select retail.aprobar_devolucion(:'devolucion_id', null, null);
`);
  esperar(
    "con la boleta sin enviar a SUNAT, aprobar se niega y dice que espere",
    !conPendiente.ok && conPendiente.mensaje.includes("todavía no está aceptada por SUNAT") && conPendiente.mensaje.includes("Espera a que SUNAT la acepte"),
    conPendiente
  );
  const conEnviada = correr(`${conBoleta("enviado")}
select retail.aprobar_devolucion(:'devolucion_id', null, null);
`);
  esperar(
    "con la boleta enviada y sin respuesta de SUNAT, aprobar se niega",
    !conEnviada.ok && conEnviada.mensaje.includes("SUNAT aún no responde"),
    conEnviada
  );
  const conRechazada = correr(`${conBoleta("rechazado")}
select retail.aprobar_devolucion(:'devolucion_id', null, null);
`);
  esperar(
    "con la boleta rechazada por SUNAT, aprobar se niega y dice que la reintente",
    !conRechazada.ok && conRechazada.mensaje.includes("Reintenta su envío en Comprobantes"),
    conRechazada
  );
  const conLiberada = correr(`${conBoleta("no_emitido")}
select retail.aprobar_devolucion(:'devolucion_id', null, null) as _ok \\gset
select estado from retail.devoluciones where id = :'devolucion_id';
rollback;
`);
  esperar(
    "con la boleta liberada (no_emitido), aprobar funciona como siempre",
    conLiberada.ok && conLiberada.salida === "aprobada",
    conLiberada
  );

  // ---- venta anulada: `anular_venta` ya devolvió sus prendas al stock ----
  // Anula con la RPC real (caja abierta, líder, sin comprobante SUNAT): es el camino
  // que un líder recorre de verdad.
  const ANULAR = `select retail.anular_venta(:'venta_id', 'prueba automatizada',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'venta_item', 'condicion', 'vendible'))) as _anulada \\gset`;

  const crearSobreAnulada = correr(`${FIXTURE_BASE}
${ANULAR}
select retail.crear_devolucion(:'venta_id', :'ubic', ${ITEMS_DEVOLUCION}, 'prueba automatizada', 'otro');
`);
  esperar(
    "crear una devolución sobre una venta anulada se rechaza",
    !crearSobreAnulada.ok && crearSobreAnulada.mensaje.includes("ya no admite cambios ni devoluciones"),
    crearSobreAnulada
  );

  // Una devolución pendiente sobre una venta anulada no se alcanza por la vía normal
  // (`anular_venta` se niega si hay una pendiente, y el trigger impide crearla después):
  // se arma con un UPDATE dentro de la transacción que se revierte. La salida de esa
  // devolución es rechazarla — el candado no debe dejarla atrapada para siempre.
  const ANULAR_A_MANO = `update retail.ventas set estado = 'anulada', motivo_anulacion = 'prueba automatizada', anulado_en = now()
  where id = :'venta_id';`;

  const rechazarSobreAnulada = correr(`${FIXTURE_VENTA}
${ANULAR_A_MANO}
select retail.rechazar_devolucion(:'devolucion_id', 'la venta se anuló') as _ok \\gset
select estado from retail.devoluciones where id = :'devolucion_id';
rollback;
`);
  esperar(
    "rechazar una devolución pendiente de una venta anulada sigue funcionando",
    rechazarSobreAnulada.ok && rechazarSobreAnulada.salida === "rechazada",
    rechazarSobreAnulada
  );

  // El arqueo: la base ya abrió la caja con 100 y vendió una prenda con TARJETA (no suma al
  // efectivo). Se vende otra en EFECTIVO y se anula: ese efectivo ya volvió a la clienta,
  // así que al cerrar solo se espera la apertura (100), no 100 + el precio de la prenda.
  const arqueoConVentaAnulada = correr(`${FIXTURE_BASE}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', :'precio_viejo', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'precio_viejo')),
  null, gen_random_uuid()) as venta_efectivo \\gset
select id as item_efectivo from retail.venta_items where venta_id = :'venta_efectivo' \\gset
select retail.anular_venta(:'venta_efectivo', 'prueba automatizada',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'item_efectivo', 'condicion', 'vendible'))) as _anulada \\gset
select monto_sistema from retail.cerrar_caja(:'caja_id', 100.00);
rollback;
`);
  esperar(
    "cerrar caja no espera el efectivo de una venta anulada",
    arqueoConVentaAnulada.ok && Number(arqueoConVentaAnulada.salida) === 100,
    arqueoConVentaAnulada
  );


  // ---- 20261012120100 (ADR-0380): la nota de crédito sale por lo que la clienta PAGÓ, no por el precio de lista ----
  // Venta con boleta ACEPTADA, S/ 20 de descuento por prenda y una devolución pendiente (mismo armado que
  // `arreglos_en_vivo.mjs`). Antes la nota salía por el precio de lista: más que la boleta.
  const FIXTURE_CON_NOTA = (descuento) => `${FIXTURE_BASE}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', :'precio_viejo', 'descuento_unitario', ${descuento}${
    descuento > 0 ? `, 'motivo_descuento', 'liquidacion_temporada', 'argumento_descuento', 'prueba automatizada'` : ""
  })),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'precio_viejo')::numeric - ${descuento})),
  null, gen_random_uuid(), 'boleta') as venta_nota \\gset
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where venta_id = :'venta_nota';
insert into retail.series_comprobantes (ubicacion_id, tipo, serie)
  select :'ubic', 'nota_credito', 'BC01' where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_credito');
select id as item_nota from retail.venta_items where venta_id = :'venta_nota' \\gset
select retail.crear_devolucion(:'venta_nota', :'ubic',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'item_nota', 'cantidad', 1, 'condicion', 'vendible')),
  'prueba automatizada', 'otro') as dev_nota \\gset
set local request.jwt.claim.sub = '${SANDRA}';
`;

  const notaConDescuento = correr(`${FIXTURE_CON_NOTA(20)}
select retail.aprobar_devolucion(:'dev_nota', (:'precio_viejo')::numeric - 20, 'yape') as _ok \\gset
select n.total, n.igv, n.subtotal, b.total
  from retail.devoluciones d
  join retail.comprobantes n on n.id = d.nota_credito_id
  join retail.comprobantes b on b.id = n.comprobante_original_id
 where d.id = :'dev_nota';
rollback;
`);
  {
    const [total, igv, subtotal, totalBoleta] = notaConDescuento.ok ? notaConDescuento.salida.split("|").map(Number) : [];
    esperar(
      "con descuento, la nota de crédito sale por lo pagado (igual a la boleta), no por el precio de lista",
      notaConDescuento.ok && total === totalBoleta && Math.abs(igv + subtotal - total) < 0.005 && igv === Math.round((total - total / 1.18) * 100) / 100,
      notaConDescuento
    );
  }

  const notaDeMas = correr(`${FIXTURE_CON_NOTA(20)}
select retail.aprobar_devolucion(:'dev_nota', (:'precio_viejo')::numeric - 20, 'yape') as _ok \\gset
select retail.emitir_nota(c.id, 'nota_credito', '07', 0.01, 0, 0.01) from retail.comprobantes c where c.venta_id = :'venta_nota' and c.tipo = 'boleta';
rollback;
`);
  esperar(
    "una segunda nota de crédito que pasaría de lo que cobró la boleta se rechaza (nunca se acredita más que lo cobrado)",
    !notaDeMas.ok && notaDeMas.mensaje.includes("pasarían de lo que cobró"),
    notaDeMas
  );

  const notaSinDescuento = correr(`${FIXTURE_CON_NOTA(0)}
select retail.aprobar_devolucion(:'dev_nota', :'precio_viejo', 'yape') as _ok \\gset
select n.total = b.total
  from retail.devoluciones d
  join retail.comprobantes n on n.id = d.nota_credito_id
  join retail.comprobantes b on b.id = n.comprobante_original_id
 where d.id = :'dev_nota';
rollback;
`);
  esperar("sin descuento nada cambia: la nota sale por el total de la boleta", notaSinDescuento.ok && notaSinDescuento.salida === "t", notaSinDescuento);

  // ---- 20261012200000 (ADR-0382): la nota de crédito declara SOLO lo devuelto ----
  // Antes `aprobar_devolucion` no le pasaba ítems a `emitir_nota` y la nota copiaba TODAS las líneas de la boleta: en una
  // devolución parcial le decía a SUNAT que volvieron prendas que la clienta se llevó, con ítems que no sumaban el total.
  // Boleta ACEPTADA con dos prendas: BLU-EMMA-NEG-M con S/ 20 de descuento (1 unidad) y BLU-EMMA-BEI-M sin descuento (2 unidades).
  const FIXTURE_DOS_LINEAS = `${FIXTURE_BASE}
select id as v_b, precio as precio_b from retail.variantes where sku = 'BLU-EMMA-BEI-M' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_b', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov_b \\gset
select retail.fn_aplicar_movimiento(:'mov_b') as _d2 \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(
    jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', (:'precio_viejo')::numeric, 'descuento_unitario', 20,
                       'motivo_descuento', 'liquidacion_temporada', 'argumento_descuento', 'prueba automatizada'),
    jsonb_build_object('variante_id', :'v_b', 'cantidad', 2, 'precio_unitario', (:'precio_b')::numeric, 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'precio_viejo')::numeric - 20 + 2 * (:'precio_b')::numeric)),
  null, gen_random_uuid(), 'boleta') as venta_nota \\gset
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where venta_id = :'venta_nota';
insert into retail.series_comprobantes (ubicacion_id, tipo, serie)
  select :'ubic', 'nota_credito', 'BC01' where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_credito');
select id as item_a from retail.venta_items where venta_id = :'venta_nota' and variante_id = :'v_old' \\gset
select id as item_b from retail.venta_items where venta_id = :'venta_nota' and variante_id = :'v_b' \\gset
`;

  // Devuelve `lineas` (pares venta_item / cantidad), la aprueba Sandra (otra cuenta con el módulo) y lee la nota: motivo | n.º de ítems | lo que dicen
  // los ítems (variante:cantidad:descuento, ordenado) | ¿Σ (precio − descuento) × cantidad de los ítems = total de la nota?
  const NOTA_LEIDA = `
select n.motivo, jsonb_array_length(n.items),
       (select string_agg(linea, ',' order by linea) from (
          select case when (it ->> 'variante_id')::uuid = :'v_old'::uuid then 'A' else 'B' end || ':' || (it ->> 'cantidad') || ':' || ((it ->> 'descuento_unitario')::numeric)::int as linea
            from jsonb_array_elements(n.items) it) l),
       (select sum((it ->> 'cantidad')::numeric * ((it ->> 'precio_unitario')::numeric - (it ->> 'descuento_unitario')::numeric))
          from jsonb_array_elements(n.items) it) = n.total
  from retail.devoluciones d join retail.comprobantes n on n.id = d.nota_credito_id
 where d.id = :'dev_parcial';
rollback;
`;
  const devolverYLeer = (lineas, reembolso) => correr(`${FIXTURE_DOS_LINEAS}
select retail.crear_devolucion(:'venta_nota', :'ubic',
  jsonb_build_array(${lineas.map(([item, cant]) => `jsonb_build_object('venta_item_id', :'${item}', 'cantidad', ${cant}, 'condicion', 'vendible')`).join(", ")}),
  'prueba automatizada', 'otro') as dev_parcial \\gset
set local request.jwt.claim.sub = '${SANDRA}';
select retail.aprobar_devolucion(:'dev_parcial', ${reembolso}, 'yape') as _ok \\gset
${NOTA_LEIDA}`);

  const parcialOtraPrenda = devolverYLeer([["item_a", 1]], "(:'precio_viejo')::numeric - 20");
  esperar(
    "devolución parcial (una de dos prendas): la nota declara solo la devuelta, con su descuento, y sus ítems suman el total",
    parcialOtraPrenda.ok && parcialOtraPrenda.salida === "07|1|A:1:20|t",
    parcialOtraPrenda
  );

  const parcialMenosUnidades = devolverYLeer([["item_b", 1]], "(:'precio_b')::numeric");
  esperar(
    "devolución parcial (una de dos unidades): la nota declara 1 unidad, no las 2 de la boleta",
    parcialMenosUnidades.ok && parcialMenosUnidades.salida === "07|1|B:1:0|t",
    parcialMenosUnidades
  );

  const devolucionTotal = devolverYLeer([["item_a", 1], ["item_b", 2]], "(:'precio_viejo')::numeric - 20 + 2 * (:'precio_b')::numeric");
  esperar(
    "devolución total: la nota declara las dos prendas completas y suma el total (lo que ya estaba bien no cambia)",
    devolucionTotal.ok && devolucionTotal.salida === "06|2|A:1:20,B:2:0|t",
    devolucionTotal
  );

  // Una prenda sin registrar (ADR-0179) ya regularizada a BLU-EMMA-NEG-M, vendida junto a otra BLU-EMMA-NEG-M de lista: al
  // regularizar, las dos líneas de venta quedan con la MISMA variante, y la boleta dijo «Blusa lino beige» para una de ellas. La
  // nota de la devuelta tiene que repetir ese texto (sale de `prendas_por_regularizar`), no el nombre del catálogo.
  const sinRegistrar = correr(`${FIXTURE_BASE}
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select id as cat from retail.categorias where activo order by nombre limit 1 \\gset
select id as talla from retail.tallas where activo and estado = 'aprobado' order by valor limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(
    jsonb_build_object('variante_id', '22222222-2222-4222-8222-222222222222', 'cantidad', 1, 'precio_unitario', 50, 'descuento_unitario', 0,
                       'descripcion_libre', 'Blusa lino beige', 'categoria_id', :'cat', 'talla_id', :'talla', 'color_codigo', :'color'),
    jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', (:'precio_viejo')::numeric, 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 50 + (:'precio_viejo')::numeric)),
  null, gen_random_uuid(), 'boleta') as venta_nota \\gset
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where venta_id = :'venta_nota';
insert into retail.series_comprobantes (ubicacion_id, tipo, serie)
  select :'ubic', 'nota_credito', 'BC01' where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_credito');
select vi.id as item_libre from retail.venta_items vi join retail.prendas_por_regularizar p on p.venta_item_id = vi.id where vi.venta_id = :'venta_nota' \\gset
select retail.regularizar_prenda(p.id, :'v_old', 'ya_registrada') as _dif from retail.prendas_por_regularizar p where p.venta_item_id = :'item_libre' \\gset
select retail.crear_devolucion(:'venta_nota', :'ubic',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'item_libre', 'cantidad', 1, 'condicion', 'vendible')),
  'prueba automatizada', 'otro') as dev_libre \\gset
set local request.jwt.claim.sub = '${SANDRA}';
select retail.aprobar_devolucion(:'dev_libre', 50, 'yape') as _ok \\gset
select jsonb_array_length(n.items), n.items -> 0 ->> 'descripcion_libre', (n.items -> 0 ->> 'precio_unitario')::numeric, n.total
  from retail.devoluciones d join retail.comprobantes n on n.id = d.nota_credito_id
 where d.id = :'dev_libre';
rollback;
`);
  esperar(
    "prenda sin registrar ya regularizada: la nota declara solo esa línea y con el texto de la boleta («Blusa lino beige»)",
    sinRegistrar.ok && sinRegistrar.salida === "1|Blusa lino beige|50.00|50.00",
    sinRegistrar
  );

  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
