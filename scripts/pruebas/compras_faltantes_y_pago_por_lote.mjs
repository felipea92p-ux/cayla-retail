#!/usr/bin/env node
/**
 * Pruebas de Compras: pago por lote (D3) y faltantes con nota de crédito (D2) contra
 * el Postgres local — CAYLA V2, ADR-0111.
 *
 * QUÉ PRUEBA. Las RPC nuevas y lo que cambiaron en lo existente, con dinero de por
 * medio (por eso hay pruebas antes de que esto llegue a producción):
 *   · `registrar_pago_compras`        — una transferencia, varios comprobantes del mismo
 *                                       proveedor, todo o nada, idempotente por token.
 *   · `cerrar_linea_compra`           — «estas N no van a llegar», con o sin nota de crédito.
 *   · `registrar_nota_credito_compra` — la nota suelta; baja el saldo exactamente su monto.
 *   · `recibir_compras`               — el tope por línea ahora descuenta lo cerrado.
 *   · la foto de `compras` (saldo, estado_pago, estado_recepcion, atrasada) y las vistas.
 *   · las tablas append-only (`compra_item_cierres`, `compra_notas_credito`) y su RLS.
 *   · el día de corte en Lima (`fn_hoy_lima()`) en `vencida` y `listar_compras`.
 *
 * CÓMO. Mismo patrón que `registrar_venta.mjs` (léelo primero si esto no tiene sentido):
 * cada escenario corre en su propia transacción con ROLLBACK — nunca se commitea nada,
 * corre seguro contra el Postgres local que comparten ~20 worktrees. Simula a Felipe
 * (líder, cualquier sede) y a Micaela (integrante, fija a Tienda Trujillo) con
 * `set local request.jwt.claim.sub`, sin JWT real: habla con Postgres directo vía
 * `docker exec ... psql`.
 *
 * DATOS. Usa del seed solo lo estable: los proveedores `Textiles Andina SAC` y
 * `Confecciones del Sur EIRL`, las ubicaciones `Taller` y `Tienda Trujillo` y la
 * variante `BLU-EMMA-NEG-M`. Los comprobantes de cada escenario (serie `TST`) se crean
 * DENTRO de la transacción con la RPC real `registrar_compra` — no dependen de las
 * facturas del seed ni dejan rastro.
 *
 * POR QUÉ NO ES UN `*.test.ts` DE VITEST. `pnpm test` corre sobre un checkout limpio
 * sin Postgres ni Docker; por eso vive en `scripts/` y se corre a mano (mismo criterio
 * que `registrar_venta.mjs`).
 *
 * USO
 *   pnpm pruebas:compras-faltantes   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
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

const comoPersona = (authUserId, sql) => `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;

/** Proveedores, ubicaciones y la variante del seed. */
const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as prov2 from retail.proveedores where nombre = 'Confecciones del Sur EIRL' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

/**
 * Crea un comprobante a crédito con la RPC real. Por defecto: factura de 24 u × S/ 50 + IGV 18 %
 * = S/ 1,416.00 (subtotal 1,200 + IGV 216), emitida hoy (Lima) y vence en 10 días.
 * Deja `:v` (el comprobante), `:v_item` (la línea más grande) y `:v_item2` (la segunda, si hay).
 */
function compra(v, { prov = "prov1", destino = "taller", lineas = [24], costo = 50, tipo = "factura", igv = 18, emision = "retail.fn_hoy_lima()", vence = "retail.fn_hoy_lima() + 10" } = {}) {
  const items = lineas
    .map((c) => `jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${c}, 'costo_unitario', ${costo})`)
    .join(", ");
  return `
select retail.registrar_compra(:'${prov}', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'${destino}',
  jsonb_build_array(${items}),
  p_tipo => '${tipo}', p_fecha_emision => ${emision}, p_fecha_vencimiento => ${vence}, p_igv_porcentaje => ${igv}) as ${v} \\gset
select (array_agg(id order by cantidad desc))[1] as ${v}_item, (array_agg(id order by cantidad desc))[2] as ${v}_item2
  from retail.compra_items where compra_id = :'${v}' \\gset
`;
}

/** Recibe `cantidad` unidades de una línea, en el Taller, como Felipe. */
const recibe = (linea, cantidad) => `
select retail.recibir_compras(:'taller', jsonb_build_array(jsonb_build_object('compra_item_id', :'${linea}', 'variante_id', :'var', 'cantidad', ${cantidad}))) as _lote \\gset
`;

/** Aplicación de pago para el arreglo `p_aplicaciones`. */
const aplic = (v, monto) => `jsonb_build_object('compra_id', :'${v}', 'monto', ${monto})`;

const CASOS = [];
function exito(nombre, sql, esperado) {
  CASOS.push({ nombre, tipo: "exito", sql, esperado });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}

// ===========================================================================
// D3 — PAGO POR LOTE
// ===========================================================================

exito(
  "pago por lote feliz: 2 comprobantes, un solo grupo, saldo 0 y estado pagada en ambos",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_pago_compras(:'prov1', 'transferencia',
  jsonb_build_array(${aplic("c1", "1416.00")}, ${aplic("c2", "1416.00")}), 'OP-0001', null, gen_random_uuid()) as g \\gset
select
  (select count(*) from retail.compra_pagos where pago_grupo_id = :'g'),
  (select sum(monto) from retail.compra_pagos where pago_grupo_id = :'g'),
  (select count(distinct compra_id) from retail.compra_pagos where pago_grupo_id = :'g'),
  (select count(*) from retail.compras where id in (:'c1', :'c2') and estado_pago = 'pagada' and saldo = 0),
  (select bool_and(fecha = retail.fn_hoy_lima() and metodo = 'transferencia' and referencia = 'OP-0001') from retail.compra_pagos where pago_grupo_id = :'g');
rollback;
`
  ),
  ["2", "2832.00", "2", "2", "t"]
);

exito(
  "pago por lote parcial: cada comprobante baja solo lo aplicado y queda parcial",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_pago_compras(:'prov1', 'yape',
  jsonb_build_array(${aplic("c1", "100.00")}, ${aplic("c2", "50.50")})) as g \\gset
select
  (select saldo from retail.compras where id = :'c1'),
  (select saldo from retail.compras where id = :'c2'),
  (select count(*) from retail.compras where id in (:'c1', :'c2') and estado_pago = 'parcial'),
  (select count(*) from retail.compra_pagos where pago_grupo_id = :'g');
rollback;
`
  ),
  ["1316.00", "1365.50", "2", "2"]
);

