#!/usr/bin/env node
/**
 * Pruebas de los INDICADORES de Compras contra el Postgres local — CAYLA V2, ADR-0111.
 *
 * QUÉ PRUEBA. Las funciones de LECTURA que alimentan las tarjetas y tablas de Por pagar,
 * Recibir mercadería, Ingreso sin comprobante y Proveedores. Hasta hoy solo se habían
 * mirado con los datos de muestra; con dinero real detrás (deuda, caja, IGV) una cifra
 * que miente es peor que una que falta:
 *   · `resumen_compras` / `resumen_compras_extra`     — cabecera: por recibir, atraso, mes vs mes, IGV, concentración.
 *   · `deuda_por_vencimiento` / `salidas_caja_30d`     — la deuda por antigüedad y semana a semana.
 *   · `por_pagar_tramos`                               — subtotales reales de la lista (con y sin filtros).
 *   · `resumen_recepciones` / `listar_recepciones_compras`     — quién cumple y cuánto tarda.
 *   · `resumen_sin_comprobante` / `recepciones_sin_comprobante` — lo que entra sin factura y sin costo.
 *   · `fn_proveedores*`, `fn_proveedor_metricas_compras`, `fn_proveedor_costo_evolucion`,
 *     `fn_proveedor_devoluciones`, `fn_saldo_favor_proveedor`, `fn_proveedor_creditos`.
 *   · permisos (integrante vs. líder, sin sesión, anon), notas de crédito y el borde de día en Lima.
 *
 * CÓMO. Mismo patrón que `compras_faltantes_y_pago_por_lote.mjs` (léelo primero): cada
 * escenario corre en su propia transacción con ROLLBACK — nunca se commitea nada, corre seguro
 * contra el Postgres local que comparten ~20 worktrees. Simula a Felipe (líder) y a Micaela
 * (integrante, fija a Tienda Trujillo) con `set local request.jwt.claim.sub`.
 *
 * LÍNEA BASE, NO VALORES ABSOLUTOS. El seed ya trae comprobantes, lotes y proveedores con
 * deuda: una prueba que espere «la deuda vencida es 0» rompe apenas alguien registre una
 * factura. Por eso cada prueba mide la cifra ANTES de crear su escenario (tabla temporal
 * `b_*` dentro de la misma transacción) y verifica la DIFERENCIA. Solo se afirma un valor
 * absoluto cuando el escenario crea el universo entero: un proveedor nuevo (sin compras),
 * o un universo aislado por fechas (comprobantes en el futuro lejano).
 *
 * EL RELOJ. «Hoy» es `fn_hoy_lima()`. Para probar el borde de día (UTC ya es «mañana», Lima
 * todavía «hoy») hay pruebas que REEMPLAZAN `fn_hoy_lima()` dentro de la transacción
 * (`create or replace function`, transaccional en Postgres: el ROLLBACK la devuelve a como
 * estaba y otras sesiones nunca la ven). Así el borde se prueba a cualquier hora del día.
 *
 * HALLAZGOS. Una prueba marcada `[HALLAZGO Hn]` afirma lo que la función DEBERÍA hacer según
 * su propia documentación y hoy no lo hace. No cuenta como fallo del script (sale con ⚠ y se
 * resume al final): documenta el bug sin arreglarlo en silencio ni tocar migraciones. Cuando
 * alguien corrija la función, la prueba pasa sola y avisa que se puede volver una prueba normal.
 * Abierto hoy (el detalle está en su prueba y en docs/BACKLOG.md):
 *   H4 (decisión de Felipe) los indicadores de dinero le muestran a un integrante lo de SU sede.
 * Ya corregidos por la migración 20260918221000 (sus pruebas son normales, con un comentario «Hn (corregido…)»):
 *   H1 «% entregado completo» de la ficha, H2 «última devolución», H3 filtros de por_pagar_tramos, H5 fecha de Lima en los pagos.
 *
 * CÓMO SE VALIDÓ QUE LAS PRUEBAS MUERDEN. Antes de entregarlas se mutó cada función dentro de
 * una transacción (quitar el candado de sede, mover un borde un día, cambiar Lima por UTC,
 * usar current_date, restar mal las notas, ignorar un filtro…) y se comprobó que cada mutación
 * hace fallar al menos un caso. Las únicas mutaciones que sobreviven son equivalentes (p. ej.
 * el filtro `estado = 'devuelta_proveedor'` de fn_proveedor_devoluciones, que el CHECK de
 * `prendas_danadas` ya vuelve redundante).
 *
 * POR QUÉ NO ES UN `*.test.ts` DE VITEST. `pnpm test` corre sobre un checkout limpio sin
 * Postgres ni Docker; por eso vive en `scripts/` y se corre a mano.
 *
 * USO
 *   pnpm pruebas:compras-indicadores   → necesita el stack local (`npx supabase start`)
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

/** Proveedores, ubicaciones, la variante y un segundo producto del seed. */
const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as prov2 from retail.proveedores where nombre = 'Confecciones del Sur EIRL' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
select id as prod2 from retail.productos where id <> :'prod' and id <> '11111111-1111-4111-8111-111111111111' order by referencia limit 1 \\gset
`;

// ---------------------------------------------------------------------------
// Fechas relativas a «hoy en Lima» (nunca current_date)
// ---------------------------------------------------------------------------

const HOY = "retail.fn_hoy_lima()";
/** `dia(-3)` = hace 3 días (Lima); `dia(0)` = hoy. Siempre entre paréntesis: se puede sumar encima. */
const dia = (n) => (n === 0 ? HOY : `(${HOY} ${n > 0 ? "+" : "-"} ${Math.abs(n)})`);
/** Un instante en hora de Lima: el día `d` a las `hora` (Lima). 22:30 de Lima ya es «mañana» en UTC. */
const limaTs = (d, hora = "10:00") => `((${d})::timestamp + time '${hora}') at time zone 'America/Lima'`;

const PRIMER_DIA_MES = "(date_trunc('month', retail.fn_hoy_lima())::date)";
const ULTIMO_DIA_MES_ANT = "(date_trunc('month', retail.fn_hoy_lima())::date - 1)";
const PRIMER_DIA_MES_ANT = "((date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date)";
const ULTIMO_DIA_HACE_2_MESES = "((date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date - 1)";

/**
 * Cambia `fn_hoy_lima()` SOLO dentro de esta transacción (DDL transaccional; el ROLLBACK la
 * restaura). Con `current_date - 1` se simula el borde: en UTC ya es «mañana», en Lima sigue siendo «hoy».
 */
const RELOJ = (expr) => `create or replace function retail.fn_hoy_lima() returns date language sql stable as $$ select ${expr} $$;\n`;
const RELOJ_UTC_ADELANTADO = RELOJ("current_date - 1");

// ---------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------

/**
 * Crea un comprobante a crédito con la RPC real. Por defecto: factura de 24 u × S/ 50 + IGV 18 %
 * = S/ 1,416.00 (subtotal 1,200 + IGV 216), emitida hoy (Lima) y vence en 10 días.
 * `lineas`: cantidades, o pares [cantidad, costo] cuando cada línea cuesta distinto.
 * Deja `:v` (el comprobante), `:v_item` (la línea más grande), `:v_item2` (la segunda) y `:v_doc`.
 */
function compra(v, { prov = "prov1", destino = "taller", lineas = [24], costo = 50, prodVar = ["prod", "var"], tipo = "factura", igv = 18, emision = HOY, vence = dia(10), estimada = null, serie = "TST", numero = "N" } = {}) {
  const items = lineas
    .map((l) => {
      const [c, k] = Array.isArray(l) ? l : [l, costo];
      const [p, va] = prodVar;
      return `jsonb_build_object('producto_id', :'${p}', ${va ? `'variante_id', :'${va}', ` : ""}'cantidad', ${c}, 'costo_unitario', ${k})`;
    })
    .join(", ");
  return `
select retail.registrar_compra(:'${prov}', '${serie}', '${numero}' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'${destino}',
  jsonb_build_array(${items}),
  p_tipo => '${tipo}', p_fecha_emision => ${emision}, p_fecha_vencimiento => ${vence}, p_igv_porcentaje => ${igv}${estimada ? `, p_fecha_estimada_llegada => ${estimada}` : ""}) as ${v} \\gset
select (array_agg(id order by cantidad desc))[1] as ${v}_item, (array_agg(id order by cantidad desc))[2] as ${v}_item2
  from retail.compra_items where compra_id = :'${v}' \\gset
select documento as ${v}_doc from retail.compras where id = :'${v}' \\gset
`;
}

/** Como `compra`, pero AL CONTADO y pagada por completo al registrarse (total 1,416.00 con los valores por defecto). */
function compraContado(v, { prov = "prov1", destino = "taller", lineas = [24], costo = 50 } = {}) {
  const items = lineas
    .map((c) => `jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${c}, 'costo_unitario', ${costo})`)
    .join(", ");
  const total = lineas.reduce((a, c) => a + c, 0) * costo * 1.18;
  return `
select retail.registrar_compra(:'${prov}', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'contado', :'${destino}',
  jsonb_build_array(${items}),
  p_fecha_emision => retail.fn_hoy_lima(),
  p_pago => jsonb_build_array(jsonb_build_object('monto', ${total.toFixed(2)}, 'metodo', 'transferencia'))) as ${v} \\gset
select (array_agg(id order by cantidad desc))[1] as ${v}_item from retail.compra_items where compra_id = :'${v}' \\gset
`;
}

/** Un proveedor nuevo, sin compras: el universo entero es del escenario (valores absolutos seguros). */
const nuevoProv = (v, { nombre = "ZZ Prueba Indicadores", activo = true } = {}) => `
insert into retail.proveedores (nombre, activo) values ('${nombre} ' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), ${activo}) returning id as ${v} \\gset
`;

/** Recibe `cantidad` unidades de una línea (una guía por llamada). Deja el lote en `:lote`. */
const recibe = (linea, cantidad, { ubic = "taller", lote = "_lote", guia = null } = {}) => `
select retail.recibir_compras(:'${ubic}', jsonb_build_array(jsonb_build_object('compra_item_id', :'${linea}', 'variante_id', :'var', 'cantidad', ${cantidad})), ${guia ? `'${guia}'` : "null"}) as ${lote} \\gset
`;

/** Una sola guía que cubre varias líneas (de comprobantes distintos del mismo proveedor). `items`: [[linea, cantidad], …]. */
const recibeJuntas = (lote, items, { ubic = "taller", guia = null } = {}) => `
select retail.recibir_compras(:'${ubic}', jsonb_build_array(${items
  .map(([linea, cantidad]) => `jsonb_build_object('compra_item_id', :'${linea}', 'variante_id', :'var', 'cantidad', ${cantidad})`)
  .join(", ")}), ${guia ? `'${guia}'` : "null"}) as ${lote} \\gset
`;

/** Ingreso SIN comprobante (`recibir_lote`). `items`: [[cantidad, costo | null], …] — sin costo = no lleva la clave. */
const recibeSC = (lote, { ubic = "taller", prov = "prov1", items, guia = null, nota = null } = {}) => `
select retail.recibir_lote(:'${ubic}', :'${prov}', jsonb_build_array(${items
  .map(([c, k]) => `jsonb_build_object('variante_id', :'var', 'cantidad', ${c}${k == null ? "" : `, 'costo_unitario', ${k}`})`)
  .join(", ")}), ${guia ? `'${guia}'` : "null"}, ${nota ? `'${nota}'` : "null"}) as ${lote} \\gset
`;

/** Pone la fecha de llegada de una guía (recibir_compras usa now(); para probar demoras hay que fecharla). */
const fechaLote = (lote, d, hora = "10:00") => `update retail.lotes set fecha_recepcion = ${limaTs(d, hora)} where id = :'${lote}';\n`;

/** Comprobante a crédito con 20 recibidos y 4 cerrados (resuelto al 100 %, 236.00 sin llegar). */
const resuelto = (v, o = {}) => `${compra(v, o)}${recibe(`${v}_item`, 20)}
select retail.cerrar_linea_compra(:'${v}_item', 4, 'no_llego') as cierre_${v} \\gset
`;

/** Nota de crédito (por defecto por faltante, del día). */
const nota = (v, monto, serie, motivo = "faltante", fecha = HOY) =>
  `select retail.registrar_nota_credito_compra(:'${v}', '${serie}', ${fecha}, ${monto}, '${motivo}') as nc_${serie.replace(/[^A-Za-z0-9]/g, "_")} \\gset\n`;

const pago = (v, monto, fecha = null) =>
  `select retail.registrar_pago_compra(:'${v}', ${monto}, 'transferencia'${fecha ? `, null, ${fecha}` : ""}) as _pg_${v} \\gset\n`;

/**
 * Deja 236.00 de saldo a favor con `prov` (`:c0` es la factura al contado que lo originó, `:c0_doc` su documento).
 * Las pruebas que afirman el saldo EXACTO usan un proveedor nuevo: con `prov1` el resultado dependería de si
 * alguien (otra sesión) dejó saldo a favor en el seed.
 */
const conSaldo = (prov = "prov1") => `${compraContado("c0", { prov })}
${recibe("c0_item", 20)}
select retail.cerrar_linea_compra(:'c0_item', 4, 'no_llego') as _k0 \\gset
select retail.registrar_nota_credito_compra(:'c0', 'FC01-80', retail.fn_hoy_lima(), 236.00, 'faltante') as _n0 \\gset
select documento as c0_doc from retail.compras where id = :'c0' \\gset
`;
const CON_SALDO = conSaldo();

/** El sistema entero sin deuda: todo comprobante vigente con saldo se paga (por SQL directo, dentro de la transacción). */
const PAGA_TODO = `
insert into retail.compra_pagos (compra_id, fecha, monto, metodo)
  select id, retail.fn_hoy_lima(), saldo, 'efectivo' from retail.compras where estado = 'vigente' and saldo > 0;
