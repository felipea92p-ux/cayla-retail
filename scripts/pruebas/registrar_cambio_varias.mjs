#!/usr/bin/env node
/**
 * Pruebas de `retail.registrar_cambio_varias` contra el Postgres local — CAYLA V2 (ADR-0470).
 *
 * EL PROBLEMA QUE RESUELVE. El 2026-10-21 una clienta devolvió un body de S/ 45.90 y se llevó dos Top Rib de S/ 35.90 (boleta B005-000670).
 * El cambio solo sabía de UNA prenda nueva: la colaboradora anotó un cambio uno por uno con diferencia −S/ 10 por «transferencia» y vendió
 * el segundo top aparte; Izipay cobró S/ 25.90 de diferencia. Quedó «Por depositar Izipay» con S/ 10 de más e Interbank con S/ 10 de menos.
 * `registrar_cambio_varias` lo guarda de una vez: una entrada, una salida por prenda, la diferencia TOTAL (S/ 25.90) por el medio real.
 *
 * QUÉ HACE. Cada escenario corre en su propia transacción con ROLLBACK al final — nunca se commitea nada, así que corre seguro contra el
 * mismo Postgres local que comparten varias sesiones. Simula la sesión de Felipe (líder) o Micaela (integrante de Trujillo) con
 * `set local request.jwt.claim.sub`, como `registrar_cambio.mjs`; se habla con Postgres por `docker exec … psql`.
 *
 * POR QUÉ NO ES UN `*.test.ts` DE VITEST. Necesita Postgres y Docker; `pnpm test` del CI corre sobre un checkout limpio sin ellos.
 *
 * USO
 *   pnpm pruebas:registrar-cambio-varias    → necesita el stack local con las migraciones 20261021183000 y 20261021185000..191000
 *   PRUEBAS_BASE=mi_copia node scripts/pruebas/registrar_cambio_varias.mjs   → contra una copia de la base
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const BASE = process.env.PRUEBAS_BASE ?? "postgres";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

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

function comoPersona(authUserId, sqlDespues) {
  return `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sqlDespues}
`;
}

/**
 * Una venta con UNA línea en Tienda Lima del «body» (BLU-EMMA-NEG-M) y dos prendas para llevarse (VES-SOFI-NEG-M y BLU-EMMA-BEI-M). Los
 * precios se ajustan dentro de la transacción (que nunca se commitea) para que la diferencia sea EXACTA sin importar el catálogo de hoy:
 * `registrar_venta` exige que el precio de la línea coincida con el vigente, así que el catálogo se ajusta primero.
 * Pagada con tarjeta, nunca en efectivo, para que su monto no entre al cajón y ensucie las aserciones de caja.
 */
function fixture({ precioViejo = 45.9, descuento = 0, precio1 = 35.9, precio2 = 35.9 } = {}) {
  return `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset

insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Cuarentena', 'cuarentena'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena');
select id as sub_cuarentena from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'cuarentena' \\gset

select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset

select id as v_old from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v_n1 from retail.variantes where sku = 'VES-SOFI-NEG-M' \\gset
select id as v_n2 from retail.variantes where sku = 'BLU-EMMA-BEI-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_old', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov_old \\gset
select retail.fn_aplicar_movimiento(:'mov_old') as _d1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_n1', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov_n1 \\gset
select retail.fn_aplicar_movimiento(:'mov_n1') as _d2 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_n2', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov_n2 \\gset
select retail.fn_aplicar_movimiento(:'mov_n2') as _d3 \\gset

update retail.variantes set precio = ${precioViejo} where id = :'v_old';
update retail.variantes set precio = ${precio1} where id = :'v_n1';
update retail.variantes set precio = ${precio2} where id = :'v_n2';

select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', ${precioViejo}, 'descuento_unitario', ${descuento}${
    descuento > 0 ? `, 'motivo_descuento', 'liquidacion_temporada', 'argumento_descuento', 'prueba automatizada'` : ""
  })),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', ${precioViejo} - ${descuento})),
  null, gen_random_uuid()) as venta_id \\gset
select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset

select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_old' and ubicacion_id = :'ubic'),0) as stock_old_antes \\gset
select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_n1' and ubicacion_id = :'ubic'),0) as stock_n1_antes \\gset
select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_n2' and ubicacion_id = :'ubic'),0) as stock_n2_antes \\gset
`;
}