exito(
  "el pago individual de siempre no cambia: sin grupo (pago_grupo_id nulo)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 200.00, 'efectivo') as p \\gset
select (select pago_grupo_id is null from retail.compra_pagos where id = :'p'), (select saldo from retail.compras where id = :'c1');
rollback;
`
  ),
  ["t", "1216.00"]
);

error(
  "mismo proveedor obligatorio: un comprobante de otro proveedor se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2", { prov: "prov2" })}
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c1", "100")}, ${aplic("c2", "100")}));
`
  ),
  "comprobantes de un solo proveedor"
);

error(
  "monto mayor al saldo se rechaza (todo o nada: el otro comprobante tampoco se paga)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c1", "100")}, ${aplic("c2", "1416.01")}));
`
  ),
  "supera su saldo pendiente"
);

exito(
  "todo o nada: tras un rechazo por saldo, ningún comprobante quedó pagado",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
savepoint antes;
\\set ON_ERROR_STOP off
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c1", "100")}, ${aplic("c2", "1416.01")}));
\\set ON_ERROR_STOP on
rollback to savepoint antes;
select (select count(*) from retail.compra_pagos where compra_id in (:'c1', :'c2')), (select sum(pagado) from retail.compras where id in (:'c1', :'c2'));
rollback;
`
  ),
  ["0", "0.00"]
);

exito(
  "idempotencia por token: reintentar el mismo pago (que ya dejó saldo 0) devuelve el mismo grupo y no paga dos veces",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select gen_random_uuid() as tk \\gset
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c1", "1416.00")}), 'OP-9', null, :'tk') as g1 \\gset
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c1", "1416.00")}), 'OP-9', null, :'tk') as g2 \\gset
select (:'g1' = :'g2'), (:'g1' = :'tk'), (select count(*) from retail.compra_pagos where compra_id = :'c1'), (select pagado from retail.compras where id = :'c1');
rollback;
`
  ),
  ["t", "t", "1", "1416.00"]
);

exito(
  "sin token, dos llamadas iguales son dos pagos distintos (grupos distintos) — el token es la idempotencia",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compras(:'prov1', 'efectivo', jsonb_build_array(${aplic("c1", "100")})) as g1 \\gset
select retail.registrar_pago_compras(:'prov1', 'efectivo', jsonb_build_array(${aplic("c1", "100")})) as g2 \\gset
select (:'g1' <> :'g2'), (select pagado from retail.compras where id = :'c1');
rollback;
`
  ),
  ["t", "200.00"]
);

error(
  "el mismo comprobante dos veces en un pago se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c1", "100")}, ${aplic("c1", "100")}));
`
  ),
  "aparece más de una vez"
);

error(
  "un pago sin comprobantes se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}select retail.registrar_pago_compras(:'prov1', 'transferencia', '[]'::jsonb);`
  ),
  "al menos un comprobante"
);

error(
  "medio de pago desconocido se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compras(:'prov1', 'bitcoin', jsonb_build_array(${aplic("c1", "100")}));
`
  ),
  "Medio de pago no reconocido"
);

error(
  "montos con más de 2 decimales se rechazan (no se redondean en silencio)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c1", "10.005")}));
`
  ),
  "como máximo 2 decimales"
);

error(
  "colaborador (Micaela, integrante) no puede registrar un pago por lote",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
${cambiaA(MICAELA)}select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c1", "100")}));
`
  ),
  "No tienes permiso para registrar pagos a proveedores"
);

error(
  "comprobante anulado no acepta pago por lote",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.anular_compra(:'c1', 'prueba');
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c1", "100")}));
`
  ),
  "está anulado, no acepta pagos"
);

error(
  "comprobante sin saldo no acepta pago por lote",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1416.00, 'efectivo') as _p \\gset
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c1", "1")}));
`
  ),
  "no tiene saldo pendiente"
);

exito(
  "la fecha por defecto del pago es la de Lima (fn_hoy_lima), no current_date",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compras(:'prov1', 'efectivo', jsonb_build_array(${aplic("c1", "10")})) as g \\gset
select (select fecha from retail.compra_pagos where pago_grupo_id = :'g') = (now() at time zone 'America/Lima')::date;
rollback;
`
  ),
  ["t"]
);

// ===========================================================================
// D2 — CERRAR LÍNEA (sin nota)
// ===========================================================================

exito(
  "cierre sin nota: parcial atrasada -> recibida, atrasada baja, pendiente 0, saldo intacto",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { emision: "retail.fn_hoy_lima() - 30", vence: "retail.fn_hoy_lima() + 10" })}
${recibe("c1_item", 20)}
select estado_recepcion as antes_estado, recepcion_atrasada as antes_atrasada from retail.compras_resumen where id = :'c1' \\gset
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego', 'no mandaron el resto') as r \\gset
select :'antes_estado', :'antes_atrasada',
  r.estado_recepcion, r.recepcion_atrasada, r.cerrado_cantidad, r.saldo,
  (select pendiente from retail.compra_items_resumen where id = :'c1_item'),
  (select cerrado from retail.compra_items_resumen where id = :'c1_item'),
  (select count(*) = 0 from retail.compra_notas_credito where compra_id = :'c1'),
  :'r'::uuid = (select id from retail.compra_item_cierres where compra_item_id = :'c1_item')
from retail.compras_resumen r where r.id = :'c1';
rollback;
`
  ),
  ["parcial", "t", "recibida", "f", "4", "1416.00", "0", "4", "t", "t"]
);

exito(
  "dos líneas: cerrar solo una deja el comprobante pendiente y atrasado por la otra",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [24, 10], emision: "retail.fn_hoy_lima() - 30" })}
select retail.cerrar_linea_compra(:'c1_item2', 10, 'error_proveedor') as _r \\gset
select r.estado_recepcion, r.recepcion_atrasada, r.cerrado_cantidad,
  (select pendiente from retail.compra_items_resumen where id = :'c1_item'),
  (select pendiente from retail.compra_items_resumen where id = :'c1_item2')
from retail.compras_resumen r where r.id = :'c1';
rollback;
`
  ),
  ["sin_recibir", "t", "10", "24", "0"]
);

exito(
  "dos líneas: una recibida completa + la otra cerrada = comprobante recibida",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [24, 10] })}