`;

// ---------------------------------------------------------------------------
// Fotos de la línea base y sus diferencias
// ---------------------------------------------------------------------------

const foto = (t, consulta) => `create temp table ${t} on commit drop as ${consulta};\n`;

const FOTO_DEUDA = foto("b_dv", "select * from retail.deuda_por_vencimiento()");
const DIF_DEUDA = `select d.tramo, (d.comprobantes - b.comprobantes), (d.monto - b.monto)::numeric(12,2)
from retail.deuda_por_vencimiento() with ordinality as d(tramo, comprobantes, monto, ord)
join b_dv b on b.tramo = d.tramo order by d.ord;`;
const filasDeuda = (o = {}) => ["vencida", "0_7", "8_30", "mas_30"].map((t) => [t, String(o[t]?.[0] ?? 0), (o[t]?.[1] ?? 0).toFixed(2)]);

const FOTO_SALIDAS = foto("b_sc", "select * from retail.salidas_caja_30d()");
const DIF_SALIDAS = `select s.orden, (s.comprobantes - b.comprobantes), (s.monto - b.monto)::numeric(12,2)
from retail.salidas_caja_30d() with ordinality as s(orden, etiqueta, desde, hasta, comprobantes, monto, es_vencido, ord)
join b_sc b on b.orden = s.orden order by s.ord;`;
const filasSalidas = (o = {}) => [0, 1, 2, 3, 4, 5].map((k) => [String(k), String(o[k]?.[0] ?? 0), (o[k]?.[1] ?? 0).toFixed(2)]);

const fotoPP = (t, args = "") => foto(t, `select * from retail.por_pagar_tramos(${args})`);
const difPP = (t, args = "") => `select p.tramo, (p.comprobantes - b.comprobantes), (p.saldo - b.saldo)::numeric(12,2)
from retail.por_pagar_tramos(${args}) with ordinality as p(tramo, comprobantes, saldo, ord)
join ${t} b on b.tramo = p.tramo order by p.ord;`;
const filasPP = (o = {}) => ["vencidas", "semana", "despues"].map((t) => [t, String(o[t]?.[0] ?? 0), (o[t]?.[1] ?? 0).toFixed(2)]);

const FOTO_EXTRA = foto("b_x", "select * from retail.resumen_compras_extra()");
const FOTO_RC = foto("b_rc", "select * from retail.resumen_compras()");
const FOTO_RR = foto("b_rr", "select * from retail.resumen_recepciones()");
const FOTO_SC = foto("b_sc2", "select * from retail.resumen_sin_comprobante()");
const FOTO_PR = foto("b_pr", "select * from retail.fn_proveedores_resumen()");

// ---------------------------------------------------------------------------
// Registro de casos
// ---------------------------------------------------------------------------

const CASOS = [];
/** `esperado`: fila de columnas (se compara la ÚLTIMA línea de salida) o arreglo de filas (las últimas N). */
function exito(nombre, sql, esperado) {
  CASOS.push({ nombre, tipo: "exito", sql, esperado });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}
/** Afirma lo que la función DEBERÍA hacer; si hoy no lo hace, sale como ⚠ (no como fallo). */
function hallazgo(id, nombre, detalle, sql, esperado) {
  CASOS.push({ nombre: `[HALLAZGO ${id}] ${nombre}`, tipo: "exito", sql, esperado, hallazgo: { id, detalle } });
}

// ===========================================================================
// 1. resumen_compras_extra — lo que falta llegar
// ===========================================================================

const DIF_PENDIENTE = `select (e.unidades_pendientes - b.unidades_pendientes), (e.valor_por_recibir - b.valor_por_recibir)::numeric(12,2)
from retail.resumen_compras_extra() e, b_x b;`;

exito(
  "por recibir: una compra nueva de 24 u × S/ 50 suma 24 unidades y S/ 1,416.00 (con IGV, comparable con el saldo)",
  comoPersona(FELIPE, `${BASE}${FOTO_EXTRA}${compra("c1")}${DIF_PENDIENTE}\nrollback;`),
  ["24", "1416.00"]
);

exito(
  "por recibir: recibir 20 de 24 deja solo lo que falta — 4 unidades × S/ 50 × 1.18 = S/ 236.00",
  comoPersona(FELIPE, `${BASE}${FOTO_EXTRA}${compra("c1")}${recibe("c1_item", 20)}${DIF_PENDIENTE}\nrollback;`),
  ["4", "236.00"]
);

exito(
  "por recibir: la línea cerrada por faltante (D2) ya no cuenta como pendiente — comprobante resuelto aporta 0",
  comoPersona(FELIPE, `${BASE}${FOTO_EXTRA}${resuelto("c1")}${DIF_PENDIENTE}\nrollback;`),
  ["0", "0.00"]
);

exito(
  "por recibir: un comprobante anulado no debe mercadería (0 unidades, S/ 0.00)",
  comoPersona(FELIPE, `${BASE}${FOTO_EXTRA}${compra("c1")}select retail.anular_compra(:'c1', 'prueba');\n${DIF_PENDIENTE}\nrollback;`),
  ["0", "0.00"]
);

exito(
  "por recibir: una boleta sin IGV (10 u × S/ 30) vale S/ 300.00, no S/ 354.00 — el 18 % no se inventa",
  comoPersona(FELIPE, `${BASE}${FOTO_EXTRA}${compra("c1", { tipo: "boleta", igv: 0, lineas: [10], costo: 30 })}${DIF_PENDIENTE}\nrollback;`),
  ["10", "300.00"]
);

exito(
  "por recibir: con dos líneas (24 y 10 u) y la mayor ya recibida, falta 10 u × S/ 50 × (2,006/1,700) = S/ 590.00",
  comoPersona(FELIPE, `${BASE}${FOTO_EXTRA}${compra("c1", { lineas: [24, 10] })}${recibe("c1_item", 24)}${DIF_PENDIENTE}\nrollback;`),
  ["10", "590.00"]
);

exito(
  "por recibir: recibir 10 y cerrar 4 sin nota de por medio deja 10 pendientes (S/ 590.00) — el comprobante sigue parcial, con lo cerrado ya descontado",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_EXTRA}${compra("c1")}${recibe("c1_item", 10)}select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _k \\gset
${DIF_PENDIENTE}
rollback;
`
  ),
  ["10", "590.00"]
);

exito(
  "sede: el líder cuenta la mercadería por recibir de TODAS las sedes (a Micaela ya no se le entregan estas cifras: ADR-0126, ver `dinero_compras_solo_lider.mjs`)",
  comoPersona(
    FELIPE,
    `${BASE}${foto("b_f", "select * from retail.resumen_compras_extra()")}
${compra("c1")}${compra("t1", { destino: "trujillo", lineas: [10] })}
select (e.unidades_pendientes - b.unidades_pendientes), (e.valor_por_recibir - b.valor_por_recibir)::numeric(12,2) from retail.resumen_compras_extra() e, b_f b;
rollback;
`
  ),
  ["34", "2006.00"]
);

// ---------------------------------------------------------------- la entrega más atrasada

exito(
  "más atrasada: emitida hace 400 días y sin fecha estimada, lleva hoy − (emisión + 7) = 393 días y sale con su documento y su proveedor",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { emision: dia(-400) })}
select e.dias_mas_atrasada, e.documento_mas_atrasada = :'c1_doc', e.proveedor_mas_atrasado from retail.resumen_compras_extra() e;
rollback;
`
  ),
  ["393", "t", "Textiles Andina SAC"]
);

exito(
  "más atrasada: la fecha estimada de llegada manda sobre emisión + 7 (estimada hace 450 días → 450, no 493)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { emision: dia(-500), estimada: dia(-450) })}
select e.dias_mas_atrasada, e.documento_mas_atrasada = :'c1_doc' from retail.resumen_compras_extra() e;
rollback;
`
  ),
  ["450", "t"]
);

exito(
  "más atrasada: una entrega estimada para dentro de 5 días no está atrasada aunque lleve 40 días emitida — no desplaza a la que sí",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_EXTRA}${compra("c1", { emision: dia(-40), estimada: dia(5) })}
select e.dias_mas_atrasada is not distinct from b.dias_mas_atrasada, e.documento_mas_atrasada is not distinct from b.documento_mas_atrasada
from retail.resumen_compras_extra() e, b_x b;
rollback;
`
  ),
  ["t", "t"]
);

exito(
  "más atrasada: empate en la fecha esperada (hace 1000 días) → gana la de emisión más antigua, de forma estable",
  comoPersona(
    FELIPE,
    `${BASE}${compra("ca", { emision: dia(-1010), estimada: dia(-1000) })}${compra("cb", { emision: dia(-1005), estimada: dia(-1000) })}
select e.dias_mas_atrasada, e.documento_mas_atrasada = :'ca_doc' from retail.resumen_compras_extra() e;
rollback;
`
  ),
  ["1000", "t"]
);

// El mismo borde («atrasada» = hoy > fecha esperada) vive en TRES lugares: `resumen_compras`, la vista
// `compras_resumen` y `fn_proveedores`. Los tres tienen que coincidir en el día exacto.
for (const [nombre, opciones, suma] of [
  ["entrega estimada para HOY: todavía no está atrasada (hoy > hoy es falso)", { estimada: dia(0) }, 0],
  ["entrega estimada era AYER: ya está atrasada", { estimada: dia(-1) }, 1],
  ["sin fecha estimada, emitida hace 7 días: aún en plazo (emisión + 7 = hoy)", { emision: dia(-7) }, 0],
  ["sin fecha estimada, emitida hace 8 días: atrasada", { emision: dia(-8) }, 1],
]) {
  exito(
    `atraso (resumen_compras, vista y ficha de proveedor coinciden): ${nombre}`,
    comoPersona(
      FELIPE,
      `${BASE}select por_recibir_atrasadas as r0 from retail.resumen_compras() \\gset
select facturas_atrasadas as f0 from retail.fn_proveedores() where id = :'prov1' \\gset
select count(*) as v0 from retail.compras_resumen where recepcion_atrasada \\gset
${compra("c1", opciones)}
select (select por_recibir_atrasadas from retail.resumen_compras()) - :r0,
  (select facturas_atrasadas from retail.fn_proveedores() where id = :'prov1') - :f0,
  (select count(*) from retail.compras_resumen where recepcion_atrasada) - :v0;
rollback;
`
    ),
    [String(suma), String(suma), String(suma)]
  );
}

// ---------------------------------------------------------------- compras del mes vs mes anterior

const DIF_MES = `select (e.compras_mes - b.compras_mes)::numeric(12,2), (e.compras_mes_anterior - b.compras_mes_anterior)::numeric(12,2), (e.igv_mes - b.igv_mes)::numeric(12,2)
from retail.resumen_compras_extra() e, b_x b;`;

exito(
  "compras del mes: una factura emitida hoy suma su total (S/ 1,416.00) al mes, no al anterior, y su IGV (S/ 216.00) al IGV del mes",
  comoPersona(FELIPE, `${BASE}${FOTO_EXTRA}${compra("c1")}${DIF_MES}\nrollback;`),
  ["1416.00", "0.00", "216.00"]
);

exito(
  "compras del mes: los bordes del calendario de Lima — día 1 cuenta al mes, último día del anterior y día 1 del anterior al anterior, y el último día de hace 2 meses a ninguno",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_EXTRA}${compra("c1", { emision: PRIMER_DIA_MES })}${compra("c2", { emision: ULTIMO_DIA_MES_ANT })}${compra("c3", { emision: PRIMER_DIA_MES_ANT })}${compra("c4", { emision: ULTIMO_DIA_HACE_2_MESES })}${DIF_MES}
rollback;
`
  ),
  ["1416.00", "2832.00", "216.00"]
);

exito(
  "compras del mes: un comprobante anulado no cuenta en el mes ni en el IGV",
  comoPersona(FELIPE, `${BASE}${FOTO_EXTRA}${compra("c1")}select retail.anular_compra(:'c1', 'prueba');\n${DIF_MES}\nrollback;`),
  ["0.00", "0.00", "0.00"]
);

exito(
  "IGV del mes: una boleta suma su total (S/ 300.00) a las compras del mes pero NO aporta IGV (no hay crédito fiscal)",
  comoPersona(FELIPE, `${BASE}${FOTO_EXTRA}${compra("c1", { tipo: "boleta", igv: 0, lineas: [10], costo: 30 })}${DIF_MES}\nrollback;`),
  ["300.00", "0.00", "0.00"]
);

exito(
  "IGV del mes NETO de notas: factura de S/ 1,416.00 (IGV 216) y nota por faltante de S/ 236.00 (IGV 36) → IGV del mes +180.00; las compras brutas no bajan",
  comoPersona(FELIPE, `${BASE}${FOTO_EXTRA}${resuelto("c1")}${nota("c1", "236.00", "FC01-201")}${DIF_MES}\nrollback;`),
  ["1416.00", "0.00", "180.00"]
);

exito(
  "IGV del mes: la nota de HOY sobre una factura del mes anterior resta IGV al mes en que se emite la nota (−36.00), sin tocar las compras del mes",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_EXTRA}${resuelto("c1", { emision: ULTIMO_DIA_MES_ANT })}${nota("c1", "236.00", "FC01-202")}${DIF_MES}
rollback;
`
  ),
  ["0.00", "1416.00", "-36.00"]
);

exito(
  "IGV del mes: la nota FECHADA en el mes anterior (mismo día de la factura) no resta nada al mes actual",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_EXTRA}${resuelto("c1", { emision: ULTIMO_DIA_MES_ANT })}${nota("c1", "236.00", "FC01-203", "faltante", ULTIMO_DIA_MES_ANT)}${DIF_MES}
rollback;
`
  ),
  ["0.00", "1416.00", "0.00"]
);

exito(
  "IGV del mes: una nota sobre una factura AL CONTADO (ya pagada, todo el monto va a saldo a favor) resta igual su IGV al crédito fiscal (+180.00) y no toca la deuda",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${FOTO_EXTRA}${FOTO_RC}${compraContado("c1", { prov: "prov3" })}${recibe("c1_item", 20)}select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _k \\gset
${nota("c1", "236.00", "FC01-209")}
select (e.igv_mes - b.igv_mes)::numeric(12,2), (r.deuda - x.deuda)::numeric(12,2), retail.fn_saldo_favor_proveedor(:'prov3')
from retail.resumen_compras_extra() e, b_x b, retail.resumen_compras() r, b_rc x;
rollback;
`
  ),
  ["180.00", "0.00", "236.00"]
);

exito(
  "IGV del mes: dos notas de devolución que suman TODO el comprobante (700 + 716) restan exactamente su IGV (216.00): el IGV neto del mes queda en 0",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_EXTRA}${compra("c1")}${nota("c1", "700.00", "FC01-204", "devolucion")}${nota("c1", "716.00", "FC01-205", "devolucion")}${DIF_MES}
select saldo, estado_pago from retail.compras where id = :'c1';
rollback;
`
  ),
  ["0.00", "pagada"]
);

exito(
  "IGV del mes con las dos notas de devolución: 216.00 de la factura − 216.00 de las notas = 0.00; compras del mes intactas (1,416.00)",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_EXTRA}${compra("c1")}${nota("c1", "700.00", "FC01-206", "devolucion")}${nota("c1", "716.00", "FC01-207", "devolucion")}${DIF_MES}
rollback;
`
  ),
  ["1416.00", "0.00", "0.00"]
);

// ---------------------------------------------------------------- quién concentra la deuda

exito(
  "concentración: un proveedor nuevo con S/ 1,180,000 de deuda es el que más se debe, y su % es su saldo sobre la deuda total (línea base + lo nuevo)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}
select deuda as d0 from retail.resumen_compras() \\gset
${compra("c1", { prov: "prov3", lineas: [1000], costo: 1000 })}
select e.top_proveedor_id = :'prov3', e.top_proveedor_nombre = (select nombre from retail.proveedores where id = :'prov3'),
  e.top_proveedor_pct = round(100 * 1180000.00 / (:'d0'::numeric + 1180000.00), 1)
from retail.resumen_compras_extra() e;
rollback;
`
  ),
  ["t", "t", "t"]
);

exito(
  "concentración: la deuda gigante de un comprobante ANULADO no cuenta — el proveedor no puede salir como el que más se debe",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", lineas: [1000], costo: 1000 })}select retail.anular_compra(:'c1', 'prueba');
select e.top_proveedor_id is distinct from :'prov3' from retail.resumen_compras_extra() e;
rollback;
`
  ),
  ["t"]
);

exito(
  "concentración: si el sistema entero queda sin deuda, no hay «proveedor que más se debe» (todo NULL, sin dividir por cero)",
  comoPersona(
    FELIPE,
    `${BASE}${PAGA_TODO}
select e.top_proveedor_id is null, e.top_proveedor_nombre is null, e.top_proveedor_pct is null from retail.resumen_compras_extra() e;
rollback;
`
  ),
  ["t", "t", "t"]
);

// ===========================================================================
// 2. resumen_compras — el reloj de Lima en la cabecera
// ===========================================================================

exito(
  "resumen_compras: un comprobante que vence HOY no está vencido (entra en «por vencer»); el corte es por día de Lima",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_RC}${compra("c1", { vence: dia(0) })}
select (r.vencidas - b.vencidas), (r.vencido - b.vencido)::numeric(12,2), (r.por_vencer - b.por_vencer), (r.por_vencer_monto - b.por_vencer_monto)::numeric(12,2)
from retail.resumen_compras() r, b_rc b;
rollback;
`
  ),
  ["0", "0.00", "1", "1416.00"]
);

