#!/usr/bin/env node
/**
 * Prueba de `20261015170000_compras_montos_y_fechas_parte1.sql` y `20261015171000_compras_token_igv_y_anular_parte2.sql`
 * (/chaos de Compras 2026-10-15, ADR-0421).
 *
 * EL PROBLEMA QUE PRUEBA. Recibir y anular la misma factura a la vez terminaban las dos (factura anulada con su mercadería en el stock,
 * INV-14); el mismo token con otro contenido devolvía lo del primer envío en `registrar_compra` y en los tres pagos; y por la API entraban
 * una factura con costo o IGV `NaN`, un IGV de 1000 %, una emisión en 2030, una factura sin serie, un vencimiento antes de la emisión y un
 * proveedor de 5000 letras. Aquí cada caso se rechaza con su candado o su `hint`, lo válido pasa igual, y hay control: sin las
 * migraciones, todo entraba (y anular no esperaba a una recepción en curso).
 *
 * Cada caso corre en una transacción que termina en ROLLBACK. USO: pnpm pruebas:compras-candados-y-token
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const PARTE1 = readFileSync(join(RAIZ, "supabase/migrations/20261015170000_compras_montos_y_fechas_parte1.sql"), "utf8");
const PARTE2 = readFileSync(join(RAIZ, "supabase/migrations/20261015171000_compras_token_igv_y_anular_parte2.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

const CANDADOS = [...PARTE1.matchAll(/select pg_temp\.candado\('([a-z_]+)', '([a-z_]+)'/g)].map((m) => ({ tabla: m[1], nombre: m[2] }));
if (CANDADOS.length !== 12) throw new Error(`esperaba 12 candados y encontré ${CANDADOS.length}`);
const sinCandados = CANDADOS.map((c) => `alter table retail.${c.tabla} drop constraint if exists ${c.nombre};`).join("\n");
const BLOQUES = [...PARTE2.matchAll(/select pg_temp\.insertar_antes\(\s*'(retail\.[^']+)',\s*\$v\$[\s\S]*?\$v\$, \d+,\s*\$v\$([\s\S]*?)\$v\$,/g)].map((m) => ({ firma: m[1], bloque: m[2] }));
if (BLOQUES.length !== 6) throw new Error(`esperaba 6 bloques y encontré ${BLOQUES.length}`);
const deshacer = (lista) => lista.map((b) => `do $d$ begin execute replace(pg_get_functiondef('${b.firma}'::regprocedure), $n$${b.bloque}$n$, ''); end $d$;`).join("\n");
const DEL_TOKEN = BLOQUES.filter((b) => b.bloque.includes("fn_intento_con_huella("));
const DE_REGLAS = BLOQUES.filter((b) => b.bloque.includes("serie_vacia"));
const DE_ANULAR = BLOQUES.filter((b) => b.bloque.includes("anular_espera_recepcion"));
if (DEL_TOKEN.length !== 4 || DE_REGLAS.length !== 1 || DE_ANULAR.length !== 1) throw new Error("no encontré los bloques de la parte 2");

// Todo sale del seed por su nombre o su código (los ids cambian en cada base).
function preparar({ sinMontos = false, sinToken = false, sinReglas = false } = {}) {
  return `
begin;
${PARTE1}
${PARTE2}
${sinMontos ? sinCandados : ""}
${sinToken ? deshacer(DEL_TOKEN) : ""}
${sinReglas ? deshacer(DE_REGLAS) : ""}
set local request.jwt.claim.sub = '${FELIPE}';
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as bei_l, producto_id as emma from retail.variantes where sku = 'BLU-EMMA-BEI-L' \\gset
`;
}

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 5).join("\n    ")}`);
  }
}
const rechaza = (r, marca) => !r.ok && r.error.includes(marca);

/** Una línea de factura: 3 unidades a `costo` (expresión SQL). */
const linea = (cantidad = 3, costo = "30") =>
  `jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'variante_id', :'bei_l', 'descripcion', 'L1', 'cantidad', ${cantidad}, 'costo_unitario', ${costo}, 'confirma_costo', true))`;
