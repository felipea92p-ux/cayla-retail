#!/usr/bin/env node
/**
 * Pruebas del contrato ampliado de `retail.registrar_venta` (D-56/57/62/67/85/86/87,
 * `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA
 *   1. La llamada de HOY (sin ninguno de los 5 parámetros nuevos, posicional, igual que
 *      `registrar_venta.mjs`) se comporta EXACTAMENTE igual que antes de
 *      `20260922150000_venta_asesora_emisor_descuento_lider.sql`: mismo stock, y el
 *      comprobante se sigue reservando (emisor default = 'retail', el comportamiento de hoy —
 *      ver la cabecera de esa migración, «LA OBJECIÓN»).
 *   2. `fn_asesoras_de_turno` no falla en una sede sin datos de Dynamic — ni cuando la
 *      ubicación no tiene `sede_dynamic_id` (el Taller del seed), ni cuando SÍ lo tiene pero
 *      Dynamic no está disponible (el caso de TODO Postgres local, que no tiene stub de
 *      `jornadas`/`marcajes` a propósito — ADR-0033): las dos rutas devuelven una tabla vacía,
 *      nunca un error.
 *   3. D-67: un descuento de venta por encima del tope del rol (10% por defecto para
 *      colaborador) sin `p_autorizado_por` de un líder falla con SQLSTATE 42501 — exacto, no
 *      solo el texto del mensaje.
 *   4. D-67: el mismo descuento CON `p_autorizado_por` de un líder activo pasa, y la venta
 *      queda con `descuento_pct`/`descuento_autorizado_por`/`descuento_motivo` guardados.
 *   5. Extra (mismo módulo, mismo archivo, barato de cubrir): `p_emisor = 'alegra'` NO reserva
 *      comprobante aunque venga `p_tipo_comprobante`; un `p_emisor` inválido se rechaza; un
 *      líder no tiene tope (puede aplicar cualquier descuento de venta sin autorización); y
 *      `anular_venta` libera también un comprobante que ya estaba en la cola de reintento
 *      (`pendiente_reintento`, D-60) — el hueco que documenta la cabecera de
 *      `20260922151500_comprobantes_cola_de_reintento.sql`.
 *
 * CÓMO. Mismo patrón que `registrar_venta.mjs` (léelo primero si esto no tiene sentido): cada
 * escenario en su propia transacción con ROLLBACK — nunca se commitea nada, corre seguro contra
 * el Postgres local compartido. Simula a Felipe (líder) o Micaela (colaboradora, fija a Tienda
 * Trujillo, tope de descuento 10% por defecto) con `set local request.jwt.claim.sub`.
 *
 * TODA LLAMADA A `registrar_venta` QUE PASA UN PARÁMETRO NUEVO USA NOTACIÓN CON NOMBRE
 * (`p_x => valor`), nunca posicional: la firma tiene 16 parámetros y un `null` de relleno en la
 * posición de `p_emisor` (13) insertaría NULL en una columna `not null` — un error de conteo
 * fácil y silencioso. Con nombre, el orden no importa y un parámetro que no se menciona
 * simplemente toma su DEFAULT.
 *
 * USO
 *   pnpm pruebas:venta-contrato-ampliado   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Mismas credenciales obvias que supabase/seed.sql y registrar_venta.mjs.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo, tope 10%

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba.
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

/** `pg_temp.intento(sql)`: SQLSTATE|mensaje del error, o SIN_ERROR — para verificar 42501 exacto
 *  y no solo el texto (mismo helper que `candado_lider_caja_y_ajuste.mjs`). */
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
`;

/** Sede con piso/almacén, caja abierta y stock de sobra de BLU-EMMA-NEG-M (precio 79.90, costo
 *  32.00 en el seed) — igual que `registrar_venta.mjs`. Deja `:ubic`, `:v1`, `:v1_precio`,
 *  `:stock_v1_antes`, `:comprobantes_antes`. */
function fixture({ ubicacionNombre = "Tienda Lima", colchon = 1000 } = {}) {
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

select id as v1, precio as v1_precio, costo as v1_costo from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', ${colchon}, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset

select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic'),0) as stock_v1_antes \\gset
select count(*) as comprobantes_antes from retail.comprobantes where ubicacion_id = :'ubic' \\gset
`;
}

/** Un carrito de 1 unidad de BLU-EMMA-NEG-M al precio de catálogo, sin descuento por línea. */
const CARRITO_1 =
  "jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0))";
const PAGO_EXACTO = "jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :'v1_precio'))";

const CASOS = [];
function exito(nombre, sql, verificar) {
  CASOS.push({ nombre, tipo: "exito", sql, verificar });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}

// ---------------------------------------------------------------------------
// 1: la llamada de hoy (posicional, sin ningún parámetro nuevo) se comporta exactamente igual
// ---------------------------------------------------------------------------