exito(
  "resumen_compras: el que venció AYER sí está vencido (1 comprobante, S/ 1,416.00) y no cuenta como por vencer",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_RC}${compra("c1", { vence: dia(-1) })}
select (r.vencidas - b.vencidas), (r.vencido - b.vencido)::numeric(12,2), (r.por_vencer - b.por_vencer), (r.por_vencer_monto - b.por_vencer_monto)::numeric(12,2)
from retail.resumen_compras() r, b_rc b;
rollback;
`
  ),
  ["1", "1416.00", "0", "0.00"]
);

exito(
  "resumen_compras: un comprobante vencido cuyo saldo quedó en 0 (pagó 1,180 y una nota cubrió los 236) ya no es deuda ni vencido",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_RC}${resuelto("c1", { vence: dia(-5) })}${pago("c1", "1180.00")}${nota("c1", "236.00", "FC01-208")}
select (r.vencidas - b.vencidas), (r.vencido - b.vencido)::numeric(12,2), (r.con_saldo - b.con_saldo), (r.deuda - b.deuda)::numeric(12,2)
from retail.resumen_compras() r, b_rc b;
rollback;
`
  ),
  ["0", "0.00", "0", "0.00"]
);

// ===========================================================================
// 3. deuda_por_vencimiento — 4 tramos por antigüedad
// ===========================================================================

for (const [dias, tramo, motivo] of [
  [-1, "vencida", "venció ayer → vencida"],
  [0, "0_7", "vence HOY → 0–7, NO vencida (el corte es por día de Lima)"],
  [7, "0_7", "vence en 7 días → último día de 0–7"],
  [8, "8_30", "vence en 8 días → primer día de 8–30"],
  [30, "8_30", "vence en 30 días → último día de 8–30"],
  [31, "mas_30", "vence en 31 días → más de 30"],
]) {
  exito(
    `deuda por vencimiento: ${motivo}`,
    comoPersona(FELIPE, `${BASE}${FOTO_DEUDA}${compra("c1", { vence: dia(dias) })}${DIF_DEUDA}\nrollback;`),
    filasDeuda({ [tramo]: [1, 1416] })
  );
}

exito(
  "deuda por vencimiento: SIEMPRE 4 filas, en el orden vencida, 0_7, 8_30, mas_30 — la pantalla las pinta por posición",
  comoPersona(
    FELIPE,
    `${BASE}select count(*), bool_and(d.ord = case d.tramo when 'vencida' then 1 when '0_7' then 2 when '8_30' then 3 when 'mas_30' then 4 end)
from retail.deuda_por_vencimiento() with ordinality as d(tramo, comprobantes, monto, ord);
rollback;
`
  ),
  ["4", "t"]
);

exito(
  "deuda por vencimiento: se suma el SALDO, no el total — un pago parcial de 416 deja S/ 1,000.00 en su tramo",
  comoPersona(FELIPE, `${BASE}${FOTO_DEUDA}${compra("c1", { vence: dia(3) })}${pago("c1", "416.00")}${DIF_DEUDA}\nrollback;`),
  filasDeuda({ "0_7": [1, 1000] })
);

exito(
  "deuda por vencimiento: un comprobante pagado por completo sale de la deuda (0 comprobantes, S/ 0.00 en todos los tramos)",
  comoPersona(FELIPE, `${BASE}${FOTO_DEUDA}${compra("c1")}${pago("c1", "1416.00")}${DIF_DEUDA}\nrollback;`),
  filasDeuda()
);

exito(
  "deuda por vencimiento: comprobante anulado y factura al contado (nace pagada) no son deuda",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_DEUDA}${compra("c1")}select retail.anular_compra(:'c1', 'prueba');
${compraContado("c2")}${DIF_DEUDA}
rollback;
`
  ),
  filasDeuda()
);

exito(
  "deuda por vencimiento: la nota de crédito baja la deuda de su tramo — factura de 1,416 con nota de 236 debe S/ 1,180.00 (8–30)",
  comoPersona(FELIPE, `${BASE}${FOTO_DEUDA}${resuelto("c1", { vence: dia(15) })}${nota("c1", "236.00", "FC01-210")}${DIF_DEUDA}\nrollback;`),
  filasDeuda({ "8_30": [1, 1180] })
);

exito(
  "deuda por vencimiento: una nota que SUPERA el saldo (pagó 1,300, debe 116, nota 236) deja saldo 0, no infla la deuda y no la vuelve negativa",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_DEUDA}${resuelto("c1", { vence: dia(-3) })}${pago("c1", "1300.00")}${nota("c1", "236.00", "FC01-211")}
select coalesce(sum(d.comprobantes - b.comprobantes), 0), coalesce(sum(d.monto - b.monto), 0)::numeric(12,2), (select saldo from retail.compras where id = :'c1'),
  (select min(monto) >= 0 from retail.deuda_por_vencimiento())
from retail.deuda_por_vencimiento() d join b_dv b using (tramo);
rollback;
`
  ),
  ["0", "0.00", "0.00", "t"]
);

exito(
  "sede: en Por vencimiento el líder cuenta los comprobantes vencidos de TODAS las sedes (a Micaela ya no se le entrega esta cifra: ADR-0126)",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_DEUDA}
${compra("c1", { vence: dia(-2) })}${compra("t1", { destino: "trujillo", vence: dia(-2) })}
select (d.comprobantes - b.comprobantes), (d.monto - b.monto)::numeric(12,2) from retail.deuda_por_vencimiento() d join b_dv b on b.tramo = d.tramo where d.tramo = 'vencida';
rollback;
`
  ),
  ["2", "2832.00"]
);

// Los tres tramos de lectura y la cabecera cuentan la MISMA deuda: si alguno se separa, la pantalla se contradice.
const MEZCLA = (destinoDe = () => "taller") => `
${compra("m1", { vence: dia(-3), destino: destinoDe(1) })}${compra("m2", { vence: dia(4), destino: destinoDe(2) })}${compra("m3", { vence: dia(20), destino: destinoDe(3) })}
${compra("m4", { vence: dia(60), destino: destinoDe(4) })}${compra("m5", { vence: dia(2), destino: destinoDe(5) })}${pago("m5", "416.00")}
${resuelto("m6", { vence: dia(15), destino: destinoDe(6) })}${nota("m6", "236.00", "FC01-M6")}
${compraContado("m7", { destino: destinoDe(7) })}${compra("m8", { destino: destinoDe(8) })}select retail.anular_compra(:'m8', 'prueba');
${compra("m9", { vence: dia(0), destino: destinoDe(9) })}
`;

const INVARIANTES = `
select
  (select coalesce(sum(monto), 0) from retail.deuda_por_vencimiento()) = (select deuda from retail.resumen_compras()),
  (select coalesce(sum(monto), 0) from retail.salidas_caja_30d()) = (select deuda from retail.resumen_compras()),
  (select coalesce(sum(saldo), 0) from retail.por_pagar_tramos()) = (select deuda from retail.resumen_compras()),
  (select sum(comprobantes) from retail.deuda_por_vencimiento()) = (select con_saldo from retail.resumen_compras()),
  (select sum(comprobantes) from retail.salidas_caja_30d()) = (select con_saldo from retail.resumen_compras()),
  (select sum(comprobantes) from retail.por_pagar_tramos()) = (select con_saldo from retail.resumen_compras()),
  (select comprobantes from retail.deuda_por_vencimiento() where tramo = 'vencida') = (select vencidas from retail.resumen_compras()),
  (select monto from retail.deuda_por_vencimiento() where tramo = 'vencida') = (select vencido from retail.resumen_compras()),
  (select comprobantes from retail.deuda_por_vencimiento() where tramo = '0_7') = (select por_vencer from retail.resumen_compras()),
  (select monto from retail.deuda_por_vencimiento() where tramo = '0_7') = (select por_vencer_monto from retail.resumen_compras()),
  (select comprobantes from retail.por_pagar_tramos() where tramo = 'vencidas') = (select vencidas from retail.resumen_compras()),
  (select comprobantes from retail.por_pagar_tramos() where tramo = 'semana') = (select por_vencer from retail.resumen_compras()),
  (select deuda from retail.resumen_compras()) > 0;
`;

exito(
  "invariante (Felipe): con un escenario mixto, deuda por vencimiento = salidas de caja = Por pagar = resumen_compras, en monto Y en comprobantes",
  comoPersona(FELIPE, `${BASE}${MEZCLA()}${INVARIANTES}\nrollback;`),
  Array(13).fill("t")
);

// (Se quitó «invariante (Micaela)»: las identidades entre indicadores de dinero ya no se le muestran a un integrante — ADR-0126.)

exito(
  "borde defensivo: una compra AL CONTADO impaga y sin vencimiento (la base lo permite, el RPC no) se cuenta como «vence hoy» en las tres lecturas — no se descarta en silencio",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_DEUDA}${FOTO_SALIDAS}${fotoPP("b_pp")}${FOTO_RC}
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, ubicacion_destino_id, subtotal, igv, total)
  values (:'prov1', 'factura', 'TST', 'CI' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), retail.fn_hoy_lima(), 'contado', null, :'taller', 100.00, 18.00, 118.00);
select
  (select d.comprobantes - b.comprobantes from retail.deuda_por_vencimiento() d join b_dv b using (tramo) where tramo = '0_7'),
  (select (d.monto - b.monto)::numeric(12,2) from retail.deuda_por_vencimiento() d join b_dv b using (tramo) where tramo = '0_7'),
  (select s.comprobantes - b.comprobantes from retail.salidas_caja_30d() s join b_sc b using (orden) where orden = 1),
  (select (s.monto - b.monto)::numeric(12,2) from retail.salidas_caja_30d() s join b_sc b using (orden) where orden = 1),
  (select p.comprobantes - b.comprobantes from retail.por_pagar_tramos() p join b_pp b using (tramo) where tramo = 'semana'),
  (select (p.saldo - b.saldo)::numeric(12,2) from retail.por_pagar_tramos() p join b_pp b using (tramo) where tramo = 'semana'),
  (select (r.deuda - b.deuda)::numeric(12,2) from retail.resumen_compras() r, b_rc b);
rollback;
`
  ),
  ["1", "118.00", "1", "118.00", "1", "118.00", "118.00"]
);

// ===========================================================================
// 4. salidas_caja_30d — semana a semana desde hoy
// ===========================================================================

exito(
  "salidas de caja: lo que vence HOY es la semana 1, no «Vencido» — el día actual de Lima todavía se puede pagar",
  comoPersona(FELIPE, `${BASE}${FOTO_SALIDAS}${compra("c1", { vence: dia(0) })}${DIF_SALIDAS}\nrollback;`),
  filasSalidas({ 1: [1, 1416] })
);

exito(
  "salidas de caja: lo que venció AYER es «Vencido» (orden 0)",
  comoPersona(FELIPE, `${BASE}${FOTO_SALIDAS}${compra("c1", { vence: dia(-1) })}${DIF_SALIDAS}\nrollback;`),
  filasSalidas({ 0: [1, 1416] })
);

exito(
  "salidas de caja: el último día de cada semana y el primero de la siguiente (6/7, 13/14, 20/21, 27/28) caen en cubetas contiguas — sin huecos ni solapes",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_SALIDAS}${[6, 7, 13, 14, 20, 21, 27, 28].map((d, i) => compra(`s${i}`, { vence: dia(d) })).join("")}${DIF_SALIDAS}
rollback;
`
  ),
  filasSalidas({ 1: [1, 1416], 2: [2, 2832], 3: [2, 2832], 4: [2, 2832], 5: [1, 1416] })
);

exito(
  "salidas de caja: siempre 6 filas (0..5), «Vencido» y «Después» con sus extremos abiertos, es_vencido solo en la primera, y las 4 semanas encadenan hasta+1 = desde",
  comoPersona(
    FELIPE,
    `${BASE}select count(*), bool_and(s.ord = s.orden + 1), min(s.etiqueta) filter (where s.orden = 0), min(s.etiqueta) filter (where s.orden = 5),
  count(*) filter (where s.es_vencido),
  bool_and(case s.orden
    when 0 then s.desde is null and s.hasta = retail.fn_hoy_lima() - 1
    when 5 then s.hasta is null and s.desde = retail.fn_hoy_lima() + 28
    else s.desde = retail.fn_hoy_lima() + 7 * (s.orden - 1) and s.hasta = retail.fn_hoy_lima() + 7 * s.orden - 1 end)
from retail.salidas_caja_30d() with ordinality as s(orden, etiqueta, desde, hasta, comprobantes, monto, es_vencido, ord);
rollback;
`
  ),
  ["6", "t", "Vencido", "Después", "1", "t"]
);

exito(
  "salidas de caja: las etiquetas salen en español y sin depender del locale, también al cruzar mes (25 sep), año (28 dic) y febrero (25 feb)",
  comoPersona(
    FELIPE,
    `${BASE}create temp table _e (fecha text, etiquetas text) on commit drop;
${RELOJ("date '2026-09-25'")}insert into _e select '2026-09-25', string_agg(etiqueta, ' / ' order by orden) from retail.salidas_caja_30d();
${RELOJ("date '2026-12-28'")}insert into _e select '2026-12-28', string_agg(etiqueta, ' / ' order by orden) from retail.salidas_caja_30d();
${RELOJ("date '2027-02-25'")}insert into _e select '2027-02-25', string_agg(etiqueta, ' / ' order by orden) from retail.salidas_caja_30d();
${RELOJ("date '2026-09-01'")}insert into _e select '2026-09-01', string_agg(etiqueta, ' / ' order by orden) from retail.salidas_caja_30d();
select * from _e order by fecha;
rollback;
`
  ),
  [
    ["2026-09-01", "Vencido / 1–7 sep / 8–14 sep / 15–21 sep / 22–28 sep / Después"],
    ["2026-09-25", "Vencido / 25 sep–1 oct / 2–8 oct / 9–15 oct / 16–22 oct / Después"],
    ["2026-12-28", "Vencido / 28 dic–3 ene / 4–10 ene / 11–17 ene / 18–24 ene / Después"],
    ["2027-02-25", "Vencido / 25 feb–3 mar / 4–10 mar / 11–17 mar / 18–24 mar / Después"],
  ]
);

exito(
  "salidas de caja: se suma el SALDO neto de notas — factura de 1,416 con una nota de 236 sale de caja por S/ 1,180.00 (semana 1)",
  comoPersona(FELIPE, `${BASE}${FOTO_SALIDAS}${resuelto("c1", { vence: dia(3) })}${nota("c1", "236.00", "FC01-220")}${DIF_SALIDAS}\nrollback;`),
  filasSalidas({ 1: [1, 1180] })
);

exito(
  "salidas de caja: pagada por completo, anulada y al contado no son una salida futura (0 comprobantes, S/ 0.00 en total)",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_SALIDAS}${compra("c1")}${pago("c1", "1416.00")}${compra("c2")}select retail.anular_compra(:'c2', 'prueba');
${compraContado("c3")}
select coalesce(sum(s.comprobantes - b.comprobantes), 0), coalesce(sum(s.monto - b.monto), 0)::numeric(12,2)
from retail.salidas_caja_30d() s join b_sc b using (orden);
rollback;
`
  ),
  ["0", "0.00"]
);

exito(
  "sede: en Salidas de caja el líder ve las salidas de TODAS las sedes (S/ 2,832.00); a Micaela ya no se le entregan (ADR-0126)",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_SALIDAS}
