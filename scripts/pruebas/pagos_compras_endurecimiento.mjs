#!/usr/bin/env node
/**
 * Pruebas del endurecimiento de los pagos de Compras (ADR-0135) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Los cinco huecos que una auditoría confirmó ejecutando SQL, cada uno con su caso de éxito tras el
 * arreglo Y con los negativos que tienen que seguir fallando (el candado se afloja lo justo, no se abre):
 *   · A1  `registrar_compra` con «el precio incluye IGV» + total del papel: 5 u × S/ 10.00, 10 u × 25.00,
 *         100 u × 12.50 y 100 u × 1.00 ahora cuadran (el redondeo del costo unitario se multiplica por la
 *         cantidad); un total realmente descuadrado (+ S/ 5, − S/ 5, + S/ 0.50 en una unidad) SIGUE rechazado.
 *   · A2  `registrar_pagos_compra` (pago desde el detalle) ahora es idempotente por `p_token`: dos llamadas con el
 *         mismo token registran UN pago (aunque el comprobante ya quedó saldado); sin token, igual que antes.
 *   · M1  el reintento de un lote que usó saldo a favor devuelve el éxito original (antes fallaba «es S/ 0.00»).
 *   · M2  las tres rutas de pago rechazan una fecha futura y una anterior a la emisión (en el lote, contra CADA
 *         comprobante); las fechas válidas y «sin fecha» siguen pasando.
 *   · M3  las tres rutas rechazan un monto con más de 2 decimales con el mismo mensaje (antes el detalle y
 *         `registrar_compra` redondeaban 10.005 → 10.01 en silencio).
 *   · Seguridad: el integrante (Micaela) sigue sin poder pagar; el líder sí, como `authenticated`; sin EXECUTE
 *         para `anon`; UNA sola firma de cada función; conservan `security definer` y su `search_path`;
 *         `registrar_pago_compra` (un medio) sigue andando sobre la firma nueva; y la migración se puede pegar
 *         dos veces.
 *
 * CÓMO. Mismo patrón que `dinero_compras_solo_lider.mjs` y `compras_faltantes_y_pago_por_lote.mjs`: cada
 * escenario corre en su propia transacción con ROLLBACK — nunca se commitea nada, corre seguro contra el Postgres
 * local que comparten ~20 worktrees. Simula a Felipe (líder) y a Micaela (integrante) con
 * `set local request.jwt.claim.sub`; para probar permisos de verdad cambia a `set local role authenticated`.
 * Los comprobantes de cada escenario (serie `TST`) se crean DENTRO de la transacción con la RPC real.
 *
 * NO PRUEBA la carrera de dos llamadas simultáneas con el mismo token (un solo psql no puede lanzar dos
 * transacciones concurrentes): esa garantía sale del `for update` sobre `compras` + el chequeo del token DESPUÉS
 * del candado, y está razonada en el ADR-0135, no ejecutada aquí.
 *
 * `--en-seco`: antes de cada escenario carga DENTRO de su transacción la migración, así se prueba SIN haberla
 * aplicado a la base compartida. Sin el flag asume que ya está aplicada (y si no lo está, los casos fallan: eso
 * es lo que demuestra que las pruebas detectan los huecos).
 *
 * USO
 *   pnpm pruebas:pagos-compras-endurecimiento            → migración ya aplicada en el local
 *   pnpm pruebas:pagos-compras-endurecimiento --en-seco  → la carga en cada escenario, sin aplicarla
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

const EN_SECO = process.argv.includes("--en-seco");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260919180000_pagos_compras_endurecimiento.sql"), "utf8");
const PRELUDIO = EN_SECO ? MIGRACION : "";

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

/** Una transacción con la migración (si `--en-seco`) y la sesión de quien se indique. Termina sin COMMIT. */
const como = (authUserId, sql) => `
begin;
${PRELUDIO}
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;
const COMO_AUTENTICADO = "set local role authenticated;\n";

/** Proveedores, ubicaciones y la variante del seed. */
const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as prov2 from retail.proveedores where nombre = 'Confecciones del Sur EIRL' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

const HOY = "retail.fn_hoy_lima()";
const N = "'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)";
const ITEM = (cantidad, costo) => `jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${cantidad}, 'costo_unitario', ${costo})`;

/**
 * Crea un comprobante a crédito con la RPC real y deja `:v` con su id. Por defecto: 24 u × S/ 50 + IGV 18 % =
 * S/ 1,416.00, emitido hoy y vencido en 10 días. `emision` es una expresión SQL (p. ej. `${HOY} - 10`).
 */
function compra(v, { prov = "prov1", cantidad = 24, costo = 50, emision = HOY } = {}) {
  return `select retail.registrar_compra(:'${prov}', 'TST', ${N}, 'credito', :'taller', jsonb_build_array(${ITEM(cantidad, costo)}),
  p_tipo => 'factura', p_fecha_emision => ${emision}, p_fecha_vencimiento => ${HOY} + 10, p_igv_porcentaje => 18) as ${v} \\gset\n`;
}

/** Llamada al pago del detalle. `fecha` y `token` son expresiones SQL (`null` por defecto). */
const pagar = (v, monto, { metodo = "efectivo", fecha = "null", token = "null" } = {}) =>
  `retail.registrar_pagos_compra(:'${v}', jsonb_build_array(jsonb_build_object('monto', ${monto}, 'metodo', '${metodo}')), ${fecha}, ${token})`;

/** Llamada al pago por lote sobre uno o más comprobantes `[[var, monto], …]`. */
const lote = (apps, { fecha = "null", token = "null", credito = "0", prov = "prov1" } = {}) =>
  `retail.registrar_pago_compras(:'${prov}', 'transferencia', jsonb_build_array(${apps
    .map(([v, m]) => `jsonb_build_object('compra_id', :'${v}', 'monto', ${m})`)
    .join(", ")}), null, ${fecha}, ${token}, ${credito})`;

/** `registrar_compra` con total del papel, IGV incluido (18 %) o no. Devuelve el id. */
const conTotal = (cantidad, costo, total, igv = 18) =>
  `select retail.registrar_compra(:'prov1', 'TST', ${N}, 'credito', :'taller', jsonb_build_array(${ITEM(cantidad, costo)}),
  p_fecha_emision => ${HOY}, p_fecha_vencimiento => ${HOY} + 10, p_igv_porcentaje => ${igv}, p_total => ${total}) as c \\gset\n`;
const VER_TOTALES = `select total::text, igv::text, subtotal::text from retail.compras where id = :'c';`;

/** Un contado con pago directo, para probar las fechas y los decimales del pago inicial de `registrar_compra`. */
const contado = (pago, v = "c") =>
  `select retail.registrar_compra(:'prov1', 'TST', ${N}, 'contado', :'taller', jsonb_build_array(${ITEM(1, 10)}),
  p_fecha_emision => ${HOY}, p_pago => ${pago}) as ${v} \\gset\n`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// A1. registrar_compra con IGV incluido: el redondeo del costo unitario se multiplica por la cantidad
// ===========================================================================

exito(
  "A1 · 5 u × S/ 10.00 con IGV (costo 8.47, papel 50.00): cuadra, y el total guardado es el del papel",
  como(FELIPE, `${BASE}${conTotal(5, 8.47, "50.00")}${VER_TOTALES}`),
  ["50.00", "7.65", "42.35"]
);
exito(
  "A1 · 10 u × S/ 25.00 con IGV (costo 21.19, papel 250.00): cuadra",
  como(FELIPE, `${BASE}${conTotal(10, 21.19, "250.00")}${VER_TOTALES}`),
  ["250.00", "38.10", "211.90"]
);
exito(
  "A1 · 100 u × S/ 12.50 con IGV (costo 10.59, papel 1250.00): cuadra",
  como(FELIPE, `${BASE}${conTotal(100, 10.59, "1250.00")}${VER_TOTALES}`),
  ["1250.00", "191.00", "1059.00"]
);
exito(
  "A1 · 100 u × S/ 1.00 con IGV (costo 0.85, papel 100.00): cuadra",
  como(FELIPE, `${BASE}${conTotal(100, 0.85, "100.00")}${VER_TOTALES}`),
  ["100.00", "15.00", "85.00"]
);
exito(
  "A1 · sin p_total el cálculo de siempre no cambia (24 × 50 + IGV = 1416.00)",
  como(
    FELIPE,
    `${BASE}${compra("c")}select total::text, igv::text, subtotal::text from retail.compras where id = :'c';`
  ),
  ["1416.00", "216.00", "1200.00"]
);
error(
  "A1 negativo · 100 u × 10.59 con papel de S/ 1,255.00 (S/ 5 de más): SIGUE rechazado",
  como(FELIPE, `${BASE}${conTotal(100, 10.59, "1255.00")}`),
  "no cuadra con sus líneas"
);
error(
  "A1 negativo · 100 u × 10.59 con papel de S/ 1,244.00 (S/ 5 de menos): SIGUE rechazado",
  como(FELIPE, `${BASE}${conTotal(100, 10.59, "1244.00")}`),
  "no cuadra con sus líneas"
);
error(
  "A1 negativo · 1 u con papel de S/ 10.50 (costo 8.47 → 9.99): S/ 0.50 en una sola unidad SIGUE rechazado",
  como(FELIPE, `${BASE}${conTotal(1, 8.47, "10.50")}`),
  "no cuadra con sus líneas"
);
error(
  "A1 negativo · sin IGV el total sigue siendo igualdad exacta (10 u × 5.00 con papel 50.01)",
  como(FELIPE, `${BASE}${conTotal(10, 5, "50.01", 0)}`),
  "Sin IGV el total tiene que ser igual"
);
error(
  "A1 negativo · un total negativo sigue rechazado",
  como(FELIPE, `${BASE}${conTotal(1, 10, "-1")}`),
  "El total no puede ser negativo"
);

// ===========================================================================
// A2. registrar_pagos_compra: idempotente por token
// ===========================================================================

exito(
  "A2 · dos llamadas con el MISMO token: un solo pago, los mismos ids, el saldo baja una vez",
  como(
    FELIPE,
    `${BASE}${compra("c1")}select gen_random_uuid() as tok \\gset