exito(
  "sin ninguno de los 5 parámetros nuevos (llamada posicional, igual que hoy): mismo stock movido, mismo comprobante reservado",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic', ${CARRITO_1}, ${PAGO_EXACTO}, null, gen_random_uuid(), 'boleta') as venta_id \\gset
select
  (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic'),0) - :'stock_v1_antes'),
  (select emisor from retail.ventas where id = :'venta_id'),
  (select descuento_pct from retail.ventas where id = :'venta_id'),
  (select asesora_id from retail.ventas where id = :'venta_id') is null,
  ((select count(*) from retail.comprobantes where ubicacion_id = :'ubic') - :'comprobantes_antes');
rollback;
`
  ),
  ([deltaStock, emisor, descuentoPct, asesoraNula, deltaComprobantes]) =>
    Number(deltaStock) === -1 &&
    emisor === "retail" &&
    Number(descuentoPct) === 0 &&
    asesoraNula === "t" &&
    Number(deltaComprobantes) === 1
);

// ---------------------------------------------------------------------------
// 2: fn_asesoras_de_turno nunca falla — ni sin enlace a Dynamic, ni sin las tablas de Dynamic
// ---------------------------------------------------------------------------

exito(
  "fn_asesoras_de_turno: el Taller (sin sede_dynamic_id en el seed) da tabla vacía, no error",
  comoPersona(
    FELIPE,
    `select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select coalesce((select sede_dynamic_id::text from retail.ubicaciones where id = :'taller'), 'NULL') as debe_ser_null \\gset
select :'debe_ser_null', count(*) from retail.fn_asesoras_de_turno(:'taller');
rollback;
`
  ),
  ([debeSerNull, filas]) => debeSerNull === "NULL" && Number(filas) === 0
);

exito(
  "fn_asesoras_de_turno: Tienda Lima (SÍ enlazada a Dynamic) tampoco falla sin las tablas de Dynamic (local no las tiene — ADR-0033)",
  comoPersona(
    FELIPE,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select count(*) from retail.fn_asesoras_de_turno(:'ubic');
rollback;
`
  ),
  ([filas]) => Number(filas) === 0
);

error(
  "fn_asesoras_de_turno: el candado de ubicación sigue vigente (Micaela no puede consultar Lima)",
  comoPersona(
    MICAELA,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select * from retail.fn_asesoras_de_turno(:'ubic');
`
  ),
  "No tienes permiso para consultar el turno de esa ubicación"
);

// ---------------------------------------------------------------------------
// 3-4: D-67 — tope de descuento de venta y autorización de un líder (todo por nombre)
// ---------------------------------------------------------------------------

exito(
  "D-67: colaboradora, descuento de venta DENTRO de su tope (10%) — sin autorización, pasa",
  comoPersona(
    MICAELA,
    `${fixture({ ubicacionNombre: "Tienda Trujillo" })}
select retail.registrar_venta(
  p_ubicacion_id => :'ubic', p_items => ${CARRITO_1}, p_pagos => ${PAGO_EXACTO},
  p_token => gen_random_uuid(), p_descuento_pct => 10
) as venta_id \\gset
select descuento_pct, descuento_autorizado_por is null from retail.ventas where id = :'venta_id';
rollback;
`
  ),
  ([descuentoPct, sinAutorizar]) => Number(descuentoPct) === 10 && sinAutorizar === "t"
);

exito(
  "D-67: colaboradora, descuento de venta SOBRE su tope (15% > 10%) sin autorización de líder → 42501",
  comoPersona(
    MICAELA,
    `${INTENTO}
${fixture({ ubicacionNombre: "Tienda Trujillo" })}
select pg_temp.intento(format(
  'select retail.registrar_venta(p_ubicacion_id => %L, p_items => %L::jsonb, p_pagos => %L::jsonb, p_token => gen_random_uuid(), p_descuento_pct => 15)',
  :'ubic', (${CARRITO_1})::text, (${PAGO_EXACTO})::text
)) as r \\gset
select split_part(:'r', '|', 1);
rollback;
`
  ),
  ([sqlstate]) => sqlstate === "42501"
);

exito(
  "D-67: mismo 15% CON autorización de un líder real (Felipe) → pasa, y queda auditado",
  comoPersona(
    MICAELA,
    `${fixture({ ubicacionNombre: "Tienda Trujillo" })}
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select retail.registrar_venta(
  p_ubicacion_id => :'ubic', p_items => ${CARRITO_1}, p_pagos => ${PAGO_EXACTO},
  p_token => gen_random_uuid(), p_descuento_pct => 15, p_autorizado_por => :'persona_felipe',
  p_motivo_descuento => 'Clienta frecuente, autorizado por el líder de turno'
) as venta_id \\gset
select descuento_pct, descuento_autorizado_por = :'persona_felipe'::uuid, descuento_motivo from retail.ventas where id = :'venta_id';
rollback;
`
  ),
  ([descuentoPct, autorizadoOk, motivo]) =>
    Number(descuentoPct) === 15 && autorizadoOk === "t" && motivo === "Clienta frecuente, autorizado por el líder de turno"
);

exito(
  "D-67: 15% con un p_autorizado_por que NO es líder (la propia Micaela) → sigue en 42501",
  comoPersona(
    MICAELA,
    `${INTENTO}
${fixture({ ubicacionNombre: "Tienda Trujillo" })}
select id as persona_micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select pg_temp.intento(format(
  'select retail.registrar_venta(p_ubicacion_id => %L, p_items => %L::jsonb, p_pagos => %L::jsonb, p_token => gen_random_uuid(), p_descuento_pct => 15, p_autorizado_por => %L, p_motivo_descuento => %L)',
  :'ubic', (${CARRITO_1})::text, (${PAGO_EXACTO})::text, :'persona_micaela', 'Se autoriza a sí misma'
)) as r \\gset
select split_part(:'r', '|', 1);
rollback;
`
  ),
  ([sqlstate]) => sqlstate === "42501"
);

exito(
  "D-67: un líder no tiene tope — aplica 40% de descuento de venta sin ninguna autorización",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(
  p_ubicacion_id => :'ubic', p_items => ${CARRITO_1}, p_pagos => ${PAGO_EXACTO},
  p_token => gen_random_uuid(), p_descuento_pct => 40
) as venta_id \\gset
select descuento_pct from retail.ventas where id = :'venta_id';
rollback;
`
  ),
  ([descuentoPct]) => Number(descuentoPct) === 40
);