${compra("c1", { vence: dia(1) })}${compra("t1", { destino: "trujillo", vence: dia(1) })}
select (s.comprobantes - b.comprobantes), (s.monto - b.monto)::numeric(12,2) from retail.salidas_caja_30d() s join b_sc b on b.orden = s.orden where s.orden = 1;
rollback;
`
  ),
  ["2", "2832.00"]
);

// ===========================================================================
// 5. por_pagar_tramos — subtotales reales de la lista
// ===========================================================================

exito(
  "Por pagar: vencidas (ayer) / semana (hoy y +7) / después (+8) — los bordes del tramo «semana» son hoy y hoy + 7",
  comoPersona(
    FELIPE,
    `${BASE}${fotoPP("b_pp")}${compra("c1", { vence: dia(-1) })}${compra("c2", { vence: dia(0) })}${compra("c3", { vence: dia(7) })}${compra("c4", { vence: dia(8) })}${difPP("b_pp")}
rollback;
`
  ),
  filasPP({ vencidas: [1, 1416], semana: [2, 2832], despues: [1, 1416] })
);

exito(
  "Por pagar: SIEMPRE 3 filas fijas (vencidas, semana, despues) aunque no haya deuda — la lista pinta un grupo por fila",
  comoPersona(
    FELIPE,
    `${BASE}${PAGA_TODO}select count(*), bool_and(p.ord = case p.tramo when 'vencidas' then 1 when 'semana' then 2 when 'despues' then 3 end), sum(p.comprobantes), sum(p.saldo)
from retail.por_pagar_tramos() with ordinality as p(tramo, comprobantes, saldo, ord);
rollback;
`
  ),
  ["3", "t", "0", "0"]
);

exito(
  "Por pagar con filtro de proveedor: solo suma la deuda de ESE proveedor (Confecciones del Sur), no la del otro",
  comoPersona(
    FELIPE,
    `${BASE}${fotoPP("b_pp", "p_proveedor_id => :'prov2'")}${compra("c1", { vence: dia(-1) })}${compra("c2", { prov: "prov2", vence: dia(-1), lineas: [10] })}${difPP("b_pp", "p_proveedor_id => :'prov2'")}
rollback;
`
  ),
  filasPP({ vencidas: [1, 590] })
);

exito(
  "Por pagar con filtro de condición: «credito» ve la deuda nueva y «contado» ninguna (un contado se paga al registrarse)",
  comoPersona(
    FELIPE,
    `${BASE}${fotoPP("b_cr", "p_condicion => 'credito'")}${fotoPP("b_co", "p_condicion => 'contado'")}${compra("c1", { vence: dia(-1) })}${compraContado("c2")}
select (select sum(p.comprobantes - b.comprobantes) from retail.por_pagar_tramos(p_condicion => 'credito') p join b_cr b using (tramo)),
  (select sum(p.saldo - b.saldo)::numeric(12,2) from retail.por_pagar_tramos(p_condicion => 'credito') p join b_cr b using (tramo)),
  (select sum(p.comprobantes - b.comprobantes) from retail.por_pagar_tramos(p_condicion => 'contado') p join b_co b using (tramo)),
  (select sum(p.saldo - b.saldo)::numeric(12,2) from retail.por_pagar_tramos(p_condicion => 'contado') p join b_co b using (tramo));
rollback;
`
  ),
  ["1", "1416.00", "0", "0.00"]
);

exito(
  "Por pagar con «solo vencidas»: únicamente el tramo vencidas suma; lo que vence hoy o después queda fuera aunque tenga saldo",
  comoPersona(
    FELIPE,
    `${BASE}${fotoPP("b_pp", "p_solo_vencidas => true")}${compra("c1", { vence: dia(-1) })}${compra("c2", { vence: dia(0) })}${compra("c3", { vence: dia(9) })}${difPP("b_pp", "p_solo_vencidas => true")}
rollback;
`
  ),
  filasPP({ vencidas: [1, 1416] })
);

exito(
  "Por pagar: búsqueda por documento — encuentra el comprobante por un pedazo de su número, sin importar mayúsculas",
  comoPersona(
    FELIPE,
    `${BASE}${fotoPP("b_pp", "p_busqueda => 'zqx-paga'")}${compra("c1", { serie: "ZQX", numero: "PAGA" })}${difPP("b_pp", "p_busqueda => 'zqx-paga'")}
rollback;
`
  ),
  filasPP({ despues: [1, 1416] })
);

exito(
  "Por pagar: la búsqueda ignora los espacios de alrededor y las mayúsculas («  ZQX-PAGA  » = «zqx-paga»)",
  comoPersona(
    FELIPE,
    `${BASE}${fotoPP("b_pp", "p_busqueda => '  ZQX-PAGA  '")}${compra("c1", { serie: "ZQX", numero: "PAGA" })}${difPP("b_pp", "p_busqueda => '  ZQX-PAGA  '")}
rollback;
`
  ),
  filasPP({ despues: [1, 1416] })
);

exito(
  "Por pagar: búsqueda por nombre de proveedor — trae la deuda del proveedor cuyo nombre coincide y deja la de los demás",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3", { nombre: "Zzqx Textil Prueba" })}${fotoPP("b_pp", "p_busqueda => 'zzqx textil'")}
${compra("c1", { prov: "prov3", vence: dia(-1) })}${compra("c2", { vence: dia(-1) })}${difPP("b_pp", "p_busqueda => 'zzqx textil'")}
rollback;
`
  ),
  filasPP({ vencidas: [1, 1416] })
);

exito(
  "Por pagar: los filtros se COMBINAN con Y — proveedor + crédito + solo vencidas deja únicamente la vencida de ese proveedor",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${fotoPP("b_pp", "p_proveedor_id => :'prov3', p_condicion => 'credito', p_solo_vencidas => true")}
${compra("c1", { prov: "prov3", vence: dia(-2) })}${compra("c2", { prov: "prov3", vence: dia(2) })}${compra("c3", { vence: dia(-2) })}${difPP("b_pp", "p_proveedor_id => :'prov3', p_condicion => 'credito', p_solo_vencidas => true")}
rollback;
`
  ),
  filasPP({ vencidas: [1, 1416] })
);

exito(
  "Por pagar: una búsqueda en blanco («   ») equivale a no filtrar — no puede vaciar la lista",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { vence: dia(-1) })}
select count(*) = 0 from (select * from retail.por_pagar_tramos(p_busqueda => '   ') except select * from retail.por_pagar_tramos()) x;
rollback;
`
  ),
  ["t"]
);

exito(
  "Por pagar: el subtotal cubre TODA la deuda, no la página — 60 comprobantes suman 60 aunque la lista trae 50 (+1 de cursor)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}
select count(retail.registrar_compra(:'prov3', 'TST', 'B' || g || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 'credito', :'taller',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 1, 'costo_unitario', 10)),
  p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() - 1)) as _n from generate_series(1, 60) g \\gset
select (select comprobantes from retail.por_pagar_tramos(p_proveedor_id => :'prov3') where tramo = 'vencidas'),
  (select saldo from retail.por_pagar_tramos(p_proveedor_id => :'prov3') where tramo = 'vencidas'),
  (select count(*) from retail.listar_compras(p_limite => 50, p_con_saldo => true, p_proveedor_id => :'prov3'));
rollback;
`
  ),
  ["60", "708.00", "51"]
);

exito(
  "Por pagar: los subtotales cuadran con las filas que la lista muestra con los mismos filtros (proveedor; y proveedor + solo vencidas)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", vence: dia(-4) })}${compra("c2", { prov: "prov3", vence: dia(3) })}${compra("c3", { prov: "prov3", vence: dia(40) })}${compra("c4", { prov: "prov3", vence: dia(5) })}${pago("c4", "416.00")}
select
  (select sum(saldo) from retail.por_pagar_tramos(p_proveedor_id => :'prov3')) = (select sum(saldo) from retail.listar_compras(p_limite => 200, p_con_saldo => true, p_proveedor_id => :'prov3')),
  (select sum(comprobantes) from retail.por_pagar_tramos(p_proveedor_id => :'prov3')) = (select count(*) from retail.listar_compras(p_limite => 200, p_con_saldo => true, p_proveedor_id => :'prov3')),
  (select sum(saldo) from retail.por_pagar_tramos(p_proveedor_id => :'prov3', p_solo_vencidas => true)) = (select sum(saldo) from retail.listar_compras(p_limite => 200, p_con_saldo => true, p_solo_vencidas => true, p_proveedor_id => :'prov3')),
  (select sum(saldo) from retail.por_pagar_tramos(p_proveedor_id => :'prov3', p_solo_vencidas => true)) = 1416.00;
rollback;
`
  ),
  ["t", "t", "t", "t"]
);

exito(
  "Por pagar: se suma el saldo, no el total — un pago parcial de 416 deja S/ 1,000.00 en «semana»",
  comoPersona(FELIPE, `${BASE}${fotoPP("b_pp")}${compra("c1", { vence: dia(3) })}${pago("c1", "416.00")}${difPP("b_pp")}\nrollback;`),
  filasPP({ semana: [1, 1000] })
);

exito(
  "sede: en Por pagar el líder ve los vencidos de TODAS las sedes; a Micaela ya no se le entregan (ADR-0126)",
  comoPersona(
    FELIPE,
    `${BASE}${fotoPP("b_pp")}
${compra("c1", { vence: dia(-1) })}${compra("t1", { destino: "trujillo", vence: dia(-1) })}
select (p.comprobantes - b.comprobantes), (p.saldo - b.saldo)::numeric(12,2) from retail.por_pagar_tramos() p join b_pp b on b.tramo = p.tramo where p.tramo = 'vencidas';
rollback;
`
  ),
  ["2", "2832.00"]
);

// H3 (corregido en 20260918221000): por_pagar_tramos no aceptaba el tipo de documento ni el rango de emisión que sí tiene listar_compras, y los subtotales no cuadraban con las filas filtradas.
exito(
  "por_pagar_tramos acepta el tipo de documento y el rango de emisión igual que listar_compras, y quedó UNA sola firma (sin sobrecarga)",
  comoPersona(
    FELIPE,
    `${BASE}select pg_get_function_arguments('retail.por_pagar_tramos(uuid, text, boolean, text, text, date, date)'::regprocedure) ilike '%p_tipo%',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'por_pagar_tramos');
rollback;
`
  ),
  ["t", "1"]
);

exito(
  "por_pagar_tramos filtrado por tipo y por emisión: los subtotales cuadran con las filas de listar_compras (boleta 1, factura 1, sin filtro 2, desde -10 días 1, hasta -10 días 1)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", tipo: "factura", emision: dia(-20), vence: dia(-1) })}${compra("c2", { prov: "prov3", tipo: "boleta", igv: 0, emision: dia(-5), vence: dia(20) })}
select (select coalesce(sum(t.saldo), 0) from retail.por_pagar_tramos(p_proveedor_id => :'prov3', p_tipo => 'boleta') t)
       = (select coalesce(sum(r.saldo), 0) from retail.listar_compras(p_limite => 200, p_proveedor_id => :'prov3', p_tipo => 'boleta', p_con_saldo => true) r),
  (select sum(t.comprobantes) from retail.por_pagar_tramos(p_proveedor_id => :'prov3', p_tipo => 'boleta') t),
  (select sum(t.comprobantes) from retail.por_pagar_tramos(p_proveedor_id => :'prov3', p_tipo => 'factura') t),
  (select sum(t.comprobantes) from retail.por_pagar_tramos(p_proveedor_id => :'prov3') t),
  (select sum(t.comprobantes) from retail.por_pagar_tramos(p_proveedor_id => :'prov3', p_desde => ${dia(-10)}) t),
  (select sum(t.comprobantes) from retail.por_pagar_tramos(p_proveedor_id => :'prov3', p_hasta => ${dia(-10)}) t);
rollback;
`
  ),
  ["t", "1", "1", "2", "1", "1"]
);

// ---------------------------------------------------------------- «sistema sin deuda»

exito(
  "sin deuda en todo el sistema: deuda por vencimiento (4 filas), salidas de caja (6) y Por pagar (3) siguen devolviendo sus filas fijas, todas en cero",
  comoPersona(
    FELIPE,
    `${BASE}${PAGA_TODO}select (select count(*) from retail.deuda_por_vencimiento()), (select sum(monto) from retail.deuda_por_vencimiento()),
  (select count(*) from retail.salidas_caja_30d()), (select sum(monto) from retail.salidas_caja_30d()),
  (select count(*) from retail.por_pagar_tramos()), (select sum(saldo) from retail.por_pagar_tramos()),
  (select deuda from retail.resumen_compras());
rollback;
`
  ),
  ["4", "0", "6", "0", "3", "0", "0"]
);

// ===========================================================================
// 6. Recepciones — resumen_recepciones y listar_recepciones_compras
// ===========================================================================

const GUIA = (etiqueta) => `p_busqueda => '${etiqueta}'`;

exito(
  "recepciones: una guía que cubre 2 comprobantes aparece 2 veces (un lote, dos filas), cada una con lo que llegó de SU comprobante",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}${recibeJuntas("l1", [["c1_item", 10], ["c2_item", 6]], { guia: "GZQX-DOBLE" })}
select count(*), count(distinct l.lote_id), count(distinct l.compra_id), sum(l.unidades_llegaron),
  (select unidades_llegaron from retail.listar_recepciones_compras(${GUIA("GZQX-DOBLE")}) where compra_id = :'c1'),
  (select unidades_llegaron from retail.listar_recepciones_compras(${GUIA("GZQX-DOBLE")}) where compra_id = :'c2')
from retail.listar_recepciones_compras(${GUIA("GZQX-DOBLE")}) l;
rollback;
`
  ),
  ["2", "1", "2", "16", "10", "6"]
);

exito(
  "resumen de recepciones: esa misma guía es 1 recepción pero 2 comprobantes recibidos, 30 unidades, 1 entrega completa y 18 unidades de faltante abierto en 1 comprobante",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_RR}${compra("c1")}${compra("c2")}${recibeJuntas("l1", [["c1_item", 24], ["c2_item", 6]], { guia: "GZQX-RES" })}
select (r.unidades_recibidas - b.unidades_recibidas), (r.recepciones - b.recepciones), (r.comprobantes_recibidos - b.comprobantes_recibidos),
  (r.entregas_completas - b.entregas_completas), (r.faltante_unidades - b.faltante_unidades), (r.faltante_comprobantes - b.faltante_comprobantes)
from retail.resumen_recepciones() r, b_rr b;
rollback;
`
  ),
  ["30", "1", "2", "1", "18", "1"]
);

exito(
  "demora: la guía llegó 5 días después de emitirse el comprobante → dias_demora = 5",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { emision: dia(-10) })}${recibe("c1_item", 24, { lote: "l1", guia: "GZQX-D5" })}${fechaLote("l1", `${dia(-10)} + 5`)}
select dias_demora from retail.listar_recepciones_compras(${GUIA("GZQX-D5")});
rollback;
`
  ),
  ["5"]
);

exito(
  "demora: una guía fechada ANTES de la emisión (se recibió y luego llegó la factura) no da demora negativa — 0",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${recibe("c1_item", 24, { lote: "l1", guia: "GZQX-D0" })}${fechaLote("l1", dia(-3))}
select dias_demora from retail.listar_recepciones_compras(${GUIA("GZQX-D0")});
rollback;
`
  ),
  ["0"]
);

exito(
  "borde de día en Lima: una guía recibida a las 22:30 de Lima cuenta como ESE día (demora 4), aunque en UTC ya sea el día siguiente (5)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { emision: dia(-10) })}${recibe("c1_item", 24, { lote: "l1", guia: "GZQX-D22" })}${fechaLote("l1", `${dia(-10)} + 4`, "22:30")}
select l.dias_demora, (l.fecha_recepcion at time zone 'UTC')::date - (select fecha_emision from retail.compras where id = :'c1')
from retail.listar_recepciones_compras(${GUIA("GZQX-D22")}) l;
rollback;
`
  ),
  ["4", "5"]
);

