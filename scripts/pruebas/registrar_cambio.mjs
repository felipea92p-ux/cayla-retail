#!/usr/bin/env node
/**
 * Pruebas de `retail.registrar_cambio` contra el Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. `registrar_cambio` (supabase/migrations/0007_cambios.sql,
 * extendida por 20260915200000_diferencia_de_cambio_en_el_arqueo.sql) mueve stock real
 * y, cuando hay diferencia de precio, plata real del cajón — y tenía CERO pruebas
 * automatizadas. Cada verificación hasta hoy fue manual ("verificado en psql", "en el
 * navegador"), sin nada que corra solo la próxima vez que alguien la toque.
 *
 * QUÉ HACE. Corre los escenarios de abajo contra la RPC real, cada uno en su propia
 * transacción con ROLLBACK al final — nunca se commitea nada, así que corre seguro
 * contra el mismo Postgres local que comparten ~27 worktrees, sin dejar rastro ni
 * pisar datos de otra sesión. Simula la sesión de Felipe (líder) o Micaela
 * (integrante, fija a Tienda Trujillo) con `set local request.jwt.claim.sub`,
 * exactamente como ya hace `supabase/seed.sql` — no hay JWT real, PostgREST ni
 * `@supabase/supabase-js` de por medio: se habla con Postgres directo vía
 * `docker exec ... psql`, igual que `scripts/migraciones/verificar.mjs`, para no
 * sumar una dependencia de Postgres al monorepo solo para esto.
 *
 * POR QUÉ NO ES UN `*.test.ts` DE VITEST. `pnpm test` (CI incluido, ver
 * `.github/workflows/ci.yml`) corre sobre un checkout limpio SIN Postgres ni Docker —
 * si esto viviera donde vitest lo descubre solo, CI se pondría rojo en todos los PRs
 * futuros por una razón ajena al código (misma disciplina que documenta el propio
 * `ci.yml`: "no toca base de datos"). Por eso vive en `scripts/` y se corre a mano,
 * nunca desde `pnpm test`.
 *
 * QUÉ DA POR SENTADO. Que `Tienda Lima` y las variantes `BLU-EMMA-NEG-M`/
 * `VES-SOFI-NEG-M` existen (las siembra `supabase/seed.sql`). Cada escenario deja su
 * propia sububicación de piso/almacén si faltara (se vio el 2026-09-16: este Postgres
 * compartido las tenía vacías para AMBAS tiendas — migrado de más sin un reset
 * después de 20260914230000_inventario_piso_almacen.sql) y su propia caja limpia
 * (cierra cualquiera abierta con la RPC real `cerrar_caja`, nunca con un UPDATE
 * crudo, y abre una con `abrir_caja`) — todo dentro de la misma transacción que se
 * revierte, así que tampoco esto deja rastro.
 *
 * USO
 *   pnpm pruebas:registrar-cambio    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Mismas credenciales obvias que supabase/seed.sql.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado
// que se está probando.
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
 * Deja lista una venta con UNA línea en Tienda Lima, entre BLU-EMMA-NEG-M (vieja) y
 * VES-SOFI-NEG-M (nueva) — mismo par de variantes que ya usa `supabase/seed.sql` para
 * su propio `registrar_cambio` de ejemplo.
 *
 * El precio de la línea vieja se calcula a partir del precio REAL de la variante
 * nueva (`v_new_precio - diferenciaUnitaria`), así la diferencia que produce
 * `registrar_cambio` es EXACTAMENTE `diferenciaUnitaria * cantidad`, sin importar qué
 * precios tenga el catálogo hoy — pero `registrar_venta` exige que `precio_unitario`
 * coincida con `variantes.precio` vigente (candado ADR-0048,
 * 20260914215059_candado_precio_venta.sql), así que el catálogo se ajusta primero,
 * dentro de esta misma transacción que nunca se commitea.
 *
 * Deja stock de sobra en la variante VIEJA (siempre, para que la venta que la
 * "compra" no falle) y en la NUEVA salvo que `toparStockNuevo` sea falso — el
 * escenario de "sin stock suficiente" necesita la variante nueva sin ese colchón.
 */