${recibe("c1_item", 24)}
select estado_recepcion as antes from retail.compras where id = :'c1' \\gset
select retail.cerrar_linea_compra(:'c1_item2', 10, 'danada') as _r \\gset
select :'antes', estado_recepcion, recibido_cantidad, cerrado_cantidad, facturado_cantidad from retail.compras where id = :'c1';
rollback;
`
  ),
  ["parcial", "recibida", "24", "10", "34"]
);

exito(
  "cerrar la línea entera sin recibir nada: recibida con recibido 0 (resuelta, no entregada)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.cerrar_linea_compra(:'c1_item', 24, 'no_llego') as _r \\gset
select estado_recepcion, recibido_cantidad, cerrado_cantidad, saldo from retail.compras where id = :'c1';
rollback;
`
  ),
  ["recibida", "0", "24", "1416.00"]
);

error(
  "cerrar más que el pendiente se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
${recibe("c1_item", 20)}
select retail.cerrar_linea_compra(:'c1_item', 5, 'no_llego');
`
  ),
  "La línea tiene 4 unidades pendientes: no se pueden cerrar 5"
);

error(
  "cerrar una línea sin pendiente se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
${recibe("c1_item", 24)}
select retail.cerrar_linea_compra(:'c1_item', 1, 'no_llego');
`
  ),
  "La línea ya no tiene unidades pendientes"
);

error(
  "no se puede cerrar dos veces lo mismo (el segundo cierre ve el pendiente ya descontado)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.cerrar_linea_compra(:'c1_item', 20, 'no_llego') as _r \\gset
select retail.cerrar_linea_compra(:'c1_item', 5, 'no_llego');
`
  ),
  "La línea tiene 4 unidades pendientes: no se pueden cerrar 5"
);

error(
  "motivo de cierre desconocido se rechaza",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nselect retail.cerrar_linea_compra(:'c1_item', 1, 'porque si');`),
  "Motivo de cierre no reconocido"
);

error(
  "cantidad de cierre cero se rechaza",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nselect retail.cerrar_linea_compra(:'c1_item', 0, 'no_llego');`),
  "La cantidad a cerrar debe ser mayor a cero"
);

// ===========================================================================
// D2 — CERRAR CON NOTA DE CRÉDITO
// ===========================================================================

exito(
  "cierre + nota por faltante: el saldo baja EXACTAMENTE el monto y el IGV queda desglosado (200 + 36)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
${recibe("c1_item", 20)}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as cierre \\gset
select retail.registrar_nota_credito_compra(:'c1', 'fc01-000018', retail.fn_hoy_lima(), 236.00, 'faltante', null, :'cierre') as nc \\gset
select c.saldo, c.notas_credito, c.estado_pago, c.estado_recepcion,
  n.subtotal, n.igv, n.monto, n.aplicado, n.serie_numero, n.motivo,
  n.cierre_id = :'cierre',
  (select count(*) from retail.proveedor_creditos where proveedor_id = c.proveedor_id)
from retail.compras c join retail.compra_notas_credito n on n.compra_id = c.id where c.id = :'c1';
rollback;
`
  ),
  ["1180.00", "236.00", "pendiente", "recibida", "200.00", "36.00", "236.00", "236.00", "FC01-000018", "faltante", "t", "0"]
);

exito(
  "la nota y el cierre salen en las vistas: compras_resumen y listar_compras traen notas_credito y cerrado_cantidad",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
${recibe("c1_item", 20)}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _r \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-000019', retail.fn_hoy_lima(), 236.00, 'faltante') as _n \\gset
select (select notas_credito from retail.compras_resumen where id = :'c1'),
  (select cerrado_cantidad from retail.compras_resumen where id = :'c1'),
  (select notas_credito from retail.listar_compras(p_limite => 200) where id = :'c1'),
  (select saldo from retail.listar_compras(p_limite => 200) where id = :'c1');
rollback;
`
  ),
  ["236.00", "4", "236.00", "1180.00"]
);

error(
  "nota de crédito que sumaría más que el comprobante se rechaza (no se acredita más de lo facturado)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-1', retail.fn_hoy_lima(), 1416.01, 'descuento');
`
  ),
  "más que el comprobante"
);

exito(
  "una nota mayor al saldo NO se rechaza: baja la deuda hasta 0 y lo que sobra queda a favor (pagado 1000 + nota 416.01)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1000.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-1', retail.fn_hoy_lima(), 416.01, 'descuento') as nc \\gset
select c.saldo, c.notas_credito, n.aplicado, n.monto, retail.fn_saldo_favor_proveedor(c.proveedor_id)
from retail.compras c join retail.compra_notas_credito n on n.id = :'nc' where c.id = :'c1';
rollback;
`
  ),
  ["0.00", "416.00", "416.00", "416.01", "0.01"]
);

exito(
  "pagado 1000 + nota 416 = pagada, saldo 0; un pago posterior ya no cabe y la vencida se apaga",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { emision: "retail.fn_hoy_lima() - 40", vence: "retail.fn_hoy_lima() - 5" })}
select vencida as antes_vencida from retail.compras_resumen where id = :'c1' \\gset
select retail.registrar_pago_compra(:'c1', 1000.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-2', retail.fn_hoy_lima(), 416.00, 'descuento', 'descuento por volumen') as _n \\gset
select :'antes_vencida', saldo, estado_pago, vencida, pagado, notas_credito from retail.compras_resumen where id = :'c1';
rollback;
`
  ),
  ["t", "0.00", "pagada", "f", "1000.00", "416.00"]
);

exito(
  "estado_pago: solo nota = pendiente con menos saldo; pago + nota parcial = parcial",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-3', retail.fn_hoy_lima(), 100.00, 'otro') as _n \\gset
select estado_pago as solo_nota, saldo as saldo1 from retail.compras where id = :'c1' \\gset
select retail.registrar_pago_compra(:'c1', 100.00, 'efectivo') as _p \\gset
select :'solo_nota', :'saldo1', estado_pago, saldo from retail.compras where id = :'c1';
rollback;
`
  ),
  ["pendiente", "1316.00", "parcial", "1216.00"]
);

error(
  "después de una nota, el pago por lote respeta el saldo nuevo (1416 - 100 = 1316)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-4', retail.fn_hoy_lima(), 100.00, 'otro') as _n \\gset
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c1", "1316.01")}));
`
  ),
  "supera su saldo pendiente (S/ 1316.00)"
);

exito(
  "nota posterior atada al cierre (p_cierre_id): la nota queda ligada a ese cierre",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
${recibe("c1_item", 20)}
select retail.cerrar_linea_compra(:'c1_item', 4, 'danada') as cierre \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-5', retail.fn_hoy_lima(), 236.00, 'faltante', null, :'cierre') as nc \\gset
select (select cierre_id = :'cierre' from retail.compra_notas_credito where id = :'nc'), saldo from retail.compras where id = :'c1';
rollback;
`
  ),
  ["t", "1180.00"]
);

error(
  "p_cierre_id de OTRO comprobante se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.cerrar_linea_compra(:'c2_item', 4, 'danada') as cierre_otro \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-6', retail.fn_hoy_lima(), 100.00, 'faltante', null, :'cierre_otro');
`
  ),
  "no pertenece a este comprobante"
);

