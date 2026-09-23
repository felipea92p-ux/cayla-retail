#!/usr/bin/env node
/**
 * Pruebas de «Prenda sin registrar» (ADR-0178) contra el Postgres local — CAYLA V2.
 *
 * Una prenda que llega a piso sin pasar por almacén se vende con la variante centinela
 * «Cargo especial» + descripción, categoría, talla y color. `registrar_venta` deja una fila
 * pendiente en `prendas_por_regularizar`; almacén la une después con su prenda real
 * (`regularizar_prenda`). Estas pruebas cuidan que el stock cuadre en cada camino.
 *
 * Mismo patrón que `scripts/pruebas/registrar_venta.mjs` (léelo primero): cada caso corre en
 * su propia transacción con ROLLBACK contra el Postgres local compartido, simulando a Felipe
 * (líder) o Micaela (colaboradora de Tienda Trujillo) con `request.jwt.claim.sub`. No vive en
 * vitest porque el CI no tiene Postgres.
 *
 * USO
 *   pnpm pruebas:prendas-por-regularizar    → necesita el stack local (`npx supabase start`)
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

function comoPersona(authUserId, sqlDespues) {
  return `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sqlDespues}
`;
}

/** Sede con piso/almacén, caja abierta, stock de BLU-EMMA-NEG-M (79.90) y las listas para la prenda libre. */
function fixture(ubicacionNombre = "Tienda Lima") {
  return `
select id as ubic from retail.ubicaciones where nombre = '${ubicacionNombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00) as caja_id \\gset

select id as v1, precio as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset

select id as cat from retail.categorias where activo order by nombre limit 1 \\gset
select id as talla from retail.tallas where activo and estado = 'aprobado' order by valor limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
`;
}

/** Vende UNA prenda sin registrar a `precio`; deja :venta_id y :item_id. `extra` pisa claves del ítem. */
function venderLibre(precio = 50, extra = "") {
  return `
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', '${CENTINELA}', 'cantidad', 1, 'precio_unitario', ${precio},
    'descuento_unitario', 0, 'descripcion_libre', 'Blusa lino beige', 'categoria_id', :'cat',
    'talla_id', :'talla', 'color_codigo', :'color') ${extra}),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', ${precio})),
  null, gen_random_uuid()) as venta_id \\gset
select id as item_id from retail.venta_items where venta_id = :'venta_id' \\gset
`;
}

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ---------------------------------------------------------------------------
// Paso 1: la venta deja la fila pendiente
// ---------------------------------------------------------------------------

error(
  "una prenda sin registrar sin descripción no se vende",
  comoPersona(FELIPE, `${fixture()}${venderLibre(50, "- 'descripcion_libre'")}`),
  "prenda_sin_registrar_incompleta"
);

error(
  "una prenda sin registrar no se vende de a dos",
  comoPersona(FELIPE, `${fixture()}${venderLibre(50, "|| jsonb_build_object('cantidad', 2)")}`),
  "prenda_sin_registrar_incompleta"
);

exito(
  "la venta deja la prenda pendiente con lo que anotó caja",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre(50)}
select estado, descripcion, precio_cobrado, ubicacion_id = :'ubic'::uuid
  from retail.prendas_por_regularizar where venta_item_id = :'item_id';
rollback;`
  ),
  ([estado, descripcion, precio, sede]) => estado === "pendiente" && descripcion === "Blusa lino beige" && precio === "50.00" && sede === "t"
);

exito(
  "anular la venta saca la prenda pendiente de la cola",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre(50)}
select retail.anular_venta(:'venta_id', 'prueba',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'item_id', 'condicion', 'vendible'))) as _a \\gset
select estado from retail.prendas_por_regularizar where venta_item_id = :'item_id';
rollback;`
  ),
  ([estado]) => estado === "anulada"
);

error(
  "no se puede cambiar una prenda que almacén aún no regularizó",
  comoPersona(
    FELIPE,
    `${fixture()}${venderLibre(50)}
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad)
  values (:'item_id', :'ubic', :'v1', 1);
rollback;`
  ),
  "prenda_sin_regularizar"
);

exito(
  "una venta normal no crea filas por regularizar",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'v1_precio')),
  null, gen_random_uuid()) as venta_id \\gset
select count(*) from retail.prendas_por_regularizar p join retail.venta_items vi on vi.id = p.venta_item_id
  where vi.venta_id = :'venta_id';