function fixture({ cantidad = 1, diferenciaUnitaria = 0, toparStockNuevo = true }) {
  const colchonViejo = Math.max(1000, cantidad + 10);
  return `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset

-- Autocuración: este Postgres compartido puede no tener las sububicaciones de
-- piso/almacén de esta tienda (ver cabecera) — sin esto, fn_sububicacion_por_defecto
-- devuelve NULL y todo lo de abajo revienta por una razón ajena a registrar_cambio.
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

-- Caja limpia y propia: cierra cualquiera abierta con la RPC real (nunca un UPDATE
-- crudo a estado) y abre una nueva — así ninguna aserción de caja de este archivo
-- depende de qué haya dejado abierto otra sesión o una corrida anterior.
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset

select id as v_old from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v_new, precio as v_new_precio from retail.variantes where sku = 'VES-SOFI-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_old', :'ubic', :'sub_piso', 'entrada', ${colchonViejo}, 'colchón de prueba') returning id as mov_old \\gset
select retail.fn_aplicar_movimiento(:'mov_old') as _d1 \\gset
${
  toparStockNuevo
    ? `insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_new', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov_new \\gset
select retail.fn_aplicar_movimiento(:'mov_new') as _d2 \\gset`
    : ""
}

select ((:'v_new_precio')::numeric - (${diferenciaUnitaria})::numeric) as precio_viejo \\gset
update retail.variantes set precio = :'precio_viejo' where id = :'v_old';

-- Pagada con tarjeta, NUNCA efectivo: registrar_venta exige una caja abierta, así
-- que esta venta queda ligada a la MISMA caja fresca que se acaba de abrir arriba —
-- si se pagara en efectivo, su propio monto entraría al "ventas_efectivo" de
-- cerrar_caja y contaminaría la aserción del escenario 12 (que solo quiere ver la
-- diferencia del CAMBIO, no la de la venta original).
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', ${cantidad}, 'precio_unitario', :'precio_viejo', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'precio_viejo')::numeric * ${cantidad})),
  null, gen_random_uuid()) as venta_id \\gset

select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset

select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_old' and ubicacion_id = :'ubic'),0) as stock_old_antes \\gset
select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_new' and ubicacion_id = :'ubic'),0) as stock_new_antes \\gset
`;
}

const CASOS = [];
function exito(nombre, sql, verificar) {
  CASOS.push({ nombre, tipo: "exito", sql, verificar });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}

// ---------------------------------------------------------------------------
// 1-3: la diferencia se calcula y liquida bien en los tres sentidos posibles
// ---------------------------------------------------------------------------

exito(
  "sin diferencia de precio: mueve el stock y no exige método de pago",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 0 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, null, gen_random_uuid()) as cambio_id \\gset
select
  c.diferencia,
  coalesce(c.metodo_pago_diferencia, ''),
  (select count(*) from retail.movimientos where cambio_id = c.id),
  (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_old' and ubicacion_id = :'ubic'),0) - :'stock_old_antes'),
  (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_new' and ubicacion_id = :'ubic'),0) - :'stock_new_antes')
from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ([diferencia, metodo, movs, deltaOld, deltaNew]) =>
    Number(diferencia) === 0 && metodo === "" && Number(movs) === 2 && Number(deltaOld) === 1 && Number(deltaNew) === -1
);

exito(
  "diferencia positiva: la clienta paga más y queda con el método indicado",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 20 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, 'efectivo', gen_random_uuid()) as cambio_id \\gset
select c.diferencia, c.metodo_pago_diferencia from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ([diferencia, metodo]) => Number(diferencia) === 20 && metodo === "efectivo"
);

exito(
  "diferencia negativa: se le devuelve a la clienta",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: -20 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, 'efectivo', gen_random_uuid()) as cambio_id \\gset
select c.diferencia, c.metodo_pago_diferencia from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ([diferencia, metodo]) => Number(diferencia) === -20 && metodo === "efectivo"
);

// ---------------------------------------------------------------------------
// 4-9: los candados — cada uno un estado que el negocio no puede permitir
// ---------------------------------------------------------------------------

error(
  "hay diferencia de precio pero no se indica método de pago",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 15 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, null, gen_random_uuid());
`
  ),
  "indica cómo se cobra"
);

error(
  "cantidad cero",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 0 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 0, null, gen_random_uuid());
`
  ),
  "mayor que cero"
);

error(
  "no se puede cambiar más de lo que se compró en esa línea",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 0 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 2, null, gen_random_uuid());
`
  ),
  "no puedes cambiar"
);

error(
  "la línea de venta no existe",
  comoPersona(
    FELIPE,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as v_new from retail.variantes where sku = 'VES-SOFI-NEG-M' \\gset
select retail.registrar_cambio(gen_random_uuid(), :'ubic', :'v_new', 1, null, gen_random_uuid());
`
  ),
  "línea de venta"
);

error(
  "la variante nueva no existe",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 0 })}
select retail.registrar_cambio(:'venta_item', :'ubic', gen_random_uuid(), 1, null, gen_random_uuid());
`
  ),
  "La variante"
);

error(
  "sin stock suficiente de la variante nueva",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 999999, diferenciaUnitaria: 0, toparStockNuevo: false })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 999999, null, gen_random_uuid());
`
  ),
  "Stock insuficiente"
);

// ---------------------------------------------------------------------------
// 10: el mismo candado de sede que se pidió verificar para Vender
// ---------------------------------------------------------------------------