exito(
  "IGV proporcional: una boleta (sin IGV) da nota con IGV 0 y subtotal = monto",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { tipo: "boleta", igv: 0 })}
select retail.registrar_nota_credito_compra(:'c1', 'BC01-1', retail.fn_hoy_lima(), 100.00, 'otro') as nc \\gset
select subtotal, igv, monto from retail.compra_notas_credito where id = :'nc';
rollback;
`
  ),
  ["100.00", "0.00", "100.00"]
);

exito(
  "IGV proporcional: una nota por el total devuelve exactamente el IGV del comprobante (216)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-7', retail.fn_hoy_lima(), 1416.00, 'devolucion') as nc \\gset
select subtotal, igv, monto, (select saldo from retail.compras where id = :'c1'), (select estado_pago from retail.compras where id = :'c1')
from retail.compra_notas_credito where id = :'nc';
rollback;
`
  ),
  ["1200.00", "216.00", "1416.00", "0.00", "pagada"]
);

exito(
  "IGV proporcional: dos notas de 708 suman 216 de IGV, nunca más que el comprobante",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-8', retail.fn_hoy_lima(), 708.00, 'descuento') as _a \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-9', retail.fn_hoy_lima(), 708.00, 'descuento') as _b \\gset
select sum(igv), sum(subtotal), sum(monto), (select igv from retail.compras where id = :'c1')
from retail.compra_notas_credito where compra_id = :'c1';
rollback;
`
  ),
  ["216.00", "1200.00", "1416.00", "216.00"]
);

error(
  "la misma serie-número no se registra dos veces en el mismo comprobante",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-10', retail.fn_hoy_lima(), 10.00, 'otro') as _a \\gset
select retail.registrar_nota_credito_compra(:'c1', ' fc01-10 ', retail.fn_hoy_lima(), 10.00, 'otro');
`
  ),
  "ya está registrada en el comprobante"
);

error(
  "nota de crédito con fecha anterior al comprobante se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { emision: "retail.fn_hoy_lima() - 10" })}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-11', retail.fn_hoy_lima() - 11, 10.00, 'otro');
`
  ),
  "no puede ser anterior al comprobante"
);

error(
  "nota de crédito con fecha futura se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-12', retail.fn_hoy_lima() + 1, 10.00, 'otro');
`
  ),
  "no puede ser futura"
);

error(
  "nota de crédito con monto cero se rechaza",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nselect retail.registrar_nota_credito_compra(:'c1', 'FC01-13', retail.fn_hoy_lima(), 0, 'otro');`),
  "monto mayor a cero"
);

error(
  "nota de crédito sin serie-número se rechaza",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nselect retail.registrar_nota_credito_compra(:'c1', '  ', retail.fn_hoy_lima(), 10, 'otro');`),
  "necesita su serie y número"
);

error(
  "nota de crédito con motivo desconocido se rechaza",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nselect retail.registrar_nota_credito_compra(:'c1', 'FC01-14', retail.fn_hoy_lima(), 10, 'porque si');`),
  "Motivo de nota de crédito no reconocido"
);

exito(
  "comprobante ya pagado por completo: se puede cerrar sin nota, pero la nota se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1416.00, 'transferencia') as _p \\gset
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as r \\gset
select cerrado_cantidad, saldo, estado_pago from retail.compras where id = :'c1';
rollback;
`
  ),
  ["4", "0.00", "pagada"]
);

// ===========================================================================
// D2 — recibir_compras respeta el nuevo tope
// ===========================================================================

error(
  "recibir_compras: tras cerrar 4 de 24, recibir 21 se rechaza (tope = cantidad - recibido - cerrado)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _r \\gset
select retail.recibir_compras(:'taller', jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'variante_id', :'var', 'cantidad', 21)));
`
  ),
  "4 cerrados sin llegar"
);

exito(
  "recibir_compras: tras cerrar 4 de 24, recibir las 20 restantes cabe y el comprobante queda recibida",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _r \\gset
${recibe("c1_item", 20)}
select estado_recepcion, recibido_cantidad, cerrado_cantidad from retail.compras where id = :'c1';
rollback;
`
  ),
  ["recibida", "20", "4"]
);

error(
  "recibir_compras: recibir ya sin cupo (todo recibido + cerrado) se rechaza con el mensaje de siempre si no hay cierres",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
${recibe("c1_item", 24)}
select retail.recibir_compras(:'taller', jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'variante_id', :'var', 'cantidad', 1)));
`
  ),
  "la línea tiene 24 facturados, 24 ya recibidos y se intenta recibir 1 más"
);

// ===========================================================================
// COMPROBANTE ANULADO RECHAZA TODO
// ===========================================================================

error(
  "comprobante anulado: cerrar línea se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.anular_compra(:'c1', 'prueba');
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego');
`
  ),
  "está anulado, no acepta cierres"
);

error(
  "comprobante anulado: registrar nota de crédito se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.anular_compra(:'c1', 'prueba');
select retail.registrar_nota_credito_compra(:'c1', 'FC01-20', retail.fn_hoy_lima(), 10, 'otro');
`
  ),
  "está anulado, no acepta notas de crédito"
);

error(
  "comprobante anulado: recibir mercadería se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.anular_compra(:'c1', 'prueba');
${recibe("c1_item", 1)}
`
  ),
  "está anulada"
);

error(
  "anular un comprobante con nota de crédito se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-21', retail.fn_hoy_lima(), 10, 'otro') as _n \\gset
select retail.anular_compra(:'c1', 'prueba');
`
  ),
  "notas de crédito registradas: no se puede anular"
);

error(
  "anular un comprobante con líneas cerradas se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _r \\gset
select retail.anular_compra(:'c1', 'prueba');
`
  ),
  "líneas cerradas por faltante: no se puede anular"
);

// ===========================================================================
// QUIÉN PUEDE QUÉ
// ===========================================================================

exito(
  "integrante (Micaela) SÍ puede cerrar una línea sin nota en un comprobante de su sede (Trujillo)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { destino: "trujillo" })}
${cambiaA(MICAELA)}select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego', 'no vino en la caja') as _r \\gset
select cerrado_cantidad, estado_recepcion, saldo from retail.compras where id = :'c1';
rollback;
`
  ),
  ["4", "sin_recibir", "1416.00"]
);

error(
  "integrante (Micaela) NO puede registrar una nota de crédito (dinero: solo líder), aunque sea su sede",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { destino: "trujillo" })}
${cambiaA(MICAELA)}select retail.registrar_nota_credito_compra(:'c1', 'FC01-30', retail.fn_hoy_lima(), 236.00, 'descuento');
`
  ),
  "No tienes permiso para registrar notas de crédito de proveedores"
);