select ${pagar("c1", 300, { token: ":'tok'" })} as ids1 \\gset
select ${pagar("c1", 300, { token: ":'tok'" })} = :'ids1'::uuid[],
  (select count(*) from retail.compra_pagos where compra_id = :'c1'),
  (select saldo::text from retail.compras where id = :'c1');`
  ),
  ["t", "1", "1116.00"]
);
exito(
  "A2 · reintento con token DESPUÉS de saldar el comprobante (corte de red tras el commit): éxito, sin duplicar",
  como(
    FELIPE,
    `${BASE}${compra("c1")}select gen_random_uuid() as tok \\gset
select ${pagar("c1", 1416, { token: ":'tok'" })} as ids1 \\gset
select ${pagar("c1", 1416, { token: ":'tok'" })} = :'ids1'::uuid[],
  (select count(*) from retail.compra_pagos where compra_id = :'c1'),
  (select estado_pago || '/' || saldo::text from retail.compras where id = :'c1');`
  ),
  ["t", "1", "pagada/0.00"]
);
exito(
  "A2 · un pago con dos medios y token: el reintento devuelve las 2 filas y no escribe más",
  como(
    FELIPE,
    `${BASE}${compra("c1")}select gen_random_uuid() as tok \\gset
select retail.registrar_pagos_compra(:'c1', jsonb_build_array(jsonb_build_object('monto', 100, 'metodo', 'efectivo'), jsonb_build_object('monto', 200, 'metodo', 'yape')), null, :'tok') as ids1 \\gset
select retail.registrar_pagos_compra(:'c1', jsonb_build_array(jsonb_build_object('monto', 100, 'metodo', 'efectivo'), jsonb_build_object('monto', 200, 'metodo', 'yape')), null, :'tok') as ids2 \\gset
select cardinality(:'ids1'::uuid[]), cardinality(:'ids2'::uuid[]),
  (select count(*) from retail.compra_pagos where compra_id = :'c1' and pago_grupo_id = :'tok');`
  ),
  ["2", "2", "2"]
);
exito(
  "A2 · el token queda guardado en pago_grupo_id (y sin token queda NULL)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}select gen_random_uuid() as tok \\gset
select ${pagar("c1", 100, { token: ":'tok'" })} as _a \\gset
select ${pagar("c1", 50)} as _b \\gset
select count(*) filter (where pago_grupo_id = :'tok'), count(*) filter (where pago_grupo_id is null) from retail.compra_pagos where compra_id = :'c1';`
  ),
  ["1", "1"]
);
exito(
  "A2 · SIN token todo sigue como hoy: dos llamadas iguales registran dos pagos",
  como(
    FELIPE,
    `${BASE}${compra("c1")}select ${pagar("c1", 300, { metodo: "transferencia" })} as _a \\gset
select ${pagar("c1", 300, { metodo: "transferencia" })} as _b \\gset
select count(*), sum(monto)::text from retail.compra_pagos where compra_id = :'c1';`
  ),
  ["2", "600.00"]
);
exito(
  "A2 · tokens distintos son pagos distintos",
  como(
    FELIPE,
    `${BASE}${compra("c1")}select ${pagar("c1", 300, { token: "gen_random_uuid()" })} as _a \\gset
select ${pagar("c1", 300, { token: "gen_random_uuid()" })} as _b \\gset
select count(*), sum(monto)::text from retail.compra_pagos where compra_id = :'c1';`
  ),
  ["2", "600.00"]
);
error(
  "A2 negativo · un token que ya se usó en OTRO comprobante se rechaza (no devuelve pagos ajenos)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}select gen_random_uuid() as tok \\gset
select ${pagar("c1", 100, { token: ":'tok'" })} as _a \\gset
select ${pagar("c2", 100, { token: ":'tok'" })};`
  ),
  "ya se usó en otro comprobante"
);
error(
  "A2 negativo · con token nuevo un pago que excede el saldo SIGUE rechazado",
  como(FELIPE, `${BASE}${compra("c1")}select ${pagar("c1", 1416.01, { token: "gen_random_uuid()" })};`),
  "supera el saldo pendiente"
);
error(
  "A2 negativo · con token nuevo, pagar una factura anulada SIGUE rechazado",
  como(
    FELIPE,
    `${BASE}${compra("c1")}select retail.anular_compra(:'c1', 'prueba') as _a \\gset
select ${pagar("c1", 10, { token: "gen_random_uuid()" })};`
  ),
  "está anulada, no acepta pagos"
);
exito(
  "A2 · registrar_pago_compra (un medio) sigue andando: llama a la firma nueva con 3 argumentos",
  como(
    FELIPE,
    `${BASE}${compra("c1")}select retail.registrar_pago_compra(:'c1', 250, 'yape', 'ref-1', null) is not null as ok \\gset
select :'ok', saldo::text from retail.compras where id = :'c1';`
  ),
  ["t", "1166.00"]
);

// ===========================================================================
// M1. Lote: el reintento de un pago que usó saldo a favor devuelve el éxito original
// ===========================================================================

/**
 * Deja al proveedor nuevo `:prov1` con S/ 236.00 de saldo a favor (contado 24 × S/ 50 + IGV, 4 u que no llegaron,
 * nota de crédito por el faltante) y crea `:c2`, un crédito de S/ 1,416.00. Un proveedor propio evita depender del
 * saldo del seed.
 */
const CON_SALDO_A_FAVOR = `${BASE}insert into retail.proveedores (nombre) values ('Proveedor prueba saldo ' || gen_random_uuid()) returning id as prov1 \\gset
select retail.registrar_compra(:'prov1', 'TST', ${N}, 'contado', :'taller', jsonb_build_array(${ITEM(24, 50)}),
  p_fecha_emision => ${HOY}, p_pago => jsonb_build_array(jsonb_build_object('monto', 1416.00, 'metodo', 'transferencia'))) as c0 \\gset
select id as c0_item from retail.compra_items where compra_id = :'c0' \\gset
select retail.recibir_compras(:'taller', jsonb_build_array(jsonb_build_object('compra_item_id', :'c0_item', 'variante_id', :'var', 'cantidad', 20))) as _r \\gset
select retail.cerrar_linea_compra(:'c0_item', 4, 'no_llego') as _k \\gset
select retail.registrar_nota_credito_compra(:'c0', 'FC01-80', ${HOY}, 236.00, 'faltante') as _n \\gset
${compra("c2")}`;

exito(
  "M1 · lote con saldo a favor: el reintento con el mismo token devuelve el mismo token, sin duplicar ni fallar",
  como(
    FELIPE,
    `${CON_SALDO_A_FAVOR}select retail.fn_saldo_favor_proveedor(:'prov1') as antes \\gset
select gen_random_uuid() as tok \\gset
select ${lote([["c2", 1180]], { token: ":'tok'", credito: "236.00" })} = :'tok'::uuid as _a \\gset
select ${lote([["c2", 1180]], { token: ":'tok'", credito: "236.00" })} = :'tok'::uuid,
  :'antes'::numeric,
  retail.fn_saldo_favor_proveedor(:'prov1'),
  (select count(*) from retail.compra_pagos where compra_id = :'c2'),
  (select saldo::text from retail.compras where id = :'c2');`
  ),
  ["t", "236.00", "0.00", "2", "236.00"]
);
error(
  "M1 negativo · SIN token, pedir más saldo a favor del que hay SIGUE rechazado",
  como(FELIPE, `${CON_SALDO_A_FAVOR}select ${lote([["c2", 1180]], { credito: "300.00" })};`),
  "saldo a favor con este proveedor es S/ 236.00"
);
error(
  "M1 negativo · con un token NUEVO, pedir más saldo a favor del que hay SIGUE rechazado",
  como(FELIPE, `${CON_SALDO_A_FAVOR}select ${lote([["c2", 1180]], { token: "gen_random_uuid()", credito: "300.00" })};`),
  "saldo a favor con este proveedor es S/ 236.00"
);
exito(
  "M1 · lote sin saldo a favor: el reintento sigue devolviendo el token y no paga dos veces",
  como(
    FELIPE,
    `${BASE}${compra("c1")}select gen_random_uuid() as tok \\gset
select ${lote([["c1", 400]], { token: ":'tok'" })} as _a \\gset
select ${lote([["c1", 400]], { token: ":'tok'" })} = :'tok'::uuid,
  (select count(*) from retail.compra_pagos where compra_id = :'c1'),
  (select saldo::text from retail.compras where id = :'c1');`
  ),
  ["t", "1", "1016.00"]
);

// ===========================================================================
// M2. Fechas de pago: ni futuras ni anteriores a la emisión, en las tres rutas
// ===========================================================================

// --- pago del detalle
error("M2 · detalle: fecha 2099-01-01 rechazada", como(FELIPE, `${BASE}${compra("c1")}select ${pagar("c1", 100, { fecha: "date '2099-01-01'" })};`), "no puede ser futura");
error("M2 · detalle: mañana rechazada", como(FELIPE, `${BASE}${compra("c1")}select ${pagar("c1", 100, { fecha: `${HOY} + 1` })};`), "no puede ser futura");
error("M2 · detalle: 1990-01-01 (antes de la emisión) rechazada", como(FELIPE, `${BASE}${compra("c1")}select ${pagar("c1", 100, { fecha: "date '1990-01-01'" })};`), "es anterior a la emisión del comprobante");
error(
  "M2 · detalle: un día antes de la emisión rechazada",
  como(FELIPE, `${BASE}${compra("c1", { emision: `${HOY} - 10` })}select ${pagar("c1", 100, { fecha: `${HOY} - 11` })};`),
  "es anterior a la emisión del comprobante"
);
exito(
  "M2 · detalle: el mismo día de la emisión pasa, y una fecha intermedia también",
  como(
    FELIPE,
    `${BASE}${compra("c1", { emision: `${HOY} - 10` })}select ${pagar("c1", 100, { fecha: `${HOY} - 10` })} as _a \\gset
select ${pagar("c1", 100, { fecha: `${HOY} - 5` })} as _b \\gset
select string_agg(fecha::text, ',' order by fecha) = ((${HOY} - 10)::text || ',' || (${HOY} - 5)::text) from retail.compra_pagos where compra_id = :'c1';`
  ),
  ["t"]
);
exito(
  "M2 · detalle: hoy y «sin fecha» pasan (quedan con la fecha de hoy en Lima)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}select ${pagar("c1", 100, { fecha: HOY })} as _a \\gset
select ${pagar("c1", 100)} as _b \\gset
select count(*) filter (where fecha = ${HOY}), count(*) from retail.compra_pagos where compra_id = :'c1';`
  ),
  ["2", "2"]
);
exito(
  "M2 · detalle: un comprobante con emisión FUTURA (mañana) se puede pagar hoy (el piso nunca supera a hoy)",
  como(FELIPE, `${BASE}${compra("c1", { emision: `${HOY} + 1` })}select ${pagar("c1", 100, { fecha: HOY })} is not null;`),
  ["t"]
);
error(
  "M2 · detalle: aun con emisión futura, una fecha de ayer se rechaza",
  como(FELIPE, `${BASE}${compra("c1", { emision: `${HOY} + 1` })}select ${pagar("c1", 100, { fecha: `${HOY} - 1` })};`),
  "es anterior a la emisión del comprobante"
);

