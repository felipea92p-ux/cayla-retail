#!/usr/bin/env node
/**
 * Pruebas de las piezas de liquidación (ADR-0371) contra el Postgres local — CAYLA V2.
 *
 * Una prenda suelta que se liquida no entra al catálogo: se etiqueta con categoría y precio (`crear_pieza_liquidacion`),
 * se rebaja con una etiqueta NUEVA (la vieja deja de valer) y la caja la vende escaneando el código: una línea de la
 * variante centinela con `pieza_liquidacion_codigo`, que no mueve stock ni cae a la cola de almacén. Venta final.
 *
 * Mismo patrón que `prendas_por_regularizar.mjs`: cada caso en su transacción con ROLLBACK, como Felipe (líder) o
 * Micaela (colaboradora de Tienda Trujillo). No vive en vitest porque el CI no tiene Postgres.
 *
 * USO
 *   pnpm pruebas:piezas-liquidacion    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora, fija a Tienda Trujillo
const CENTINELA = "22222222-2222-4222-8222-222222222222";

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

const comoPersona = (authUserId, sql) => `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`;

/** Sede con caja abierta, una categoría activa y una prenda de catálogo con stock (para la venta mixta). */
function fixture(ubicacionNombre = "Tienda Lima") {
  return `
select id as ubic from retail.ubicaciones where nombre = '${ubicacionNombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset
select id as cat from retail.categorias where activo order by nombre limit 1 \\gset
select id as v1, retail.fn_precio_en_sede(id, :'ubic') as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
`;
}

/** Etiqueta una pieza a `precio`; deja :pieza y :codigo. */
const etiquetar = (precio = 30) => `
select (r ->> 'id') as pieza, (r ->> 'codigo') as codigo
  from (select retail.crear_pieza_liquidacion(:'ubic', :'cat', ${precio}) as r) x \\gset
`;

/** La línea de una pieza tal como la manda la caja. `extra` pisa claves. */
const lineaPieza = (precio, codigo = ":'codigo'", extra = "") =>
  `jsonb_build_object('variante_id', '${CENTINELA}', 'cantidad', 1, 'precio_unitario', ${precio}, 'descuento_unitario', 0,
     'descripcion_libre', 'Liquidación · prueba', 'pieza_liquidacion_codigo', ${codigo}) ${extra}`;

const vender = (lineas, total, extraParams = "") => `
select retail.registrar_venta(:'ubic', jsonb_build_array(${lineas}),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', ${total})),
  null, gen_random_uuid() ${extraParams}) as venta_id \\gset
select id as item_id from retail.venta_items where venta_id = :'venta_id' and variante_id = '${CENTINELA}' \\gset
`;

const STOCK_V1 = `coalesce((select sum(cantidad) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic'), 0)`;

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ---------------------------------------------------------------------------
// Etiquetar
// ---------------------------------------------------------------------------

exito(
  "etiquetar deja la pieza disponible con un código LQ y una sola etiqueta vigente",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}
select (select estado from retail.piezas_liquidacion where id = :'pieza'), :'codigo' ~ '^LQ[2-9A-HJ-NP-Z]{6}$',
       (select count(*) from retail.piezas_liquidacion_etiquetas where pieza_id = :'pieza' and vigente);
rollback;`),
  ([estado, formato, vigentes]) => estado === "disponible" && formato === "t" && vigentes === "1"
);

exito(
  "el mismo token dos veces (doble clic o respuesta perdida) deja UNA pieza y devuelve la misma",
  comoPersona(FELIPE, `${fixture()}
select gen_random_uuid() as tok \\gset
select retail.crear_pieza_liquidacion(:'ubic', :'cat', 30, :'tok') ->> 'id' as p1 \\gset
select retail.crear_pieza_liquidacion(:'ubic', :'cat', 30, :'tok') ->> 'id' as p2 \\gset
select :'p1' = :'p2', (select count(*) from retail.piezas_liquidacion where token = :'tok'::uuid);
rollback;`),
  ([misma, n]) => misma === "t" && n === "1"
);

exito(
  "la descripción opcional se guarda limpia (sin espacios de más) y vuelve en la pieza",
  comoPersona(FELIPE, `${fixture()}
