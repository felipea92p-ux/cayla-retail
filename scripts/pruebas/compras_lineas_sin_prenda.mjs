#!/usr/bin/env node
/**
 * Pruebas de «las líneas sin prenda de un comprobante de orden» (ADR-0362, actividad 3 de la fase 2, Felipe 2026-10-12) — migración
 * `20261012210000_compras_lineas_sin_prenda.sql`. CAYLA V2.
 *
 * EL PROBLEMA. Con `20261012205000` una línea de comprobante puede NO tener prenda (`producto_id` y `variante_id` vacíos, con
 * `categoria_id`, `marca_id` y `descripcion`): es la de un comprobante que sale de una orden de compra, y su mercadería llega por guía
 * (fase 4), no por Recibir mercadería. Esta prueba vigila que ninguna lectura ni escritura que suponía una prenda en cada línea deje un
 * estado imposible: un «por recibir» sin nada que recibir, un faltante de una prenda que no existe, un gráfico de costos vacío.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las migraciones se cargan dentro de cada caso —dos veces—, así corre con la base al
 * día o sin ella, y de paso se prueba que se pueden pegar dos veces). El comprobante sin prenda se arma como lo hace la función que lo
 * registra: filas en `compras`, `compra_items` y `compra_item_destinos`, insertadas como postgres.
 *   A  SE RECHAZA: `recibir_compras`, `recibir_envio`, `cerrar_linea_compra` y, por ellas, `recibir_y_cerrar_compras` dicen «Esa línea
 *      todavía no tiene prenda: llega por guía, no por Recibir mercadería» (y las guardas van antes de escribir nada). `recibir_lote` no
 *      toca líneas de comprobante: no cambia.
 *   B  RECIBIR NO LO OFRECE: `lineas_compra_operativo` no devuelve la línea sin prenda; un comprobante hecho solo de ellas no sale en
 *      `listar_compras_operativo` (con tienda ni sin tienda) y uno mixto sale con las cifras de su prenda; recibida la prenda, el mixto
 *      deja de salir «por recibir» aunque su estado de recepción siga «parcial»; `resumen_recepciones` no cuenta lo que Recibir no puede
 *      recibir como faltante.
 *   C  LAS LECTURAS NO SE ROMPEN: la evolución del costo de un proveedor elige su prenda más comprada entre líneas con prenda (con más
 *      comprobantes sin prenda que con ella, antes salía vacía); `fn_origen_producto` y `fn_producto_historia` ignoran la línea sin
 *      prenda; la vista `compra_items_resumen` trae `categoria_id` y `marca_id` y conserva `security_invoker`; `fn_mi_parte_de_compra`
 *      trae la categoría y la marca de la línea.
 *   D  LO DE SIEMPRE SIGUE IGUAL: un comprobante con prenda se lista, se recibe (por `recibir_compras` y por `recibir_envio`), se cierra su
 *      faltante y queda «recibida».
 *   E  LA FORMA: una sola función de cada nombre y `authenticated` las sigue ejecutando.
 *
 * USO (el alias de pnpm lo agrega quien mantiene package.json)
 *   node scripts/pruebas/compras_lineas_sin_prenda.mjs                                → contra la base `postgres` del stack local
 *   node scripts/pruebas/compras_lineas_sin_prenda.mjs --contenedor supabase_db_x     → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/compras_lineas_sin_prenda.mjs --sin-migracion                → sin cargar las migraciones: contra una base sin el
 *                                                                                      cambio, la prueba tiene que FALLAR (así se ve que
 *                                                                                      vigila algo). Una base que YA tiene la migración
 *                                                                                      aplicada la pasa igual, claro.
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
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
// En orden: primero el esquema (la línea puede ir sin prenda), después lo que esta actividad hace con ella.
const MIGRACION = SIN_MIGRACION
  ? ""
  : ["20261012205000_compras_lineas_de_orden.sql", "20261012210000_compras_lineas_sin_prenda.sql"]
      .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8").replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, ""))
      .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const SIN_PRENDA = "Esa línea todavía no tiene prenda: llega por guía, no por Recibir mercadería";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;

const PRELUDIO = `
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
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
grant execute on function pg_temp.intento(text) to authenticated;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as prov2 from retail.proveedores where nombre = 'Confecciones del Sur EIRL' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
select id as cat, nombre as cat_nombre from retail.categorias where activo order by nombre limit 1 \\gset
select id as marca from retail.marcas where nombre = 'CAYLA' \\gset
`;

// Un comprobante armado como lo hace la función que registra el de una orden: filas en `compras`, `compra_items` (una línea por entrada de
// `lineas`, con prenda o sin ella) y `compra_item_destinos` (por defecto todo a Lima, la gestora; `destinos: { lima: 4, tru: 6 }` lo reparte).
// Deja `:v` (el comprobante) y `:v_1`, `:v_2`… (las líneas).
const COMPROBANTE = (v, lineas, { prov = "prov1" } = {}) => {
  const sub = lineas.reduce((a, l) => a + l.cant * l.costo, 0);
  const igv = Math.round(sub * 18) / 100;
  return `
reset role;
set constraints all deferred;
insert into retail.compras (proveedor_id, tipo, serie, numero, condicion, fecha_emision, fecha_vencimiento, subtotal, igv, total, ubicacion_gestion_id, naturaleza)
  values (:'${prov}', 'factura', 'TSP', 'S' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', retail.fn_hoy_lima(), retail.fn_hoy_lima() + 10,
          ${sub.toFixed(2)}, ${igv.toFixed(2)}, ${(sub + igv).toFixed(2)}, :'lima', 'mercaderia') returning id as ${v} \\gset
${lineas
  .map(
    (l, i) => `insert into retail.compra_items (compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario, categoria_id, marca_id)
  values (:'${v}', ${l.prenda ? ":'prod'" : "null"}, ${l.prenda ? ":'var'" : "null"}, ${l.prenda ? "null" : "'lino crudo'"}, ${l.cant}, ${l.costo},
          ${l.prenda ? "null" : ":'cat'"}, ${l.prenda ? "null" : ":'marca'"}) returning id as ${v}_${i + 1} \\gset
insert into retail.compra_item_destinos (compra_item_id, ubicacion_id, cantidad) values ${Object.entries(l.destinos ?? { lima: l.cant })
      .map(([u, c]) => `(:'${v}_${i + 1}', :'${u}', ${c})`)
      .join(", ")};`,
  )
  .join("\n")}
set constraints all immediate;
`;
};
const SOLO_SIN_PRENDA = [{ prenda: false, cant: 10, costo: 20 }]; // 10 u × S/ 20, sin prenda
const MIXTO = [{ prenda: false, cant: 10, costo: 20 }, { prenda: true, cant: 5, costo: 50 }]; // :v_1 sin prenda, :v_2 con prenda

// Un comprobante normal (con prenda) por la función de siempre: 24 u × S/ 50 + 18 % para Lima. Deja `:v` y `:v_item`.
const FACTURA = (v) => `
reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select retail.registrar_compra(:'prov1', 'TST', 'L' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'lima',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 24, 'costo_unitario', 50,
    'destinos', jsonb_build_array(jsonb_build_object('ubicacion_id', :'lima', 'cantidad', 24)))),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as ${v} \\gset
select id as ${v}_item from retail.compra_items where compra_id = :'${v}' \\gset
set constraints all immediate;
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO esos módulos. Se va con el ROLLBACK.
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba lineas sin prenda') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
`;

const ITEM = (linea, cantidad) => `jsonb_build_object('compra_item_id', :'${linea}', 'variante_id', :'var', 'cantidad', ${cantidad})`;
const LISTA = (...xs) => `jsonb_build_array(${xs.join(", ")})`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

// A. SE RECHAZA -------------------------------------------------------------------------------------------------------------
const RECHAZO = `P0001|${SIN_PRENDA}`;
caso(
  "A1 recibir_compras rechaza la línea sin prenda",
  `${COMPROBANTE("sp", SOLO_SIN_PRENDA)}
   ${como(FELIPE)}
   select pg_temp.intento(format('select retail.recibir_compras(%L, %L::jsonb)', :'lima', ${LISTA(ITEM("sp_1", 1))}::text));`,
  RECHAZO
);
caso(
  "A2 recibir_envio la rechaza antes de abrir el envío",
  `${COMPROBANTE("sp", SOLO_SIN_PRENDA)}
   ${como(FELIPE)}
   select pg_temp.intento(format('select retail.recibir_envio(%L, %L::jsonb)', :'lima', ${LISTA(ITEM("sp_1", 1))}::text));`,
  RECHAZO
);
caso(
  "A3 cerrar_linea_compra no cierra como faltante una prenda que no existe",
  `${COMPROBANTE("sp", SOLO_SIN_PRENDA)}
   ${como(FELIPE)}
   select pg_temp.intento(format('select retail.cerrar_linea_compra(%L, 1, %L)', :'sp_1', 'no_llego'));`,
  RECHAZO
);
caso(
  "A4 recibir_y_cerrar_compras queda cubierta, al recibir y al cerrar",
  `${COMPROBANTE("sp", SOLO_SIN_PRENDA)}
   ${como(FELIPE)}
   select pg_temp.intento(format('select retail.recibir_y_cerrar_compras(%L, %L::jsonb)', :'lima', ${LISTA(ITEM("sp_1", 1))}::text)) || ' / ' ||
          pg_temp.intento(format('select retail.recibir_y_cerrar_compras(%L, %L::jsonb, %L::jsonb)', :'lima', '[]',
            jsonb_build_array(jsonb_build_object('compra_item_id', :'sp_1', 'cantidad', 1, 'motivo', 'no_llego'))::text));`,
  `${RECHAZO} / ${RECHAZO}`
);
caso(
  "A5 en un comprobante mixto se rechaza solo la línea sin prenda: la de la prenda se recibe",
  `${COMPROBANTE("mx", MIXTO)}
   ${como(FELIPE)}
   select pg_temp.intento(format('select retail.recibir_envio(%L, %L::jsonb)', :'lima', ${LISTA(ITEM("mx_1", 1), ITEM("mx_2", 1))}::text)) as malo \\gset
   select :'malo' || ' / ' || pg_temp.intento(format('select retail.recibir_envio(%L, %L::jsonb)', :'lima', ${LISTA(ITEM("mx_2", 2))}::text)) as dos \\gset
   reset role;
   select :'dos' || ' / ' || (select coalesce(sum(m.cantidad), 0) from retail.movimientos m where m.compra_item_id = :'mx_2');`,
  `${RECHAZO} / SIN_ERROR / 2`
);
caso(
  "A6 las guardas van antes de escribir nada (el lote, el envío, el candado de la línea)",
  `select string_agg(ok::text, ',') from (
     select position(${`'${SIN_PRENDA}'`} in pg_get_functiondef('retail.recibir_compras(uuid,jsonb,text,text)'::regprocedure))
              between 1 and position('insert into lotes' in pg_get_functiondef('retail.recibir_compras(uuid,jsonb,text,text)'::regprocedure)) - 1 as ok
     union all
     select position(${`'${SIN_PRENDA}'`} in pg_get_functiondef('retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)'::regprocedure))
              between 1 and position('insert into envios' in pg_get_functiondef('retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)'::regprocedure)) - 1
     union all
     select position(${`'${SIN_PRENDA}'`} in pg_get_functiondef('retail.cerrar_linea_compra(uuid,integer,text,text,uuid)'::regprocedure))
              between 1 and position('for update' in pg_get_functiondef('retail.cerrar_linea_compra(uuid,integer,text,text,uuid)'::regprocedure)) - 1
   ) x;`,
  "true,true,true"
);
caso(
  "A7 recibir_lote no toca líneas de comprobante (recibe prendas por su variante): no cambia",
  `select position('compra_item' in pg_get_functiondef('retail.recibir_lote(uuid,uuid,jsonb,text,text,uuid)'::regprocedure)) = 0;`,
  "t"
);

// B. RECIBIR NO LO OFRECE ----------------------------------------------------------------------------------------------------
const OFRECE = (c) => `(select count(*) from retail.lineas_compra_operativo(array[:'${c}']::uuid[], :'lima')) || ',' ||
  (select count(*) from retail.listar_compras_operativo(p_por_recibir => true, p_ubicacion_id => :'lima') where id = :'${c}') || ',' ||
  (select count(*) from retail.listar_compras_operativo(p_por_recibir => true) where id = :'${c}')`;
caso(
  "B1 un comprobante hecho solo de líneas sin prenda no ofrece líneas ni sale «por recibir» (de una tienda ni sin tienda)",
  `${COMPROBANTE("sp", SOLO_SIN_PRENDA)}
   ${como(FELIPE)}
   select ${OFRECE("sp")};`,
  "0,0,0"
);
caso(
  "B2 un comprobante mixto ofrece solo la línea con prenda, con las cifras de su prenda (5), no las de toda la factura (15)",
  `${COMPROBANTE("mx", MIXTO)}
   ${como(FELIPE)}
   select (select string_agg((id = :'mx_2')::text || '/' || pendiente_aqui, ',') from retail.lineas_compra_operativo(array[:'mx']::uuid[], :'lima')) || ',' ||
          (select asignado_aqui || '/' || pendiente_aqui from retail.listar_compras_operativo(p_por_recibir => true, p_ubicacion_id => :'lima') where id = :'mx') || ',' ||
          (select count(*) from retail.listar_compras_operativo(p_por_recibir => true) where id = :'mx');`,
  "true/5,5/5,1"
);
caso(
  "B3 recibida la prenda del mixto, deja de salir «por recibir» aunque su estado de recepción siga «parcial» (lo que falta es sin prenda)",
  `${COMPROBANTE("mx", MIXTO)}
   ${como(FELIPE)}
   select retail.recibir_compras(:'lima', ${LISTA(ITEM("mx_2", 5))}) is not null as recibido \\gset
   select (select estado_recepcion from retail.compras where id = :'mx') || ',' ||
          (select count(*) from retail.listar_compras_operativo(p_por_recibir => true, p_ubicacion_id => :'lima') where id = :'mx') || ',' ||
          (select count(*) from retail.listar_compras_operativo(p_por_recibir => true) where id = :'mx');`,
  "parcial,0,0"
);
caso(
  "B4 el faltante de Recibir (resumen_recepciones) cuenta lo de la prenda (3), no lo que llega por guía (10)",
  `${como(FELIPE)}
   select faltante_unidades as f0 from retail.resumen_recepciones() \\gset
   ${COMPROBANTE("mx", MIXTO)}
   ${como(FELIPE)}
   select retail.recibir_compras(:'lima', ${LISTA(ITEM("mx_2", 2))}) is not null as recibido \\gset
   select faltante_unidades - :f0 from retail.resumen_recepciones();`,
  "3"
);

caso(
  "B5 una colaboradora de Trujillo (solo con Recibir) ve de un comprobante mixto la línea con prenda y sus cifras (5), no la que llega por guía (6 más)",
  `${COMPROBANTE("mx", [{ prenda: false, cant: 10, costo: 20, destinos: { lima: 4, tru: 6 } }, { prenda: true, cant: 5, costo: 50, destinos: { tru: 5 } }])}
   ${rolDeMicaela("recibir")}
   ${como(MICAELA)}
   select (select string_agg((id = :'mx_2')::text, ',') from retail.lineas_compra_operativo(array[:'mx']::uuid[])) || ',' ||
          (select asignado_aqui || '/' || pendiente_aqui from retail.listar_compras_operativo(p_por_recibir => true) where id = :'mx');`,
  "true,5/5"
);

// C. LAS LECTURAS NO SE ROMPEN -----------------------------------------------------------------------------------------------
caso(
  "C1 la evolución del costo de un proveedor no se queda vacía porque tenga más comprobantes sin prenda (3) que con ella (2)",
  `${FACTURA("normal")}
   ${COMPROBANTE("sp1", SOLO_SIN_PRENDA)}
   ${COMPROBANTE("sp2", SOLO_SIN_PRENDA)}
   ${COMPROBANTE("sp3", SOLO_SIN_PRENDA)}
   ${como(FELIPE)}
   select count(*) > 0 and count(*) = count(*) filter (where producto_id is not null) from retail.fn_proveedor_costo_evolucion(:'prov1', 6);`,
  "t"
);
caso(
  "C2 fn_origen_producto y fn_producto_historia ignoran la línea sin prenda (la cuenta de «líneas de compra» de la prenda no cambia)",
  // Con `coalesce`: en una base recién sembrada (la del CI) la prenda no tiene origen todavía, y un NULL deja la variable de psql sin
  // definir (\\gset no la crea) y la comparación de abajo sería un error de sintaxis en vez de una respuesta.
  `reset role;
   select coalesce((select tipo || '/' || origen_id from retail.fn_origen_producto(:'prod', retail.fn_hoy_lima())), 'sin origen') as origen0,
          coalesce((select n from retail.fn_producto_historia(:'prod') where concepto = 'líneas de compra'), 0) as lineas0 \\gset
   ${COMPROBANTE("sp", SOLO_SIN_PRENDA, { prov: "prov2" })}
   select (coalesce((select tipo || '/' || origen_id from retail.fn_origen_producto(:'prod', retail.fn_hoy_lima())), 'sin origen') = :'origen0') || ',' ||
          (coalesce((select n from retail.fn_producto_historia(:'prod') where concepto = 'líneas de compra'), 0) = :'lineas0'::bigint);`,
  "true,true"
);
caso(
  "C3 la vista de líneas trae categoria_id y marca_id (vacías con prenda) y sigue respetando quién puede leer (security_invoker)",
  `${COMPROBANTE("mx", MIXTO)}
   ${como(FELIPE)}
   select (select count(*) from retail.compra_items_resumen where id = :'mx_1' and producto_id is null and categoria_id = :'cat' and marca_id = :'marca') || ',' ||
          (select count(*) from retail.compra_items_resumen where id = :'mx_2' and producto_id is not null and categoria_id is null and marca_id is null) || ',' ||
          (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'retail.compra_items_resumen'::regclass) as ok \\gset
   ${rolDeMicaela("recibir")}
   ${como(MICAELA)}
   select :'ok' || ',' || (select count(*) from retail.compra_items_resumen where compra_id = :'mx');`,
  "1,1,true,0"
);
caso(
  "C4 «mi parte» de un comprobante trae la categoría y la marca de la línea sin prenda (y la referencia vacía)",
  `${COMPROBANTE("mx", MIXTO)}
   ${como(FELIPE)}
   with x as (select retail.fn_mi_parte_de_compra(:'mx') as r),
        lineas as (select jsonb_array_elements(x.r -> 'lineas') as linea from x)
   select string_agg((linea ->> 'categoria' is not distinct from :'cat_nombre')::text || '/' || (linea ->> 'marca' is not distinct from 'CAYLA')::text || '/' || (linea ->> 'referencia' is null)::text,
                     ',' order by linea ->> 'referencia' nulls first) from lineas;`,
  "true/true/true,false/false/false"
);
caso(
  "C5 un comprobante sin prenda sigue siendo un comprobante: se ve en la lista de Compras y su deuda es la de siempre",
  `${COMPROBANTE("sp", SOLO_SIN_PRENDA)}
   ${como(FELIPE)}
   select (select count(*) from retail.listar_compras(p_por_recibir => true) where id = :'sp') || ',' ||
          (select estado_recepcion || '/' || facturado_cantidad || '/' || saldo from retail.compras_resumen where id = :'sp');`,
  "1,sin_recibir/10/236.00"
);

// D. LO DE SIEMPRE SIGUE IGUAL -----------------------------------------------------------------------------------------------
caso(
  "D1 un comprobante con prenda se lista, se recibe, se cierra su faltante y queda «recibida»",
  `${FACTURA("normal")}
   ${como(FELIPE)}
   select ${OFRECE("normal")} as ofrece \\gset
   select pendiente_aqui as pendiente0 from retail.lineas_compra_operativo(array[:'normal']::uuid[], :'lima') \\gset
   select retail.recibir_compras(:'lima', ${LISTA(ITEM("normal_item", 10))}) is not null as recibio \\gset
   select retail.cerrar_linea_compra(:'normal_item', 14, 'no_llego') is not null as cerro \\gset
   select :'ofrece' || ',' || :'pendiente0' || ',' || :'recibio' || ',' || :'cerro' || ',' || (select estado_recepcion from retail.compras where id = :'normal') || ',' ||
          (select count(*) from retail.listar_compras_operativo(p_por_recibir => true, p_ubicacion_id => :'lima') where id = :'normal');`,
  "1,1,1,24,t,t,recibida,0"
);
caso(
  "D2 recibir_envio recibe una línea con prenda como siempre",
  `${FACTURA("normal")}
   ${como(FELIPE)}
   select retail.recibir_envio(:'lima', ${LISTA(ITEM("normal_item", 5))}) ->> 'ya_registrado';`,
  "false"
);

// E. LA FORMA -----------------------------------------------------------------------------------------------------------------
caso(
  "E1 una sola función de cada nombre, y authenticated las sigue ejecutando",
  `select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute'), ',' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname in ('recibir_compras', 'recibir_envio', 'recibir_lote', 'cerrar_linea_compra', 'recibir_y_cerrar_compras',
      'lineas_compra_operativo', 'listar_compras_operativo', 'resumen_recepciones', 'fn_proveedor_costo_evolucion', 'fn_mi_parte_de_compra');`,
  "cerrar_linea_compra:true,fn_mi_parte_de_compra:true,fn_proveedor_costo_evolucion:true,lineas_compra_operativo:true,listar_compras_operativo:true,recibir_compras:true,recibir_envio:true,recibir_lote:true,recibir_y_cerrar_compras:true,resumen_recepciones:true"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