exito(
  "demora promedio: dos guías de 2 (recibida a las 22:30 de Lima) y 6 días dan 4.0 sobre las mismas filas (universo aislado con fechas del futuro lejano, sin mezclar el seed)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { emision: dia(400), vence: dia(410) })}${compra("c2", { emision: dia(400), vence: dia(410) })}
${recibe("c1_item", 24, { lote: "l1" })}${fechaLote("l1", `${dia(400)} + 2`, "22:30")}${recibe("c2_item", 24, { lote: "l2" })}${fechaLote("l2", `${dia(400)} + 6`)}
select r.dias_entrega_promedio, r.recepciones, r.unidades_recibidas, r.comprobantes_recibidos, r.entregas_completas from retail.resumen_recepciones(${dia(399)}) r;
rollback;
`
  ),
  ["4.0", "2", "48", "2", "2"]
);

exito(
  "ventana por defecto de 90 días: una guía de hace 91 días (a las 22:30 de Lima, que en UTC ya es hace 90) queda fuera y la de hace 90 entra — el borde es inclusivo y por día de Lima",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_RR}${compra("c1", { emision: dia(-100) })}${compra("c2", { emision: dia(-100) })}
${recibe("c1_item", 24, { lote: "l1" })}${fechaLote("l1", dia(-91), "22:30")}${recibe("c2_item", 24, { lote: "l2" })}${fechaLote("l2", dia(-90))}
select (r.recepciones - b.recepciones), (r.comprobantes_recibidos - b.comprobantes_recibidos) from retail.resumen_recepciones() r, b_rr b;
rollback;
`
  ),
  ["1", "1"]
);

exito(
  "faltante abierto: solo el comprobante PARCIAL cuenta (4 u); el sin recibir es «por llegar» y el que se cerró por faltante ya está resuelto",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_RR}${compra("c1")}${recibe("c1_item", 20)}${compra("c2")}${resuelto("c3")}
select (r.faltante_unidades - b.faltante_unidades), (r.faltante_comprobantes - b.faltante_comprobantes) from retail.resumen_recepciones() r, b_rr b;
rollback;
`
  ),
  ["4", "1"]
);

exito(
  "faltante abierto NO depende de la ventana: una recepción parcial de hace 200 días sigue faltando aunque su guía ya no entre en los 90 días",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_RR}${compra("c1", { emision: dia(-210) })}${recibe("c1_item", 20, { lote: "l1" })}${fechaLote("l1", dia(-200))}
select (r.recepciones - b.recepciones), (r.faltante_unidades - b.faltante_unidades), (r.faltante_comprobantes - b.faltante_comprobantes) from retail.resumen_recepciones() r, b_rr b;
rollback;
`
  ),
  ["0", "4", "1"]
);

exito(
  "entrega completa = llegó TODO lo facturado: una línea cerrada por faltante (20 de 24) cuenta como comprobante recibido pero NO como entrega completa",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_RR}${resuelto("c1")}${compra("c2")}${recibe("c2_item", 24)}
select (r.comprobantes_recibidos - b.comprobantes_recibidos), (r.entregas_completas - b.entregas_completas) from retail.resumen_recepciones() r, b_rr b;
rollback;
`
  ),
  ["2", "1"]
);

exito(
  "lista: el faltante de cada fila es lo que falta HOY del comprobante (8 u), igual en todas sus guías, junto a lo facturado (24) y lo que llegó en cada guía",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { emision: dia(-5) })}${recibe("c1_item", 10, { lote: "l1" })}${recibe("c1_item", 6, { lote: "l2" })}${fechaLote("l1", dia(-2))}${fechaLote("l2", dia(-1))}
select count(*), min(faltante), max(faltante), max(unidades_facturadas), sum(unidades_llegaron) from retail.listar_recepciones_compras(p_busqueda => :'c1_doc');
rollback;
`
  ),
  ["2", "8", "8", "24", "16"]
);

exito(
  "lista: busca por número de comprobante, por guía y por proveedor (sin importar mayúsculas ni espacios) y un texto que no existe no trae nada",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3", { nombre: "Zzqx Textil Prueba" })}${compra("c1", { prov: "prov3" })}${recibe("c1_item", 24, { lote: "l1", guia: "GZQX-BUSCA" })}
select (select count(*) from retail.listar_recepciones_compras(p_busqueda => '  ' || lower(:'c1_doc') || '  ')),
  (select count(*) from retail.listar_recepciones_compras(p_busqueda => 'gzqx-busca')),
  (select count(*) from retail.listar_recepciones_compras(p_busqueda => 'zzqx textil')),
  (select count(*) from retail.listar_recepciones_compras(p_busqueda => 'no-existe-qqzz'));
rollback;
`
  ),
  ["1", "1", "1", "0"]
);

exito(
  "lista: los filtros de fecha usan el DÍA DE LIMA — una guía de las 22:30 (03:30 UTC del día siguiente) entra con hasta = ese día y sale con desde = el día siguiente",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { emision: dia(-10) })}${recibe("c1_item", 24, { lote: "l1", guia: "GZQX-FECHA" })}${fechaLote("l1", dia(-3), "22:30")}
select (select count(*) from retail.listar_recepciones_compras(${GUIA("GZQX-FECHA")}, p_hasta => ${dia(-3)})),
  (select count(*) from retail.listar_recepciones_compras(${GUIA("GZQX-FECHA")}, p_desde => ${dia(-3)})),
  (select count(*) from retail.listar_recepciones_compras(${GUIA("GZQX-FECHA")}, p_hasta => ${dia(-4)})),
  (select count(*) from retail.listar_recepciones_compras(${GUIA("GZQX-FECHA")}, p_desde => ${dia(-2)}));
rollback;
`
  ),
  ["1", "1", "0", "0"]
);

exito(
  "lista: las guías salen de la más reciente a la más antigua",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { emision: dia(-5) })}${recibe("c1_item", 10, { lote: "l1" })}${recibe("c1_item", 6, { lote: "l2" })}${fechaLote("l1", dia(-2))}${fechaLote("l2", dia(-1))}
select string_agg(l.unidades_llegaron::text, ',' order by l.ord)
from retail.listar_recepciones_compras(p_busqueda => :'c1_doc') with ordinality as l(lote_id, fecha_recepcion, ubicacion_nombre, proveedor_id, proveedor_nombre, numero_guia, recibido_por, compra_id, documento, unidades_llegaron, unidades_facturadas, faltante, dias_demora, ord);
rollback;
`
  ),
  ["6,10"]
);

exito(
  "lista: el filtro por proveedor trae solo las guías de ESE proveedor (Confecciones del Sur), no las de otro que recibió la misma semana",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${recibe("c1_item", 24, { guia: "GZQX-PROV" })}${compra("c2", { prov: "prov2" })}${recibe("c2_item", 24, { guia: "GZQX-PROV" })}
select (select count(*) from retail.listar_recepciones_compras(p_proveedor_id => :'prov2', ${GUIA("GZQX-PROV")})),
  (select bool_and(l.proveedor_nombre = 'Confecciones del Sur EIRL') from retail.listar_recepciones_compras(p_proveedor_id => :'prov2', ${GUIA("GZQX-PROV")}) l),
  (select count(*) from retail.listar_recepciones_compras(${GUIA("GZQX-PROV")}));
rollback;
`
  ),
  ["1", "t", "2"]
);

exito(
  "demora promedio: se promedia por GUÍA (una entrega en 2 guías pesa 2 veces) y la muestra cuenta COMPROBANTES — (2 + 6 + 10)/3 = 6.0 sobre 2 comprobantes",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", emision: dia(-20) })}${recibe("c1_item", 10, { lote: "l1" })}${recibe("c1_item", 14, { lote: "l2" })}${fechaLote("l1", `${dia(-20)} + 2`)}${fechaLote("l2", `${dia(-20)} + 6`)}
${compra("c2", { prov: "prov3", emision: dia(-20) })}${recibe("c2_item", 24, { lote: "l3" })}${fechaLote("l3", `${dia(-20)} + 10`)}
select m.dias_entrega_promedio, m.dias_entrega_muestra from retail.fn_proveedor_metricas_compras(:'prov3') m;
rollback;
`
  ),
  ["6.0", "2"]
);

exito(
  "lista: el límite se acota entre 1 y 200 — un límite de 0 o negativo devuelve 1 fila, no error ni vacío",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${recibe("c1_item", 10)}
select (select count(*) from retail.listar_recepciones_compras(p_limite => 0)), (select count(*) from retail.listar_recepciones_compras(p_limite => -5)), (select count(*) from retail.listar_recepciones_compras(p_limite => 1));
rollback;
`
  ),
  ["1", "1", "1"]
);

exito(
  "sede: Micaela (Trujillo) solo ve recepciones de comprobantes destinados a SU sede — la guía de Taller no aparece en su lista ni en su resumen",
  comoPersona(
    FELIPE,
    `${BASE}${cambiaA(MICAELA)}${foto("b_m", "select * from retail.resumen_recepciones()")}${cambiaA(FELIPE)}${FOTO_RR}
${compra("c1")}${compra("t1", { destino: "trujillo" })}${recibe("c1_item", 24, { guia: "GZQX-SEDE" })}${recibe("t1_item", 24, { ubic: "trujillo", guia: "GZQX-SEDE" })}
${cambiaA(MICAELA)}select (select count(*) from retail.listar_recepciones_compras(${GUIA("GZQX-SEDE")})) as m_l, (select documento = :'t1_doc' from retail.listar_recepciones_compras(${GUIA("GZQX-SEDE")})) as m_d,
  (r.recepciones - b.recepciones) as m_r from retail.resumen_recepciones() r, b_m b \\gset
${cambiaA(FELIPE)}select :'m_l', :'m_d', :'m_r', (select count(*) from retail.listar_recepciones_compras(${GUIA("GZQX-SEDE")})), (r.recepciones - b.recepciones) from retail.resumen_recepciones() r, b_rr b;
rollback;
`
  ),
  ["1", "t", "1", "2", "2"]
);

// ===========================================================================
// 7. Ingreso sin comprobante — resumen_sin_comprobante y recepciones_sin_comprobante
// ===========================================================================

const DIF_SC = `select (r.unidades_mes - b.unidades_mes), (r.recepciones_mes - b.recepciones_mes), (r.unidades_sin_costo_mes - b.unidades_sin_costo_mes)
from retail.resumen_sin_comprobante() r, b_sc2 b;`;

exito(
  "sin comprobante: un lote de 10 u con costo suma 10 unidades y 1 recepción del mes, y ninguna unidad sin costo",
  comoPersona(FELIPE, `${BASE}${FOTO_SC}${recibeSC("l1", { items: [[10, 30]] })}${DIF_SC}\nrollback;`),
  ["10", "1", "0"]
);

exito(
  "sin comprobante: 10 u SIN costo suman a «unidades sin costo» y su lote sale con sin_costo = sí y sin costo promedio (falta completar)",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_SC}${recibeSC("l1", { items: [[10, null]] })}
select (r.unidades_mes - b.unidades_mes), (r.recepciones_mes - b.recepciones_mes), (r.unidades_sin_costo_mes - b.unidades_sin_costo_mes),
  (select x.sin_costo from retail.recepciones_sin_comprobante(p_limite => 200) x where x.lote_id = :'l1'),
  (select x.costo_unitario_promedio is null from retail.recepciones_sin_comprobante(p_limite => 200) x where x.lote_id = :'l1')
from retail.resumen_sin_comprobante() r, b_sc2 b;
rollback;
`
  ),
  ["10", "1", "10", "t", "t"]
);

exito(
  "sin comprobante: un costo registrado en 0 (obsequio) SÍ es costo — una decisión explícita, no una omisión: no cuenta como sin costo",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_SC}${recibeSC("l1", { items: [[10, 0]] })}
select (r.unidades_mes - b.unidades_mes), (r.unidades_sin_costo_mes - b.unidades_sin_costo_mes),
  (select x.sin_costo from retail.recepciones_sin_comprobante(p_limite => 200) x where x.lote_id = :'l1'),
  (select x.costo_unitario_promedio from retail.recepciones_sin_comprobante(p_limite => 200) x where x.lote_id = :'l1')
from retail.resumen_sin_comprobante() r, b_sc2 b;
rollback;
`
  ),
  ["10", "0", "f", "0.00"]
);

exito(
  "sin comprobante: lote a medias (6 u a S/ 40, 4 u a S/ 60 y 5 u sin costo) → 15 u, 5 sin costo, el lote sigue marcado sin_costo y el costo promedio es el ponderado de lo que SÍ tiene costo (S/ 48.00)",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_SC}${recibeSC("l1", { items: [[6, 40], [4, 60], [5, null]] })}
select (r.unidades_mes - b.unidades_mes), (r.recepciones_mes - b.recepciones_mes), (r.unidades_sin_costo_mes - b.unidades_sin_costo_mes),
  x.sin_costo, x.costo_unitario_promedio, x.unidades
from retail.resumen_sin_comprobante() r, b_sc2 b, retail.recepciones_sin_comprobante(p_limite => 200) x where x.lote_id = :'l1';
rollback;
`
  ),
  ["15", "1", "5", "t", "48.00", "15"]
);

exito(
  "borde de mes en hora de Lima: un ingreso del último día del mes anterior a las 22:30 (que en UTC ya es el mes nuevo) NO es del mes; el del día 1 a las 00:30 sí",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_SC}${recibeSC("l1", { items: [[10, 30]] })}${fechaLote("l1", ULTIMO_DIA_MES_ANT, "22:30")}${recibeSC("l2", { items: [[7, 30]] })}${fechaLote("l2", PRIMER_DIA_MES, "00:30")}
${DIF_SC}
rollback;
`
  ),
  ["7", "1", "0"]
);

exito(
  "última recepción: no se limita al mes y reporta la sede — un lote posterior en Tienda Trujillo es la «última» con esa ubicación",
  comoPersona(
    FELIPE,
    `${BASE}${recibeSC("l1", { ubic: "trujillo", items: [[3, 30]] })}update retail.lotes set fecha_recepcion = now() + interval '40 days' where id = :'l1';
select r.ultima_recepcion = (select l.fecha_recepcion from retail.lotes l where l.id = :'l1'), r.ultima_ubicacion from retail.resumen_sin_comprobante() r;
rollback;
`
  ),
  ["t", "Tienda Trujillo"]
);

exito(
  "un lote recibido CONTRA comprobante no es «sin comprobante»: no suma ninguna cifra ni aparece en su lista (sí en la de recepciones contra comprobante)",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_SC}${compra("c1")}${recibe("c1_item", 10, { lote: "l1", guia: "GZQX-CON" })}
select (r.unidades_mes - b.unidades_mes), (r.recepciones_mes - b.recepciones_mes), (r.unidades_sin_costo_mes - b.unidades_sin_costo_mes),
  (select count(*) from retail.recepciones_sin_comprobante(p_limite => 200) x where x.lote_id = :'l1'),
  (select count(*) from retail.listar_recepciones_compras(${GUIA("GZQX-CON")}))
from retail.resumen_sin_comprobante() r, b_sc2 b;
rollback;
`
  ),
  ["0", "0", "0", "0", "1"]
);

exito(
  "lote MIXTO (una línea de comprobante + 5 u «fuera de comprobante» sin costo): sigue siendo una recepción con comprobante — DECISIÓN DOCUMENTADA en 20260918213000: esas 5 u sin costo no salen en «sin comprobante»",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_SC}${compra("c1")}
select retail.recibir_compras(:'taller', jsonb_build_array(
  jsonb_build_object('compra_item_id', :'c1_item', 'variante_id', :'var', 'cantidad', 10),
  jsonb_build_object('variante_id', :'var', 'cantidad', 5)), 'GZQX-MIXTO') as l1 \\gset
select (r.unidades_mes - b.unidades_mes), (r.unidades_sin_costo_mes - b.unidades_sin_costo_mes),
  (select unidades_llegaron from retail.listar_recepciones_compras(${GUIA("GZQX-MIXTO")}))
from retail.resumen_sin_comprobante() r, b_sc2 b;
rollback;
`
  ),
  ["0", "0", "10"]
);

