#!/usr/bin/env node
/**
 * Pruebas de «Apartar con descuento a mano» (`20261030220000_apartar_con_descuento_manual.sql`, ADR-0584) contra el Postgres local.
 *
 * EL PROBLEMA QUE PRUEBA. Al apartar solo valía el descuento de la campaña; desde ADR-0584 vale también uno a mano, con LAS MISMAS
 * reglas de la venta. Este archivo prueba tres cosas:
 *   1. que el apartado con descuento a mano se guarda con su motivo, su total cuadra y, al recoger, la venta lleva el mismo
 *      descuento con el mismo motivo (antes la entrega marcaba «campaña» todo descuento);
 *   2. que cada regla rechaza lo que debe (sin motivo, «Otro» sin detalle, pasado el 15 % sin argumento, bajo el costo, gratis,
 *      un Líder pasado el 35 %);
 *   1b. que la lista de apartados (`buscar_separaciones`, `20261030224000`) dice el motivo, el detalle y el argumento de cada prenda:
 *      con eso el detalle, Entregar y el Historial distinguen un descuento a mano de uno de campaña;
 *   3. que la regla de Apartar (`fn_exigir_descuento_manual`) y la de la venta (dentro de `registrar_venta`) dicen LO MISMO: cada
 *      caso de rechazo se corre en las dos y exige el mismo error. La regla vive en dos lugares (ver el DESCARTÉ de la migración);
 *      si una cambia sin la otra, esto falla.
 *
 * MISMO PATRÓN que `separaciones.mjs`: `docker exec ... psql`, `set local request.jwt.claim.sub` y ROLLBACK siempre.
 * QUÉ DA POR SENTADO. `Tienda Trujillo` y `BLU-EMMA-NEG-M` del seed (S/ 79.90); Felipe (líder) y Micaela (colaboradora en Trujillo).
 * El costo de la prenda se fija en S/ 32 dentro de cada caso, para que «bajo el costo» no dependa de la semilla.
 *
 * USO
 *   pnpm pruebas:apartar-con-descuento    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const iContenedor = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = iContenedor > -1 ? process.argv[iContenedor + 1] : "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql + "\nrollback;\n").trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// Preparación como Felipe: caja propia en Trujillo, stock de sobra en el piso, costo conocido. Al final, `quien` es la sesión.
function preparar(quien = MICAELA) {
  return `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT99' when 'factura' then 'FT99' else serie end, siguiente_numero = 1
 where ubicacion_id = :'ubic' and tipo in ('boleta', 'factura');
select id as v, retail.fn_precio_en_sede(id, :'ubic') as precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
update retail.variantes set costo = 32 where id = :'v';
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'piso', 'entrada', 20, 'colchón de prueba') returning id as m0 \\gset
select retail.fn_aplicar_movimiento(:'m0') as _a \\gset
set local request.jwt.claim.sub = '${quien}';
`;
}

/** El descuento de una línea, como lo manda la web (`descuentoParaGuardar`). */
const linea = ({ descuento = 0, motivo, detalle, argumento } = {}) =>
  `jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric, 'descuento_unitario', ${descuento}` +
  (motivo ? `, 'motivo_descuento', '${motivo}'` : "") +
  (detalle ? `, 'motivo_descuento_detalle', '${detalle}'` : "") +
  (argumento ? `, 'argumento_descuento', '${argumento}'` : "") +
  ")";

function separar(d, como = "sep") {
  return `select retail.separar_prendas(
    p_ubicacion_id => :'ubic', p_items => jsonb_build_array(${linea(d)}),
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 30)),
    p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987111222',
    p_devolucion_medio => 'yape') as ${como} \\gset
`;
}

/** La misma línea, vendida: el precio menos el descuento, pagado entero por Yape. */
function vender(d) {
  return `select retail.registrar_venta(:'ubic', jsonb_build_array(${linea(d)}),
    jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric - ${d.descuento ?? 0})),
    null, gen_random_uuid()) as venta \\gset
`;
}

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });
const filas = (salida) => salida.split("\n").filter(Boolean);

