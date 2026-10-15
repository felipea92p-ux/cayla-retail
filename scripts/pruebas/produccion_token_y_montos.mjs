#!/usr/bin/env node
/**
 * Prueba de `20261014214000_produccion_montos_finitos_parte1.sql` y `20261014215000_produccion_token_sigue_al_contenido_parte2.sql`
 * (/chaos de Producción 2026-10-14, ADR-0409).
 *
 * EL PROBLEMA QUE PRUEBA. En seis funciones de Producción el mismo token con OTRO contenido devolvía lo del primer envío (una orden de
 * 6 reintentada como 8 quedaba en 6 y la pantalla anunciaba 8); un `NaN` entraba al costo de una orden, a un lote de insumo y a las
 * líneas de una factura (en Postgres `NaN` pasa todo `<= 0`); y una factura de insumos aceptaba un IGV de 1000 %. Aquí cada caso se
 * rechaza con su `hint` o su candado, lo válido pasa igual (el reintento con lo mismo devuelve lo mismo, sin token todo sigue) y hay
 * control: sin las migraciones, los ataques pasaban.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK.
 *
 * USO: pnpm pruebas:produccion-token-y-montos   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIG_MONTOS = readFileSync(join(RAIZ, "supabase/migrations/20261014214000_produccion_montos_finitos_parte1.sql"), "utf8");
const MIG_TOKEN = readFileSync(join(RAIZ, "supabase/migrations/20261014215000_produccion_token_sigue_al_contenido_parte2.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

/** Los bloques que inserta la parte 2: para deshacerlos en los controles («sin la migración»). */
const BLOQUES = [...MIG_TOKEN.matchAll(/select pg_temp\.insertar_antes\(\s*'(retail\.[^']+)',\s*\$v\$([\s\S]*?)\$v\$, \d+,\s*\$v\$([\s\S]*?)\$v\$,/g)].map((m) => ({ firma: m[1], bloque: m[3] }));
const DEL_TOKEN = BLOQUES.filter((b) => b.bloque.includes("fn_intento_con_huella("));
const DEL_IGV = BLOQUES.filter((b) => b.bloque.includes("igv_fuera_de_rango"));
if (DEL_TOKEN.length !== 6) throw new Error(`esperaba 6 candados de token y encontré ${DEL_TOKEN.length}`);
if (DEL_IGV.length !== 1) throw new Error(`esperaba 1 candado de IGV y encontré ${DEL_IGV.length}`);
const deshacer = (lista) => lista.map((b) => `do $d$ begin execute replace(pg_get_functiondef('${b.firma}'::regprocedure), $n$${b.bloque}$n$, ''); end $d$;`).join("\n");

// Los candados de la parte 1: el control los quita (dentro de la misma transacción) para mostrar que sin ellos el NaN entraba.
const CANDADOS = [...MIG_MONTOS.matchAll(/select pg_temp\.candado\('([a-z_]+)', '([a-z_]+)'/g)].map((m) => ({ tabla: m[1], nombre: m[2] }));
if (CANDADOS.length !== 10) throw new Error(`esperaba 10 candados de montos y encontré ${CANDADOS.length}`);
const sinCandados = CANDADOS.map((c) => `alter table retail.${c.tabla} drop constraint if exists ${c.nombre};`).join("\n");

// Todo sale del seed por su nombre o su código (los ids cambian en cada base: en el CI no son los de tu máquina). El insumo y el
// proveedor del Taller los crea la propia prueba, dentro de la transacción.
function preparar({ sinToken = false, sinIgv = false, sinMontos = false } = {}) {
  return `
begin;
${MIG_MONTOS}
${MIG_TOKEN}
${sinToken ? deshacer(DEL_TOKEN) : ""}
${sinIgv ? deshacer(DEL_IGV) : ""}
${sinMontos ? sinCandados : ""}
set local request.jwt.claim.sub = '${FELIPE}';
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as negs, producto_id as emma from retail.variantes where sku = 'BLU-EMMA-NEG-S' \\gset
select id as beis from retail.variantes where sku = 'BLU-EMMA-BEI-S' \\gset
select ct.categoria_id as cat, ct.talla_id as talla from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo
  join retail.categorias c on c.id = ct.categoria_id and c.activo order by c.nombre, t.id limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('T-PRUEBA-TOK', 'Tela de prueba', 'tela', 'metro') returning id as ins \\gset
select retail.guardar_proveedor_produccion(null, 'Textiles de Prueba SAC', 'tela') as prov \\gset
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
const rechaza = (r, hint) => !r.ok && r.error.includes(hint);

/** El mismo token dos veces: `uno` y `dos` son expresiones SQL que reciben el token. */
function mismoToken(uno, dos, { antes = "", sin = false } = {}) {
  const t = "c0ffee00-0000-4000-8000-000000014901";
  return correr(`${preparar({ sinToken: sin })}${antes}
select 'uno|' || (${uno(t)})::text;
select 'dos|' || (${dos(t)})::text;`);
}
const iguales = (r) => {
  const a = r.salida.match(/^uno\|(.*)$/m)?.[1];
  const b = r.salida.match(/^dos\|(.*)$/m)?.[1];
  return a !== undefined && a === b;
};

const lineas = (neg, bei) => `jsonb_build_array(jsonb_build_object('variante_id', :'negs', 'cantidad', ${neg}), jsonb_build_object('variante_id', :'beis', 'cantidad', ${bei}))`;
const celda = (n) => `jsonb_build_array(jsonb_build_object('talla_id', :'talla', 'color_codigo', :'color', 'cantidad', ${n}))`;
const items = (n, costo = "22") => `jsonb_build_array(jsonb_build_object('insumo_id', :'ins', 'cantidad', ${n}, 'costo_unitario', ${costo}))`;
// Una factura al crédito ya registrada (sin token): la base de los casos de pago y de recepción.
const FACTURA = `select retail.registrar_comprobante_produccion(:'prov', 'F901', '1', 'credito', ${items(50)}, p_fecha_vencimiento => current_date + 30) as cid \\gset
select id as lin from retail.comprobantes_produccion_items where comprobante_id = :'cid' \\gset
`;

const CASOS = [
  {
    nombre: "abrir_produccion: 6+4 y luego 8+4",
    uno: (t) => `retail.abrir_produccion(:'taller', :'emma', ${lineas(6, 4)}, p_costo_maquila => 100, p_token => '${t}')`,
    dos: (t) => `retail.abrir_produccion(:'taller', :'emma', ${lineas(8, 4)}, p_costo_maquila => 100, p_token => '${t}')`,
  },
  {
    nombre: "abrir_produccion_con_modelo_nuevo: el modelo Uno (6) y luego el Dos (8)",
    uno: (t) => `retail.abrir_produccion_con_modelo_nuevo(:'taller', 'Modelo Prueba Uno', :'cat', ${celda(6)}, p_precio => 59.9, p_token => '${t}')`,
    dos: (t) => `retail.abrir_produccion_con_modelo_nuevo(:'taller', 'Modelo Prueba Dos', :'cat', ${celda(8)}, p_precio => 59.9, p_token => '${t}')`,
  },
  {
    nombre: "recibir_insumo: 10 m y luego 20 m",
    uno: (t) => `retail.recibir_insumo(:'ins', :'taller', 10, 200, 'L1', null, null, 'compra', null, '${t}')`,
    dos: (t) => `retail.recibir_insumo(:'ins', :'taller', 20, 400, 'L1', null, null, 'compra', null, '${t}')`,
  },
  {
    nombre: "registrar_comprobante_produccion: la F901-111 (50) y luego la F901-112 (80)",
    uno: (t) => `retail.registrar_comprobante_produccion(:'prov', 'F901', '111', 'credito', ${items(50)}, p_fecha_vencimiento => current_date + 30, p_token => '${t}')`,
    dos: (t) => `retail.registrar_comprobante_produccion(:'prov', 'F901', '112', 'credito', ${items(80)}, p_fecha_vencimiento => current_date + 30, p_token => '${t}')`,
  },
  {
    nombre: "registrar_pago_comprobante_produccion: S/ 100 y luego S/ 300",
    antes: FACTURA,
    uno: (t) => `retail.registrar_pago_comprobante_produccion(:'cid', '[{"monto":100,"metodo":"transferencia"}]'::jsonb, null, '${t}')`,
    dos: (t) => `retail.registrar_pago_comprobante_produccion(:'cid', '[{"monto":300,"metodo":"transferencia"}]'::jsonb, null, '${t}')`,
  },
  {
    nombre: "recibir_comprobante_produccion: 10 y luego 30",
    antes: FACTURA,
    uno: (t) => `retail.recibir_comprobante_produccion(:'cid', :'taller', jsonb_build_array(jsonb_build_object('item_id', :'lin', 'cantidad', 10)), '[]'::jsonb, null, '${t}')`,
    dos: (t) => `retail.recibir_comprobante_produccion(:'cid', :'taller', jsonb_build_array(jsonb_build_object('item_id', :'lin', 'cantidad', 30)), '[]'::jsonb, null, '${t}')`,
  },
];

// --- El token: controles (sin la migración devolvía lo del primero) y el rechazo con ella ---
for (const c of CASOS) {
  const sin = mismoToken(c.uno, c.dos, { antes: c.antes, sin: true });
  esperar(`CONTROL ${c.nombre}: sin la migración, el segundo devolvía lo del primero`, sin.ok && iguales(sin), sin.salida || sin.error);
  esperar(`${c.nombre}: el segundo se rechaza (token_reusado)`, rechaza(mismoToken(c.uno, c.dos, { antes: c.antes }), "token_reusado"), "pasó");
  const repetido = mismoToken(c.uno, c.uno, { antes: c.antes });
  esperar(`${c.nombre}: el reintento con LO MISMO devuelve lo mismo`, repetido.ok && iguales(repetido), repetido.salida || repetido.error);
}
{
  // Confirmar que el modelo es distinto no cambia la orden: el reintento con `p_confirmo_distinto` no es otro contenido.
  const uno = (t) => `retail.abrir_produccion_con_modelo_nuevo(:'taller', 'Modelo Prueba Uno', :'cat', ${celda(6)}, p_precio => 59.9, p_token => '${t}')`;
  const dos = (t) => `retail.abrir_produccion_con_modelo_nuevo(:'taller', 'Modelo Prueba Uno', :'cat', ${celda(6)}, p_precio => 59.9, p_confirmo_distinto => true, p_token => '${t}')`;
  const r = mismoToken(uno, dos);
  esperar("abrir_produccion_con_modelo_nuevo: el reintento que solo confirma «es distinto» devuelve la misma orden", r.ok && iguales(r), r.salida || r.error);
}
{
  const r = correr(`${preparar()}
select 'a|' || retail.abrir_produccion(:'taller', :'emma', ${lineas(6, 4)}, p_costo_maquila => 100);
select 'b|' || retail.abrir_produccion(:'taller', :'emma', ${lineas(6, 4)}, p_costo_maquila => 100);
select 'ordenes|' || count(*) from retail.producciones where producto_id = :'emma' and created_at >= now();`);
  esperar("sin token todo sigue igual: dos órdenes iguales son dos órdenes", r.ok && r.salida.includes("ordenes|2"), r.salida || r.error);
}

// --- El IGV de una factura de insumos ---
const factura = (igv) => `select retail.registrar_comprobante_produccion(:'prov', 'F902', '1', 'credito', ${items(50)}, p_fecha_vencimiento => current_date + 30, p_igv_porcentaje => ${igv});`;
{
  const sin = correr(`${preparar({ sinIgv: true })}${factura(1000)}`);
  esperar("CONTROL sin la migración: una factura con IGV de 1000 % se guardaba", sin.ok, sin.error);
}
esperar("una factura con IGV de 1000 % se rechaza (igv_fuera_de_rango)", rechaza(correr(`${preparar()}${factura(1000)}`), "igv_fuera_de_rango"), "pasó");
esperar("una factura con IGV NaN se rechaza (igv_fuera_de_rango)", rechaza(correr(`${preparar()}${factura("'NaN'")}`), "igv_fuera_de_rango"), "pasó");
esperar("una factura con IGV negativo se rechaza (igv_fuera_de_rango)", rechaza(correr(`${preparar()}${factura(-5)}`), "igv_fuera_de_rango"), "pasó");
for (const igv of [18, 0]) {
  const r = correr(`${preparar()}${factura(igv)}`);
  esperar(`una factura con IGV de ${igv} % se guarda`, r.ok, r.error);
}
{
  const r = correr(`${preparar()}select retail.registrar_comprobante_produccion(:'prov', 'F902', '2', 'credito', ${items(50)}, p_fecha_vencimiento => current_date + 30) as c \\gset
select 'igv|' || igv from retail.comprobantes_produccion where id = :'c';`);
  esperar("la pantalla (sin porcentaje) sigue con el 18 % de la base: 50 × S/ 22 lleva S/ 198 de IGV", r.ok && r.salida.includes("igv|198.00"), r.salida || r.error);
}

// --- NaN en los montos: rechazado por el candado de su tabla, con control ---
const ATAQUES_NAN = [
  ["una orden con el costo de la tela en NaN", `select retail.abrir_produccion(:'taller', :'emma', ${lineas(6, 4)}, p_costo_tela => 'NaN', p_costo_maquila => 100);`, "producciones_montos_finitos"],
  ["un lote de insumo con el costo en NaN", `select retail.recibir_insumo(:'ins', :'taller', 10, 'NaN', 'L1', null, null, 'compra', null, null);`, "insumo_lotes_montos_finitos"],
  ["una factura de insumos con el costo de una línea en NaN", `select retail.registrar_comprobante_produccion(:'prov', 'F903', '1', 'credito', ${items(50, "'NaN'")}, p_fecha_vencimiento => current_date + 30);`, "_montos_finitos"],
  ["una cotización de maquila en NaN", `insert into retail.cotizaciones_maquila (categoria_id, precio_maquila, fecha_cotizacion, vigente_hasta, proveedor_referencia) values (:'cat', 'NaN', current_date, current_date + 30, 'prueba');`, "cotizaciones_maquila_montos_finitos"],
  ["un insumo con el stock mínimo en NaN", `update retail.insumos set stock_minimo = 'NaN' where id = :'ins';`, "insumos_montos_finitos"],
];
for (const [nombre, sql, candado] of ATAQUES_NAN) {
  const sin = correr(`${preparar({ sinMontos: true })}${sql}`);
  esperar(`CONTROL sin la migración: ${nombre} entraba`, sin.ok, sin.error);
  esperar(`${nombre} se rechaza (${candado})`, rechaza(correr(`${preparar()}${sql}`), candado), "pasó");
}
{
  const r = correr(`${preparar()}select retail.recibir_insumo(:'ins', :'taller', 10, 200, 'L1', null, null, 'compra', null, null);
select retail.abrir_produccion(:'taller', :'emma', ${lineas(6, 4)}, p_costo_tela => 120.5, p_costo_avios => 30, p_costo_maquila => 100);
select 'ok|montos';`);
  esperar("lo válido entra igual: un lote y una orden con sus costos normales", r.ok && r.salida.includes("ok|montos"), r.error);
}

// --- Las dos partes se pueden pegar dos veces ---
{
  const r = correr(`begin;\n${MIG_MONTOS}\n${MIG_MONTOS}\n${MIG_TOKEN}\n${MIG_TOKEN}
select 'llamadas|' || sum((length(d) - length(replace(d, 'fn_intento_con_huella(', ''))) / length('fn_intento_con_huella('))
  from (select pg_get_functiondef(oid) d from pg_proc where pronamespace = 'retail'::regnamespace
         and proname in ('abrir_produccion','abrir_produccion_con_modelo_nuevo','recibir_insumo','registrar_comprobante_produccion',
                         'registrar_pago_comprobante_produccion','recibir_comprobante_produccion')) x;
select 'igv|' || (length(d) - length(replace(d, 'igv_fuera_de_rango', ''))) / length('igv_fuera_de_rango')
  from (select pg_get_functiondef('retail.registrar_comprobante_produccion(uuid, text, text, text, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid)'::regprocedure) d) x;
select 'validados|' || count(*) filter (where convalidated) || '/' || count(*) from pg_constraint
 where conname in (${CANDADOS.map((c) => `'${c.nombre}'`).join(", ")});`);
  esperar("las dos partes se pueden pegar dos veces: cada llamada una sola vez y los 10 candados validados",
    r.ok && r.salida.includes("llamadas|6") && r.salida.includes("igv|2") && r.salida.includes("validados|10/10"), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