error(
  "integrante (Micaela) NO puede cerrar una línea de un comprobante de otra sede (Taller)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { destino: "taller" })}
${cambiaA(MICAELA)}select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego');
`
  ),
  "No tienes permiso para cerrar líneas de este comprobante"
);

error(
  "integrante (Micaela) NO puede registrar una nota de crédito suelta",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { destino: "trujillo" })}
${cambiaA(MICAELA)}select retail.registrar_nota_credito_compra(:'c1', 'FC01-31', retail.fn_hoy_lima(), 10, 'otro');
`
  ),
  "No tienes permiso para registrar notas de crédito de proveedores"
);

// ===========================================================================
// APPEND-ONLY Y RLS
// ===========================================================================

error(
  "append-only: una nota de crédito no se edita ni con el rol dueño",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-40', retail.fn_hoy_lima(), 10, 'otro') as nc \\gset
update retail.compra_notas_credito set monto = 1 where id = :'nc';
`
  ),
  "no se editan ni se borran"
);

error(
  "append-only: un cierre de línea no se borra ni con el rol dueño",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _r \\gset
delete from retail.compra_item_cierres where compra_item_id = :'c1_item';
`
  ),
  "no se editan ni se borran"
);

error(
  "RLS: un usuario autenticado no puede insertar directo en compra_notas_credito",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
set local role authenticated;
insert into retail.compra_notas_credito (compra_id, serie_numero, fecha, subtotal, igv, monto, motivo)
  values (:'c1', 'FC01-41', retail.fn_hoy_lima(), 8.47, 1.53, 10.00, 'otro');
`
  ),
  "permission denied"
);

error(
  "RLS: un usuario autenticado no puede insertar directo en compra_item_cierres",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
set local role authenticated;
insert into retail.compra_item_cierres (compra_item_id, cantidad, motivo) values (:'c1_item', 1, 'no_llego');
`
  ),
  "permission denied"
);

exito(
  "RLS de lectura: Felipe (líder) ve la nota de un comprobante del Taller; Micaela (Trujillo) no",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { destino: "taller" })}
${recibe("c1_item", 20)}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _r \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-42', retail.fn_hoy_lima(), 236.00, 'faltante') as _n \\gset
set local role authenticated;
select count(*) as felipe_notas from retail.compra_notas_credito where compra_id = :'c1' \\gset
select count(*) as felipe_cierres from retail.compra_item_cierres where compra_item_id = :'c1_item' \\gset
${cambiaA(MICAELA)}select :'felipe_notas', :'felipe_cierres',
  (select count(*) from retail.compra_notas_credito where compra_id = :'c1'),
  (select count(*) from retail.compra_item_cierres where compra_item_id = :'c1_item');
rollback;
`
  ),
  ["1", "1", "0", "0"]
);

// ===========================================================================
// LA FOTO Y EL DÍA DE LIMA
// ===========================================================================

exito(
  "recalcular_compras reconstruye la foto igual que los triggers (pagado, notas, cerrado, saldo)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 300.00, 'yape') as _p \\gset
${recibe("c1_item", 20)}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _r \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-50', retail.fn_hoy_lima(), 236.00, 'faltante') as _n \\gset
select pagado as p0, notas_credito as n0, cerrado_cantidad as k0, saldo as s0 from retail.compras where id = :'c1' \\gset
select retail.recalcular_compras();
select (pagado = :'p0'), (notas_credito = :'n0'), (cerrado_cantidad = :'k0'), (saldo = :'s0'), saldo from retail.compras where id = :'c1';
rollback;
`
  ),
  ["t", "t", "t", "t", "880.00"]
);

exito(
  "CHECK de esquema: nadie puede dejar pagado + notas por encima del total, ni por SQL directo",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
savepoint s;
\\set ON_ERROR_STOP off
update retail.compras set notas_credito = total + 1 where id = :'c1';
\\set ON_ERROR_STOP on
rollback to savepoint s;
select notas_credito, saldo from retail.compras where id = :'c1';
rollback;
`
  ),
  ["0.00", "1416.00"]
);

error(
  "CHECK de esquema: compras_no_sobrepagada rechaza pagado + notas > total (mensaje del constraint)",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nupdate retail.compras set notas_credito = total + 1 where id = :'c1';`),
  "compras_no_sobrepagada"
);

error(
  "CHECK de esquema: compras_no_sobrerecibida rechaza recibido + cerrado > facturado",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nupdate retail.compras set cerrado_cantidad = facturado_cantidad + 1 where id = :'c1';`),
  "compras_no_sobrerecibida"
);

exito(
  "vencida usa el día de Lima: vence hoy NO está vencida; vence ayer SÍ; y listar_compras coincide",
  comoPersona(
    FELIPE,
    `${BASE}${compra("hoy", { emision: "retail.fn_hoy_lima() - 5", vence: "retail.fn_hoy_lima()" })}${compra("ayer", { emision: "retail.fn_hoy_lima() - 5", vence: "retail.fn_hoy_lima() - 1" })}
select
  retail.fn_hoy_lima() = (now() at time zone 'America/Lima')::date,
  (select vencida from retail.compras_resumen where id = :'hoy'),
  (select vencida from retail.compras_resumen where id = :'ayer'),
  (select count(*) from retail.listar_compras(p_solo_vencidas => true, p_limite => 200) where id = :'hoy'),
  (select count(*) from retail.listar_compras(p_solo_vencidas => true, p_limite => 200) where id = :'ayer');
rollback;
`
  ),
  ["t", "f", "t", "0", "1"]
);

exito(
  "recepcion_atrasada usa el día de Lima: esperada hoy no está atrasada; esperada ayer sí",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
update retail.compras set fecha_estimada_llegada = retail.fn_hoy_lima() where id = :'c1';
update retail.compras set fecha_estimada_llegada = retail.fn_hoy_lima() - 1 where id = :'c2';
select (select recepcion_atrasada from retail.compras_resumen where id = :'c1'),
       (select recepcion_atrasada from retail.compras_resumen where id = :'c2');
rollback;
`
  ),
  ["f", "t"]
);

// ---------------------------------------------------------------------------