// --- pago por lote
error("M2 · lote: fecha 2099-01-01 rechazada", como(FELIPE, `${BASE}${compra("c1")}select ${lote([["c1", 100]], { fecha: "date '2099-01-01'" })};`), "no puede ser futura");
error("M2 · lote: 1990-01-01 rechazada", como(FELIPE, `${BASE}${compra("c1")}select ${lote([["c1", 100]], { fecha: "date '1990-01-01'" })};`), "es anterior a la emisión del comprobante");
error(
  "M2 · lote: se valida contra CADA comprobante (el segundo se emitió después de la fecha del pago)",
  como(
    FELIPE,
    `${BASE}${compra("c1", { emision: `${HOY} - 10` })}${compra("c2", { emision: `${HOY} - 2` })}select ${lote([["c1", 100], ["c2", 100]], { fecha: `${HOY} - 5` })};`
  ),
  "es anterior a la emisión del comprobante"
);
exito(
  "M2 · lote: con la fecha entre las dos emisiones el lote pasa cuando cada comprobante ya existía",
  como(
    FELIPE,
    `${BASE}${compra("c1", { emision: `${HOY} - 10` })}${compra("c2", { emision: `${HOY} - 2` })}select ${lote([["c1", 100], ["c2", 100]], { fecha: `${HOY} - 1` })} is not null as ok \\gset
select :'ok', count(*) from retail.compra_pagos where compra_id in (:'c1', :'c2') and fecha = ${HOY} - 1;`
  ),
  ["t", "2"]
);
exito(
  "M2 · lote: solo con el comprobante viejo, la fecha de hace 5 días pasa",
  como(FELIPE, `${BASE}${compra("c1", { emision: `${HOY} - 10` })}select ${lote([["c1", 100]], { fecha: `${HOY} - 5` })} is not null;`),
  ["t"]
);
exito("M2 · lote: sin fecha pasa", como(FELIPE, `${BASE}${compra("c1")}select ${lote([["c1", 100]])} is not null;`), ["t"]);