/** Las dos prendas del caso: una de cada una. */
const DOS_TOPS = `jsonb_build_array(jsonb_build_object('variante_id', :'v_n1', 'cantidad', 1), jsonb_build_object('variante_id', :'v_n2', 'cantidad', 1))`;

const CASOS = [];
function exito(nombre, sql, verificar) {
  CASOS.push({ nombre, tipo: "exito", sql, verificar });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}

// ---------------------------------------------------------------------------
// El caso de la boleta B005-000670
// ---------------------------------------------------------------------------

exito(
  "el body de S/ 45.90 por dos tops de S/ 35.90 cobra S/ 25.90 con QR: una entrada, dos salidas, el stock y el libro de Izipay cuadran",
  comoPersona(
    FELIPE,
    `${fixture()}
select coalesce(sum(l.monto), 0) as qr_antes from retail.fn_dinero_libro(retail.fn_hoy_lima()) l
  where l.ubicacion_id = :'ubic' and l.detalle ilike 'Cobros con QR%' \\gset
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'qr', gen_random_uuid()) as cambio_id \\gset
select
  c.diferencia,
  c.metodo_pago_diferencia,
  (select d.nombre from retail.cuentas_dinero d where d.id = c.cuenta_dinero_id),
  (select count(*) from retail.movimientos where cambio_id = c.id and tipo = 'entrada'),
  (select count(*) from retail.movimientos where cambio_id = c.id and tipo = 'salida'),
  (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_old' and ubicacion_id = :'ubic'),0) - :'stock_old_antes'),
  (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_n1' and ubicacion_id = :'ubic'),0) - :'stock_n1_antes'),
  (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_n2' and ubicacion_id = :'ubic'),0) - :'stock_n2_antes'),
  (select count(*) from retail.cambio_salidas where cambio_id = c.id),
  (select sum(precio_unitario * cantidad) from retail.cambio_salidas where cambio_id = c.id),
  (select coalesce(sum(l.monto), 0) from retail.fn_dinero_libro(retail.fn_hoy_lima()) l
    where l.ubicacion_id = :'ubic' and l.detalle ilike 'Cobros con QR%') - :'qr_antes'
from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ([dif, metodo, cuenta, entradas, salidas, dOld, dN1, dN2, nSal, totalSal, libro]) =>
    Number(dif) === 25.9 &&
    metodo === "qr" &&
    cuenta === "Por depositar Izipay" &&
    Number(entradas) === 1 &&
    Number(salidas) === 2 &&
    Number(dOld) === 1 &&
    Number(dN1) === -1 &&
    Number(dN2) === -1 &&
    Number(nSal) === 2 &&
    Number(totalSal) === 71.8 &&
    Number(libro) === 25.9
);

exito(
  "dos unidades de la misma prenda: una sola fila con cantidad 2 y la misma diferencia",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_cambio_varias(:'venta_item', :'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_n1', 'cantidad', 2)), 1, 'yape', gen_random_uuid()) as cambio_id \\gset
select c.diferencia,
  (select count(*) from retail.cambio_salidas where cambio_id = c.id),
  (select cantidad from retail.cambio_salidas where cambio_id = c.id),
  (select cantidad from retail.movimientos where cambio_id = c.id and tipo = 'salida')
from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ([dif, filas, cantFila, cantMov]) => Number(dif) === 25.9 && Number(filas) === 1 && Number(cantFila) === 2 && Number(cantMov) === 2
);

exito(
  "la misma prenda repetida en la lista se suma en una sola",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_cambio_varias(:'venta_item', :'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_n1', 'cantidad', 1), jsonb_build_object('variante_id', :'v_n1', 'cantidad', 1)),
  1, 'yape', gen_random_uuid()) as cambio_id \\gset
select (select count(*) from retail.cambio_salidas where cambio_id = :'cambio_id'),
       (select cantidad from retail.cambio_salidas where cambio_id = :'cambio_id');
rollback;
`
  ),
  ([filas, cant]) => Number(filas) === 1 && Number(cant) === 2
);

