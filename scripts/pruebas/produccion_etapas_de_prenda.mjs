#!/usr/bin/env node
/**
 * Pruebas de las tres etapas de una prenda (ADR-0614, actividad 14; ADR-0551, decisión 8 y D) — migración
 * `20261106004000_tres_etapas_de_una_prenda.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que la etapa salga de la orden, el stock y los movimientos; que un modelo sin orden no cambie en nada; que el stock mande
 * sobre la orden; que llegar a una tienda no tenga vuelta; y que Vender, la vitrina y Productos den la misma respuesta.
 *
 * USO: node scripts/pruebas/produccion_etapas_de_prenda.mjs [--contenedor supabase_db_x] [--base otra]
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261106004000_tres_etapas_de_una_prenda.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${como(FELIPE)}
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select id as tienda from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
select id as cat from retail.categorias c where retail.fn_categoria_entra_a_motores(c.id) order by nombre limit 1 \\gset
insert into retail.productos (referencia, categoria_id) values ('Modelo Etapas Prueba', :'cat') returning id as prod \\gset
update retail.productos set estado = 'activo', estado_alta = 'aprobado' where id = :'prod';
select codigo as color from retail.colores order by codigo limit 1 \\gset
select id as talla from retail.tallas order by id limit 1 \\gset
insert into retail.variantes (producto_id, precio, color_codigo, talla_id, activo) values (:'prod', 50, :'color', :'talla', true) returning id as v1 \\gset
insert into retail.vitrina_productos (producto_id, publicado, publicado_en) values (:'prod', true, now())
  on conflict (producto_id) do update set publicado = true, publicado_en = now();
`;

const ORDEN = (estado) =>
  estado === "terminada"
    ? `insert into retail.producciones (ubicacion_id, producto_id, estado, cantidad_plan, cantidad_buenas, inventariado_at) values (:'taller', :'prod', 'terminada', 10, 10, now());`
    : `insert into retail.producciones (ubicacion_id, producto_id, estado, cantidad_plan) values (:'taller', :'prod', '${estado}', 10);`;
const STOCK = (lugar, n) => `insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'v1', :'${lugar}', ${n});`;
const PASO_POR_TIENDA = `insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo) values (:'v1', :'tienda', 'salida', 1, 'venta de prueba');`;
const ETAPA = `coalesce(retail.fn_producto_etapa(:'prod'), 'sin_etapa')`;
/** Las tres pantallas que tienen que responder lo mismo: lo que Vender esconde, si la vitrina lo deja, si Productos lo lista. */
const VENDER = `not exists (select 1 from retail.fn_productos_aun_no_en_tienda() e where e.producto_id = :'prod')`;
const VITRINA = `retail.fn_tienda_modelo_se_ve(:'prod')`;
const PRODUCTOS = `exists (select 1 from retail.fn_productos_listado(p_busqueda => 'Modelo Etapas Prueba') l where l.producto_id = :'prod')`;
const LAS_TRES = `concat_ws('/', ${ETAPA}, ${VENDER}, ${VITRINA}, ${PRODUCTOS})`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  if (obtenido === esperado) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  }
}

caso("E1 un modelo sin orden no cambia en nada: se ve en las tres", `select ${LAS_TRES};`, "sin_etapa/t/t/t");
caso("E2 con la orden abierta y sin stock no se ve en ninguna", `${ORDEN("en_proceso")} select ${LAS_TRES};`, "en_produccion/f/f/f");
caso("E3 con su orden anulada es como si nunca la hubiera tenido", `${ORDEN("anulada")} select ${LAS_TRES};`, "sin_etapa/t/t/t");
caso("E4 terminada, con stock solo en el Taller: aún no se ofrece", `${ORDEN("terminada")} ${STOCK("taller", 10)} select ${LAS_TRES};`, "terminada/f/f/f");
caso("E5 con stock en una tienda se ve en las tres", `${ORDEN("terminada")} ${STOCK("tienda", 5)} select ${LAS_TRES};`, "en_tienda/t/t/t");
caso(
  "E6 el stock manda sobre la orden: en tienda con una orden abierta sigue a la venta (el Chaleco)",
  `${ORDEN("en_proceso")} ${STOCK("tienda", 66)} select ${LAS_TRES};`,
  "en_tienda/t/t/t"
);
caso(
  "E7 vendido hasta cero y con una orden de reposición: no vuelve atrás",
  `${ORDEN("en_proceso")} ${PASO_POR_TIENDA} select ${LAS_TRES};`,
  "en_tienda/t/t/t"
);
caso(
  "E8 la orden de reposición terminada, con stock solo en el Taller: tampoco vuelve atrás",
  `${ORDEN("terminada")} ${STOCK("taller", 10)} ${PASO_POR_TIENDA} select ${LAS_TRES};`,
  "en_tienda/t/t/t"
);
caso("E9 cerrada y sin stock, sin haber llegado a una tienda: no se esconde", `${ORDEN("terminada")} select ${LAS_TRES};`, "sin_etapa/t/t/t");
caso(
  "E10 el traslado al salir del Taller ya cuenta como llegar",
  `${ORDEN("en_proceso")}
   insert into retail.movimientos (variante_id, ubicacion_id, ubicacion_destino_id, tipo, cantidad, motivo) values (:'v1', :'taller', :'tienda', 'traslado', 1, 'prueba');
   select ${ETAPA};`,
  "en_tienda"
);
caso(
  "E11 el filtro que comparten el listado y los conteos de Productos tampoco la cuenta",
  `${ORDEN("en_proceso")}
   select not exists (select 1 from retail.fn_productos_filtro(p_busqueda => 'Modelo Etapas Prueba') f where f.producto_id = :'prod');`,
  "t"
);
caso(
  "E12 la vitrina dice el porqué",
  `${ORDEN("en_proceso")}
   select retail.fn_vitrina_por_que_no(:'prod');`,
  "no_llega_a_tienda"
);
caso(
  "E13 Análisis: en producción no sale en ninguna sede; terminada sale en el Taller",
  `${ORDEN("en_proceso")}
   select position(:'v1' in retail.fn_analisis_sede(:'taller')::text) > 0 as a \\gset
   update retail.producciones set estado = 'terminada', cantidad_buenas = 10, inventariado_at = now() where producto_id = :'prod';
   ${STOCK("taller", 10)}
   select position(:'v1' in retail.fn_analisis_sede(:'taller')::text) > 0 as b \\gset
   select position(:'v1' in retail.fn_analisis_sede(:'tienda')::text) > 0 as c \\gset
   select concat_ws('/', :'a', :'b', :'c');`,
  "f/t/f"
);
caso(
  "E14 la lista que lee la web pide acceso al ERP, y nadie de afuera la llama",
  `select has_function_privilege('anon', 'retail.fn_productos_aun_no_en_tienda()', 'execute'),
          has_function_privilege('authenticated', 'retail.fn_productos_aun_no_en_tienda()', 'execute'),
          has_function_privilege('authenticated', 'retail.fn_productos_por_etapa(uuid[])', 'execute');`,
  "f|t|f"
);
caso(
  "E15 la migración se vuelve a cargar sin error",
  `${MIGRACION}
   select position('no_llega_a_tienda' in pg_get_functiondef('retail.fn_vitrina_por_que_no(uuid)'::regprocedure)) > 0;`,
  "t"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR}, base: ${BASE})`);
process.exit(fallas ? 1 : 0);
