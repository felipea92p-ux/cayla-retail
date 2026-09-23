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
 * DOS MIGRACIONES. La 20260919180000 endurece `registrar_pagos_compra` y `registrar_pago_compras` (y crea el
 * helper de fecha); la 20260919181000 PARCHA `registrar_compra` sobre su definición viva (A1, M2, M3), para no pisar la
 * de reparto por tienda (ADR-0139). Las pruebas de `registrar_compra` deben pasar con las dos, y hay casos propios del
 * parche: aplicarlo dos veces no cambia el md5, aborta limpio si falta un ancla (una por una, las seis) o si la función
 * quedó a medias, y —si la migración de reparto está en el worktree hermano— sus anclas existen en la definición
 * que esa rama deja y el parche se aplica sobre ella.
 *
 * `--en-seco`: antes de cada escenario carga DENTRO de su transacción la definición SIN parchar de `registrar_compra`
 * (la de la migración 20260918219100, la que hay en producción hoy) y luego las dos migraciones EN ORDEN, así se prueba
 * SIN haberlas aplicado a la base compartida y el parche corre de verdad sobre una función cruda. Sin el flag asume
 * que ya están aplicadas (y si no lo están, los casos fallan: eso es lo que demuestra que las pruebas detectan los
 * huecos).
 *
 * USO
 *   pnpm pruebas:pagos-compras-endurecimiento            → migración ya aplicada en el local
 *   pnpm pruebas:pagos-compras-endurecimiento --en-seco  → la carga en cada escenario, sin aplicarla
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

const EN_SECO = process.argv.includes("--en-seco");
const leerMigracion = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8");
const MIGRACION = leerMigracion("20260919180000_pagos_compras_endurecimiento.sql"); // parte 1: pagos + helper de fecha
const PARCHE = leerMigracion("20260919181000_registrar_compra_endurecimiento_por_parche.sql"); // parte 2: parche de registrar_compra

/**
 * `registrar_compra` SIN parchar: el texto de la migración 20260918219100 (la definición que hay en producción), con
 * `fn_hoy_lima()` en la fecha del pago como en la definición viva (la de la migración lleva `current_date`).
 */
