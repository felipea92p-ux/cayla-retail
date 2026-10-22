#!/usr/bin/env node
/**
 * Pruebas del precio de venta SUGERIDO en la línea de una orden de compra (ADR-0362, decisión 21; diseño
 * `docs/pantallas/compras-ordenes-precio-y-stock.md` §4.7, actividad 2) — migración
 * `20261022080000_orden_compra_precio_sugerido.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que el sugerido que piensa la compradora al armar la orden NO se pierda ni se invente por el camino: que se guarde con sus
 * motivos, que las reglas sean las mismas al crear y al editar, que una edición que solo cambia el sugerido SÍ cuente como cambio (la
 * huella lo mira), que el comprobante lo herede sin pisar lo que el papel traiga, y que quien recibe lo vea aunque no haya papel. Y que
 * nada fije un precio por sí solo: es una propuesta.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga dentro de cada caso, así corre igual con la base al día).
 *   S  EL ESQUEMA: las dos columnas nacen nulas; el tope (0 a S/ 5 000, sin NaN ni infinitos) y los motivos (solo con sugerido, de 1 a 8)
 *      los hace cumplir la base aunque alguien escriba directo; recargar la migración no duplica nada.
 *   V  VALIDAR (crear): guarda el sugerido y los motivos recortados; sin sugerido queda nulo; cada regla rechaza con su hint
 *      (`orden_compra_sugerido` / `orden_compra_sugerido_motivos`) y SIN gastar número; el 0 solo en una categoría que admite precio cero.
 *   H  HUELLA Y EDITAR: el mismo pedido repetido devuelve la misma orden; otro sugerido (o otros motivos) con el mismo `p_id` avisa
 *      `orden_compra_ya_guardada`; editar SOLO el sugerido sube la versión, archiva el anterior y anota en Actividad SIN el monto;
 *      el mismo sugerido otra vez no cambia nada; quitarlo borra también los motivos; editar valida igual que crear.
 *   C  COMPROBANTE: una línea del papel que sale de una línea pedida hereda el sugerido de la orden; el que traiga el papel manda; lo que
 *      no sale de la orden no hereda nada; una orden sin sugerido no inventa uno.
 *   R  RECEPCIÓN (`fn_envio_detalle`): sin papel, quien recibe ve el sugerido de la orden; con papel, el del papel; sin ninguno, nada.
 *   P  PIEZAS INTERNAS: ni `authenticated` ni `anon` ejecutan las dos piezas nuevas.
 *
 * USO
 *   pnpm pruebas:orden-compra-sugerido                         → contra la base `postgres` del stack local
 *   pnpm pruebas:orden-compra-sugerido --contenedor supabase_db_x → contra otro stack (un banco de pruebas propio)
 *   --migracion <ruta>  carga OTRA versión de la migración (así se prueba la prueba: un mutante de la migración debe hacerla fallar)
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
const MIGRACION = readFileSync(arg("--migracion", join(RAIZ, "supabase", "migrations", "20261022080000_orden_compra_precio_sugerido.sql")), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "");
const si = (cond, a, b) => `case when ${cond} then '${a}' else '${b}' end`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${sinCandadosDePegado(MIGRACION)}
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

create function pg_temp.crea(p_id uuid, p_prov uuid, p_dest uuid, p_ent date, p_nota text, p_lineas jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_num integer;
begin
  for v_num in select r.numero from retail.crear_orden_compra(p_id, p_prov, p_dest, p_ent, p_nota, p_lineas) r loop
    return 'OK:' || v_num;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;

create function pg_temp.edita(p_id uuid, p_version integer, p_prov uuid, p_dest uuid, p_ent date, p_nota text, p_lineas jsonb) returns text
language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.numero, r.version from retail.editar_orden_compra(p_id, p_version, p_prov, p_dest, p_ent, p_nota, p_lineas) r loop
    return 'OK:' || v_fila.numero || ':' || v_fila.version;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;

-- Cada llamada devuelve su respuesta o «<sqlstate>|<mensaje>».
create function pg_temp.registra(p_orden uuid, p_lineas jsonb) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  return retail.registrar_comprobante_orden(p_orden, 'boleta', 'B009', (random() * 1000000)::int::text, p_lineas, null, 'credito',
    retail.fn_hoy_lima() + 30, true, null, null, null, null)::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
create function pg_temp.envia(p_sede uuid, p_lineas jsonb) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  return retail.crear_envio(p_sede, p_lineas, null, null, null)::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;

-- Datos propios de la prueba: un proveedor, una marca, una categoría de ropa y una de papelería (la que se pone fuera de los motores).
insert into retail.proveedores (nombre) values ('Proveedor Sugerido OC Prueba') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Sugerido OC') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Polos Sugerido OC', 'indumentaria') returning id as cat \\gset
insert into retail.categorias (nombre, familia) values ('Bolsas Sugerido OC', 'papeleria') returning id as cat_bolsa \\gset
update retail.familias set entra_a_motores = false where codigo = 'papeleria';
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
${como(FELIPE)}
`;

// Una línea para \`p_lineas\`, con los números como TEXTO, igual que los manda la pantalla (los motivos, como arreglo).
const linea = (o) =>
  JSON.stringify({ categoria_id: ":CAT", marca_id: ":MARCA", cantidad: "10", precio_unitario: "25.00", ...o })
    .replace('":CAT"', `"' || :'cat' || '"`)
    .replace('":MARCA"', `"' || :'marca' || '"`);
const lineas = (...ls) => `('[' || ${ls.map((l) => `'${linea(l)}'`).join(" || ',' || ")} || ']')::jsonb`;
const args = ({ id = "gen_random_uuid()", destino = ":'tru'", ls = lineas({}) } = {}) => `${id}, :'prov', ${destino}, null::date, null::text, ${ls}`;
const crea = (o) => `pg_temp.crea(${args(o)})`;
const SUG = { precio_venta_sugerido: "59.90", sugerido_motivos: ["Rotar rápido", "Gancho: traer gente"] };
const parte = (expr, n) => `split_part(${expr}, '|', ${n})`;

// Una orden con sugerido, ya creada: \`pid\` es su id, \`oc\` es lo mismo para las consultas de abajo.
const ORDEN_CON_SUGERIDO = `
select gen_random_uuid() as pid \\gset
select ${crea({ id: ":'pid'", ls: lineas(SUG, { cantidad: "4", precio_unitario: "100" }) })} as creada \\gset
select version as v from retail.ordenes_compra where id = :'pid' \\gset
select id as l1 from retail.orden_compra_items where orden_compra_id = :'pid' and posicion = 1 \\gset
select id as l2 from retail.orden_compra_items where orden_compra_id = :'pid' and posicion = 2 \\gset
`;
const edita = (o = {}) => `pg_temp.edita(:'pid', ${o.version ?? ":'v'"}, :'prov', :'tru', null::date, null::text, ${o.ls ?? lineas(SUG, { cantidad: "4", precio_unitario: "100" })})`;
const enActividad = (accion) => `(select count(*) from retail.actividad a where a.tabla = 'ordenes_compra' and a.registro_id = :'pid' and a.accion = '${accion}')`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nset constraints all immediate;\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").filter(Boolean).at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// S. ESQUEMA --------------------------------------------------------------------------------------------------------------
caso(
  "S1 las dos columnas existen y nacen nulas (una línea escrita sin ellas queda «sin sugerir»)",
  `select ${crea({ ls: lineas({}) })} as r \\gset
   select concat_ws(',', (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'orden_compra_items'
                           and column_name in ('precio_venta_sugerido', 'sugerido_motivos')),
     (select string_agg(coalesce(precio_venta_sugerido::text, 'nulo') || '/' || coalesce(sugerido_motivos::text, 'nulo'), ' ')
        from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id and o.proveedor_id = :'prov'));`,
  "2,nulo/nulo",
);
caso(
  "S2 el tope lo hace cumplir la base aunque se escriba directo: de 0 a S/ 5 000; −0.01, 5000.01, NaN e infinito no pasan",
  `select ${crea({ ls: lineas({}) })} as r \\gset
   reset role;
   select id as it from retail.orden_compra_items where orden_compra_id = (select id from retail.ordenes_compra where proveedor_id = :'prov') \\gset
   select concat_ws(',',
     split_part(pg_temp.intento($$update retail.orden_compra_items set precio_venta_sugerido = 5000 where id = '$$ || :'it' || $$'$$), '|', 1),
     split_part(pg_temp.intento($$update retail.orden_compra_items set precio_venta_sugerido = 0 where id = '$$ || :'it' || $$'$$), '|', 1),
     split_part(pg_temp.intento($$update retail.orden_compra_items set precio_venta_sugerido = 5000.01 where id = '$$ || :'it' || $$'$$), '|', 1),
     split_part(pg_temp.intento($$update retail.orden_compra_items set precio_venta_sugerido = -0.01 where id = '$$ || :'it' || $$'$$), '|', 1),
     split_part(pg_temp.intento($$update retail.orden_compra_items set precio_venta_sugerido = 'NaN' where id = '$$ || :'it' || $$'$$), '|', 1),
     split_part(pg_temp.intento($$update retail.orden_compra_items set precio_venta_sugerido = 'Infinity' where id = '$$ || :'it' || $$'$$), '|', 1));`,
  // El infinito ni siquiera cabe en numeric(12,2) (22003): el tipo ya lo rechaza antes que el candado; lo que importa es que no se guarde.
  "SIN_ERROR,SIN_ERROR,23514,23514,23514,22003",
);
caso(
  "S3 los motivos solo existen con un sugerido y van de 1 a 8, también escribiendo directo",
  `select ${crea({ ls: lineas({}) })} as r \\gset
   reset role;
   select id as it from retail.orden_compra_items where orden_compra_id = (select id from retail.ordenes_compra where proveedor_id = :'prov') \\gset
   select concat_ws(',',
     split_part(pg_temp.intento($$update retail.orden_compra_items set sugerido_motivos = '{a}' where id = '$$ || :'it' || $$'$$), '|', 1),
     split_part(pg_temp.intento($$update retail.orden_compra_items set precio_venta_sugerido = 10, sugerido_motivos = '{a}' where id = '$$ || :'it' || $$'$$), '|', 1),
     split_part(pg_temp.intento($$update retail.orden_compra_items set precio_venta_sugerido = 10, sugerido_motivos = '{a,b,c,d,e,f,g,h}' where id = '$$ || :'it' || $$'$$), '|', 1),
     split_part(pg_temp.intento($$update retail.orden_compra_items set precio_venta_sugerido = 10, sugerido_motivos = '{a,b,c,d,e,f,g,h,i}' where id = '$$ || :'it' || $$'$$), '|', 1),
     split_part(pg_temp.intento($$update retail.orden_compra_items set precio_venta_sugerido = 10, sugerido_motivos = '{}' where id = '$$ || :'it' || $$'$$), '|', 1),
     split_part(pg_temp.intento($$update retail.orden_compra_items set sugerido_motivos = null where id = '$$ || :'it' || $$'$$), '|', 1));`,
  "23514,SIN_ERROR,SIN_ERROR,23514,23514,SIN_ERROR",
);
caso(
  "S4 la migración se vuelve a cargar sin error y cada función queda con su parche UNA sola vez (idempotente: así se pega en producción)",
  `${sinCandadosDePegado(MIGRACION)}
   set local search_path = retail, public, extensions;
   select concat_ws(',',
     (select count(*) from regexp_matches(pg_get_functiondef('retail.fn_orden_compra_validar(uuid,uuid,date,text,jsonb,jsonb)'::regprocedure), 'fn_orden_compra_validar_sugerido', 'g')),
     (select count(*) from regexp_matches(pg_get_functiondef('retail.fn_orden_compra_huella(uuid,uuid,date,text,jsonb)'::regprocedure), 'sugerido_motivos', 'g')),
     (select count(*) from regexp_matches(pg_get_functiondef('retail.fn_orden_compra_escribir_lineas(uuid,jsonb)'::regprocedure), 'precio_venta_sugerido', 'g')),
     (select count(*) from regexp_matches(pg_get_functiondef('retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)'::regprocedure), 'v_item.precio_venta_sugerido', 'g')),
     (select count(*) from regexp_matches(pg_get_functiondef('retail.fn_envio_detalle(uuid)'::regprocedure), 'i.precio_venta_sugerido\\)', 'g')));`,
  "1,2,2,1,1",
);

// V. VALIDAR Y GUARDAR ----------------------------------------------------------------------------------------------------
caso(
  "V1 crear guarda el sugerido y los motivos, y el detalle los trae (la línea 2, sin sugerir, trae nulo)",
  `${ORDEN_CON_SUGERIDO}
   select retail.fn_orden_compra_detalle(:'pid') as d \\gset
   select concat_ws(' / ', :'creada',
     (select precio_venta_sugerido || ':' || sugerido_motivos::text from retail.orden_compra_items where id = :'l1'),
     (select coalesce(precio_venta_sugerido::text, 'nulo') || ':' || coalesce(sugerido_motivos::text, 'nulo') from retail.orden_compra_items where id = :'l2'),
     (select (l ->> 'precio_venta_sugerido') || ':' || (l -> 'sugerido_motivos')::text from jsonb_array_elements(:'d'::jsonb -> 'lineas') l where (l ->> 'posicion') = '1'),
     (select coalesce(l ->> 'precio_venta_sugerido', 'nulo') || ':' || (l -> 'sugerido_motivos')::text from jsonb_array_elements(:'d'::jsonb -> 'lineas') l where (l ->> 'posicion') = '2'));`,
  (o) => /^OK:\d+ \/ 59\.90:\{"Rotar rápido","Gancho: traer gente"\} \/ nulo:nulo \/ 59\.90:\["Rotar rápido", "Gancho: traer gente"\] \/ nulo:null$/.test(o),
);
caso(
  "V2 sin sugerido, o con motivos nulos o vacíos, la línea queda «sin sugerir» (nada se inventa)",
  `select gen_random_uuid() as pid \\gset
   select ${crea({ id: ":'pid'", ls: lineas({}, { sugerido_motivos: [] }, { sugerido_motivos: null }, { precio_venta_sugerido: "" }, { precio_venta_sugerido: "  " }) })} as r \\gset
   select concat_ws(',', split_part(:'r', ':', 1),
     (select count(*) from retail.orden_compra_items where orden_compra_id = :'pid'),
     (select count(*) from retail.orden_compra_items where orden_compra_id = :'pid' and precio_venta_sugerido is null and sugerido_motivos is null));`,
  "OK,5,5",
);
caso(
  "V3 los números llegan como texto con espacios y los motivos se recortan: se guarda 59.90 y «Rotar rápido»",
  `select gen_random_uuid() as pid \\gset
   select ${crea({ id: ":'pid'", ls: lineas({ precio_venta_sugerido: " 59.9 ", sugerido_motivos: ["  Rotar rápido  "] }) })} as r \\gset
   select (select precio_venta_sugerido::text || ':' || sugerido_motivos::text from retail.orden_compra_items where orden_compra_id = :'pid');`,
  "59.90:{\"Rotar rápido\"}",
);
caso(
  "V4 el precio sugerido se rechaza con su hint si no es un monto de 0 a S/ 5 000 con dos decimales (texto, negativo, tope, tres decimales, NaN)",
  `select retail.fn_ordenes_compra_siguiente() as antes \\gset
   select concat_ws(',',
     ${["abc", "-1", "5000.01", "12.345", "NaN", "Infinity", "1e9"].map((v) => parte(crea({ ls: lineas({ precio_venta_sugerido: v }) }), 2)).join(",\n     ")},
     ${parte(crea({ ls: lineas({}, { precio_venta_sugerido: "abc" }) }), 3)},
     ${si("retail.fn_ordenes_compra_siguiente() = :'antes'::int", "sin gastar", "gasto numeros")});`,
  (o) => o.startsWith("orden_compra_sugerido,".repeat(7)) && o.endsWith("El precio de venta sugerido de la línea 2 no se entiende: escribe solo el monto, con hasta dos decimales,sin gastar"),
);
caso(
  "V5 el 0 solo vale donde el catálogo lo admite (ADR-0384): en una categoría de ropa se rechaza; en bolsas, cajas y empaque se acepta",
  `select concat_ws(',',
     ${parte(crea({ ls: lineas({ precio_venta_sugerido: "0" }) }), 2)},
     ${parte(crea({ ls: lineas({ precio_venta_sugerido: "0.00" }) }), 3)},
     split_part(${crea({ ls: lineas({ categoria_id: "CAT_BOLSA", precio_venta_sugerido: "0" }).replace("CAT_BOLSA", "' || :'cat_bolsa' || '") })}, ':', 1));`,
  "orden_compra_sugerido,El precio de venta sugerido de la línea 1 no puede ser 0: solo las bolsas, cajas y empaque se regalan,OK",
);
caso(
  "V6 los motivos: sin precio, mal formados, de más, vacíos, largos o repetidos se rechazan con su hint; con precio y recortados, pasan",
  `select concat_ws(',',
     ${[
       { sugerido_motivos: ["Rotar rápido"] },
       { precio_venta_sugerido: "10", sugerido_motivos: "Rotar rápido" },
       { precio_venta_sugerido: "10", sugerido_motivos: [5] },
       { precio_venta_sugerido: "10", sugerido_motivos: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] },
       { precio_venta_sugerido: "10", sugerido_motivos: ["  "] },
       { precio_venta_sugerido: "10", sugerido_motivos: ["x".repeat(61)] },
       { precio_venta_sugerido: "10", sugerido_motivos: ["Rotar rápido", "  Rotar rápido "] },
     ].map((l) => parte(crea({ ls: lineas(l) }), 2)).join(",\n     ")},
     split_part(${crea({ ls: lineas({ precio_venta_sugerido: "10", sugerido_motivos: ["a", "b", "c", "d", "e", "f", "g", "h"] }) })}, ':', 1),
     split_part(${crea({ ls: lineas({ precio_venta_sugerido: "10", sugerido_motivos: ["x".repeat(60)] }) })}, ':', 1));`,
  "orden_compra_sugerido_motivos,".repeat(7) + "OK,OK",
);
caso(
  "V7 cada regla dice en qué línea falló, la edición valida igual que la creación y nada gasta números",
  `${ORDEN_CON_SUGERIDO}
   select retail.fn_ordenes_compra_siguiente() as antes \\gset
   select ${edita({ ls: lineas(SUG, { precio_venta_sugerido: "-3" }) })} as e1 \\gset
   select ${edita({ ls: lineas(SUG, { precio_venta_sugerido: "10", sugerido_motivos: ["a", "a"] }) })} as e2 \\gset
   select concat_ws(',', ${parte(":'e1'", 2)}, ${parte(":'e1'", 3)}, ${parte(":'e2'", 2)},
     (select precio_venta_sugerido from retail.orden_compra_items where id = :'l1'),
     ${si("retail.fn_ordenes_compra_siguiente() = :'antes'::int", "sin gastar", "gasto numeros")});`,
  "orden_compra_sugerido,El precio de venta sugerido de la línea 2 va de S/ 0 a S/ 5 000, con hasta dos decimales,orden_compra_sugerido_motivos,59.90,sin gastar",
);

// H. HUELLA Y EDITAR ------------------------------------------------------------------------------------------------------
caso(
  "H1 el mismo p_id con el MISMO pedido (doble clic, reintento) devuelve la misma orden: una sola, y un solo número gastado",
  `select gen_random_uuid() as pid \\gset
   select ${crea({ id: ":'pid'", ls: lineas(SUG) })} as a \\gset
   select ${crea({ id: ":'pid'", ls: lineas({ ...SUG, precio_venta_sugerido: " 59.9", sugerido_motivos: [" Rotar rápido", "Gancho: traer gente "] }) })} as b \\gset
   select concat_ws(',', :'a' = :'b', (select count(*) from retail.ordenes_compra where id = :'pid'));`,
  "t,1",
);
caso(
  "H2 el mismo p_id con OTRO sugerido, o con otros motivos, avisa que ya se guardó con lo de antes y no cambia nada",
  `select gen_random_uuid() as pid \\gset
   select ${crea({ id: ":'pid'", ls: lineas(SUG) })} as a \\gset
   select ${crea({ id: ":'pid'", ls: lineas({ ...SUG, precio_venta_sugerido: "69.90" }) })} as otro_precio \\gset
   select ${crea({ id: ":'pid'", ls: lineas({ ...SUG, sugerido_motivos: ["Rotar rápido"] }) })} as otros_motivos \\gset
   select ${crea({ id: ":'pid'", ls: lineas({ ...SUG, precio_venta_sugerido: "" , sugerido_motivos: null }) })} as sin_sugerido \\gset
   select concat_ws(',', ${parte(":'otro_precio'", 2)}, ${parte(":'otros_motivos'", 2)}, ${parte(":'sin_sugerido'", 2)},
     (select precio_venta_sugerido || ':' || sugerido_motivos::text from retail.orden_compra_items where orden_compra_id = :'pid'));`,
  "orden_compra_ya_guardada,orden_compra_ya_guardada,orden_compra_ya_guardada,59.90:{\"Rotar rápido\",\"Gancho: traer gente\"}",
);
caso(
  "H3 editar SOLO el sugerido es un cambio: sube la versión, guarda el nuevo, archiva el anterior y Actividad lo cuenta SIN el monto",
  `${ORDEN_CON_SUGERIDO}
   select ${edita({ ls: lineas({ ...SUG, precio_venta_sugerido: "79.90" }, { cantidad: "4", precio_unitario: "100" }) })} as r \\gset
   reset role;
   select concat_ws(' / ', split_part(:'r', ':', 1) || ':' || split_part(:'r', ':', 3),
     (select precio_venta_sugerido::text from retail.orden_compra_items where orden_compra_id = :'pid' and posicion = 1),
     (select (datos -> 'lineas' -> 0 ->> 'precio_venta_sugerido') || ':' || (datos -> 'lineas' -> 0 -> 'sugerido_motivos')::text
        from retail.orden_compra_versiones where orden_compra_id = :'pid'),
     ${enActividad("orden_compra_editada")},
     (select ${si("descripcion like '%1 línea cambiada%'", "cuenta la línea", "no la cuenta")} || ':' ||
             ${si("descripcion like '%59%' or descripcion like '%79%' or detalle::text like '%59.9%' or detalle::text like '%79.9%'", "con montos", "sin montos")}
        from retail.actividad a where a.tabla = 'ordenes_compra' and a.registro_id = :'pid' and a.accion = 'orden_compra_editada'));`,
  "OK:2 / 79.90 / 59.90:[\"Rotar rápido\", \"Gancho: traer gente\"] / 1 / cuenta la línea:sin montos",
);
caso(
  "H3b editar solo los MOTIVOS también es un cambio (y su orden cuenta)",
  `${ORDEN_CON_SUGERIDO}
   select ${edita({ ls: lineas({ ...SUG, sugerido_motivos: ["Gancho: traer gente", "Rotar rápido"] }, { cantidad: "4", precio_unitario: "100" }) })} as r \\gset
   select split_part(:'r', ':', 3) || ':' || (select sugerido_motivos::text from retail.orden_compra_items where orden_compra_id = :'pid' and posicion = 1);`,
  "2:{\"Gancho: traer gente\",\"Rotar rápido\"}",
);
caso(
  "H4 el MISMO sugerido otra vez (escrito de otra forma) no cambia nada: sin versión nueva, sin archivo y sin línea en Actividad",
  `${ORDEN_CON_SUGERIDO}
   select ${edita({ ls: lineas({ ...SUG, precio_venta_sugerido: " 59.9 " }, { cantidad: "4", precio_unitario: "100" }) })} as r \\gset
   select concat_ws(',', split_part(:'r', ':', 3), (select count(*) from retail.orden_compra_versiones where orden_compra_id = :'pid'), ${enActividad("orden_compra_editada")});`,
  "1,0,0",
);
caso(
  "H5 quitar el sugerido borra también sus motivos (nunca quedan motivos sin precio) y quitarlos solo deja el precio",
  `${ORDEN_CON_SUGERIDO}
   select ${edita({ ls: lineas({ cantidad: "10", precio_unitario: "25.00" }, { cantidad: "4", precio_unitario: "100" }) })} as quitado \\gset
   select version as v2 from retail.ordenes_compra where id = :'pid' \\gset
   select ${edita({ version: ":'v2'", ls: lineas({ cantidad: "10", precio_unitario: "25.00", precio_venta_sugerido: "49.90" }, { cantidad: "4", precio_unitario: "100" }) })} as con_precio \\gset
   select concat_ws(',', split_part(:'quitado', ':', 3), (select coalesce(precio_venta_sugerido::text, 'nulo') || '/' || coalesce(sugerido_motivos::text, 'nulo')
        from retail.orden_compra_items where orden_compra_id = :'pid' and posicion = 1), split_part(:'con_precio', ':', 3));`,
  "2,49.90/nulo,3",
);

// C. COMPROBANTE ----------------------------------------------------------------------------------------------------------
const lineaPapel = (id, extra = "") => `jsonb_build_object('orden_compra_item_id', ${id}, 'cantidad', 10, 'costo_unitario', '25.00'${extra})`;
caso(
  "C1 una línea del papel que sale de una línea pedida hereda el sugerido de la orden; el que traiga el papel manda; lo de afuera no hereda",
  `${ORDEN_CON_SUGERIDO}
   select pg_temp.registra(:'pid', jsonb_build_array(
     ${lineaPapel(":'l1'")},
     jsonb_build_object('orden_compra_item_id', :'l2', 'cantidad', 4, 'costo_unitario', '90.00', 'precio_venta_sugerido', '129.90'),
     jsonb_build_object('categoria_id', :'cat', 'marca_id', :'marca', 'cantidad', 1, 'costo_unitario', '5.00'))) as r \\gset
   select concat_ws(' / ', ${parte(":'r'", 1)}, (select string_agg(coalesce(ci.precio_venta_sugerido::text, 'nulo'), ',' order by ci.cantidad desc, ci.costo_unitario)
        from retail.compra_items ci where ci.compra_id = (:'r'::jsonb ->> 'compra_id')::uuid));`,
  (o) => o.endsWith(" / 59.90,129.90,nulo") && !o.includes("|"),
);
caso(
  "C1b un sugerido vacío en el papel también hereda (no se puede «borrar» el de la orden desde el comprobante sin escribir otro)",
  `${ORDEN_CON_SUGERIDO}
   select pg_temp.registra(:'pid', jsonb_build_array(${lineaPapel(":'l1'", ", 'precio_venta_sugerido', ''")})) as r \\gset
   select (select ci.precio_venta_sugerido::text from retail.compra_items ci where ci.compra_id = (:'r'::jsonb ->> 'compra_id')::uuid);`,
  "59.90",
);
caso(
  "C2 una orden SIN sugerido no inventa uno: el papel queda con lo que traiga (nulo si nada)",
  `select gen_random_uuid() as pid \\gset
   select ${crea({ id: ":'pid'", ls: lineas({}) })} as creada \\gset
   select id as l1 from retail.orden_compra_items where orden_compra_id = :'pid' and posicion = 1 \\gset
   select pg_temp.registra(:'pid', jsonb_build_array(${lineaPapel(":'l1'")})) as r \\gset
   select (select coalesce(ci.precio_venta_sugerido::text, 'nulo') from retail.compra_items ci where ci.compra_id = (:'r'::jsonb ->> 'compra_id')::uuid);`,
  "nulo",
);

// R. RECEPCIÓN ------------------------------------------------------------------------------------------------------------
const sugeridoDelEnvio = (res) => `(select coalesce(l ->> 'precio_venta_sugerido', 'nulo') from jsonb_array_elements(retail.fn_envio_detalle((${res}::jsonb ->> 'despacho_id')::uuid) -> 'lineas') l limit 1)`;
caso(
  "R1 sin papel, quien recibe ve el sugerido de la orden (el tercer escalón); sin sugerido en la orden, nada",
  `${ORDEN_CON_SUGERIDO}
   select pg_temp.envia(:'tru', jsonb_build_array(jsonb_build_object('orden_compra_item_id', :'l1', 'cantidad', 3))) as e1 \\gset
   select pg_temp.envia(:'tru', jsonb_build_array(jsonb_build_object('orden_compra_item_id', :'l2', 'cantidad', 2))) as e2 \\gset
   select concat_ws(',', ${sugeridoDelEnvio(":'e1'")}, ${sugeridoDelEnvio(":'e2'")});`,
  "59.90,nulo",
);
caso(
  "R2 con papel, manda el del papel: si el papel trae otro sugerido (o la orden se corrigió en el papel), quien recibe ve ese",
  `${ORDEN_CON_SUGERIDO}
   select pg_temp.registra(:'pid', jsonb_build_array(
     jsonb_build_object('orden_compra_item_id', :'l1', 'cantidad', 10, 'costo_unitario', '25.00', 'precio_venta_sugerido', '64.90'))) as comp \\gset
   select pg_temp.envia(:'tru', jsonb_build_array(jsonb_build_object('orden_compra_item_id', :'l1', 'cantidad', 3))) as e1 \\gset
   select concat_ws(',', ((:'comp'::jsonb ->> 'compra_id') is not null), ${sugeridoDelEnvio(":'e1'")});`,
  "t,64.90",
);
caso(
  "R3 con papel que hereda, quien recibe ve el heredado de la orden",
  `${ORDEN_CON_SUGERIDO}
   select pg_temp.registra(:'pid', jsonb_build_array(${lineaPapel(":'l1'")})) as comp \\gset
   select pg_temp.envia(:'tru', jsonb_build_array(jsonb_build_object('orden_compra_item_id', :'l1', 'cantidad', 3))) as e1 \\gset
   select ${sugeridoDelEnvio(":'e1'")};`,
  "59.90",
);

// P. PIEZAS INTERNAS ------------------------------------------------------------------------------------------------------
caso(
  "P1 las dos piezas nuevas son internas: ni authenticated ni anon las ejecutan",
  `reset role;
   select concat_ws(',',
     has_function_privilege('authenticated', 'retail.fn_orden_compra_validar_sugerido(integer,jsonb,uuid)', 'execute'),
     has_function_privilege('anon', 'retail.fn_orden_compra_validar_sugerido(integer,jsonb,uuid)', 'execute'),
     has_function_privilege('authenticated', 'retail.fn_orden_compra_motivos(jsonb)', 'execute'),
     has_function_privilege('anon', 'retail.fn_orden_compra_motivos(jsonb)', 'execute'));`,
  "f,f,f,f",
);
caso(
  "P2 sin el módulo «Órdenes de compra» no se ve el sugerido: el detalle sigue exigiéndolo (42501)",
  `${ORDEN_CON_SUGERIDO}
   ${como(MICAELA)}
   select split_part(pg_temp.intento(format('select retail.fn_orden_compra_detalle(%L)', :'pid')), '|', 1);`,
  "42501",
);

console.log(`\n${casos - fallas}/${casos} casos bien`);
if (fallas > 0) process.exit(1);