// ===========================================================================
// NOTA POR FALTANTE ESTRICTA + SALDO A FAVOR + RECIBIR Y CERRAR ATÓMICO (ADR-0111, corrección 2026-09-18)
// ===========================================================================

/** Como `compra`, pero AL CONTADO y pagada por completo al registrarse (total 1,416.00 con los valores por defecto). */
function compraContado(v, { prov = "prov1", destino = "taller", lineas = [24], costo = 50, pago = null } = {}) {
  const items = lineas
    .map((c) => `jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${c}, 'costo_unitario', ${costo})`)
    .join(", ");
  const total = lineas.reduce((a, c) => a + c, 0) * costo * 1.18;
  return `
select retail.registrar_compra(:'${prov}', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'contado', :'${destino}',
  jsonb_build_array(${items}),
  p_fecha_emision => retail.fn_hoy_lima(),
  p_pago => ${pago ?? `jsonb_build_array(jsonb_build_object('monto', ${total.toFixed(2)}, 'metodo', 'transferencia'))`}) as ${v} \\gset
select (array_agg(id order by cantidad desc))[1] as ${v}_item from retail.compra_items where compra_id = :'${v}' \\gset
`;
}

/** Comprobante a crédito con 20 recibidos y 4 cerrados (resuelto al 100 %, 236.00 sin llegar). Deja `:cierre`. */
const resuelto = (v) => `${compra(v)}
${recibe(`${v}_item`, 20)}
select retail.cerrar_linea_compra(:'${v}_item', 4, 'no_llego') as cierre_${v} \\gset
`;

// ---------------------------------------------------------------- las reglas de la nota por faltante

error(
  "nota por faltante SIN ningún cierre se rechaza",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nselect retail.registrar_nota_credito_compra(:'c1', 'FC01-60', retail.fn_hoy_lima(), 100.00, 'faltante');`),
  "necesita al menos una línea cerrada por faltante"
);

error(
  "nota por faltante con el comprobante todavía a medias (quedan 20 sin resolver) se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _k \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-61', retail.fn_hoy_lima(), 236.00, 'faltante');
`
  ),
  "todavía tiene 20 unidades sin resolver"
);

error(
  "nota por faltante: una sola por comprobante (la segunda se rechaza aunque sea otra serie)",
  comoPersona(
    FELIPE,
    `${BASE}${resuelto("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-62', retail.fn_hoy_lima(), 118.00, 'faltante') as _a \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-63', retail.fn_hoy_lima(), 118.00, 'faltante');
`
  ),
  "ya tiene su nota de crédito por faltante: es una sola por comprobante"
);

error(
  "nota por faltante que pasa de lo cerrado a su costo + IGV (236 + S/ 1 de margen) se rechaza",
  comoPersona(FELIPE, `${BASE}${resuelto("c1")}\nselect retail.registrar_nota_credito_compra(:'c1', 'FC01-64', retail.fn_hoy_lima(), 237.01, 'faltante');`),
  "supera lo que se cerró sin llegar"
);

exito(
  "nota por faltante en el borde del margen (237.00) se acepta",
  comoPersona(
    FELIPE,
    `${BASE}${resuelto("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-65', retail.fn_hoy_lima(), 237.00, 'faltante') as nc \\gset
select monto, aplicado from retail.compra_notas_credito where id = :'nc';
rollback;
`
  ),
  ["237.00", "237.00"]
);

exito(
  "las notas de otro motivo (devolución, descuento) NO llevan las reglas del faltante: sin cierres y varias por comprobante",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-66', retail.fn_hoy_lima(), 100.00, 'devolucion') as _a \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-67', retail.fn_hoy_lima(), 50.00, 'descuento') as _b \\gset
select count(*), sum(aplicado), (select saldo from retail.compras where id = :'c1') from retail.compra_notas_credito where compra_id = :'c1';
rollback;
`
  ),
  ["2", "150.00", "1266.00"]
);

// ---------------------------------------------------------------- de dónde sale el saldo a favor

exito(
  "factura AL CONTADO (ya pagada) con faltante: la nota no baja ninguna deuda y queda ENTERA como saldo a favor",
  comoPersona(
    FELIPE,
    `${BASE}${compraContado("c1")}
${recibe("c1_item", 20)}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _k \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-70', retail.fn_hoy_lima(), 236.00, 'faltante') as nc \\gset
select c.saldo, c.notas_credito, n.aplicado, n.monto,
  retail.fn_saldo_favor_proveedor(c.proveedor_id),
  (select count(*) from retail.proveedor_creditos where nota_credito_id = :'nc' and tipo = 'nota_credito' and monto = 236.00)
from retail.compras c join retail.compra_notas_credito n on n.id = :'nc' where c.id = :'c1';
rollback;
`
  ),
  ["0.00", "0.00", "0.00", "236.00", "236.00", "1"]
);

exito(
  "crédito con saldo menor a la nota (pagó 1300, debe 116; nota 236): baja la deuda a 0 y los otros 120 quedan a favor",
  comoPersona(
    FELIPE,
    `${BASE}${resuelto("c1")}
select retail.registrar_pago_compra(:'c1', 1300.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-71', retail.fn_hoy_lima(), 236.00, 'faltante') as nc \\gset
select c.saldo, c.estado_pago, n.aplicado, retail.fn_saldo_favor_proveedor(c.proveedor_id)
from retail.compras c join retail.compra_notas_credito n on n.id = :'nc' where c.id = :'c1';
rollback;
`
  ),
  ["0.00", "pagada", "116.00", "120.00"]
);

exito(
  "crédito sin pagar: la nota baja TODA la deuda y no deja saldo a favor",
  comoPersona(
    FELIPE,
    `${BASE}${resuelto("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-72', retail.fn_hoy_lima(), 236.00, 'faltante') as _n \\gset
select saldo, retail.fn_saldo_favor_proveedor(proveedor_id) from retail.compras where id = :'c1';
rollback;
`
  ),
  ["1180.00", "0.00"]
);

// ---------------------------------------------------------------- usar el saldo a favor al pagar

/** Deja 236.00 de saldo a favor con `prov1` (`:c0` es la factura al contado que lo originó). */
const CON_SALDO = `${compraContado("c0")}
${recibe("c0_item", 20)}
select retail.cerrar_linea_compra(:'c0_item', 4, 'no_llego') as _k0 \\gset
select retail.registrar_nota_credito_compra(:'c0', 'FC01-80', retail.fn_hoy_lima(), 236.00, 'faltante') as _n0 \\gset
`;

exito(
  "pago de UN comprobante con varios medios: 236 con saldo a favor + 1180 por transferencia = pagada, y el saldo a favor queda en 0",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2")}
select retail.registrar_pagos_compra(:'c2', jsonb_build_array(
  jsonb_build_object('monto', 236.00, 'metodo', 'saldo_a_favor'),
  jsonb_build_object('monto', 1180.00, 'metodo', 'transferencia', 'referencia', 'OP-9'))) as _ids \\gset
select c.saldo, c.estado_pago, retail.fn_saldo_favor_proveedor(c.proveedor_id),
  (select count(*) from retail.proveedor_creditos where tipo = 'aplicacion' and compra_id = :'c2' and monto = 236.00 and compra_pago_id is not null),
  (select count(*) from retail.compra_pagos where compra_id = :'c2' and metodo = 'saldo_a_favor')
from retail.compras c where c.id = :'c2';
rollback;
`
  ),
  ["0.00", "pagada", "0.00", "1", "1"]
);

error(
  "usar más saldo a favor del que hay (236 disponibles, se piden 300) se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2")}