select retail.crear_pieza_liquidacion(:'ubic', :'cat', 30, null, '  Blusa   beige, manga globo ') ->> 'descripcion';
rollback;`),
  ([d]) => d === "Blusa beige, manga globo"
);

error(
  "una descripción de más de 60 letras no se guarda",
  comoPersona(FELIPE, `${fixture()}select retail.crear_pieza_liquidacion(:'ubic', :'cat', 30, null, repeat('a', 61)); rollback;`),
  "liquidacion_datos_invalidos"
);

error(
  "un precio cero no se etiqueta",
  comoPersona(FELIPE, `${fixture()}${etiquetar(0)}rollback;`),
  "liquidacion_datos_invalidos"
);

error(
  "quien no tiene el módulo no etiqueta",
  comoPersona(FELIPE, `${fixture("Tienda Trujillo")}
set local request.jwt.claim.sub = '${MICAELA}';
${etiquetar(30)}rollback;`),
  "liquidacion_sin_modulo"
);

error(
  "con el módulo, una colaboradora no etiqueta bajo el mínimo",
  comoPersona(FELIPE, `${fixture("Tienda Trujillo")}
set local request.jwt.claim.sub = '${MICAELA}';
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_mi_rol_id(), 'liquidacion');
${etiquetar(5)}rollback;`),
  "liquidacion_bajo_minimo"
);

exito(
  "con el módulo, una colaboradora etiqueta sobre el mínimo; el líder también bajo el mínimo",
  comoPersona(FELIPE, `${fixture("Tienda Trujillo")}${etiquetar(5)}
set local request.jwt.claim.sub = '${MICAELA}';
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_mi_rol_id(), 'liquidacion');
${etiquetar(15)}
select count(*) from retail.piezas_liquidacion where ubicacion_id = :'ubic' and estado = 'disponible' and precio in (5, 15);
rollback;`),
  ([n]) => Number(n) >= 2
);

// ---------------------------------------------------------------------------
// Rebajar
// ---------------------------------------------------------------------------

exito(
  "cambiar el precio imprime un código nuevo y el viejo deja de valer",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}
select retail.cambiar_precio_pieza_liquidacion(:'codigo', 20) ->> 'codigo' as nuevo \\gset
select :'nuevo' <> :'codigo',
       (select vigente from retail.piezas_liquidacion_etiquetas where codigo = :'codigo'),
       (select precio from retail.piezas_liquidacion where id = :'pieza'),
       (retail.fn_pieza_liquidacion(:'codigo') ->> 'vigente');
rollback;`),
  ([distinto, viejoVigente, precio, leidoVigente]) => distinto === "t" && viejoVigente === "f" && precio === "20.00" && leidoVigente === "false"
);

error(
  "no se rebaja desde una etiqueta vieja",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}
select retail.cambiar_precio_pieza_liquidacion(:'codigo', 20) as _r \\gset
select retail.cambiar_precio_pieza_liquidacion(:'codigo', 10);
rollback;`),
  "liquidacion_etiqueta_vieja"
);

// ---------------------------------------------------------------------------
// Vender
// ---------------------------------------------------------------------------

exito(
  "vender una pieza: queda vendida, sin stock movido y sin fila para almacén",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}
select count(*) as movs_antes from retail.movimientos \\gset
${vender(lineaPieza(30), 30)}
select (select estado from retail.piezas_liquidacion where id = :'pieza'),
       (select venta_item_id = :'item_id'::uuid from retail.piezas_liquidacion where id = :'pieza'),
       (select count(*) from retail.movimientos) - :movs_antes,
       (select count(*) from retail.prendas_por_regularizar where venta_item_id = :'item_id');
rollback;`),
  ([estado, linea, movs, cola]) => estado === "vendida" && linea === "t" && movs === "0" && cola === "0"
);