// ---------------------------------------------------------------------------
// La diferencia, en los tres sentidos y contra lo que la clienta PAGÓ
// ---------------------------------------------------------------------------

exito(
  "sin diferencia (S/ 71.80 por dos de S/ 35.90): no pide medio de pago y la plata no se mueve",
  comoPersona(
    FELIPE,
    `${fixture({ precioViejo: 71.8 })}
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, null, gen_random_uuid()) as cambio_id \\gset
select c.diferencia, coalesce(c.metodo_pago_diferencia, ''), (select count(*) from retail.movimientos where cambio_id = c.id)
from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ([dif, metodo, movs]) => Number(dif) === 0 && metodo === "" && Number(movs) === 3
);

exito(
  "se le devuelve plata (S/ 100 por dos de S/ 40): diferencia negativa en efectivo, igual que registrar_cambio (sin candado de líder)",
  comoPersona(
    FELIPE,
    `${fixture({ precioViejo: 100, precio1: 40, precio2: 40 })}
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'efectivo', gen_random_uuid()) as cambio_id \\gset
select c.diferencia, c.metodo_pago_diferencia, c.caja_id = :'caja_id'::uuid from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ([dif, metodo, enCaja]) => Number(dif) === -20 && metodo === "efectivo" && enCaja === "t"
);

exito(
  "se compara contra lo que la clienta PAGÓ, no contra el precio de lista (S/ 60 con S/ 10 de descuento → pagó 50; dos de 35.90 = 71.80 − 50)",
  comoPersona(
    FELIPE,
    `${fixture({ precioViejo: 60, descuento: 10 })}
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'yape', gen_random_uuid()) as cambio_id \\gset
select c.diferencia from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ([dif]) => Number(dif) === 21.8
);

error(
  "una diferencia sin medio de pago se rechaza",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, null, gen_random_uuid());
`
  ),
  "indica cómo se cobra o se devuelve"
);

error(
  "diferencia en efectivo sin caja abierta se rechaza",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta';
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'efectivo', gen_random_uuid());
`
  ),
  "No hay una caja abierta"
);

// ---------------------------------------------------------------------------
// Todo o nada, y el doble clic
// ---------------------------------------------------------------------------

exito(
  "si la segunda prenda no tiene stock, no queda NADA: ni cambio, ni movimientos, ni el stock de la primera tocado",
  comoPersona(
    FELIPE,
    `${fixture()}
select count(*) as movs_antes from retail.movimientos where ubicacion_id = :'ubic' \\gset
-- Un DO no ve las variables de psql: se las pasamos como ajustes de la transacción.
select set_config('cv.item', :'venta_item', true), set_config('cv.ubic', :'ubic', true),
       set_config('cv.n1', :'v_n1', true), set_config('cv.n2', :'v_n2', true) as _ajustes \\gset
do $prueba$
begin
  begin
    perform retail.registrar_cambio_varias(current_setting('cv.item')::uuid, current_setting('cv.ubic')::uuid,
      jsonb_build_array(jsonb_build_object('variante_id', current_setting('cv.n1'), 'cantidad', 1),
                        jsonb_build_object('variante_id', current_setting('cv.n2'), 'cantidad', 5000)),
      1, 'yape', gen_random_uuid());
  exception when others then
    null; -- se espera: no hay 5000 en el piso
  end;
end $prueba$;
select
  (select count(*) from retail.cambios where venta_item_id = :'venta_item'),
  (select count(*) from retail.movimientos where ubicacion_id = :'ubic') - :'movs_antes',
  (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_n1' and ubicacion_id = :'ubic'),0) - :'stock_n1_antes'),
  (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_old' and ubicacion_id = :'ubic'),0) - :'stock_old_antes');
rollback;
`
  ),
  ([cambios, movs, dN1, dOld]) => Number(cambios) === 0 && Number(movs) === 0 && Number(dN1) === 0 && Number(dOld) === 0
);

exito(
  "doble clic con el mismo token: devuelve el mismo cambio y no mueve el stock dos veces",
  comoPersona(
    FELIPE,
    `${fixture()}
select gen_random_uuid() as tk \\gset
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'yape', :'tk') as c1 \\gset
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'yape', :'tk') as c2 \\gset
select :'c1' = :'c2',
       (select count(*) from retail.cambios where venta_item_id = :'venta_item'),
       (select count(*) from retail.movimientos where cambio_id = :'c1'::uuid);