let n = 0;
/** `registrar_compra` con lo de siempre (factura al crédito a 10 días); `extra` agrega o pisa parámetros con nombre. */
const factura = ({ serie = "'FPR1'", items = linea(), extra = "", como = "compra" } = {}) =>
  `select retail.registrar_compra(:'prov', ${serie}, 'P${++n}', 'credito', :'lima', ${items}, p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10${extra}) as ${como} \\gset\n`;

// --- 1. Montos y fechas en la tabla, con control ---
const ATAQUES = [
  ["una factura con el costo en NaN", factura({ items: linea(3, "'NaN'") }), "_montos_finitos"],
  ["una factura que vence antes de emitirse", factura({ extra: ", p_fecha_vencimiento => retail.fn_hoy_lima() - 5" }).replace("p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_fecha_vencimiento", "p_fecha_vencimiento"), "compras_vence_despues_de_emitir"],
  ["un proveedor de 121 letras", `update retail.proveedores set nombre = repeat('p', 121) where id = :'prov';`, "proveedores_textos_con_tope"],
];
for (const [nombre, sql, candado] of ATAQUES) {
  const sin = correr(`${preparar({ sinMontos: true })}${sql}`);
  esperar(`CONTROL sin la migración: ${nombre} entraba`, sin.ok, sin.error);
  esperar(`${nombre} se rechaza (${candado})`, rechaza(correr(`${preparar()}${sql}`), candado), "pasó");
}

// --- 2. El IGV, la emisión y la serie, con control ---
const REGLAS = [
  ["un IGV de 1000 %", factura({ extra: ", p_igv_porcentaje => 1000" }), "igv_fuera_de_rango"],
  ["un IGV en NaN", factura({ extra: ", p_igv_porcentaje => 'NaN'" }), "igv_fuera_de_rango"],
  ["una factura emitida en 2030", factura({ extra: ", p_fecha_emision => '2030-01-01'::date, p_fecha_vencimiento => '2030-02-01'::date" }).replace("p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, ", ""), "emision_futura"],
  ["una factura sin serie", factura({ serie: "'  '" }), "serie_vacia"],
];
for (const [nombre, sql, hint] of REGLAS) {
  // Sin las DOS partes: un IGV en NaN también lo frena el candado de montos de la parte 1 (la otra capa).
  const sin = correr(`${preparar({ sinReglas: true, sinMontos: true })}${sql}`);
  esperar(`CONTROL sin la migración: ${nombre} entraba`, sin.ok, sin.error);
  esperar(`${nombre} se rechaza (${hint})`, rechaza(correr(`${preparar()}${sql}`), hint), "pasó");
}
{
  const notaVenta = `select retail.registrar_compra(:'prov', '', 'NV${++n}', 'credito', :'lima', ${linea()}, p_tipo => 'nota_venta', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 0);\n`;
  const r = correr(`${preparar()}${factura({ extra: ", p_igv_porcentaje => 18" })}${factura({ extra: ", p_igv_porcentaje => 0" })}${notaVenta}select 'ok|validas';`);
  esperar("lo válido entra igual: IGV 18 y 0, emitida hoy, y una nota de venta sin serie", r.ok && r.salida.includes("ok|validas"), r.error);
}