// --- pago inicial de registrar_compra
error(
  "M2 · registrar_compra: pago inicial con fecha 2099 rechazado",
  como(FELIPE, `${BASE}${contado(`jsonb_build_array(jsonb_build_object('monto', 11.80, 'metodo', 'efectivo', 'fecha', '2099-01-01'))`)}`),
  "no puede ser futura"
);
error(
  "M2 · registrar_compra: pago inicial con fecha 1990 (antes de la emisión) rechazado",
  como(FELIPE, `${BASE}${contado(`jsonb_build_array(jsonb_build_object('monto', 11.80, 'metodo', 'efectivo', 'fecha', '1990-01-01'))`)}`),
  "es anterior a la emisión del comprobante"
);
error(
  "M2 · registrar_compra: una fecha inválida en la 2.ª línea de pago (que hoy se ignora) también se rechaza",
  como(
    FELIPE,
    `${BASE}${contado(`jsonb_build_array(jsonb_build_object('monto', 5.90, 'metodo', 'efectivo'), jsonb_build_object('monto', 5.90, 'metodo', 'yape', 'fecha', '2099-01-01'))`)}`
  ),
  "no puede ser futura"
);
exito(
  "M2 · registrar_compra: pago inicial con la fecha de hoy y otro sin fecha pasan (ambos quedan en hoy)",
  como(
    FELIPE,
    `${BASE}select ${HOY}::text as hoy \\gset
${contado(`jsonb_build_array(jsonb_build_object('monto', 11.80, 'metodo', 'efectivo', 'fecha', :'hoy'))`, "ca")}${contado(`jsonb_build_array(jsonb_build_object('monto', 11.80, 'metodo', 'efectivo'))`, "cb")}select count(*), count(*) filter (where fecha = ${HOY}) from retail.compra_pagos where compra_id in (:'ca', :'cb');`
  ),
  ["2", "2"]
);