select retail.registrar_pagos_compra(:'c2', jsonb_build_array(jsonb_build_object('monto', 300.00, 'metodo', 'saldo_a_favor')));
`
  ),
  "El saldo a favor con este proveedor es S/ 236.00 y se intenta usar S/ 300.00"
);

error(
  "el mismo saldo a favor no se gasta dos veces: tras usar 236, otro comprobante ya no lo encuentra",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2")}${compra("c3")}
select retail.registrar_pagos_compra(:'c2', jsonb_build_array(jsonb_build_object('monto', 236.00, 'metodo', 'saldo_a_favor'))) as _a \\gset
select retail.registrar_pagos_compra(:'c3', jsonb_build_array(jsonb_build_object('monto', 1.00, 'metodo', 'saldo_a_favor')));
`
  ),
  "El saldo a favor con este proveedor es S/ 0.00"
);

error(
  "el saldo a favor de un proveedor NO se usa para pagar un comprobante de OTRO proveedor",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2", { prov: "prov2" })}
select retail.registrar_pagos_compra(:'c2', jsonb_build_array(jsonb_build_object('monto', 100.00, 'metodo', 'saldo_a_favor')));
`
  ),
  "El saldo a favor con este proveedor es S/ 0.00"
);

error(
  "pago individual que pasa el saldo NETO de notas se rechaza con mensaje claro (antes lo atajaba solo el CHECK de la tabla)",
  comoPersona(
    FELIPE,
    `${BASE}${resuelto("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-73', retail.fn_hoy_lima(), 236.00, 'faltante') as _n \\gset
select retail.registrar_pago_compra(:'c1', 1200.00, 'transferencia');
`
  ),
  "El pago (S/ 1200.00) supera el saldo pendiente (S/ 1180.00)"
);

exito(
  "pago por lote con saldo a favor: 236 se aplican al primer comprobante, el resto por transferencia; ambos pagados, saldo a favor 0",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2")}${compra("c3")}
select retail.registrar_pago_compras(:'prov1', 'transferencia',
  jsonb_build_array(${aplic("c2", "1416.00")}, ${aplic("c3", "1416.00")}), 'OP-77', null, gen_random_uuid(), 236.00) as g \\gset
select
  (select count(*) from retail.compras where id in (:'c2', :'c3') and estado_pago = 'pagada' and saldo = 0),
  retail.fn_saldo_favor_proveedor(:'prov1'),
  (select monto from retail.compra_pagos where compra_id = :'c2' and metodo = 'saldo_a_favor'),
  (select monto from retail.compra_pagos where compra_id = :'c2' and metodo = 'transferencia'),
  (select count(*) from retail.compra_pagos where compra_id = :'c3' and metodo = 'saldo_a_favor'),
  (select count(distinct pago_grupo_id) from retail.compra_pagos where pago_grupo_id = :'g');
rollback;
`
  ),
  ["2", "0.00", "236.00", "1180.00", "0", "1"]
);

exito(
  "pago por lote cubierto ENTERO con saldo a favor: no necesita medio de pago",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2", { lineas: [4] })}
select retail.registrar_pago_compras(:'prov1', null, jsonb_build_array(${aplic("c2", "236.00")}), null, null, gen_random_uuid(), 236.00) as g \\gset
select saldo, estado_pago, retail.fn_saldo_favor_proveedor(:'prov1') from retail.compras where id = :'c2';
rollback;
`
  ),
  ["0.00", "pagada", "0.00"]
);

error(
  "pago por lote: usar más saldo a favor del que hay se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2")}
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c2", "1416.00")}), null, null, null, 300.00);
`
  ),
  "El saldo a favor con este proveedor es S/ 236.00 y se intenta usar S/ 300.00"
);

error(
  "pago por lote: el saldo a favor a usar no puede pasar del total del pago",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2", { lineas: [4] })}
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c2", "100.00")}), null, null, null, 236.00);
`
  ),
  "supera el total del pago"
);

exito(
  "pago al contado al registrar el comprobante, parte con saldo a favor (236) y parte en efectivo (1180)",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compraContado("c2", {
      pago: `jsonb_build_array(jsonb_build_object('monto', 236.00, 'metodo', 'saldo_a_favor'), jsonb_build_object('monto', 1180.00, 'metodo', 'efectivo'))`,
    })}
select saldo, estado_pago, retail.fn_saldo_favor_proveedor(:'prov1') from retail.compras where id = :'c2';
rollback;
`
  ),
  ["0.00", "pagada", "0.00"]
);

// ---------------------------------------------------------------- reembolso y el libro

exito(
  "reembolso del proveedor: baja el saldo a favor (236 - 100 = 136) y queda en el libro con su medio",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}
select retail.registrar_reembolso_proveedor(:'prov1', 100.00, 'transferencia', 'OP-DEV-1', null, 'devolvió la diferencia') as _r \\gset
select retail.fn_saldo_favor_proveedor(:'prov1'),
  (select count(*) from retail.proveedor_creditos where proveedor_id = :'prov1' and tipo = 'reembolso' and monto = 100.00 and metodo = 'transferencia' and referencia = 'OP-DEV-1');