exito(
  "lista sin comprobante: una fila por lote con sus unidades sumadas, el proveedor, la sede, la guía y la nota",
  comoPersona(
    FELIPE,
    `${BASE}${recibeSC("l1", { items: [[6, 30], [4, 30]], guia: "GZQX-SC1", nota: "muestra de temporada" })}
select x.unidades, x.numero_guia, x.nota, x.proveedor_nombre, x.ubicacion_nombre from retail.recepciones_sin_comprobante(p_limite => 200) x where x.lote_id = :'l1';
rollback;
`
  ),
  ["10", "GZQX-SC1", "muestra de temporada", "Textiles Andina SAC", "Taller"]
);

exito(
  "sin comprobante, filtro por sede: pedir Tienda Trujillo suma solo lo de Trujillo (7 u); sin filtro, todo lo visible (17 u)",
  comoPersona(
    FELIPE,
    `${BASE}${foto("b_t", "select * from retail.resumen_sin_comprobante(:'trujillo')")}${FOTO_SC}
${recibeSC("l1", { items: [[10, 30]] })}${recibeSC("l2", { ubic: "trujillo", items: [[7, 30]] })}
select (select r.unidades_mes - b.unidades_mes from retail.resumen_sin_comprobante(:'trujillo') r, b_t b), (select r.unidades_mes - b.unidades_mes from retail.resumen_sin_comprobante() r, b_sc2 b);
rollback;
`
  ),
  ["7", "17"]
);

exito(
  "sede: Micaela solo ve lo que entró en SU sede — aunque pida Taller por parámetro no ve nada de allá",
  comoPersona(
    FELIPE,
    `${BASE}${cambiaA(MICAELA)}${foto("b_m", "select * from retail.resumen_sin_comprobante()")}${foto("b_mt", "select * from retail.resumen_sin_comprobante(:'taller')")}${cambiaA(FELIPE)}
${recibeSC("l1", { items: [[10, 30]], guia: "GZQX-SC-M" })}${recibeSC("l2", { ubic: "trujillo", items: [[7, 30]], guia: "GZQX-SC-M" })}
${cambiaA(MICAELA)}select (select r.unidades_mes - b.unidades_mes from retail.resumen_sin_comprobante() r, b_m b),
  (select r.unidades_mes - b.unidades_mes from retail.resumen_sin_comprobante(:'taller') r, b_mt b),
  (select count(*) from retail.recepciones_sin_comprobante(:'taller', 200) x where x.numero_guia = 'GZQX-SC-M'),
  (select count(*) from retail.recepciones_sin_comprobante(:'trujillo', 200) x where x.numero_guia = 'GZQX-SC-M');
rollback;
`
  ),
  ["7", "0", "0", "1"]
);

exito(
  "lista sin comprobante: el límite se acota a 1 como mínimo y sale del más reciente al más antiguo",
  comoPersona(
    FELIPE,
    `${BASE}${recibeSC("l1", { items: [[3, 30]], guia: "GZQX-ORD-1" })}${recibeSC("l2", { items: [[4, 30]], guia: "GZQX-ORD-2" })}${fechaLote("l1", dia(-2))}${fechaLote("l2", dia(-1))}
select (select count(*) from retail.recepciones_sin_comprobante(p_limite => 0)),
  (select string_agg(r.unidades::text, ',' order by r.ord)
   from retail.recepciones_sin_comprobante(p_limite => 200) with ordinality as r(lote_id, fecha_recepcion, ubicacion_nombre, proveedor_nombre, numero_guia, nota, recibido_por, unidades, costo_unitario_promedio, sin_costo, ord)
   where r.numero_guia like 'GZQX-ORD-%');
rollback;
`
  ),
  ["1", "4,3"]
);

// ===========================================================================
// 8. Proveedores — fn_proveedores, fn_proveedores_resumen
// ===========================================================================

const MIS_COLUMNAS = `f.facturas, f.total_facturado::numeric(12,2), f.saldo::numeric(12,2), f.ultima_compra, f.facturas_vencidas, f.facturas_recibidas_completas,
  f.facturas_con_recepcion_pendiente, f.facturas_atrasadas, f.facturado_12m::numeric(12,2), f.saldo_vencido::numeric(12,2), f.dias_desde_ultima_compra, f.entregas_por_recibir, f.saldo_favor`;

exito(
  "fn_proveedores: un proveedor nuevo sin compras muestra ceros y NULL (última compra y días desde ella), sin errores ni saldo a favor",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}
select ${MIS_COLUMNAS} from retail.fn_proveedores() f where f.id = :'prov3';
rollback;
`
  ),
  ["0", "0.00", "0.00", "", "0", "0", "0", "0", "0.00", "0.00", "", "0", "0.00"]
);

exito(
  "fn_proveedores: 2 vigentes (una vencida y sin recibir, otra al día y recibida) + 1 anulada → 2 facturas, S/ 2,832.00, 1 vencida por S/ 1,416.00; la anulada no cuenta",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", vence: dia(-2) })}${compra("c2", { prov: "prov3" })}${recibe("c2_item", 24)}${compra("c3", { prov: "prov3" })}select retail.anular_compra(:'c3', 'prueba');
select ${MIS_COLUMNAS.replace("f.ultima_compra", "f.ultima_compra = retail.fn_hoy_lima()")} from retail.fn_proveedores() f where f.id = :'prov3';
rollback;
`
  ),
  ["2", "2832.00", "2832.00", "t", "1", "1", "1", "0", "2832.00", "1416.00", "0", "1", "0.00"]
);

exito(
  "fn_proveedores: «facturado en 12 meses» — emitida hace 364 días entra; hace 365 días ya no (fecha > hoy − 365) — pero el total histórico cuenta las dos",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", emision: dia(-364) })}${compra("c2", { prov: "prov3", emision: dia(-365) })}
select f.total_facturado::numeric(12,2), f.facturado_12m::numeric(12,2) from retail.fn_proveedores() f where f.id = :'prov3';
rollback;
`
  ),
  ["2832.00", "1416.00"]
);

exito(
  "fn_proveedores: entregas atrasadas — emitida hace 8 días sin recibir SÍ, hace 7 no (plazo emisión + 7), la ya recibida no, y la con estimada futura no",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("ca", { prov: "prov3", emision: dia(-8) })}${compra("cb", { prov: "prov3", emision: dia(-7) })}${compra("cc", { prov: "prov3", emision: dia(-30) })}${recibe("cc_item", 24)}${compra("cd", { prov: "prov3", emision: dia(-30), estimada: dia(1) })}
select f.facturas_atrasadas, f.entregas_por_recibir, f.facturas_recibidas_completas from retail.fn_proveedores() f where f.id = :'prov3';
rollback;
`
  ),
  ["1", "3", "1"]
);

exito(
  "fn_proveedores: días desde la última compra — la anulada no cuenta (última real hace 100 días aunque haya una anulada de ayer)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", emision: dia(-100) })}${compra("c2", { prov: "prov3", emision: dia(-1) })}select retail.anular_compra(:'c2', 'prueba');
select f.dias_desde_ultima_compra, f.ultima_compra = retail.fn_hoy_lima() - 100 from retail.fn_proveedores() f where f.id = :'prov3';
rollback;
`
  ),
  ["100", "t"]
);

exito(
  "nota de crédito que SUPERÓ la deuda (pagó 1,300, debe 116, nota 236): saldo 0, 120.00 a favor, la deuda no se infla ni queda negativa en NINGUNA lectura",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${FOTO_DEUDA}${FOTO_SALIDAS}${fotoPP("b_pp")}${FOTO_PR}${FOTO_RC}
${resuelto("c1", { prov: "prov3", vence: dia(-3) })}${pago("c1", "1300.00")}${nota("c1", "236.00", "FC01-230")}
select f.saldo::numeric(12,2), f.saldo_favor, f.total_facturado::numeric(12,2), f.facturas_vencidas, f.saldo_vencido::numeric(12,2),
  (r.deuda_total - b.deuda_total)::numeric(12,2), (r.saldo_favor_total - b.saldo_favor_total), (r.con_saldo_favor - b.con_saldo_favor),
  (select coalesce(sum(d.monto - x.monto), 0)::numeric(12,2) from retail.deuda_por_vencimiento() d join b_dv x using (tramo)),
  (select min(saldo) >= 0 from retail.compras),
  ((select deuda from retail.resumen_compras()) - (select deuda from b_rc))::numeric(12,2)
from retail.fn_proveedores() f, retail.fn_proveedores_resumen() r, b_pr b where f.id = :'prov3';
rollback;
`
  ),
  ["0.00", "120.00", "1416.00", "0", "0.00", "0.00", "120.00", "1", "0.00", "t", "0.00"]
);

exito(
  "fn_proveedores_resumen: activos y desactivados suman los proveedores, deuda_total = suma de saldos de la lista = deuda de resumen_compras (dos cálculos independientes)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { vence: dia(-1) })}${compra("c2", { prov: "prov2" })}
select r.activos + r.desactivados = (select count(*) from retail.proveedores), r.deuda_total = (select sum(saldo) from retail.fn_proveedores()),
  r.deuda_total = (select deuda from retail.resumen_compras()), r.con_saldo = (select count(*) from retail.fn_proveedores() where saldo > 0),
  r.con_vencidas = (select count(*) from retail.fn_proveedores() where facturas_vencidas > 0)
from retail.fn_proveedores_resumen() r;
rollback;
`
  ),
  ["t", "t", "t", "t", "t"]
);

exito(
  "fn_proveedores_resumen: 3 proveedores nuevos (uno vencido, uno al día, uno pagado) → +3 activos, +2 con saldo, +1 con vencidas, deuda +S/ 2,832.00",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_PR}${nuevoProv("pa")}${nuevoProv("pb")}${nuevoProv("pc")}
${compra("c1", { prov: "pa", vence: dia(-1) })}${compra("c2", { prov: "pb" })}${compra("c3", { prov: "pc" })}${pago("c3", "1416.00")}
select (r.activos - b.activos), (r.desactivados - b.desactivados), (r.deuda_total - b.deuda_total)::numeric(12,2), (r.con_saldo - b.con_saldo), (r.con_vencidas - b.con_vencidas)
from retail.fn_proveedores_resumen() r, b_pr b;
rollback;
`
  ),
  ["3", "0", "2832.00", "2", "1"]
);

exito(
  "fn_proveedores_resumen: el proveedor que concentra la deuda, su % y el % de los 3 mayores (top3, con decimales: hay un cuarto proveedor con deuda fuera del top) salen de la deuda real — y coinciden con resumen_compras_extra",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${nuevoProv("prov4")}${compra("c0", { prov: "prov4" })}${foto("b_fp", "select id, saldo from retail.fn_proveedores()")}
select deuda_total as d0 from retail.fn_proveedores_resumen() \\gset
select coalesce(sum(saldo), 0) as top2 from (select saldo from b_fp order by saldo desc nulls last limit 2) x \\gset
${compra("c1", { prov: "prov3", lineas: [1000], costo: 1000 })}
select r.top_proveedor_id = :'prov3', r.top_pct = round(100 * 1180000.00 / (:'d0'::numeric + 1180000.00), 1),
  r.top3_pct = round(100 * (1180000.00 + :'top2'::numeric) / (:'d0'::numeric + 1180000.00), 1),
  (select e.top_proveedor_pct from retail.resumen_compras_extra() e) = r.top_pct
from retail.fn_proveedores_resumen() r;
rollback;
`
  ),
  ["t", "t", "t", "t"]
);

exito(
  "fn_proveedores_resumen: sin deuda en todo el sistema no hay concentración (top NULL) ni división por cero — deuda_total 0",
  comoPersona(
    FELIPE,
    `${BASE}${PAGA_TODO}
select r.deuda_total = 0, r.con_saldo, r.con_vencidas, r.top_proveedor_id is null, r.top_proveedor_nombre is null, r.top_pct is null, r.top3_pct is null
from retail.fn_proveedores_resumen() r;
rollback;
`
  ),
  ["t", "0", "0", "t", "t", "t", "t"]
);

exito(
  "fn_proveedores_resumen: «sin compras en 90 días» — nuevo sin compras SÍ, última compra hace 91 días SÍ, hace 90 días NO, y un proveedor desactivado no cuenta",
  comoPersona(
    FELIPE,
    `${BASE}${FOTO_PR}${nuevoProv("pa")}${nuevoProv("pb")}${nuevoProv("pc")}${nuevoProv("pd", { activo: false })}
${compra("c1", { prov: "pb", emision: dia(-90) })}${compra("c2", { prov: "pc", emision: dia(-91) })}
select (r.activos - b.activos), (r.desactivados - b.desactivados), (r.sin_compras_90d - b.sin_compras_90d)
from retail.fn_proveedores_resumen() r, b_pr b;
rollback;
`
  ),
  ["3", "1", "2"]
);

exito(
  "fn_proveedores: la lista sale con los activos primero y luego por nombre (los desactivados al final)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("pa", { nombre: "ZZ Prueba A" })}${nuevoProv("pb", { nombre: "ZZ Prueba B", activo: false })}${nuevoProv("pc", { nombre: "ZZ Prueba C" })}
select bool_and(not (coalesce(l.activo_ant, true) = false and l.activo)) and bool_and(l.activo_ant is distinct from l.activo or l.nombre_ant is null or l.nombre >= l.nombre_ant)
from (select f.activo, f.nombre, lag(f.activo) over (order by f.ord) as activo_ant, lag(f.nombre) over (order by f.ord) as nombre_ant
  from retail.fn_proveedores() with ordinality as f(id, nombre, ruc, contacto, telefono, banco, cuenta_bancaria, activo, facturas, total_facturado, saldo, ultima_compra, facturas_vencidas, facturas_recibidas_completas, facturas_con_recepcion_pendiente, facturas_atrasadas, rubro, plazo_credito_dias, forma_pago_preferida, facturado_12m, saldo_vencido, dias_desde_ultima_compra, entregas_por_recibir, saldo_favor, ord)) l;
rollback;
`
  ),
  ["t"]
);

// ===========================================================================
// 9. Saldo a favor — fn_saldo_favor_proveedor, fn_proveedor_creditos, columnas de las dos listas
// ===========================================================================