// ---------------------------------------------------------------------------
// 1. Apartar con descuento a mano y recogerlo
// ---------------------------------------------------------------------------
const DIEZ = { descuento: 8, motivo: "cerrar_venta" }; // 79.90 con 10 % → 71.90

exito(
  "apartar con 10 % para cerrar la venta: la línea guarda el descuento y su motivo, el total cuadra y no lleva etiqueta de campaña",
  `${preparar()}${separar(DIEZ)}
select s.total, si.descuento_unitario, si.motivo_descuento, si.descuento_etiqueta_id is null,
       (select count(*) from retail.fn_verificar_separaciones())
  from retail.separaciones s join retail.separacion_items si on si.separacion_id = s.id where s.id = :'sep';`,
  (s) => s === "71.90|8.00|cerrar_venta|t|0",
);

exito(
  "recoger un apartado con descuento a mano: la venta lleva el mismo descuento, el mismo motivo y su argumento, y cobra el saldo justo",
  `${preparar()}${separar({ descuento: 20, motivo: "otro", detalle: "Botón flojo", argumento: "Se cose en tienda" })}
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric - 20 - 30))) as venta \\gset
select vi.descuento_unitario, vi.motivo_descuento, vi.motivo_descuento_detalle, vi.argumento_descuento, vi.descuento_etiqueta_id is null,
       (select sum(monto) from retail.venta_pagos where venta_id = :'venta') = :'precio'::numeric - 20
  from retail.venta_items vi where vi.venta_id = :'venta';`,
  (s) => s === "20.00|otro|Botón flojo|Se cose en tienda|t|t",
);

exito(
  "sin descuento a mano todo sigue como antes: la línea no lleva motivo y la entrega tampoco",
  `${preparar()}${separar({})}
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric - 30))) as venta \\gset
select (select motivo_descuento is null from retail.separacion_items where separacion_id = :'sep'),
       (select motivo_descuento is null and descuento_unitario = 0 from retail.venta_items where venta_id = :'venta');`,
  (s) => s === "t|t",
);

exito(
  "pasado el 15 % con su argumento se aparta (una colaboradora no tiene tope, como en la venta: solo el costo)",
  `${preparar()}${separar({ descuento: 40, motivo: "liquidacion_temporada", argumento: "Última talla" })}
select total from retail.separaciones where id = :'sep';`,
  (s) => s === "39.90",
);

error(
  "la base no deja guardar un descuento a mano sin motivo directo en la tabla (candado de origen)",
  `${preparar()}${separar(DIEZ)}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.separacion_items set motivo_descuento = null where separacion_id = :'sep';`,
  "separacion_items_descuento_con_origen",
);

// ---------------------------------------------------------------------------
// 1b. El apartado ya hecho dice su descuento (`20261030224000`, actividad 4): la lista que leen el detalle, Entregar y el Historial
// ---------------------------------------------------------------------------
exito(
  "la lista de apartados dice el motivo, el detalle y el argumento de cada prenda con descuento a mano",
  `${preparar()}${separar({ descuento: 20, motivo: "otro", detalle: "Botón flojo", argumento: "Se cose en tienda" })}
select it ->> 'descuento_unitario', it ->> 'motivo_descuento', it ->> 'motivo_descuento_detalle', it ->> 'argumento_descuento'
  from retail.buscar_separaciones(:'ubic', :'sep'::text) b, jsonb_array_elements(b.items) it;`,
  (s) => s === "20.00|otro|Botón flojo|Se cose en tienda",
);

exito(
  "sin descuento a mano la lista no inventa un motivo",
  `${preparar()}${separar({})}
select it ->> 'descuento_unitario', it ? 'motivo_descuento', coalesce(it ->> 'motivo_descuento', 'nulo')
  from retail.buscar_separaciones(:'ubic', :'sep'::text) b, jsonb_array_elements(b.items) it;`,
  (s) => s === "0.00|t|nulo",
);