rollback;`
  ),
  ([n]) => n === "0"
);

// ---------------------------------------------------------------------------
// Paso 2: almacén la regulariza sin descuadrar el stock
// ---------------------------------------------------------------------------

const STOCK_V1 = `coalesce((select sum(cantidad) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic'), 0)`;
const regularizar = (forma) =>
  `select retail.regularizar_prenda(p.id, :'v1', '${forma}') as dif from retail.prendas_por_regularizar p where venta_item_id = :'item_id' \\gset\n`;

exito(
  "«ya estaba registrada»: baja 1 del stock, la línea pasa a la prenda real y la diferencia es negativa",
  comoPersona(
    FELIPE,
    `${fixture()}select ${STOCK_V1} as antes \\gset
${venderLibre(50)}${regularizar("ya_registrada")}
select ${STOCK_V1} - :'antes', (select variante_id = :'v1'::uuid from retail.venta_items where id = :'item_id'),
       (select costo_unitario > 0 from retail.venta_items where id = :'item_id'),
       (select estado || '/' || forma || '/' || precio_oficial from retail.prendas_por_regularizar where venta_item_id = :'item_id'),
       :'dif';
rollback;`
  ),
  ([delta, varianteReal, conCosto, fila, dif]) =>
    delta === "-1" && varianteReal === "t" && conCosto === "t" && fila === "regularizada/ya_registrada/79.90" && dif === "-29.90"
);

exito(
  "«llegó nueva»: el stock no cambia y quedan su entrada y su salida con la línea de venta",
  comoPersona(
    FELIPE,
    `${fixture()}select ${STOCK_V1} as antes \\gset
${venderLibre(50)}${regularizar("llego_nueva")}
select ${STOCK_V1} - :'antes',
       (select string_agg(tipo || ':' || motivo, ',' order by tipo) from retail.movimientos where venta_item_id = :'item_id');
rollback;`
  ),
  ([delta, movs]) => delta === "0" && movs === "entrada:ingreso_regularizado,salida:venta"
);

exito(
  "cobrar más que el precio oficial queda como sobreprecio (diferencia positiva)",
  comoPersona(FELIPE, `${fixture()}${venderLibre(90)}${regularizar("ya_registrada")}
select :'dif';
rollback;`),
  ([dif]) => dif === "10.10"
);

error(
  "no se puede regularizar dos veces la misma prenda",
  comoPersona(FELIPE, `${fixture()}${venderLibre(50)}${regularizar("ya_registrada")}${regularizar("llego_nueva")}
rollback;`),
  "prenda_ya_regularizada"
);

error(
  "la forma tiene que ser una de las dos respuestas",
  comoPersona(FELIPE, `${fixture()}${venderLibre(50)}${regularizar("otra")}
rollback;`),
  "prenda_forma_invalida"
);

error(
  "no se regulariza contra la propia variante centinela",
  comoPersona(FELIPE, `${fixture()}${venderLibre(50)}
select retail.regularizar_prenda(p.id, '${CENTINELA}', 'ya_registrada') from retail.prendas_por_regularizar p where venta_item_id = :'item_id';
rollback;`),
  "no existe"
);

error(
  "«ya estaba registrada» sin stock en la sede pide elegir «llegó nueva»",
  comoPersona(FELIPE, `${fixture()}${venderLibre(50)}
select v.id as sin_stock from retail.variantes v
  where v.id <> '${CENTINELA}' and v.id <> :'v1'
    and not exists (select 1 from retail.stock s where s.variante_id = v.id and s.ubicacion_id = :'ubic' and s.cantidad > 0)
  limit 1 \\gset
select retail.regularizar_prenda(p.id, :'sin_stock', 'ya_registrada') from retail.prendas_por_regularizar p where venta_item_id = :'item_id';
rollback;`),
  "prenda_sin_stock_para_descontar"
);

error(
  "una colaboradora de otra sede no puede regularizar",
  comoPersona(FELIPE, `${fixture()}${venderLibre(50)}
set local request.jwt.claim.sub = '${MICAELA}';
${regularizar("ya_registrada")}
rollback;`),
  "No tienes permiso"
);

exito(
  "anular una venta ya regularizada devuelve la prenda real al stock",
  comoPersona(
    FELIPE,
    `${fixture()}select ${STOCK_V1} as antes \\gset
${venderLibre(50)}${regularizar("ya_registrada")}
select retail.anular_venta(:'venta_id', 'prueba',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'item_id', 'condicion', 'vendible'))) as _a \\gset
select ${STOCK_V1} - :'antes', (select estado from retail.prendas_por_regularizar where venta_item_id = :'item_id');
rollback;`
  ),
  ([delta, estado]) => delta === "0" && estado === "regularizada"
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