exito(
  "saldo a favor: un proveedor sin movimientos tiene 0.00 (no NULL); otro con una nota de 236, un uso de 100 y un reembolso de 36 tiene 100.00 a favor, también en la lista de proveedores",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${nuevoProv("prov4")}${conSaldo("prov3")}${compra("c2", { prov: "prov3" })}
select retail.registrar_pagos_compra(:'c2', jsonb_build_array(jsonb_build_object('monto', 100.00, 'metodo', 'saldo_a_favor'))) as _a \\gset
select retail.registrar_reembolso_proveedor(:'prov3', 36.00, 'transferencia', 'OP-R', null, 'devolvió parte') as _r \\gset
select retail.fn_saldo_favor_proveedor(:'prov4'), retail.fn_saldo_favor_proveedor(:'prov3'),
  (select f.saldo_favor from retail.fn_proveedores() f where f.id = :'prov3'), (select r.saldo_favor_total from retail.fn_proveedores_resumen() r) >= 100.00;
rollback;
`
  ),
  ["0.00", "100.00", "100.00", "t"]
);

exito(
  "historial del saldo a favor: del movimiento más reciente al más antiguo (reembolso, uso, nota), con el comprobante y la nota de origen y el medio del reembolso",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${conSaldo("prov3")}${compra("c2", { prov: "prov3" })}
select retail.registrar_pagos_compra(:'c2', jsonb_build_array(jsonb_build_object('monto', 100.00, 'metodo', 'saldo_a_favor'))) as _a \\gset
select retail.registrar_reembolso_proveedor(:'prov3', 36.00, 'transferencia', 'OP-R', null, 'devolvió parte') as _r \\gset
set local session_replication_role = replica;
update retail.proveedor_creditos set created_at = now() - interval '3 days' where proveedor_id = :'prov3' and tipo = 'nota_credito';
update retail.proveedor_creditos set created_at = now() - interval '2 days' where proveedor_id = :'prov3' and tipo = 'aplicacion';
update retail.proveedor_creditos set created_at = now() - interval '1 day' where proveedor_id = :'prov3' and tipo = 'reembolso';
set local session_replication_role = origin;
select string_agg(c.tipo, ',' order by c.ord),
  bool_or(c.tipo = 'nota_credito' and c.nota_serie_numero = 'FC01-80' and c.documento = :'c0_doc' and c.monto = 236.00),
  bool_or(c.tipo = 'aplicacion' and c.documento = :'c2_doc' and c.monto = 100.00),
  bool_or(c.tipo = 'reembolso' and c.metodo = 'transferencia' and c.referencia = 'OP-R' and c.documento is null and c.monto = 36.00),
  (select x.tipo from retail.fn_proveedor_creditos(:'prov3', 1) x)
from retail.fn_proveedor_creditos(:'prov3') with ordinality as c(id, tipo, monto, fecha, documento, nota_serie_numero, metodo, referencia, nota, registrado_por, created_at, ord);
rollback;
`
  ),
  ["reembolso,aplicacion,nota_credito", "t", "t", "t", "reembolso"]
);

exito(
  "nota de crédito EXACTA al saldo (pagó 1,180, debe 236, nota 236): la deuda queda en 0, el comprobante pagado y NADA a favor del proveedor",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${resuelto("c1", { prov: "prov3" })}${pago("c1", "1180.00")}${nota("c1", "236.00", "FC01-231")}
select saldo, estado_pago, retail.fn_saldo_favor_proveedor(proveedor_id) from retail.compras where id = :'c1';
rollback;
`
  ),
  ["0.00", "pagada", "0.00"]
);

// ===========================================================================
// 10. Ficha del proveedor — métricas, evolución del costo, devoluciones
// ===========================================================================

exito(
  "métricas de un proveedor nuevo: todo en 0 y los promedios en NULL (sin dividir por cero) — la ficha dice «se calcula con datos», no muestra un 0 engañoso",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}
select m.facturas_vigentes, m.total_facturado::numeric(12,2), m.saldo::numeric(12,2), m.ultima_compra is null, m.facturas_vencidas, m.facturas_recibidas_completas,
  m.facturas_con_recepcion_pendiente, m.facturas_atrasadas, m.facturado_12m::numeric(12,2), m.monto_vencido::numeric(12,2), m.entregado_completo_pct is null,
  m.dias_entrega_promedio is null, m.dias_entrega_muestra, m.dias_pago_real_promedio is null, m.dias_pago_muestra
from retail.fn_proveedor_metricas_compras(:'prov3') m;
rollback;
`
  ),
  ["0", "0.00", "0.00", "t", "0", "0", "0", "0", "0.00", "0.00", "t", "t", "0", "t", "0"]
);

exito(
  "métricas con datos: 3 vigentes (2 recibidas y pagadas, 1 vencida y parcial) + 1 anulada → 67 % entregado completo, entrega en 5.0 días (5, 8, 2), pago real en 16.0 días (12, 20)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}
${compra("c1", { prov: "prov3", emision: dia(-40), vence: dia(-10) })}${recibe("c1_item", 24, { lote: "l1" })}${fechaLote("l1", `${dia(-40)} + 5`)}${pago("c1", "1416.00", `${dia(-40)} + 12`)}
${compra("c2", { prov: "prov3", emision: dia(-30), vence: dia(-5) })}${recibe("c2_item", 24, { lote: "l2" })}${fechaLote("l2", `${dia(-30)} + 8`)}${pago("c2", "1416.00", `${dia(-30)} + 20`)}
${compra("c3", { prov: "prov3", emision: dia(-30), vence: dia(-5) })}${recibe("c3_item", 10, { lote: "l3" })}${fechaLote("l3", `${dia(-30)} + 2`)}
${compra("c4", { prov: "prov3", emision: dia(-2) })}select retail.anular_compra(:'c4', 'prueba');
select m.facturas_vigentes, m.total_facturado::numeric(12,2), m.saldo::numeric(12,2), m.facturas_vencidas, m.facturas_recibidas_completas, m.facturas_con_recepcion_pendiente,
  m.facturas_atrasadas, m.facturado_12m::numeric(12,2), m.monto_vencido::numeric(12,2), m.entregado_completo_pct, m.dias_entrega_promedio, m.dias_entrega_muestra,
  m.dias_pago_real_promedio, m.dias_pago_muestra
from retail.fn_proveedor_metricas_compras(:'prov3') m;
rollback;
`
  ),
  ["3", "4248.00", "1416.00", "1", "2", "1", "1", "4248.00", "1416.00", "67", "5.0", "3", "16.0", "2"]
);

exito(
  "métricas: el plazo de pago real es NULL con menos de 2 comprobantes pagados por completo (la ficha muestra «se calcula con 2 o más»), pero informa su muestra (1)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", emision: dia(-40) })}${pago("c1", "1416.00", `${dia(-40)} + 12`)}
select m.dias_pago_real_promedio is null, m.dias_pago_muestra from retail.fn_proveedor_metricas_compras(:'prov3') m;
rollback;
`
  ),
  ["t", "1"]
);

exito(
  "métricas: el saldo y el monto vencido salen NETOS de notas de crédito — con nota que supera la deuda el proveedor no queda debiendo (saldo 0.00, vencido 0.00)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${resuelto("c1", { prov: "prov3", vence: dia(-3) })}${pago("c1", "1300.00")}${nota("c1", "236.00", "FC01-232")}
select m.saldo::numeric(12,2), m.monto_vencido::numeric(12,2), m.facturas_vencidas, m.total_facturado::numeric(12,2) from retail.fn_proveedor_metricas_compras(:'prov3') m;
rollback;
`
  ),
  ["0.00", "0.00", "0", "1416.00"]
);

// H1 (corregido en 20260918221000): la ficha decía «100 % entregado completo» al proveedor que dejó una línea sin llegar (cerrada por faltante) porque contaba `estado_recepcion = 'recibida'`; ahora usa `recibido_cantidad >= facturado_cantidad`, igual que resumen_recepciones().
exito(
  "«% entregado completo» de la ficha no cuenta como completo al proveedor que dejó una línea sin llegar (cerrada por faltante)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3" })}${recibe("c1_item", 24)}${resuelto("c2", { prov: "prov3" })}
select m.entregado_completo_pct from retail.fn_proveedor_metricas_compras(:'prov3') m;
rollback;
`
  ),
  ["50"]
);

exito(
  "evolución del costo: lo que cobró el proveedor por la prenda que más se le compra, de la más antigua a la más reciente, ponderado por cantidad (40, 55 = (10×40 + 30×60)/40, 60)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", emision: dia(-30), lineas: [[10, 40]] })}${compra("c2", { prov: "prov3", emision: dia(-20), lineas: [[10, 40], [30, 60]] })}${compra("c3", { prov: "prov3", emision: dia(-10), lineas: [[10, 60]] })}
select (select string_agg(e.costo_unitario::text, ',' order by e.ord) from retail.fn_proveedor_costo_evolucion(:'prov3') with ordinality as e(producto_id, referencia, compra_id, documento, fecha, costo_unitario, ord)),
  (select string_agg(e.costo_unitario::text, ',' order by e.ord) from retail.fn_proveedor_costo_evolucion(:'prov3', 2) with ordinality as e(producto_id, referencia, compra_id, documento, fecha, costo_unitario, ord)),
  (select bool_and(e.referencia = (select referencia from retail.productos where id = :'prod')) from retail.fn_proveedor_costo_evolucion(:'prov3') e);
rollback;
`
  ),
  ["40.00,55.00,60.00", "55.00,60.00", "t"]
);

exito(
  "evolución del costo: elige la prenda con MÁS comprobantes (2) aunque otra se haya comprado en un comprobante más reciente (1)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", emision: dia(-6), lineas: [[5, 10]], prodVar: ["prod2", null] })}${compra("c2", { prov: "prov3", emision: dia(-5), lineas: [[5, 12]], prodVar: ["prod2", null] })}${compra("c3", { prov: "prov3", emision: dia(-1), lineas: [[5, 99]] })}
select count(*), bool_and(e.producto_id = :'prod2'), string_agg(e.costo_unitario::text, ',' order by e.ord)
from retail.fn_proveedor_costo_evolucion(:'prov3') with ordinality as e(producto_id, referencia, compra_id, documento, fecha, costo_unitario, ord);
rollback;
`
  ),
  ["2", "t", "10.00,12.00"]
);

exito(
  "evolución del costo: con igual número de comprobantes gana la prenda comprada más recientemente",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", emision: dia(-6), lineas: [[5, 10]], prodVar: ["prod2", null] })}${compra("c2", { prov: "prov3", emision: dia(-1), lineas: [[5, 99]] })}
select count(*), bool_and(e.producto_id = :'prod')
from retail.fn_proveedor_costo_evolucion(:'prov3') e;
rollback;
`
  ),
  ["1", "t"]
);

exito(
  "evolución del costo: no mezcla proveedores ni cuenta comprobantes anulados (solo el costo 40 del proveedor consultado)",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("c1", { prov: "prov3", emision: dia(-3), lineas: [[10, 40]] })}${compra("c2", { prov: "prov3", emision: dia(-2), lineas: [[10, 99]] })}select retail.anular_compra(:'c2', 'prueba');
${compra("c3", { prov: "prov1", emision: dia(-1), lineas: [[10, 77]] })}
select string_agg(e.costo_unitario::text, ',') from retail.fn_proveedor_costo_evolucion(:'prov3') e;
rollback;
`
  ),
  ["40.00"]
);

/** Una prenda devuelta al proveedor: se inserta directo (el flujo real pasa por ventas y cuarentena) con los FK desactivados solo durante el INSERT. */
const prendaDevuelta = (prov, cantidad, { creada = "now()", resuelta = "now()", estado = "devuelta_proveedor" } = {}) => `
set local session_replication_role = replica;
insert into retail.prendas_danadas (variante_id, ubicacion_id, cantidad, devolucion_item_id, movimiento_entrada_id, estado, movimiento_salida_id, resuelto_en, proveedor_id, created_at)
  values (:'var', :'taller', ${cantidad}, gen_random_uuid(), gen_random_uuid(), '${estado}', gen_random_uuid(), ${resuelta}, ${estado === "devuelta_proveedor" ? `:'${prov}'` : "null"}, ${creada});
set local session_replication_role = origin;
`;

exito(
  "devoluciones al proveedor: suma solo lo devuelto a ESE proveedor (3 + 2 = 5), no lo botado ni lo de otro proveedor; uno nuevo tiene 0 y última NULL",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${nuevoProv("prov4")}
${prendaDevuelta("prov3", 3)}${prendaDevuelta("prov3", 2)}${prendaDevuelta("prov3", 4, { estado: "se_boto" })}${prendaDevuelta("prov1", 7)}
select (select unidades from retail.fn_proveedor_devoluciones(:'prov3')), (select unidades from retail.fn_proveedor_devoluciones(:'prov4')), (select ultima is null from retail.fn_proveedor_devoluciones(:'prov4'));
rollback;
`
  ),
  ["5", "0", "t"]
);

// H2 (corregido en 20260918221000): «última devolución» era el día en que la prenda ENTRÓ a cuarentena (created_at); es el día en que se devolvió (resuelto_en).
exito(
  "«última devolución» de un proveedor es la fecha en que la prenda ENTRÓ a cuarentena, no la fecha en que se le devolvió",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${prendaDevuelta("prov3", 3, { creada: limaTs(dia(-30), "12:00"), resuelta: limaTs(dia(-2), "12:00") })}
select d.ultima = retail.fn_hoy_lima() - 2 from retail.fn_proveedor_devoluciones(:'prov3') d;
rollback;
`
  ),
  ["t"]
);

// ===========================================================================
// 11. Permisos — qué recibe realmente un integrante (Micaela) y quien no tiene sesión
// ===========================================================================

exito(
  "permisos: Micaela (integrante) recibe la lista de proveedores pero con TODAS las cifras de dinero y de compras en NULL — aunque haya deuda en su sede",
  comoPersona(
    FELIPE,
    `${BASE}${nuevoProv("prov3")}${compra("t1", { prov: "prov3", destino: "trujillo", vence: dia(-1) })}${compra("t2", { prov: "prov1", destino: "trujillo", vence: dia(-1) })}
${cambiaA(MICAELA)}select count(*) > 0, count(*) filter (where f.facturas is not null or f.total_facturado is not null or f.saldo is not null or f.ultima_compra is not null
  or f.facturas_vencidas is not null or f.facturas_recibidas_completas is not null or f.facturas_con_recepcion_pendiente is not null or f.facturas_atrasadas is not null
  or f.facturado_12m is not null or f.saldo_vencido is not null or f.dias_desde_ultima_compra is not null or f.entregas_por_recibir is not null or f.saldo_favor is not null)
from retail.fn_proveedores() f;
rollback;
`
  ),
  ["t", "0"]
);

exito(
  "permisos: la banda de arriba de Proveedores solo le da a Micaela los conteos de activos/desactivados; deuda, concentración, «sin compras» y saldo a favor son NULL",
  comoPersona(
    FELIPE,
    `${BASE}${compra("t1", { destino: "trujillo", vence: dia(-1) })}${CON_SALDO}
${cambiaA(MICAELA)}select r.activos is not null, r.desactivados is not null,
  r.deuda_total is null and r.con_saldo is null and r.con_vencidas is null and r.top_proveedor_id is null and r.top_proveedor_nombre is null
  and r.top_pct is null and r.top3_pct is null and r.sin_compras_90d is null and r.saldo_favor_total is null and r.con_saldo_favor is null
from retail.fn_proveedores_resumen() r;
rollback;
`
  ),
  ["t", "t", "t"]
);

error(
  "permisos: la ficha de un proveedor (métricas de compras) es solo de líder — Micaela recibe un error, no cifras",
  comoPersona(FELIPE, `${BASE}${cambiaA(MICAELA)}select * from retail.fn_proveedor_metricas_compras(:'prov1');`),
  "Solo un líder puede ver las métricas de un proveedor."
);

error(
  "permisos: la evolución del costo de un proveedor es solo de líder",
  comoPersona(FELIPE, `${BASE}${cambiaA(MICAELA)}select * from retail.fn_proveedor_costo_evolucion(:'prov1');`),
  "Solo un líder puede ver la evolución del costo de un proveedor."
);

error(
  "permisos: las devoluciones a un proveedor son solo de líder",
  comoPersona(FELIPE, `${BASE}${cambiaA(MICAELA)}select * from retail.fn_proveedor_devoluciones(:'prov1');`),
  "Solo un líder puede ver las devoluciones a un proveedor."
);

exito(
  "permisos: con saldo a favor real (236) Micaela recibe 0.00 y ninguna fila del historial, tanto por la función de saldo (RLS) como por la del historial",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}