// ---------------------------------------------------------------------------
// 2 y 3. Cada regla rechaza, y dice lo mismo al apartar que al vender
// ---------------------------------------------------------------------------
const RECHAZOS = [
  ["sin motivo", { descuento: 8 }, "venta_descuento_requiere_motivo", MICAELA],
  ["motivo que no es de la lista", { descuento: 8, motivo: "porque_si" }, "venta_descuento_requiere_motivo", MICAELA],
  ["«Otro» sin detalle", { descuento: 8, motivo: "otro" }, "venta_descuento_otro_sin_detalle", MICAELA],
  ["pasado el 15 % sin argumento", { descuento: 16, motivo: "cerrar_venta" }, "venta_descuento_requiere_argumento", MICAELA],
  ["bajo el costo", { descuento: 50, motivo: "cerrar_venta", argumento: "x" }, "venta_descuento_bajo_costo", MICAELA],
  ["un Líder pasado el 35 %", { descuento: 30, motivo: "cerrar_venta", argumento: "x" }, "venta_descuento_supera_autorizacion", FELIPE],
];
for (const [que, d, codigo, quien] of RECHAZOS) {
  error(`apartar ${que} → ${codigo}`, `${preparar(quien)}${separar(d)}`, codigo);
  error(`vender ${que} → ${codigo} (la misma regla)`, `${preparar(quien)}${vender(d)}`, codigo);
}
error("apartar la prenda gratis → venta_descuento_bajo_costo", `${preparar()}update retail.variantes set costo = 0 where id = :'v';
${separar({ descuento: 79.9, motivo: "otro", detalle: "x", argumento: "x" })}`, "venta_descuento_bajo_costo");

// ---------------------------------------------------------------------------
// La migración: re-ejecutable y no pisa a ciegas
// ---------------------------------------------------------------------------
const MIG = readFileSync(new URL("../../supabase/migrations/20261030220000_apartar_con_descuento_manual.sql", import.meta.url), "utf8");
const HUELLA = `(select string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname) from pg_proc p
   where p.pronamespace = 'retail'::regnamespace and p.proname in ('separar_prendas', 'entregar_separacion', 'fn_exigir_descuento_manual'))`;
exito(
  "la migración se pega dos veces sin cambiar nada ni dejar sobrecargas",
  `begin;
select ${HUELLA} as h0 \\gset
${MIG}
${MIG}
select :'h0' = ${HUELLA}, (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('separar_prendas', 'entregar_separacion'));`,
  (s) => s === "t|2",
);

const MIG_LISTA = readFileSync(new URL("../../supabase/migrations/20261030224000_apartado_dice_su_descuento.sql", import.meta.url), "utf8");
const HUELLA_LISTA = `(select md5(pg_get_functiondef('retail.buscar_separaciones'::regproc)))`;
exito(
  "la migración de la lista se pega dos veces sin cambiar nada",
  `begin;
select ${HUELLA_LISTA} as h0 \\gset
${MIG_LISTA}
${MIG_LISTA}
select :'h0' = ${HUELLA_LISTA}, (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'buscar_separaciones');`,
  (s) => s === "t|1",
);

// ---------------------------------------------------------------------------
let ok = 0;
const fallos = [];
try {
  execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
} catch {
  console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
  process.exit(2);
}
for (const c of CASOS) {
  const r = correr(c.sql);
  let pasa, detalle;
  if (c.tipo === "exito") {
    const ultima = r.ok ? (filas(r.salida).at(-1) ?? "") : "";
    pasa = r.ok && c.verificar(ultima);
    detalle = r.ok ? `salida: ${ultima}` : (r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje);
  } else {
    pasa = !r.ok && r.mensaje.includes(c.contiene);
    detalle = r.ok ? "no falló" : (r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje);
  }
  console.log(`${pasa ? "✓" : "✗"} ${c.nombre}${pasa ? "" : `\n    ${detalle}`}`);
  if (pasa) ok++;
  else fallos.push(c.nombre);
}
console.log(`\n${ok}/${CASOS.length} pruebas en verde.`);
process.exit(fallos.length ? 1 : 0);