error(
  "una colaboradora de otra sede (Micaela, fija a Trujillo) no puede cambiar en Lima",
  comoPersona(
    MICAELA,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.registrar_cambio(gen_random_uuid(), :'ubic', gen_random_uuid(), 1, null, gen_random_uuid());
`
  ),
  "No tienes permiso para hacer cambios"
);

// ---------------------------------------------------------------------------
// 11: idempotencia — el mismo doble clic que ADR-0032/0033 ya cerraron en Vender
// ---------------------------------------------------------------------------

exito(
  "el mismo token dos veces no duplica el cambio ni sus movimientos",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 0 })}
select gen_random_uuid() as token_fijo \\gset
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, null, :'token_fijo') as cambio_id_1 \\gset
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, null, :'token_fijo') as cambio_id_2 \\gset
select
  (:'cambio_id_1' = :'cambio_id_2'),
  (select count(*) from retail.cambios where venta_item_id = :'venta_item'),
  (select count(*) from retail.movimientos where cambio_id = :'cambio_id_1'::uuid);
rollback;
`
  ),
  ([mismoId, totalCambios, totalMovs]) => mismoId === "t" && Number(totalCambios) === 1 && Number(totalMovs) === 2
);

// ---------------------------------------------------------------------------
// 12: ADR-0053 — la diferencia en efectivo tiene que cuadrar el arqueo
// ---------------------------------------------------------------------------

exito(
  "la diferencia en efectivo entra a cerrar_caja con el signo correcto (ADR-0053)",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 30 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, 'efectivo', gen_random_uuid()) as cambio_id \\gset
select monto_sistema, diferencia from retail.cerrar_caja(:'caja_id', 130.00);
rollback;
`
  ),
  ([montoSistema, diferencia]) => Number(montoSistema) === 130 && Number(diferencia) === 0
);

// ---------------------------------------------------------------------------
// 13: 20260916180000 — sin caja abierta, una diferencia en efectivo se rechaza
// (antes quedaba con caja_id null, invisible para siempre en cualquier arqueo)
// ---------------------------------------------------------------------------

error(
  "sin caja abierta, no se puede cobrar/devolver una diferencia en efectivo",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 30 })}
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_de_nuevo \\gset
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, 'efectivo', gen_random_uuid());
`
  ),
  "No hay una caja abierta en esta ubicación"
);

// ---------------------------------------------------------------------------
// 14-18: 20260919000100 — motivo, estado de la prenda que vuelve (R-39) y venta
// anulada. Los 13 de arriba siguen llamando con los 6 parámetros de antes: son la
// prueba de que la pantalla vieja no se rompe contra la firma nueva.
// ---------------------------------------------------------------------------

exito(
  "con motivo, la prenda vendible vuelve al piso y el motivo queda guardado",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 0 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, null, gen_random_uuid(), 'talla_chica', 'vendible') as cambio_id \\gset
select
  c.motivo,
  c.condicion,
  (select m.sububicacion_id = :'sub_piso'::uuid from retail.movimientos m where m.cambio_id = c.id and m.tipo = 'entrada'),
  (select count(*) from retail.prendas_danadas where cambio_id = c.id)
from retail.cambios c where c.id = :'cambio_id';
rollback;
`
  ),
  ([motivo, condicion, entradaEnPiso, danadas]) =>
    motivo === "talla_chica" && condicion === "vendible" && entradaEnPiso === "t" && Number(danadas) === 0
);

exito(
  "por defecto: la fallada entra a cuarentena y sale una igual del piso",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 0 })}
select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_old' and sububicacion_id = :'sub_piso'),0) as piso_antes \\gset
select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_old' and sububicacion_id = :'sub_cuarentena'),0) as cuarentena_antes \\gset
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_old', 1, null, gen_random_uuid(), 'defecto', 'no_vendible') as cambio_id \\gset
select
  (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_old' and sububicacion_id = :'sub_piso'),0) - :'piso_antes'),
  (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_old' and sububicacion_id = :'sub_cuarentena'),0) - :'cuarentena_antes'),
  (select count(*) from retail.prendas_danadas where cambio_id = :'cambio_id' and estado = 'en_cuarentena' and cantidad = 1);
rollback;
`
  ),
  ([deltaPiso, deltaCuarentena, danadas]) => Number(deltaPiso) === -1 && Number(deltaCuarentena) === 1 && Number(danadas) === 1
);

error(
  "una prenda cambiada por defecto no puede volver al piso",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 0 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_old', 1, null, gen_random_uuid(), 'defecto', 'vendible');
`
  ),
  "no puede volver al piso"
);

error(
  "una prenda de una venta anulada no se puede cambiar (la anulación ya la devolvió al stock)",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 0 })}
update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba' where id = :'venta_id';
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, null, gen_random_uuid(), 'talla_chica', 'vendible');
`
  ),
  "está anulada"
);

error(
  "un motivo fuera de la lista se rechaza",
  comoPersona(
    FELIPE,
    `${fixture({ cantidad: 1, diferenciaUnitaria: 0 })}
select retail.registrar_cambio(:'venta_item', :'ubic', :'v_new', 1, null, gen_random_uuid(), 'no_le_gusto', 'vendible');
`
  ),
  "Motivo de cambio desconocido"
);

// ---------------------------------------------------------------------------

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
    } else {
      if (!resultado.ok) {
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
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
