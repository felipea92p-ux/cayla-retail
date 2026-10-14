#!/usr/bin/env node
/**
 * Prueba de `20261014182000_catalogo_montos_finitos_y_textos_con_tope.sql` (/chaos de Catálogo, ADR-0405).
 *
 * EL PROBLEMA QUE PRUEBA. Por la API entraban una prenda con precio o costo `NaN` (o infinito) —que nadie puede vender y que vuelve
 * `NaN` toda suma que la toque— y un nombre de producto o de marca de 5000 letras. `variantes.costo` es el costo oficial que también
 * escriben Compras y Producción. Aquí cada uno se rechaza, lo válido pasa igual, y hay control: sin la migración, todo eso entraba.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK. USO: pnpm pruebas:catalogo-montos-y-textos
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIG = readFileSync(join(RAIZ, "supabase/migrations/20261014182000_catalogo_montos_finitos_y_textos_con_tope.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

// Los candados que pone la migración: el control los quita (dentro de la misma transacción) para mostrar que sin ellos todo entraba.
const CANDADOS = [...MIG.matchAll(/select pg_temp\.candado\('([a-z_]+)', '([a-z_]+)'/g)].map((m) => ({ tabla: m[1], nombre: m[2] }));
if (CANDADOS.length !== 11) throw new Error(`esperaba 11 candados y encontré ${CANDADOS.length}`);
const sinCandados = CANDADOS.map((c) => `alter table retail.${c.tabla} drop constraint if exists ${c.nombre};`).join("\n");

function preparar({ sin = false } = {}) {
  return `
begin;
${MIG}
${sin ? sinCandados : ""}
set local request.jwt.claim.sub = '${FELIPE}';
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select producto_id as p from retail.variantes where id = :'v' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as marca from retail.marcas order by nombre limit 1 \\gset
select id as cat from retail.categorias order by nombre limit 1 \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
select codigo as familia from retail.familias order by codigo limit 1 \\gset
`;
}

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 4).join("\n    ")}`);
  }
}
const rechaza = (r, candado) => !r.ok && r.error.includes(candado);

// Cada ataque: [nombre, SQL, candado que lo frena].
const ATAQUES = [
  ["el precio de una prenda en NaN", `update retail.variantes set precio = 'NaN' where id = :'v';`, "variantes_montos_finitos"],
  ["el costo oficial en NaN (lo escriben Compras y Producción)", `update retail.variantes set costo = 'NaN' where id = :'v';`, "variantes_montos_finitos"],
  // `precios_sede` ya es historia (un disparador no deja escribir): el precio de una tienda vive en `precios_sede_prenda`.
  ["el precio por sede en NaN", `insert into retail.precios_sede_prenda (producto_id, ubicacion_id, precio, motivo, vigente_desde) values (:'p', :'lima', 'NaN', 'chaos', now());`, "precios_sede_prenda_montos_finitos"],
  ["el precio mínimo de liquidación en NaN", `update retail.parametros_liquidacion set precio_minimo = 'NaN';`, "parametros_liquidacion_montos_finitos"],
  ["un nombre de producto de 81 letras", `update retail.productos set referencia = repeat('x', 81) where id = :'p';`, "productos_textos_con_tope"],
  ["una descripción de 501 letras", `update retail.productos set descripcion = repeat('x', 501) where id = :'p';`, "productos_textos_con_tope"],
  ["un nombre de marca de 81 letras", `update retail.marcas set nombre = repeat('x', 81) where id = :'marca';`, "marcas_textos_con_tope"],
  ["un nombre de categoría de 61 letras", `update retail.categorias set nombre = repeat('x', 61) where id = :'cat';`, "categorias_textos_con_tope"],
  ["un nombre de color de 61 letras", `update retail.colores set nombre = repeat('x', 61) where codigo = :'color';`, "colores_textos_con_tope"],
  ["un nombre de familia de 61 letras", `update retail.familias set nombre = repeat('x', 61) where codigo = :'familia';`, "familias_textos_con_tope"],
];

for (const [nombre, sql, candado] of ATAQUES) {
  const sin = correr(`${preparar({ sin: true })}${sql}`);
  esperar(`CONTROL sin la migración: ${nombre} entraba`, sin.ok, sin.error);
  esperar(`${nombre} se rechaza (${candado})`, rechaza(correr(`${preparar()}${sql}`), candado), "pasó");
}

// Lo válido pasa igual: los bordes exactos.
{
  const r = correr(`${preparar()}
update retail.variantes set precio = 59.90, costo = 20 where id = :'v';
update retail.productos set referencia = repeat('y', 80), descripcion = repeat('y', 500) where id = :'p';
update retail.marcas set nombre = repeat('z', 80) where id = :'marca';
update retail.categorias set nombre = repeat('z', 60) where id = :'cat';
select 'ok|bordes';`);
  esperar("lo válido entra igual: precio y costo normales, 80 y 500 letras en el producto, 80 en la marca, 60 en la categoría", r.ok && r.salida.includes("ok|bordes"), r.error);
}

// Se puede pegar dos veces, y cada candado queda validado.
{
  const r = correr(`begin;\n${MIG}\n${MIG}
select 'validados|' || count(*) filter (where convalidated) || '/' || count(*) from pg_constraint
 where conname like '%_montos_finitos' and conrelid in ('retail.variantes'::regclass, 'retail.precios_sede'::regclass, 'retail.precios_sede_prenda'::regclass,
   'retail.parametros_liquidacion'::regclass, 'retail.piezas_liquidacion'::regclass, 'retail.piezas_liquidacion_etiquetas'::regclass)
    or conname like '%_textos_con_tope';`);
  esperar("la migración se puede pegar dos veces y sus 11 candados quedan validados", r.ok && r.salida.includes("validados|11/11"), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