// ===========================================================================
// M3. Montos con más de 2 decimales: el mismo rechazo en las tres rutas
// ===========================================================================

error("M3 · detalle: 10.005 rechazado (antes se guardaba como 10.01)", como(FELIPE, `${BASE}${compra("c1")}select ${pagar("c1", 10.005)};`), "admiten como máximo 2 decimales");
error("M3 · detalle: 0.004 rechazado por decimales (antes se redondeaba a 0.00 y salía «mayor a cero»)", como(FELIPE, `${BASE}${compra("c1")}select ${pagar("c1", 0.004)};`), "admiten como máximo 2 decimales");
error("M3 · detalle: 100.001 rechazado", como(FELIPE, `${BASE}${compra("c1")}select ${pagar("c1", 100.001)};`), "admiten como máximo 2 decimales");
error(
  "M3 · registrar_compra: pago inicial de 11.795 rechazado (antes se guardaba como 11.80)",
  como(FELIPE, `${BASE}${contado(`jsonb_build_array(jsonb_build_object('monto', 11.795, 'metodo', 'efectivo'))`)}`),
  "admiten como máximo 2 decimales"
);
error("M3 · lote: 10.005 rechazado (ya lo hacía; sigue igual)", como(FELIPE, `${BASE}${compra("c1")}select ${lote([["c1", 10.005]])};`), "admiten como máximo 2 decimales");
exito(
  "M3 · montos con 1 y 2 decimales pasan en el detalle y se guardan exactos",
  como(
    FELIPE,
    `${BASE}${compra("c1")}select ${pagar("c1", 10.5)} as _a \\gset
select ${pagar("c1", 10.01)} as _b \\gset
select string_agg(monto::text, ',' order by monto) from retail.compra_pagos where compra_id = :'c1';`
  ),
  ["10.01,10.50"]
);
error("M3 · el detalle sigue rechazando un monto en cero", como(FELIPE, `${BASE}${compra("c1")}select ${pagar("c1", 0)};`), "mayor a cero");
error("M3 · el detalle sigue rechazando un monto negativo", como(FELIPE, `${BASE}${compra("c1")}select ${pagar("c1", -5)};`), "mayor a cero");