rollback;
`
  ),
  ([igual, cambios, movs]) => igual === "t" && Number(cambios) === 1 && Number(movs) === 3
);

error(
  "el mismo token con otras prendas se rechaza (el token sigue al contenido)",
  comoPersona(
    FELIPE,
    `${fixture()}
select gen_random_uuid() as tk \\gset
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'yape', :'tk');
select retail.registrar_cambio_varias(:'venta_item', :'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_n1', 'cantidad', 2)), 1, 'yape', :'tk');
`
  ),
  "token_reusado"
);

error(
  "una línea ya cambiada no se cambia otra vez",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'yape', gen_random_uuid());
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'yape', gen_random_uuid());
`
  ),
  "linea_sin_unidades"
);

// ---------------------------------------------------------------------------
// Entradas mal armadas, permisos y la prenda devuelta con defecto
// ---------------------------------------------------------------------------

error(
  "sin prendas no hay cambio",
  comoPersona(FELIPE, `${fixture()}\nselect retail.registrar_cambio_varias(:'venta_item', :'ubic', '[]'::jsonb, 1, 'yape', gen_random_uuid());\n`),
  "Indica qué prendas"
);

error(
  "una prenda con cantidad 0 se rechaza",
  comoPersona(
    FELIPE,
    `${fixture()}\nselect retail.registrar_cambio_varias(:'venta_item', :'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'v_n1', 'cantidad', 0)), 1, 'yape', gen_random_uuid());\n`
  ),
  "vienen mal armadas"
);

error(
  "una variante que no existe se rechaza",
  comoPersona(
    FELIPE,
    `${fixture()}\nselect retail.registrar_cambio_varias(:'venta_item', :'ubic', jsonb_build_array(jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1)), 1, 'yape', gen_random_uuid());\n`
  ),
  "no existe"
);

error(
  "más de 10 prendas distintas se rechaza",
  comoPersona(
    FELIPE,
    `${fixture()}\nselect retail.registrar_cambio_varias(:'venta_item', :'ubic',
  (select jsonb_agg(jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1)) from generate_series(1, 11)), 1, 'yape', gen_random_uuid());\n`
  ),
  "hasta 10 prendas"
);

error(
  "una prenda sin precio en el catálogo no se ofrece a cambio (ADR-0385)",
  comoPersona(
    FELIPE,
    `${fixture({ precio2: 0 })}\nselect retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'yape', gen_random_uuid());\n`
  ),
  "cambio_sin_precio"
);

error(
  "quien no opera esa sede (una integrante de Trujillo en Lima) no puede",
  // El fixture lo arma el líder (una integrante de Trujillo ni siquiera puede cerrar la caja de Lima); después entra Micaela.
  comoPersona(
    FELIPE,
    `${fixture()}\nset local request.jwt.claim.sub = '${MICAELA}';\nselect retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'yape', gen_random_uuid());\n`
  ),
  "No tienes permiso para hacer cambios"
);

exito(
  "la prenda devuelta con defecto entra a cuarentena (no al piso) y queda anotada como dañada",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'yape', gen_random_uuid(), 'defecto', 'no_vendible') as cambio_id \\gset
select (select count(*) from retail.movimientos where cambio_id = :'cambio_id' and tipo = 'entrada' and sububicacion_id = :'sub_cuarentena'),
       (select count(*) from retail.prendas_danadas where cambio_id = :'cambio_id');
rollback;
`
  ),
  ([cuarentena, danadas]) => Number(cuarentena) === 1 && Number(danadas) === 1
);

error(
  "las prendas de un cambio ya hecho no se editan",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_cambio_varias(:'venta_item', :'ubic', ${DOS_TOPS}, 1, 'yape', gen_random_uuid()) as cambio_id \\gset
update retail.cambio_salidas set cantidad = 9 where cambio_id = :'cambio_id';
`
  ),
  "no se editan ni se borran"
);

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(
      `No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`
    );
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(
          `✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`
        );
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
    } else {
      const columnas = resultado.salida.split("|");
      if (!caso.verificar(columnas)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