const REGISTRAR_COMPRA_CRUDA = (() => {
  const texto = leerMigracion("20260918219100_registrar_compra_una_sola_firma_con_token_y_saldo_a_favor.sql");
  const m = texto.match(/create or replace function retail\.registrar_compra\([\s\S]*?\$function\$;/);
  if (!m) throw new Error("No encontré registrar_compra en 20260918219100");
  const ancla = "v_pago_fecha := coalesce((v_pagos -> 0 ->> 'fecha')::date, current_date);";
  if (!m[0].includes(ancla)) throw new Error("La cruda ya no tiene la línea de fecha esperada");
  return `set search_path = retail, public, extensions;\n${m[0].replace(ancla, ancla.replace("current_date", "fn_hoy_lima()"))}\n`;
})();

/** Las anclas del parche, leídas del propio archivo (una sola fuente de verdad). */
const ANCLAS = [...PARCHE.matchAll(/\$a\$([\s\S]*?)\$a\$/g)].map((m) => m[1]);
/** El `DO` del parche como una sola sentencia (para ejecutarlo con `execute` dentro de un bloque con manejo de errores). */
const DO_PARCHE = PARCHE.match(/do \$parche\$[\s\S]*?\$parche\$;/)[0].replace(/;$/, "");

/**
 * Tras el reparto por tienda (ADR-0139, migración 20260919173000) `compras` ya no tiene `ubicacion_destino_id`. La
 * función CRUDA de producción de hoy (REGISTRAR_COMPRA_CRUDA) todavía la escribe: un escenario que la instala y LA LLAMA
 * necesita la columna, así que se le devuelve DENTRO de su transacción (que termina en ROLLBACK), como estaba en
 * producción antes del reparto. No toca la base compartida.
 *
 * `--en-seco` NO sirve en una base que ya tiene el reparto: la función cruda no escribe el reparto por tienda y
 * `recibir_compras` (ya con el tope por tienda) lo exige. Con el reparto aplicado se corre el modo normal.
 */
const CABECERA_DE_ANTES = `do $c$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'compras' and column_name = 'ubicacion_destino_id') then
    alter table retail.compras add column ubicacion_destino_id uuid;
  end if;
  -- ADR-0151 (F3, migración 20260922160000) agrega ubicacion_gestion_id con un CHECK que la exige en toda factura
  -- vigente. Esta función CRUDA es de ANTES de esa migración y no la escribe: se relaja solo aquí (misma lógica que
  -- la columna de arriba), dentro de la transacción que termina sin COMMIT.
  if exists (select 1 from pg_constraint where conname = 'compras_gestora_obligatoria') then
    alter table retail.compras drop constraint compras_gestora_obligatoria;
  end if;
end $c$;
`;

const PRELUDIO = EN_SECO ? `${REGISTRAR_COMPRA_CRUDA}${MIGRACION}\n${PARCHE}\n` : "";

const FIRMA_RC = "'retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)'::regprocedure";

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
  "Registrar pagos a proveedores necesita el módulo Por pagar" // ADR-0161 P1 (20260923140000)
);
error(
  "seguridad · el integrante NO puede pagar por lote",
  COMO_MICAELA(`select ${lote([["c1", 10]], { token: "gen_random_uuid()" })};`),
  "Registrar pagos a proveedores necesita el módulo Por pagar" // ADR-0161 P1 (20260923140000)
);
error(
  "seguridad · el integrante NO puede registrar una compra (con total del papel)",
  COMO_MICAELA(
    `select retail.registrar_compra(:'prov1', 'TST', ${N}, 'credito', :'taller', jsonb_build_array(${ITEM(5, 8.47)}), p_fecha_emision => ${HOY}, p_fecha_vencimiento => ${HOY} + 10, p_total => 50.00);`
  ),
  "Registrar un comprobante de compra necesita el módulo Facturas de compra" // ADR-0161 P1 (20260923140000)
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
    // registrar_pagos_compra y registrar_pago_compras ganaron un p_ubicacion_id al final (ADR-0151, F4,
    // 20260922170000): la firma real hoy tiene un parámetro más que cuando se escribió esta prueba.
    `select
  has_function_privilege('anon', 'retail.registrar_pagos_compra(uuid, jsonb, date, uuid, uuid)', 'execute'),
  has_function_privilege('anon', 'retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric, uuid)', 'execute'),
  has_function_privilege('anon', 'retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)', 'execute'),
  has_function_privilege('anon', 'retail.fn_validar_fecha_pago_compra(date, date, text)', 'execute'),
  has_function_privilege('authenticated', 'retail.fn_validar_fecha_pago_compra(date, date, text)', 'execute'),
  has_function_privilege('authenticated', 'retail.registrar_pagos_compra(uuid, jsonb, date, uuid, uuid)', 'execute'),
  has_function_privilege('authenticated', 'retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric, uuid)', 'execute'),
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
// Las migraciones: se pueden pegar dos veces, y el parche es seguro
// ===========================================================================

const AMBAS = `${MIGRACION}\n${PARCHE}\n`;
const MD5_RC = `md5(pg_get_functiondef(${FIRMA_RC}))`;
const CUATRO = `('registrar_compra', 'registrar_pagos_compra', 'registrar_pago_compras', 'fn_validar_fecha_pago_compra')`;

exito(
  "migraciones · pegar las dos (parte 1 y parche) dos veces deja UNA firma de cada función, sin perder nada, y siguen andando",
  `begin;
${CABECERA_DE_ANTES}${REGISTRAR_COMPRA_CRUDA}${AMBAS}${AMBAS}
set local request.jwt.claim.sub = '${FELIPE}';
${BASE}${compra("c1")}select gen_random_uuid() as tok \\gset
select ${pagar("c1", 100, { token: ":'tok'" })} as ids1 \\gset
select ${pagar("c1", 100, { token: ":'tok'" })} = :'ids1'::uuid[],
  (select count(*) from retail.compra_pagos where compra_id = :'c1'),
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ${CUATRO}),
  (select count(*) from (select proname from pg_proc where pronamespace = 'retail'::regnamespace and proname in ${CUATRO} group by 1 having count(*) > 1) x);`,
  ["t", "1", "4", "0"]
);
exito(
  "migraciones · una compra y un pago anteriores no se tocan (no borra ni modifica datos)",
  `begin;
${BASE}set local request.jwt.claim.sub = '${FELIPE}';
${compra("c1")}select retail.registrar_pago_compra(:'c1', 100, 'transferencia') as _a \\gset
select saldo::text as saldo0, (select count(*) from retail.compra_pagos where compra_id = :'c1') as n0 from retail.compras where id = :'c1' \\gset
${AMBAS}
set local request.jwt.claim.sub = '${FELIPE}';
select saldo::text = :'saldo0', (select count(*) from retail.compra_pagos where compra_id = :'c1') = :'n0'::bigint from retail.compras where id = :'c1';`,
  ["t", "t"]
);
exito(
  "parche · sobre la función CRUDA cambia el md5; aplicarlo una SEGUNDA vez NO lo cambia (re-ejecutable), y queda UNA firma",
  `begin;