// ===========================================================================
// Seguridad: solo el líder, sin anon, una sola firma
// ===========================================================================

const COMO_MICAELA = (sql) =>
  como(FELIPE, `${BASE}${compra("c1")}${cambiaA(MICAELA)}${COMO_AUTENTICADO}${sql}`);

error(
  "seguridad · el integrante NO puede pagar desde el detalle (ni con token)",
  COMO_MICAELA(`select ${pagar("c1", 10, { token: "gen_random_uuid()" })};`),
  "No tienes permiso para registrar pagos a proveedores"
);
error(
  "seguridad · el integrante NO puede pagar por lote",
  COMO_MICAELA(`select ${lote([["c1", 10]], { token: "gen_random_uuid()" })};`),
  "No tienes permiso para registrar pagos a proveedores"
);
error(
  "seguridad · el integrante NO puede registrar una compra (con total del papel)",
  COMO_MICAELA(
    `select retail.registrar_compra(:'prov1', 'TST', ${N}, 'credito', :'taller', jsonb_build_array(${ITEM(5, 8.47)}), p_fecha_emision => ${HOY}, p_fecha_vencimiento => ${HOY} + 10, p_total => 50.00);`
  ),
  "No tienes permiso para registrar compras"
);
exito(
  "seguridad · el líder, como rol authenticated, paga con token y ve el éxito (el permiso de EXECUTE quedó bien)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}${COMO_AUTENTICADO}select gen_random_uuid() as tok \\gset
select ${pagar("c1", 100, { token: ":'tok'" })} as _a \\gset
select ${lote([["c1", 100]], { token: "gen_random_uuid()" })} is not null as ok \\gset
select :'ok', count(*) from retail.compra_pagos where compra_id = :'c1';`
  ),
  ["t", "2"]
);
exito(
  "seguridad · sin EXECUTE para anon en las tres funciones ni en el helper; authenticated solo en las tres",
  como(
    FELIPE,
    `select
  has_function_privilege('anon', 'retail.registrar_pagos_compra(uuid, jsonb, date, uuid)', 'execute'),
  has_function_privilege('anon', 'retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric)', 'execute'),
  has_function_privilege('anon', 'retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)', 'execute'),
  has_function_privilege('anon', 'retail.fn_validar_fecha_pago_compra(date, date, text)', 'execute'),
  has_function_privilege('authenticated', 'retail.fn_validar_fecha_pago_compra(date, date, text)', 'execute'),
  has_function_privilege('authenticated', 'retail.registrar_pagos_compra(uuid, jsonb, date, uuid)', 'execute'),
  has_function_privilege('authenticated', 'retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric)', 'execute'),
  has_function_privilege('authenticated', 'retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)', 'execute');`
  ),
  ["f", "f", "f", "f", "f", "t", "t", "t"]
);

const UNA_FIRMA = `select count(*) filter (where proname = 'registrar_compra'),
  count(*) filter (where proname = 'registrar_pagos_compra'),
  count(*) filter (where proname = 'registrar_pago_compras'),
  count(*) filter (where proname = 'fn_validar_fecha_pago_compra'),
  (select count(*) from (select proname from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('registrar_compra', 'registrar_pagos_compra', 'registrar_pago_compras', 'fn_validar_fecha_pago_compra') group by 1 having count(*) > 1) x)
  from pg_proc where pronamespace = 'retail'::regnamespace;`;
exito("firmas · UNA sola firma de cada función y ninguna sobrecarga (group by … having count(*) > 1 vacío)", como(FELIPE, UNA_FIRMA), ["1", "1", "1", "1", "0"]);
exito(
  "firmas · las tres siguen siendo security definer con search_path = retail, public, extensions",
  como(
    FELIPE,
    `select count(*), bool_and(prosecdef), bool_and(proconfig = array['search_path=retail, public, extensions']) from pg_proc
  where pronamespace = 'retail'::regnamespace and proname in ('registrar_compra', 'registrar_pagos_compra', 'registrar_pago_compras');`
  ),
  ["3", "t", "t"]
);
exito(
  "firmas · ninguna de las funciones quedó creada en el schema public",
  como(
    FELIPE,
    `select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('registrar_compra', 'registrar_pagos_compra', 'registrar_pago_compras', 'fn_validar_fecha_pago_compra');`
  ),
  ["0"]
);

// ===========================================================================
// La migración: se puede pegar dos veces
// ===========================================================================

exito(
  "migración · pegarla dos veces deja UNA firma de cada función, sin perder nada, y las funciones siguen andando",
  `begin;
${MIGRACION}
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
${BASE}${compra("c1")}select gen_random_uuid() as tok \\gset
select ${pagar("c1", 100, { token: ":'tok'" })} as ids1 \\gset
select ${pagar("c1", 100, { token: ":'tok'" })} = :'ids1'::uuid[],
  (select count(*) from retail.compra_pagos where compra_id = :'c1'),
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('registrar_compra', 'registrar_pagos_compra', 'registrar_pago_compras', 'fn_validar_fecha_pago_compra')),
  (select count(*) from (select proname from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('registrar_compra', 'registrar_pagos_compra', 'registrar_pago_compras', 'fn_validar_fecha_pago_compra') group by 1 having count(*) > 1) x);`,
  ["t", "1", "4", "0"]
);
exito(
  "migración · una compra y un pago anteriores a la migración no se tocan (no borra ni modifica datos)",
  `begin;
${BASE}set local request.jwt.claim.sub = '${FELIPE}';
${compra("c1")}select retail.registrar_pago_compra(:'c1', 100, 'transferencia') as _a \\gset
select saldo::text as saldo0, (select count(*) from retail.compra_pagos where compra_id = :'c1') as n0 from retail.compras where id = :'c1' \\gset
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
select saldo::text = :'saldo0', (select count(*) from retail.compra_pagos where compra_id = :'c1') = :'n0'::bigint from retail.compras where id = :'c1';`,
  ["t", "t"]
);

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  if (EN_SECO) console.log("Modo --en-seco: la migración se carga dentro de cada escenario (no se aplica a la base).\n");

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
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