set local role authenticated;
${cambiaA(MICAELA)}select retail.fn_saldo_favor_proveedor(:'prov1'), (select count(*) from retail.fn_proveedor_creditos(:'prov1'));
rollback;
`
  ),
  ["0.00", "0"]
);

exito(
  "permisos: comprobantes de Taller y Tienda Lima (NO de su sede) no mueven ni una unidad en las lecturas de recepción que ve Micaela (las de dinero ya no se le entregan: ADR-0126)",
  comoPersona(
    FELIPE,
    `${BASE}${cambiaA(MICAELA)}${FOTO_RR}${cambiaA(FELIPE)}
${compra("c1", { vence: dia(-1) })}${compra("c2", { destino: "lima", vence: dia(3) })}${recibe("c1_item", 10)}
${cambiaA(MICAELA)}select (rr.recepciones - br.recepciones), (rr.unidades_recibidas - br.unidades_recibidas)
from retail.resumen_recepciones() rr, b_rr br;
rollback;
`
  ),
  ["0", "0"]
);

hallazgo(
  "H4",
  "RESUELTO (ADR-0126, decidido por Felipe el 2026-09-19): los indicadores de dinero de Compras no le entregan a un integrante ni un monto — fallan con «Solo un líder puede ver …»",
  "Era la tensión entre ADR-0075 (lectura acotada por sede) y la regla «lo financiero es solo de líder»: resumen_compras, resumen_compras_extra, deuda_por_vencimiento, salidas_caja_30d y por_pagar_tramos " +
    "solo tenían el candado de sede y le daban a Micaela los montos de Trujillo. Felipe decidió cerrarlo: las cinco llaman `fn_exige_dinero_de_compras` como primera instrucción (migración 20260919160000). " +
    "Cerrar solo las funciones no bastaba —Micaela leía los mismos montos directo de `compras` y `compra_pagos`—, así que la parte B (20260919161000) cierra también las tablas, las dos vistas y el bucket de escaneos. " +
    "Las pruebas de la regla completa viven en `dinero_compras_solo_lider.mjs`.",
  comoPersona(
    FELIPE,
    `${BASE}${cambiaA(MICAELA)}do $$
declare n integer := 0; f text;
begin
  foreach f in array array['resumen_compras()', 'resumen_compras_extra()', 'deuda_por_vencimiento()', 'salidas_caja_30d()', 'por_pagar_tramos()'] loop
    begin
      execute 'select * from retail.' || f;
    exception when insufficient_privilege then
      n := n + 1;
    end;
  end loop;
  if n <> 5 then raise exception 'solo % de 5 la rechazaron', n; end if;
end;
$$;
select 'ok';
rollback;
`
  ),
  ["ok"]
);

exito(
  "permisos de catálogo: las 16 funciones de indicadores no las ejecuta anon (ni PUBLIC) y sí authenticated",
  comoPersona(
    FELIPE,
    `select count(*), count(*) filter (where has_function_privilege('anon', p.oid, 'execute')), count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute'))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and p.proname in ('resumen_compras', 'resumen_compras_extra', 'deuda_por_vencimiento', 'salidas_caja_30d', 'por_pagar_tramos',
  'resumen_recepciones', 'listar_recepciones_compras', 'resumen_sin_comprobante', 'recepciones_sin_comprobante', 'fn_proveedores', 'fn_proveedores_resumen',
  'fn_proveedor_metricas_compras', 'fn_proveedor_costo_evolucion', 'fn_proveedor_devoluciones', 'fn_saldo_favor_proveedor', 'fn_proveedor_creditos');
rollback;
`
  ),
  ["16", "0", "16"]
);

exito(
  "sin sesión (auth.uid() nulo): ninguna de las 7 lecturas de recepciones y proveedores devuelve filas — ni una cifra a quien no está autenticado (las 5 de dinero fallan: ADR-0126)",
  comoPersona(
    FELIPE,
    `${BASE}set local request.jwt.claim.sub = '';
select (select count(*) from retail.resumen_recepciones())
  + (select count(*) from retail.listar_recepciones_compras()) + (select count(*) from retail.resumen_sin_comprobante()) + (select count(*) from retail.recepciones_sin_comprobante())
  + (select count(*) from retail.fn_proveedores()) + (select count(*) from retail.fn_proveedores_resumen()) + (select count(*) from retail.fn_proveedor_creditos(:'prov1'));
rollback;
`
  ),
  ["0"]
);

error(
  "sin sesión: la ficha de un proveedor (métricas) tampoco se entrega — «solo un líder»",
  comoPersona(FELIPE, `${BASE}set local request.jwt.claim.sub = '';\nselect * from retail.fn_proveedor_metricas_compras(:'prov1');`),
  "Solo un líder puede ver las métricas de un proveedor."
);

// ===========================================================================
// 12. El reloj de Lima — borde de día simulado (UTC ya es «mañana», Lima todavía «hoy»)
// ===========================================================================

/** Un comprobante que vence `vence` (Lima), medido en las 10 lecturas que dicen «vencido»/«vence hoy». */
const BATERIA_RELOJ = (vence) => `${RELOJ_UTC_ADELANTADO}${BASE}
select current_date - retail.fn_hoy_lima() as desfase \\gset
${FOTO_DEUDA}${FOTO_SALIDAS}${fotoPP("b_pp")}
select vencidas as rc0 from retail.resumen_compras() \\gset
select facturas_vencidas as fv0 from retail.fn_proveedores() where id = :'prov1' \\gset
select facturas_vencidas as mv0 from retail.fn_proveedor_metricas_compras(:'prov1') \\gset
select count(*) as vv0 from retail.compras_resumen where vencida \\gset
${compra("c1", { vence })}
select 'reloj simulado: UTC va un día adelante' as k, :'desfase' as v
union all select 'deuda_por_vencimiento.vencida', (select (d.comprobantes - b.comprobantes)::text from retail.deuda_por_vencimiento() d join b_dv b using (tramo) where tramo = 'vencida')
union all select 'deuda_por_vencimiento.0_7', (select (d.comprobantes - b.comprobantes)::text from retail.deuda_por_vencimiento() d join b_dv b using (tramo) where tramo = '0_7')
union all select 'salidas_caja_30d.Vencido', (select (s.comprobantes - b.comprobantes)::text from retail.salidas_caja_30d() s join b_sc b using (orden) where orden = 0)
union all select 'salidas_caja_30d.semana_1', (select (s.comprobantes - b.comprobantes)::text from retail.salidas_caja_30d() s join b_sc b using (orden) where orden = 1)
union all select 'por_pagar_tramos.vencidas', (select (p.comprobantes - b.comprobantes)::text from retail.por_pagar_tramos() p join b_pp b using (tramo) where tramo = 'vencidas')
union all select 'por_pagar_tramos.semana', (select (p.comprobantes - b.comprobantes)::text from retail.por_pagar_tramos() p join b_pp b using (tramo) where tramo = 'semana')
union all select 'resumen_compras.vencidas', ((select vencidas from retail.resumen_compras()) - :rc0)::text
union all select 'fn_proveedores.facturas_vencidas', ((select facturas_vencidas from retail.fn_proveedores() where id = :'prov1') - :fv0)::text
union all select 'fn_proveedor_metricas_compras.facturas_vencidas', ((select facturas_vencidas from retail.fn_proveedor_metricas_compras(:'prov1')) - :mv0)::text
union all select 'compras_resumen.vencida', ((select count(*) from retail.compras_resumen where vencida) - :vv0)::text;
rollback;
`;

exito(
  "borde de día en Lima: con UTC ya en «mañana», un comprobante que vence HOY (Lima) NO está vencido en ninguna de las 10 lecturas — todas lo tratan como «vence hoy»",
  comoPersona(FELIPE, BATERIA_RELOJ(dia(0))),
  [
    ["reloj simulado: UTC va un día adelante", "1"],
    ["deuda_por_vencimiento.vencida", "0"],
    ["deuda_por_vencimiento.0_7", "1"],
    ["salidas_caja_30d.Vencido", "0"],
    ["salidas_caja_30d.semana_1", "1"],
    ["por_pagar_tramos.vencidas", "0"],
    ["por_pagar_tramos.semana", "1"],
    ["resumen_compras.vencidas", "0"],
    ["fn_proveedores.facturas_vencidas", "0"],
    ["fn_proveedor_metricas_compras.facturas_vencidas", "0"],
    ["compras_resumen.vencida", "0"],
  ]
);

exito(
  "borde de día en Lima: con el mismo reloj simulado, el que venció AYER (Lima) sí está vencido en las 10 lecturas — el corte no se corre un día para ningún lado",
  comoPersona(FELIPE, BATERIA_RELOJ(dia(-1))),
  [
    ["reloj simulado: UTC va un día adelante", "1"],
    ["deuda_por_vencimiento.vencida", "1"],
    ["deuda_por_vencimiento.0_7", "0"],
    ["salidas_caja_30d.Vencido", "1"],
    ["salidas_caja_30d.semana_1", "0"],
    ["por_pagar_tramos.vencidas", "1"],
    ["por_pagar_tramos.semana", "0"],
    ["resumen_compras.vencidas", "1"],
    ["fn_proveedores.facturas_vencidas", "1"],
    ["fn_proveedor_metricas_compras.facturas_vencidas", "1"],
    ["compras_resumen.vencida", "1"],
  ]
);

exito(
  "borde de día en Lima: con el reloj simulado los días de atraso, la ventana de 90 días de recepciones y «hoy» de la cabecera también son de Lima, no de UTC",
  comoPersona(
    FELIPE,
    `${RELOJ_UTC_ADELANTADO}${BASE}${FOTO_EXTRA}${FOTO_RC}${FOTO_RR}
${compra("c1", { estimada: dia(0) })}${compra("c2", { emision: dia(-400) })}
${compra("c3", { emision: dia(-100) })}${recibe("c3_item", 24, { lote: "l3" })}${fechaLote("l3", dia(-90))}
select k, v from (
  select 1 as o, 'resumen_compras_extra.compras_mes' as k, (e.compras_mes - b.compras_mes)::numeric(12,2)::text as v from retail.resumen_compras_extra() e, b_x b
  union all select 2, 'resumen_compras_extra.dias_mas_atrasada (emitida hace 400, sin estimada)', e.dias_mas_atrasada::text from retail.resumen_compras_extra() e
  union all select 3, 'resumen_compras.por_recibir_atrasadas (estimada hoy no cuenta)', (r.por_recibir_atrasadas - x.por_recibir_atrasadas)::text from retail.resumen_compras() r, b_rc x
  union all select 4, 'resumen_recepciones.recepciones (guía de hace 90 días entra)', (rr.recepciones - y.recepciones)::text from retail.resumen_recepciones() rr, b_rr y
) t order by o;
rollback;
`
  ),
  [
    ["resumen_compras_extra.compras_mes", "1416.00"],
    ["resumen_compras_extra.dias_mas_atrasada (emitida hace 400, sin estimada)", "393"],
    ["resumen_compras.por_recibir_atrasadas (estimada hoy no cuenta)", "1"],
    ["resumen_recepciones.recepciones (guía de hace 90 días entra)", "1"],
  ]
);

exito(
  "reloj fijado al 1 de marzo: la compra del 1 cae en el mes, la del 28 de febrero en el anterior y la del 31 de enero en ninguno (el mes lo manda fn_hoy_lima(), no el calendario real)",
  comoPersona(
    FELIPE,
    `${RELOJ("date '2026-03-01'")}${BASE}${FOTO_EXTRA}${compra("c1", { emision: "date '2026-03-01'" })}${compra("c2", { emision: "date '2026-02-28'" })}${compra("c3", { emision: "date '2026-01-31'" })}
${DIF_MES}
rollback;
`
  ),
  ["1416.00", "1416.00", "216.00"]
);

exito(
  "reloj fijado al 1 de marzo: el ingreso sin comprobante del 28 de febrero a las 22:30 (ya es marzo en UTC) NO es del mes; el del 1 de marzo a las 00:30 sí",
  comoPersona(
    FELIPE,
    `${RELOJ("date '2026-03-01'")}${BASE}${FOTO_SC}${recibeSC("l1", { items: [[10, 30]] })}${fechaLote("l1", "date '2026-02-28'", "22:30")}${recibeSC("l2", { items: [[7, 30]] })}${fechaLote("l2", "date '2026-03-01'", "00:30")}
${DIF_SC}
rollback;
`
  ),
  ["7", "1", "0"]
);

// H5 (corregido en 20260918221000): los pagos sin fecha explícita tomaban `current_date` (UTC) y no la fecha de Lima; entre las 7 pm y medianoche quedaban fechados «mañana». Esta prueba simula el desfase del reloj.
exito(
  "los pagos registrados SIN fecha explícita toman `current_date` (UTC) y no la fecha de Lima: entre las 7 pm y medianoche quedan fechados «mañana»",
  comoPersona(
    FELIPE,
    `${RELOJ_UTC_ADELANTADO}${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_pago_compra(:'c1', 10.00, 'efectivo') as p1 \\gset
select retail.registrar_pagos_compra(:'c2', jsonb_build_array(jsonb_build_object('monto', 10.00, 'metodo', 'efectivo'))) as _p2 \\gset
${compraContado("c3")}
select (select fecha = retail.fn_hoy_lima() from retail.compra_pagos where id = :'p1'),
  (select bool_and(fecha = retail.fn_hoy_lima()) from retail.compra_pagos where compra_id = :'c2'),
  (select bool_and(fecha = retail.fn_hoy_lima()) from retail.compra_pagos where compra_id = :'c3');
rollback;
`
  ),
  ["t", "t", "t"]
);

// ===========================================================================
// Ejecución
// ===========================================================================

function verificarContenedor() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"], { stdio: "ignore" });
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }
}

const sangria = (texto) => texto.trim().split("\n").join("\n    ");

/** Filas de salida que se comparan: `esperado` puede ser una fila o varias (las últimas N líneas). */
function compararSalida(salida, esperado) {
  const lineas = salida.split("\n").filter((l) => l !== "");
  const filas = Array.isArray(esperado[0]) ? esperado : [esperado];
  const reales = lineas.slice(-filas.length).map((l) => l.split("|"));
  const igual = reales.length === filas.length && filas.every((f, i) => f.length === reales[i].length && f.every((v, j) => v === reales[i][j]));
  return { igual, reales, filas };
}

function main() {
  verificarContenedor();

  let fallos = 0;
  let abiertos = 0;
  let cerrados = 0;
  for (const caso of CASOS) {
    const r = correr(caso.sql);
    if (caso.tipo === "error") {
      if (r.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!r.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${sangria(r.mensaje)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
      continue;
    }
    if (!r.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${sangria(r.mensaje)}`);
      continue;
    }
    const { igual, reales, filas } = compararSalida(r.salida, caso.esperado);
    if (igual) {
      if (caso.hallazgo) {
        cerrados++;
        console.log(`✓ ${caso.nombre}\n    ¡el hallazgo YA SE CORRIGIÓ! Quita \`hallazgo(...)\` y déjala como prueba normal.`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (caso.hallazgo) {
      abiertos++;
      console.log(
        `⚠ ${caso.nombre}\n    esperado (lo correcto): ${JSON.stringify(filas)}\n    salió (hoy):            ${JSON.stringify(reales)}\n    ${caso.hallazgo.detalle}`
      );
    } else {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    esperado: ${JSON.stringify(filas)}\n    salió:    ${JSON.stringify(reales)}`);
    }
  }

  const normales = CASOS.filter((c) => !c.hallazgo).length;
  const enVerde = normales - fallos;
  console.log(`\n${enVerde}/${normales} pruebas en verde.`);
  if (abiertos > 0 || cerrados > 0) {
    console.log(`${abiertos} hallazgo(s) abierto(s) documentado(s) con ⚠ (no cuentan como fallo: describen bugs reales sin arreglar)${cerrados ? `, ${cerrados} ya corregido(s)` : ""}.`);
  }
  console.log(`${CASOS.length} casos en total.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