${REGISTRAR_COMPRA_CRUDA}${MIGRACION}
select ${MD5_RC} as m0 \\gset
${PARCHE}
select ${MD5_RC} as m1 \\gset
${PARCHE}
select :'m0' <> :'m1', :'m1' = ${MD5_RC}, (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_compra');`,
  ["t", "t", "1"]
);
exito(
  "parche · conserva security definer, search_path, comentario y grants (authenticated sí, anon/public no)",
  `begin;
${REGISTRAR_COMPRA_CRUDA}${MIGRACION}
select obj_description(${FIRMA_RC}, 'pg_proc') as c0 \\gset
${PARCHE}
select prosecdef, proconfig = array['search_path=retail, public, extensions'],
  obj_description(oid, 'pg_proc') = :'c0',
  has_function_privilege('authenticated', oid, 'execute'), has_function_privilege('anon', oid, 'execute'),
  (select count(*) from aclexplode(proacl) a where a.grantee = 0)
  from pg_proc where oid = ${FIRMA_RC};`,
  ["t", "t", "t", "t", "f", "0"]
);
exito(
  "parche · si falta UNA de las seis anclas aborta con «Ancla no encontrada» y NO deja la función cambiada (las seis, una por una)",
  `begin;
${REGISTRAR_COMPRA_CRUDA}${MIGRACION}
do $t$
declare
  v_anclas text[] := array[${ANCLAS.map((a) => `$q$${a}$q$`).join(", ")}];
  v_oid oid := ${FIRMA_RC};
  v_cruda text := pg_get_functiondef(v_oid);
  v_roto text; v_md5_roto text; v_msg text; v_i integer; v_ok integer := 0;
begin
  for v_i in 1 .. array_length(v_anclas, 1) loop
    -- La misma función pero con el ancla i «rota»: un comentario de bloque en su primer espacio (sigue siendo SQL válido).
    v_roto := replace(v_cruda, v_anclas[v_i], replace(v_anclas[v_i], ' ', ' /* roto */ '));
    if v_roto = v_cruda then raise exception 'la prueba no pudo romper el ancla %', v_i; end if;
    execute v_roto;
    v_md5_roto := md5(pg_get_functiondef(v_oid));
    v_msg := null;
    begin
      execute $m$${DO_PARCHE}$m$;
    exception when others then
      v_msg := sqlerrm;
    end;
    if v_msg like 'Ancla no encontrada%' and md5(pg_get_functiondef(v_oid)) = v_md5_roto then
      v_ok := v_ok + 1;
    end if;
  end loop;
  execute v_cruda;
  perform set_config('t.ok', v_ok::text, true);
end
$t$;
select current_setting('t.ok'), (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_compra');`,
  [String(ANCLAS.length), "1"]
);
exito(
  "parche · si la función quedó a medias (algún marcador sin los demás) aborta con «parcialmente parchada» sin tocarla",
  `begin;
${REGISTRAR_COMPRA_CRUDA}${MIGRACION}
do $t$
declare
  v_oid oid := ${FIRMA_RC};
  v_media text := replace(pg_get_functiondef(${FIRMA_RC}), 'v_tolerancia numeric(12, 2);', E'v_tolerancia numeric(12, 2);\\n  v_unidades numeric := 0;');
  v_md5 text; v_msg text;
begin
  execute v_media;
  v_md5 := md5(pg_get_functiondef(v_oid));
  begin
    execute $m$${DO_PARCHE}$m$;
  exception when others then
    v_msg := sqlerrm;
  end;
  perform set_config('t.ok', (v_msg like 'registrar_compra está parcialmente parchada%' and md5(pg_get_functiondef(v_oid)) = v_md5)::text, true);
end
$t$;
select current_setting('t.ok');`,
  ["true"]
);
exito(
  "parche · si hubiera DOS firmas de registrar_compra aborta (ADR-0009) y no toca ninguna",
  `begin;
${REGISTRAR_COMPRA_CRUDA}${MIGRACION}
create function retail.registrar_compra(p_solo_prueba integer) returns integer language sql as $$ select 1 $$;
do $t$
declare v_msg text;
begin
  begin
    execute $m$${DO_PARCHE}$m$;
  exception when others then
    v_msg := sqlerrm;
  end;
  perform set_config('t.ok', (v_msg like 'registrar_compra tiene 2 firmas vivas%')::text, true);
end
$t$;
select current_setting('t.ok'), (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_compra' and pg_get_functiondef(oid) like '%v_unidades%');`,
  ["true", "0"]
);

