#!/usr/bin/env node
/**
 * Prueba de `20261015152000_catalogo_precio_con_tope_parte1.sql` y `20261015153000_produccion_entrega_y_buenas_parte2.sql`
 * (recomendaciones de /chaos aplicadas, ADR-0415).
 *
 * EL PROBLEMA QUE PRUEBA. Un precio o un costo de prenda sin techo (el punto que falta: «5990» por «59.90»); una orden del Taller que
 * prometía la entrega en 1990; y una orden de 6 que se cerraba con 60 buenas. Aquí cada caso se rechaza con su candado o su `hint`, lo
 * válido pasa igual (los bordes exactos, una orden sin fecha, algunas buenas de más) y hay control: sin las migraciones, todo entraba.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK. USO: pnpm pruebas:recomendaciones-produccion-catalogo
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const PARTE1 = readFileSync(join(RAIZ, "supabase/migrations/20261015152000_catalogo_precio_con_tope_parte1.sql"), "utf8");
const PARTE2 = readFileSync(join(RAIZ, "supabase/migrations/20261015153000_produccion_entrega_y_buenas_parte2.sql"), "utf8");
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
if (CANDADOS.length !== 6) throw new Error(`esperaba 6 candados y encontré ${CANDADOS.length}`);
const sinCandados = CANDADOS.map((c) => `alter table retail.${c.tabla} drop constraint if exists ${c.nombre};`).join("\n");
const BLOQUES = [...PARTE2.matchAll(/select pg_temp\.insertar_antes\(\s*'(retail\.[^']+)',\s*\$v\$[\s\S]*?\$v\$, \d+,\s*\$v\$([\s\S]*?)\$v\$,/g)].map((m) => ({ firma: m[1], bloque: m[2] }));
if (BLOQUES.length !== 3) throw new Error(`esperaba 3 bloques y encontré ${BLOQUES.length}`);
const sinBloques = BLOQUES.map((b) => `do $d$ begin execute replace(pg_get_functiondef('${b.firma}'::regprocedure), $n$${b.bloque}$n$, ''); end $d$;`).join("\n");

function preparar({ sinPrecio = false, sinProduccion = false } = {}) {
  return `
begin;
${PARTE1}
${PARTE2}
${sinPrecio ? sinCandados : ""}
${sinProduccion ? sinBloques : ""}
set local request.jwt.claim.sub = '${FELIPE}';
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select producto_id as p from retail.variantes where id = :'v' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as negs, producto_id as emma from retail.variantes where sku = 'BLU-EMMA-NEG-S' \\gset
select ct.categoria_id as cat, ct.talla_id as talla from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo
  join retail.categorias c on c.id = ct.categoria_id and c.activo order by c.nombre, t.id limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
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

// --- 1. El precio y el costo de una prenda llegan hasta S/ 5 000 ---
const ATAQUES = [
  ["un precio de prenda de S/ 5 000.01 (el punto que falta)", `update retail.variantes set precio = 5000.01 where id = :'v';`, "variantes_precio_con_tope"],
  ["un costo de prenda de S/ 5 990", `update retail.variantes set costo = 5990 where id = :'v';`, "variantes_precio_con_tope"],
  ["un precio por sede de S/ 5 990", `insert into retail.precios_sede_prenda (producto_id, ubicacion_id, precio, motivo, vigente_desde) values (:'p', :'lima', 5990, 'prueba', now());`, "precios_sede_prenda_precio_con_tope"],
  ["un precio mínimo de Liquidación de S/ 5 990", `update retail.parametros_liquidacion set precio_minimo = 5990;`, "parametros_liquidacion_precio_con_tope"],
];
for (const [nombre, sql, candado] of ATAQUES) {
  const sin = correr(`${preparar({ sinPrecio: true })}${sql}`);
  esperar(`CONTROL sin la migración: ${nombre} entraba`, sin.ok, sin.error);
  esperar(`${nombre} se rechaza (${candado})`, rechaza(correr(`${preparar()}${sql}`), candado), "pasó");
}
{
  const r = correr(`${preparar()}update retail.variantes set precio = 5000, costo = 5000 where id = :'v';\nselect 'ok|borde';`);
  esperar("lo válido entra igual: precio y costo de S/ 5 000 justos", r.ok && r.salida.includes("ok|borde"), r.error);
  const nan = correr(`${preparar()}update retail.variantes set precio = 'NaN' where id = :'v';`);
  esperar("un precio NaN sigue rebotando en montos_finitos (con su frase), no en el tope", rechaza(nan, "variantes_montos_finitos"), nan.error || "pasó");
}

// --- 2. La entrega de una orden no es anterior a hoy ---
const lineas = `jsonb_build_array(jsonb_build_object('variante_id', :'negs', 'cantidad', 6))`;
const abrir = (fecha) => `select retail.abrir_produccion(:'taller', :'emma', ${lineas}, p_costo_maquila => 100, p_fecha_entrega => ${fecha}) as orden \\gset\n`;
const abrirNuevo = (fecha) => `select retail.abrir_produccion_con_modelo_nuevo(:'taller', 'Modelo Prueba Fecha', :'cat', jsonb_build_array(jsonb_build_object('talla_id', :'talla', 'color_codigo', :'color', 'cantidad', 6)), p_precio => 59.9, p_fecha_entrega => ${fecha});\n`;
{
  const sin = correr(`${preparar({ sinProduccion: true })}${abrir("'1990-01-01'::date")}`);
  esperar("CONTROL sin la migración: una orden con entrega en 1990 se abría", sin.ok, sin.error);
  esperar("una orden con entrega en 1990 se rechaza (entrega_pasada)", rechaza(correr(`${preparar()}${abrir("'1990-01-01'::date")}`), "entrega_pasada"), "pasó");
  esperar("una orden con entrega ayer se rechaza (entrega_pasada)", rechaza(correr(`${preparar()}${abrir("current_date - 1")}`), "entrega_pasada"), "pasó");
  for (const [que, fecha] of [["hoy", "retail.fn_hoy_lima()"], ["en una semana", "current_date + 7"], ["sin fecha", "null"]]) {
    const r = correr(`${preparar()}${abrir(fecha)}`);
    esperar(`una orden con entrega ${que} se abre`, r.ok, r.error);
  }
  esperar("un modelo nuevo con entrega en 1990 se rechaza (entrega_pasada)", rechaza(correr(`${preparar()}${abrirNuevo("'1990-01-01'::date")}`), "entrega_pasada"), "pasó");
  const nuevo = correr(`${preparar()}${abrirNuevo("current_date + 7")}`);
  esperar("un modelo nuevo con entrega en una semana se abre", nuevo.ok, nuevo.error);
}

// --- 3. Al cerrar, ninguna talla pasa del doble de lo pedido (o de 5 más) ---
const cerrar = (buenas) =>
  `select retail.cerrar_produccion(:'orden', jsonb_build_array(jsonb_build_object('variante_id', :'negs', 'cantidad', ${buenas})), 0, 0, 100, true);\nselect 'cerrada|' || estado from retail.producciones where id = :'orden';`;
{
  const sin = correr(`${preparar({ sinProduccion: true })}${abrir("null")}${cerrar(60)}`);
  esperar("CONTROL sin la migración: una orden de 6 se cerraba con 60 buenas", sin.ok && sin.salida.includes("cerrada|"), sin.error);
  esperar("una orden de 6 cerrada con 60 buenas se rechaza (buenas_de_mas)", rechaza(correr(`${preparar()}${abrir("null")}${cerrar(60)}`), "buenas_de_mas"), "pasó");
  esperar("una orden de 6 cerrada con 13 buenas (una más que el doble) se rechaza", rechaza(correr(`${preparar()}${abrir("null")}${cerrar(13)}`), "buenas_de_mas"), "pasó");
  for (const n of [12, 9, 6, 4]) {
    const r = correr(`${preparar()}${abrir("null")}${cerrar(n)}`);
    esperar(`una orden de 6 se cierra con ${n} buenas`, r.ok && r.salida.includes("cerrada|"), r.salida || r.error);
  }
  // Una talla chica: de 1 pedida, hasta 6 (1 + 5).
  const chica = (b) => `select retail.abrir_produccion(:'taller', :'emma', jsonb_build_array(jsonb_build_object('variante_id', :'negs', 'cantidad', 1)), p_costo_maquila => 100) as orden \\gset\n${cerrar(b)}`;
  const seis = correr(`${preparar()}${chica(6)}`);
  esperar("una talla chica (1 pedida) se cierra con 6 buenas (5 de más)", seis.ok && seis.salida.includes("cerrada|"), seis.salida || seis.error);
  esperar("una talla chica (1 pedida) con 7 buenas se rechaza", rechaza(correr(`${preparar()}${chica(7)}`), "buenas_de_mas"), "pasó");
}

// --- 4. Las dos partes se pueden pegar dos veces ---
{
  const r = correr(`begin;\n${PARTE1}\n${PARTE1}\n${PARTE2}\n${PARTE2}
select 'validados|' || count(*) filter (where convalidated) || '/' || count(*) from pg_constraint where conname in (${CANDADOS.map((c) => `'${c.nombre}'`).join(", ")});
select 'marcas|' || sum((length(d) - length(replace(d, 'hint = ''entrega_pasada''', ''))) / length('hint = ''entrega_pasada''')
                     + (length(d) - length(replace(d, 'hint = ''buenas_de_mas''', ''))) / length('hint = ''buenas_de_mas'''))
  from (select pg_get_functiondef(oid) d from pg_proc where pronamespace = 'retail'::regnamespace
         and proname in ('abrir_produccion', 'abrir_produccion_con_modelo_nuevo', 'cerrar_produccion')) x;`);
  esperar("las dos partes se pueden pegar dos veces: 6 candados validados y cada chequeo una sola vez", r.ok && r.salida.includes("validados|6/6") && r.salida.includes("marcas|3"), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