exito(
  "una venta mixta (catálogo + pieza) mueve solo el stock de la prenda de catálogo",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}
select ${STOCK_V1} as antes \\gset
${vender(`jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0), ${lineaPieza(30)}`, `:'v1_precio'::numeric + 30`)}
select ${STOCK_V1} - :'antes', (select estado from retail.piezas_liquidacion where id = :'pieza');
rollback;`),
  ([delta, estado]) => delta === "-1" && estado === "vendida"
);

error(
  "la caja no cobra con una etiqueta vieja",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}
select retail.cambiar_precio_pieza_liquidacion(:'codigo', 20) as _r \\gset
${vender(lineaPieza(30), 30)}rollback;`),
  "liquidacion_etiqueta_vieja"
);

error(
  "la caja no cobra un precio distinto al de la etiqueta",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}${vender(lineaPieza(25), 25)}rollback;`),
  "liquidacion_precio_distinto"
);

error(
  "una pieza no lleva descuento",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}
${vender(lineaPieza(30, ":'codigo'", "|| jsonb_build_object('descuento_unitario', 5, 'motivo_descuento', 'liquidacion_temporada')"), 25)}rollback;`),
  "liquidacion_sin_descuentos"
);

error(
  "la misma pieza dos veces en una venta no pasa",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}${vender(`${lineaPieza(30)}, ${lineaPieza(30)}`, 60)}rollback;`),
  "liquidacion_ya_vendida"
);

error(
  "una pieza ya vendida no se vende otra vez",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}${vender(lineaPieza(30), 30)}${vender(lineaPieza(30), 30)}rollback;`),
  "liquidacion_ya_vendida"
);

error(
  "una pieza de otra tienda no se vende aquí",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja2 \\gset
${vender(lineaPieza(30), 30)}rollback;`),
  "liquidacion_otra_sede"
);

error(
  "una pieza retirada no se vende",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}
select retail.retirar_pieza_liquidacion(:'codigo', 'se manchó') as _r \\gset
${vender(lineaPieza(30), 30)}rollback;`),
  "liquidacion_retirada"
);

// ---------------------------------------------------------------------------
// Después de vender
// ---------------------------------------------------------------------------

exito(
  "anular la venta devuelve la pieza a la liquidación",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}${vender(lineaPieza(30), 30)}
select retail.anular_venta(:'venta_id', 'prueba',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'item_id', 'condicion', 'vendible'))) as _a \\gset
select estado, venta_item_id is null from retail.piezas_liquidacion where id = :'pieza';
rollback;`),
  ([estado, sinLinea]) => estado === "disponible" && sinLinea === "t"
);

error(
  "una pieza de liquidación no se cambia",
  comoPersona(FELIPE, `${fixture()}${etiquetar(30)}${vender(lineaPieza(30), 30)}
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad) values (:'item_id', :'ubic', :'v1', 1);
rollback;`),
  "liquidacion_venta_final"
);

error(
  "el mínimo solo lo cambia un líder",
  comoPersona(MICAELA, `select retail.guardar_precio_minimo_liquidacion(5); rollback;`),
  "Solo un líder"
);

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const r = correr(caso.sql);
    let falla = null;
    if (caso.tipo === "error") {
      if (r.ok) falla = `se esperaba un error ("${caso.contiene}") y no hubo ninguno`;
      else if (!r.mensaje.includes(caso.contiene)) falla = `se esperaba "${caso.contiene}", salió:\n    ${r.mensaje.trim().split("\n").join("\n    ")}`;
    } else if (!r.ok) {
      falla = `se esperaba éxito, falló:\n    ${r.mensaje.trim().split("\n").join("\n    ")}`;
    } else if (!caso.verificar(r.salida.split("\n").pop().split("|"))) {
      falla = `valores inesperados: ${JSON.stringify(r.salida)}`;
    }
    if (falla) fallos++;
    console.log(falla ? `✗ ${caso.nombre}\n    ${falla}` : `✓ ${caso.nombre}`);
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