// --- Contra la definición que deja la migración de reparto por tienda (ADR-0139), si está en el worktree hermano.
// No se puede EJECUTAR (necesita `compra_item_destinos` y sin `ubicacion_destino_id`, que esta base no tiene): se prueba
// que las seis anclas existen ahí, que el parche se aplica, que conserva su reparto y que es re-ejecutable.
const MIGRACION_REPARTO = process.env.CAYLA_REPARTO_MIGRACION
  ?? join(RAIZ, "..", "modulos-por-tienda-ca0f59", "supabase", "migrations", "20260919172000_reparto_compra_por_tienda.sql");
let REGISTRAR_COMPRA_REPARTO = null;
if (existsSync(MIGRACION_REPARTO)) {
  const m = readFileSync(MIGRACION_REPARTO, "utf8").match(/create or replace function (?:retail\.)?registrar_compra\([\s\S]*?\$function\$;/);
  if (m) REGISTRAR_COMPRA_REPARTO = m[0];
}
if (REGISTRAR_COMPRA_REPARTO) {
  const veces = ANCLAS.map((a) => REGISTRAR_COMPRA_REPARTO.split(a).length - 1);
  exito(
    `parche · sobre la registrar_compra de la migración de reparto (${veces.join("/")} apariciones de las seis anclas): se aplica, conserva el reparto y es re-ejecutable`,
    `begin;
set search_path = retail, public, extensions;
${MIGRACION}
${REGISTRAR_COMPRA_REPARTO}
select ${MD5_RC} as m0 \\gset
${PARCHE}
select ${MD5_RC} as m1 \\gset
${PARCHE}
select :'m0' <> :'m1', :'m1' = ${MD5_RC},
  pg_get_functiondef(${FIRMA_RC}) like '%compra_item_destinos%',
  pg_get_functiondef(${FIRMA_RC}) like '%v_unidades%' and pg_get_functiondef(${FIRMA_RC}) like '%fn_validar_fecha_pago_compra%' and pg_get_functiondef(${FIRMA_RC}) like '%Los montos del pago admiten%',
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_compra');`,
    ["t", "t", "t", "t", "1"]
  );
} else {
  console.log(`(omitido: no encuentro la migración de reparto en ${MIGRACION_REPARTO}; define CAYLA_REPARTO_MIGRACION para probar el parche contra ella)\n`);
}

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  if (EN_SECO) console.log("Modo --en-seco: registrar_compra cruda + las dos migraciones se cargan dentro de cada escenario (no se aplican a la base).\n");

  // ADR-0151 (F4, 20260922170000) le agregó un parámetro a registrar_pagos_compra/registrar_pago_compras: este
  // escenario reinstala DELIBERADAMENTE el código de ANTES de esa migración (para probar el parche de ADR-0135
  // sobre la definición histórica) y vuelve a pegar las migraciones 180000/181000, que asumen la firma vieja —
  // una vez F4 está aplicada de verdad, eso deja dos firmas ambiguas. No es un defecto de F4 ni de esta prueba:
  // son dos migraciones de eras distintas que no se re-pegan juntas después de que la más nueva cambió la firma.
  const HAY_PAGO_POR_TIENDA = psql("select to_regprocedure('retail.fn_saldo_de_tienda(uuid,uuid)') is not null;").trim() === "t";
  const SOLO_ANTES_DEL_PAGO_POR_TIENDA = ["migraciones · pegar las dos (parte 1 y parche) dos veces deja UNA firma de cada función"];
  let saltadas = 0;

  let fallos = 0;
  for (const caso of CASOS) {
    if (HAY_PAGO_POR_TIENDA && SOLO_ANTES_DEL_PAGO_POR_TIENDA.some((p) => caso.nombre.startsWith(p))) {
      saltadas++;
      console.log(`↷ (se salta: F4 ya está aplicada y cambió la firma que este escenario reinstala a propósito) ${caso.nombre}`);
      continue;
    }
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

  const corridas = CASOS.length - saltadas;
  console.log(`\n${corridas - fallos}/${corridas} pruebas en verde${saltadas ? ` (${saltadas} se salta: solo aplica antes de F4).` : "."}`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