// --- 3. El token sigue al contenido ---
{
  const t = "c0ffee00-0000-4000-8000-000000014211";
  const CASOS = [
    ["registrar_compra: 3 × S/ 30 y luego 9 × S/ 99", "", (m) => `retail.registrar_compra(:'prov', 'FTK9', 'T1', 'credito', :'lima', ${m === 1 ? linea() : linea(9, "99")}, p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_token => '${t}')::text`],
    ["registrar_pagos_compra: S/ 100 y luego S/ 200", factura({ items: linea(10, "30") }), (m) => `retail.registrar_pagos_compra(:'compra', '[{"monto":${m === 1 ? 100 : 200},"metodo":"transferencia"}]'::jsonb, null, '${t}')::text`],
    ["registrar_pago_compras: S/ 100 y luego S/ 200", factura({ items: linea(10, "30") }), (m) => `retail.registrar_pago_compras(:'prov', 'transferencia', jsonb_build_array(jsonb_build_object('compra_id', :'compra', 'monto', ${m === 1 ? 100 : 200})), null, null, '${t}')::text`],
    ["registrar_pago_compras_medios: S/ 100 y luego S/ 200", factura({ items: linea(10, "30") }), (m) => `retail.registrar_pago_compras_medios(:'prov', jsonb_build_array(jsonb_build_object('compra_id', :'compra', 'monto', ${m === 1 ? 100 : 200})), '[{"metodo":"transferencia","monto":${m === 1 ? 100 : 200}}]'::jsonb, null, '${t}')::text`],
  ];
  const dos = (antes, f, [a, b], opciones) => correr(`${preparar(opciones)}${antes}select 'uno|' || ${f(a)};\nselect 'dos|' || ${f(b)};`);
  const iguales = (r) => r.ok && r.salida.match(/^uno\|(.*)$/m)?.[1] === r.salida.match(/^dos\|(.*)$/m)?.[1];
  for (const [nombre, antes, f] of CASOS) {
    const sin = dos(antes, f, [1, 2], { sinToken: true });
    esperar(`CONTROL ${nombre}: sin la migración, el segundo devolvía lo del primero`, iguales(sin), sin.salida || sin.error);
    esperar(`${nombre}: el segundo se rechaza (token_reusado)`, rechaza(dos(antes, f, [1, 2]), "token_reusado"), "pasó");
    const repetido = dos(antes, f, [1, 1]);
    esperar(`${nombre}: el reintento con LO MISMO devuelve lo mismo`, iguales(repetido), repetido.salida || repetido.error);
  }
}

// --- 4. Anular espera a una recepción en curso (INV-14). La factura F002-001045 del seed, sin pagos. ---
function sesion(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ ok: code === 0, salida: out.trim(), error: err, ms: Date.now() - inicio }));
    p.stdin.end(`${sql}\nrollback;\n`);
  });
}
async function anularEspera({ sinBloque }) {
  const compra = "(select id from retail.compras where serie = 'F002' and numero = '001045')";
  // Una recepción en curso: tiene tomadas las líneas de la factura (como `fn_bloquear_en_orden`) y no termina por 2,5 s.
  const recepcion = sesion(`begin;\nperform 1 from retail.compra_items where compra_id = ${compra} order by id for update;\nselect pg_sleep(2.5);`.replace("perform 1", "select 1 as _l"));
  await new Promise((r) => setTimeout(r, 800));
  const anular = await sesion(`begin;\n${sinBloque ? deshacer(DE_ANULAR) : ""}\nset local request.jwt.claim.sub = '${FELIPE}';\nselect retail.anular_compra(${compra}, 'prueba de concurrencia');`);
  await recepcion;
  return anular;
}
{
  const sin = await anularEspera({ sinBloque: true });
  esperar("CONTROL sin la migración: anular NO esperaba a la recepción en curso (por eso las dos terminaban)", sin.ms < 1000, `tardó ${sin.ms} ms`);
  const con = await anularEspera({ sinBloque: false });
  esperar("anular espera a que la recepción en curso termine (toma las líneas antes que la factura)", con.ms >= 1000, `tardó ${con.ms} ms`);
}

// --- 5. Las dos partes se pueden pegar dos veces ---
{
  const r = correr(`begin;\n${PARTE1}\n${PARTE1}\n${PARTE2}\n${PARTE2}
select 'validados|' || count(*) filter (where convalidated) || '/' || count(*) from pg_constraint where conname in (${CANDADOS.map((c) => `'${c.nombre}'`).join(", ")});
select 'huellas|' || sum((length(d) - length(replace(d, 'fn_intento_con_huella(', ''))) / length('fn_intento_con_huella('))
  from (select pg_get_functiondef(oid) d from pg_proc where pronamespace = 'retail'::regnamespace
         and proname in ('registrar_compra', 'registrar_pagos_compra', 'registrar_pago_compras', 'registrar_pago_compras_medios')) x;
select 'anular|' || (length(d) - length(replace(d, 'anular_espera_recepcion', ''))) / length('anular_espera_recepcion')
  from (select pg_get_functiondef('retail.anular_compra(uuid, text)'::regprocedure) d) x;`);
  esperar("las dos partes se pueden pegar dos veces: 12 candados validados, cada huella y el candado de anular una sola vez",
    r.ok && r.salida.includes("validados|12/12") && r.salida.includes("huellas|4") && r.salida.includes("anular|1"), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