error(
  "un p_descuento_pct fuera de 0-100 se rechaza antes de mirar el catálogo (carrito con un ítem cualquiera)",
  comoPersona(
    FELIPE,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.registrar_venta(
  p_ubicacion_id => :'ubic',
  p_items => '[{"variante_id":"00000000-0000-0000-0000-000000000000"}]'::jsonb,
  p_pagos => '[{"metodo":"tarjeta","monto":1}]'::jsonb,
  p_descuento_pct => 150
);
`
  ),
  "debe estar entre 0"
);

// ---------------------------------------------------------------------------
// 5: D-56/57 — emisor, y D-60 — anular_venta libera también un pendiente_reintento
// ---------------------------------------------------------------------------

exito(
  "D-56: p_emisor = 'alegra' NO reserva comprobante aunque venga p_tipo_comprobante",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(
  p_ubicacion_id => :'ubic', p_items => ${CARRITO_1}, p_pagos => ${PAGO_EXACTO},
  p_token => gen_random_uuid(), p_tipo_comprobante => 'boleta', p_emisor => 'alegra'
) as venta_id \\gset
select
  (select emisor from retail.ventas where id = :'venta_id'),
  ((select count(*) from retail.comprobantes where ubicacion_id = :'ubic') - :'comprobantes_antes');
rollback;
`
  ),
  ([emisor, deltaComprobantes]) => emisor === "alegra" && Number(deltaComprobantes) === 0
);

error(
  "un p_emisor que no es alegra ni retail se rechaza (carrito con un ítem cualquiera)",
  comoPersona(
    FELIPE,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.registrar_venta(
  p_ubicacion_id => :'ubic',
  p_items => '[{"variante_id":"00000000-0000-0000-0000-000000000000"}]'::jsonb,
  p_pagos => '[{"metodo":"tarjeta","monto":1}]'::jsonb,
  p_emisor => 'shopify'
);
`
  ),
  'p_emisor solo puede ser "alegra" o "retail"'
);

exito(
  "D-60: anular_venta libera también un comprobante que ya estaba en la cola de reintento (pendiente_reintento)",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic', ${CARRITO_1}, ${PAGO_EXACTO}, null, gen_random_uuid(), 'boleta') as venta_id \\gset
select id as venta_item from retail.venta_items where venta_id = :'venta_id' \\gset
select id as comp from retail.comprobantes where venta_id = :'venta_id' \\gset
select retail.fn_marcar_reintento_transmision(:'comp', 'timeout de red simulado') as _m \\gset
select estado as estado_tras_marcar from retail.comprobantes where id = :'comp' \\gset
select retail.anular_venta(:'venta_id', 'prueba automatizada',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'venta_item', 'condicion', 'vendible'))) as _a \\gset
select :'estado_tras_marcar', estado, (motivo_no_emitido like 'Venta anulada:%') from retail.comprobantes where id = :'comp';
rollback;
`
  ),
  ([estadoTrasMarcar, estadoTrasAnular, motivoOk]) =>
    estadoTrasMarcar === "pendiente_reintento" && estadoTrasAnular === "no_emitido" && motivoOk === "t"
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