rollback;
`
  ),
  ["136.00", "1"]
);

error(
  "reembolso mayor al saldo a favor se rechaza",
  comoPersona(FELIPE, `${BASE}${CON_SALDO}\nselect retail.registrar_reembolso_proveedor(:'prov1', 236.01, 'transferencia');`),
  "El saldo a favor con este proveedor es S/ 236.00 y el reembolso es de S/ 236.01"
);

error(
  "integrante (Micaela) NO puede registrar un reembolso (dinero: solo líder)",
  comoPersona(FELIPE, `${BASE}${CON_SALDO}\n${cambiaA(MICAELA)}select retail.registrar_reembolso_proveedor(:'prov1', 10.00, 'efectivo');`),
  "No tienes permiso para registrar reembolsos de proveedores"
);

error(
  "el libro del saldo a favor no se edita (ni por SQL directo)",
  comoPersona(FELIPE, `${BASE}${CON_SALDO}\nupdate retail.proveedor_creditos set monto = 1 where proveedor_id = :'prov1';`),
  "El libro del saldo a favor no se edita ni se borra"
);

exito(
  "RLS: Felipe (líder) lee el saldo a favor y su historial; Micaela (integrante) lee 0 y ninguna fila",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}
set local role authenticated;
select retail.fn_saldo_favor_proveedor(:'prov1') as felipe_saldo \\gset
select count(*) as felipe_hist from retail.fn_proveedor_creditos(:'prov1') \\gset
${cambiaA(MICAELA)}select :'felipe_saldo', :'felipe_hist', retail.fn_saldo_favor_proveedor(:'prov1'), (select count(*) from retail.fn_proveedor_creditos(:'prov1'));
rollback;
`
  ),
  ["236.00", "1", "0.00", "0"]
);

exito(
  "fn_proveedores trae el saldo a favor por proveedor y fn_proveedores_resumen el total",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}
select (select saldo_favor from retail.fn_proveedores() where id = :'prov1'),
  (select saldo_favor from retail.fn_proveedores() where id = :'prov2'),
  (select saldo_favor_total from retail.fn_proveedores_resumen()),
  (select con_saldo_favor from retail.fn_proveedores_resumen());
rollback;
`
  ),
  ["236.00", "0.00", "236.00", "1"]
);

// ---------------------------------------------------------------- recibir + cerrar + nota, en una sola transacción

exito(
  "recibir_y_cerrar_compras: recibe 20, cierra 4 y registra la nota (236) en una sola llamada",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.recibir_y_cerrar_compras(:'taller',
  jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'variante_id', :'var', 'cantidad', 20)),
  jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'cantidad', 4, 'motivo', 'no_llego')),
  jsonb_build_array(jsonb_build_object('compra_id', :'c1', 'serie_numero', 'FC01-90', 'fecha', retail.fn_hoy_lima(), 'monto', 236.00))) as r \\gset
select (:'r'::jsonb ->> 'cierres'), (:'r'::jsonb ->> 'notas_credito'), (:'r'::jsonb ->> 'lote_id') is not null,
  estado_recepcion, saldo, recibido_cantidad, cerrado_cantidad
from retail.compras where id = :'c1';
rollback;
`
  ),
  ["1", "1", "t", "recibida", "1180.00", "20", "4"]
);

exito(
  "recibir_y_cerrar_compras sin nada recibido: la línea que llegó en 0 se cierra entera y el comprobante queda resuelto",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.recibir_y_cerrar_compras(:'taller', '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'cantidad', 24, 'motivo', 'no_llego')), '[]'::jsonb) as r \\gset
select (:'r'::jsonb ->> 'lote_id') is null, estado_recepcion, recibido_cantidad, cerrado_cantidad from retail.compras where id = :'c1';
rollback;
`
  ),
  ["t", "recibida", "0", "24"]
);

exito(
  "recibir_y_cerrar_compras es TODO O NADA: si la nota se rechaza, tampoco quedan el stock ni el cierre",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
savepoint s;
\\set ON_ERROR_STOP off
select retail.recibir_y_cerrar_compras(:'taller',
  jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'variante_id', :'var', 'cantidad', 20)),
  jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'cantidad', 4, 'motivo', 'no_llego')),
  jsonb_build_array(jsonb_build_object('compra_id', :'c1', 'serie_numero', 'FC01-91', 'fecha', retail.fn_hoy_lima(), 'monto', 999.00)));
\\set ON_ERROR_STOP on
rollback to savepoint s;
select recibido_cantidad, cerrado_cantidad, notas_credito, estado_recepcion,
  (select count(*) from retail.movimientos where compra_item_id = :'c1_item'),
  (select count(*) from retail.lotes where id in (select lote_id from retail.movimientos where compra_item_id = :'c1_item'))
from retail.compras where id = :'c1';
rollback;
`
  ),
  ["0", "0", "0.00", "sin_recibir", "0", "0"]
);

error(
  "recibir_y_cerrar_compras: una nota por faltante sin cierres en la misma llamada se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.recibir_y_cerrar_compras(:'taller',
  jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'variante_id', :'var', 'cantidad', 20)), '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('compra_id', :'c1', 'serie_numero', 'FC01-92', 'fecha', retail.fn_hoy_lima(), 'monto', 236.00)));
`
  ),
  "necesita que se cierre al menos una línea en esta misma guía"
);

error(
  "recibir_y_cerrar_compras: sin ítems ni cierres no hay nada que registrar",
  comoPersona(FELIPE, `${BASE}\nselect retail.recibir_y_cerrar_compras(:'taller');`),
  "No hay nada que registrar"
);

error(
  "recibir_y_cerrar_compras: cerrar más de lo pendiente tras la recepción se rechaza (la pantalla vio otra cosa)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.recibir_y_cerrar_compras(:'taller',
  jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'variante_id', :'var', 'cantidad', 20)),
  jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'cantidad', 5, 'motivo', 'no_llego')));
`
  ),
  "La línea tiene 4 unidades pendientes: no se pueden cerrar 5"
);

error(
  "integrante (Micaela) puede recibir y cerrar en su sede, pero NO registrar la nota de crédito dentro de la misma llamada",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { destino: "trujillo" })}
${cambiaA(MICAELA)}select retail.recibir_y_cerrar_compras(:'trujillo',
  jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'variante_id', :'var', 'cantidad', 20)),
  jsonb_build_array(jsonb_build_object('compra_item_id', :'c1_item', 'cantidad', 4, 'motivo', 'no_llego')),
  jsonb_build_array(jsonb_build_object('compra_id', :'c1', 'serie_numero', 'FC01-93', 'fecha', retail.fn_hoy_lima(), 'monto', 236.00)));
`
  ),
  "No tienes permiso para registrar notas de crédito de proveedores"
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
      // La última línea de salida es la fila de verificación.
      const ultima = resultado.salida.split("\n").filter(Boolean).pop() ?? "";
      const columnas = ultima.split("|");
      const igual = columnas.length === caso.esperado.length && columnas.every((v, i) => v === caso.esperado[i]);
      if (!igual) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    esperado: ${JSON.stringify(caso.esperado)}\n    salió:    ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
