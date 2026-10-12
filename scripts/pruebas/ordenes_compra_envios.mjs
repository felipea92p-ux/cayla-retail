#!/usr/bin/env node
/**
 * Pruebas del envío a una sede (ADR-0362, fase 3; Felipe 2026-10-12) — migraciones `20261012225000_compras_envios.sql` y
 * `20261012230000_compras_por_repartir.sql`. Contrato: docs/compras/ordenes-de-compra-2026-10/contrato-envio-a-sede.md.
 *
 * LO QUE VIGILA. Que la compradora mande lo de una orden a una sede con SOLO el módulo «Órdenes de compra», que una orden «directo»
 * vaya solo a su tienda y una «Por repartir» se reparta en una guía por sede, que nunca salga más de lo pedido (salvo lo de más que el
 * papel facturó, decisión 43), que el precio quede congelado, que un reintento no duplique, que anular solo valga en camino y libere lo
 * enviado, que la orden con envío no se edite ni se anule por debajo, que la sede lea sus envíos con Recibir, y que el comprobante de
 * una «Por repartir» quede en la sede de quien lo registra.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las dos migraciones se cargan DOS veces dentro de cada caso, así se prueba que
 * se pueden pegar dos veces y corren con la base al día o sin ella). Micaela es de Tienda Trujillo y no es líder (un rol de prueba con
 * los módulos que pide cada caso); Felipe es líder y Admin, de Tienda Lima. El responsable obligatorio va encendido, como en producción.
 *   P  PERMISOS: con solo «Órdenes de compra» envía; con solo Recibir o sin módulos, 42501 al enviar, anular y ver lo por enviar. Quien
 *      no es Admin firma sin combo con `orden_compra_envio` (sin la clave le pide el combo); una terminal sin elegir a alguien, no.
 *   E  ENVIAR: directo a su tienda (ENV correlativo, en camino, precio neto congelado, la línea del papel si hay una sola, sin stock);
 *      una directo no va a otra tienda (ni a mano: el candado de esquema), ni una anulada, ni al Taller; una «Por repartir» en dos guías
 *      a dos sedes, y una guía con dos órdenes y dos proveedores; no más de lo pedido salvo lo facturado de más (con su aviso), y el
 *      tope diferido frena lo que entra a mano.
 *   V  LO QUE NO SE ACEPTA: sin líneas, repetida, cantidad rara, dato ilegible, línea que no existe, guía o nota largas, sin sede.
 *   D  LA ORDEN: enviado y por enviar por línea, sus envíos (el más reciente primero) y la lista «Por enviar».
 *   T  EL MISMO TOKEN: con la misma huella devuelve lo mismo y no duplica; con otra, error.
 *   N  ANULAR: solo en camino y con motivo, con la versión que se vio; repetido devuelve lo mismo; lo anulado deja de contar; el
 *      camino no vuelve atrás y una línea no se borra.
 *   O  LA ORDEN CON ENVÍO: con uno vigente no se edita ni se anula; anulado el envío, se anula pero sigue sin editarse.
 *   L  LECTURAS DE LA SEDE: con Recibir ve lo que está en camino y el envío por dentro; sin módulos, 42501.
 *   C  DE QUIÉN ES LA DEUDA (decisión 46): la sede asignada de quien hizo la orden (activa); si no, «Llega a»; si no (una «Por
 *      repartir»), la sede de quien registra el papel; si nada, error. `deuda_de` en el detalle dice lo mismo.
 *   S  LA FORMA: security definer, authenticated sí y anon no, RLS sin políticas, el tope diferido, la clave del combo.
 *
 * USO
 *   node scripts/pruebas/ordenes_compra_envios.mjs                                → contra el stack local compartido
 *   node scripts/pruebas/ordenes_compra_envios.mjs --contenedor supabase_db_x     → contra otro stack (un banco de pruebas propio)
 *   node scripts/pruebas/ordenes_compra_envios.mjs --sin-migracion                → sin cargar las migraciones: contra una base sin el
 *                                                                                   cambio, la prueba tiene que FALLAR
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
const MIGRACIONES = SIN_MIGRACION
  ? ""
  : ["20261012225000_compras_envios.sql", "20261012230000_compras_por_repartir.sql"]
      .map((f) =>
        readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8")
          .replace(/^set lock_timeout.*$/m, "")
          .replace(/^reset lock_timeout;$/m, ""),
      )
      .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
// Una terminal de prueba (se crea dentro de cada caso y se va con el ROLLBACK).
const T_VENTAS = "33333333-3333-4333-8333-0000000000c9";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth) =>
  `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;
const encabezados = (obj) => `select set_config('request.headers', '${JSON.stringify(obj)}', true) \\g /dev/null\n`;
// Con la cuenta de una persona y sin elegir responsable: la clave soltada del combo (decisión 39).
const SIN_COMBO = encabezados({ "x-responsable-omitido": "orden_compra_envio" });
const SIN_COMBO_COMPROBANTE = encabezados({ "x-responsable-omitido": "orden_compra_comprobante" });
const SIN_ENCABEZADOS = `select set_config('request.headers', '', true) \\g /dev/null\n`;

// Cada llamada devuelve su respuesta (texto JSON) o «<sqlstate>|<mensaje>».
const atrapa = (nombre, firma, llamada) => `
create function pg_temp.${nombre}(${firma}) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  return (${llamada})::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.${nombre}(${firma.replace(/p_\w+ /g, "")}) to authenticated;`;

const PRELUDIO = `
set client_min_messages = warning;
begin;
${MIGRACIONES}
${MIGRACIONES}
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
${atrapa("envia", "p_sede uuid, p_lineas jsonb, p_guia text, p_nota text, p_token uuid", "retail.crear_envio(p_sede, p_lineas, p_guia, p_nota, p_token)")}
${atrapa("anula", "p_id uuid, p_version integer, p_motivo text", "retail.anular_envio(p_id, p_version, p_motivo)")}
${atrapa(
  "registra",
  "p_orden uuid, p_numero text, p_lineas jsonb",
  "retail.registrar_comprobante_orden(p_orden, 'boleta', 'B009', p_numero, p_lineas, null, 'credito', retail.fn_hoy_lima() + 30, true, null, null, null, null)",
)}
-- Un envío escrito A MANO (sin crear_envio), para probar los candados de esquema: los diferidos se disparan aquí mismo.
create function pg_temp.a_mano(p_sede uuid, p_item uuid, p_cantidad integer, p_persona uuid) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_d uuid; v_cat uuid; v_marca uuid;
begin
  for v_cat, v_marca in select i.categoria_id, i.marca_id from retail.orden_compra_items i where i.id = p_item loop exit; end loop;
  insert into retail.despachos (ubicacion_destino_id, despachado_por) values (p_sede, p_persona) returning id into v_d;
  insert into retail.despacho_items (despacho_id, orden_compra_item_id, cantidad, categoria_id, marca_id, precio_unitario)
    values (v_d, p_item, p_cantidad, v_cat, v_marca, 1);
  set constraints all immediate;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;

-- Datos propios de la prueba.
insert into retail.proveedores (nombre) values ('Proveedor Envío OC Prueba') returning id as prov \\gset
insert into retail.proveedores (nombre) values ('Proveedor Envío OC Dos') returning id as prov2 \\gset
insert into retail.marcas (nombre) values ('Marca Envío OC') returning id as marca \\gset
insert into retail.categorias (nombre, familia) values ('Polos Envío OC', 'indumentaria') returning id as cat \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by created_at limit 1 \\gset
-- Como en producción: el responsable obligatorio encendido (sin él, cualquiera firmaría sin combo y la clave no probaría nada).
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
-- O1 directo a Trujillo: l1 = 10 «Polo básico» a S/ 25.50; l2 = 4 a S/ 100 con S/ 40 de descuento (neto S/ 90).
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, fecha_entrega_estimada, creada_por)
  values (:'prov', :'tru', retail.fn_hoy_lima() + 7, :'felipe_p') returning id as o1, numero as n1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario)
  values (:'o1', 1, :'cat', :'marca', 'Polo básico', 10, 25.50) returning id as l1 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento, descuento_pct)
  values (:'o1', 2, :'cat', :'marca', 4, 100, 40, 10) returning id as l2 \\gset
-- O2 «Por repartir», de otro proveedor: l_o2 = 6 a S/ 50 con S/ 5 de descuento (neto 295 / 6 = 49.1666… → S/ 49.17).
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov2', null, :'felipe_p')
  returning id as o2, numero as n2 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario, descuento)
  values (:'o2', 1, :'cat', :'marca', 6, 50, 5) returning id as l_o2 \\gset
-- O3 anulada.
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por, estado, anulada_por, anulada_en, motivo_anulacion)
  values (:'prov', :'tru', :'felipe_p', 'anulada', :'felipe_p', now(), 'Prueba') returning id as o3, numero as n3 \\gset
insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
  values (:'o3', 1, :'cat', :'marca', 2, 10) returning id as l_o3 \\gset
select retail.fn_orden_compra_numero_texto(:n1) as oc1, retail.fn_orden_compra_numero_texto(:n2) as oc2,
       retail.fn_orden_compra_numero_texto(:n3) as oc3 \\gset
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO esos módulos. Se va con el ROLLBACK.
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba envío OC ' || substr(md5(random()::text), 1, 8)) returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
`;
// La terminal de ventas de Trujillo, con el módulo en su rol (para llegar al candado del responsable y no al del módulo).
const TERMINAL = `
reset role;
insert into auth.users (id, aud, role, email) values ('${T_VENTAS}', 'authenticated', 'authenticated', 'oc-envio-terminal@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  values (:'tru', 'Terminal envío OC Prueba', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS}');
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('terminal_ventas'), 'ordenes_compra') on conflict do nothing;
`;

// Una línea de \`p_lineas\` (valores en SQL) y la lista.
const L = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const LINEAS = (...ls) => `jsonb_build_array(${ls.map(L).join(", ")})`;
const V = (item, cantidad) => ({ orden_compra_item_id: `:'${item}'`, cantidad });
const envia = ({ sede = ":'tru'", lineas, guia = "null", nota = "null", token = "null" }) =>
  `pg_temp.envia(${sede}, ${lineas}, (${guia})::text, (${nota})::text, (${token})::uuid)`;
const anula = (idSql, version, motivo) => `pg_temp.anula(${idSql}, ${version}, ${motivo})`;
const DID = (v) => `(:'${v}'::jsonb ->> 'despacho_id')::uuid`;
// Los números cambian en cada corrida: OC1/OC2/OC3 son las tres órdenes de la prueba y ENV cualquier envío.
const limpio = (expr) =>
  `regexp_replace(replace(replace(replace(${expr}, :'oc1', 'OC1'), :'oc2', 'OC2'), :'oc3', 'OC3'), 'ENV-[0-9]{6}', 'ENV', 'g')`;
// Por línea de una orden: «posición:enviado/por_enviar».
const LINEAS_DE = (d) =>
  `(select string_agg((l ->> 'posicion') || ':' || (l ->> 'enviado') || '/' || (l ->> 'por_enviar'), ' ' order by (l ->> 'posicion')::int)
      from jsonb_array_elements(:'${d}'::jsonb -> 'lineas') l)`;
const CLAVES = (expr) => `(select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(${expr}) k)`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    // Al final se disparan los candados diferidos (el tope de lo enviado, el reparto del papel): si algo quedó mal guardado, el caso
    // falla aquí.
    obtenido = psql(`${PRELUDIO}${sql}\nset constraints all immediate;\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => /ERROR|DETAIL|HINT|CONTEXT|LINE/.test(l)).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

const ELIGE = "42501|Elige quién hace esta operación";

// P. PERMISOS -------------------------------------------------------------------------------------------------------------
caso(
  "P1 con solo «Órdenes de compra», sin ser líder, envía a una sede y firma ella",
  `${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   ${SIN_COMBO}
   select ${envia({ lineas: LINEAS(V("l1", 2)) })} as r \\gset
   -- Como al confirmar desde la web: los candados diferidos corren con el rol de la sesión, no con el de la función.
   set constraints all immediate;
   reset role;
   select (:'r'::jsonb ->> 'sede') || ':' || (:'r'::jsonb ->> 'unidades') || ':'
     || (select (d.despachado_por = :'micaela_p') from retail.despachos d where d.id = ${DID("r")});`,
  "Tienda Trujillo:2:true",
);
for (const [modulos, nombre] of [[["recibir"], "con solo Recibir"], [[], "sin módulos"]]) {
  caso(
    `P2 ${nombre}: 42501 al enviar, al anular y al pedir lo por enviar`,
    `${como(FELIPE)}
     select ${envia({ lineas: LINEAS(V("l1", 1)) })} as r \\gset
     reset role;
     select d.version as v from retail.despachos d where d.id = ${DID("r")} \\gset
     ${rolDeMicaela(...modulos)}
     ${como(MICAELA)}
     ${SIN_COMBO}
     select concat_ws(' / ',
       ${envia({ lineas: LINEAS(V("l1", 1)) })},
       ${anula(DID("r"), ":v", "'No va'")},
       pg_temp.intento('select * from retail.fn_ordenes_compra_por_enviar()'));`,
    "42501|Enviar a una sede necesita el módulo «Órdenes de compra» en tu rol / " +
      "42501|Anular un envío necesita el módulo «Órdenes de compra» en tu rol / " +
      "42501|Ver las órdenes de compra necesita el módulo «Órdenes de compra» en tu rol",
  );
}
caso(
  "P3 sin la clave le pide el combo; una terminal no envía ni anula sin elegir a alguien (ni mandando la clave)",
  `${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   select ${envia({ lineas: LINEAS(V("l1", 1)) })} as sin_clave \\gset
   ${como(FELIPE)}
   select ${envia({ lineas: LINEAS(V("l1", 1)) })} as r \\gset
   reset role;
   select d.version as v from retail.despachos d where d.id = ${DID("r")} \\gset
   ${TERMINAL}
   ${como(T_VENTAS)}
   select ${envia({ lineas: LINEAS(V("l1", 1)) })} as t_nada \\gset
   ${SIN_COMBO}
   select ${envia({ lineas: LINEAS(V("l1", 1)) })} as t_clave \\gset
   select ${anula(DID("r"), ":v", "'No va'")} as t_anula \\gset
   reset role;
   select concat_ws(' / ', :'sin_clave', :'t_nada', :'t_clave', :'t_anula',
     (select count(*) from retail.despacho_items di where di.orden_compra_item_id = :'l1') || ' envío',
     (select d.estado from retail.despachos d where d.id = ${DID("r")}));`,
  `${ELIGE} / ${ELIGE} / ${ELIGE} / ${ELIGE} / 1 envío / en_camino`,
);

// E. ENVIAR ---------------------------------------------------------------------------------------------------------------
caso(
  "E1 directo a su tienda: ENV correlativo, en camino, precio neto congelado, la línea del papel si hay una sola, sin stock, en Actividad",
  `${como(FELIPE)}
   select pg_temp.registra(:'o1', '900', ${LINEAS({ orden_compra_item_id: ":'l1'", cantidad: 10, costo_unitario: "25.50" })}) as comp \\gset
   reset role;
   select count(*) as mov0 from retail.movimientos \\gset
   ${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   ${SIN_COMBO}
   select gen_random_uuid() as tok \\gset
   select ${envia({ lineas: LINEAS(V("l1", 6), V("l2", 4)), guia: "' T001-55 '", nota: "'Va en dos bolsas'", token: ":'tok'" })} as r1 \\gset
   select ${envia({ lineas: LINEAS(V("l1", 4)) })} as r2 \\gset
   reset role;
   set constraints all immediate;
   select concat_ws(' / ',
     (:'r1'::jsonb ->> 'numero') ~ '^ENV-[0-9]{6}$',
     substr(:'r2'::jsonb ->> 'numero', 5)::int - substr(:'r1'::jsonb ->> 'numero', 5)::int,
     (:'r1'::jsonb ->> 'sede') || ':' || (:'r1'::jsonb ->> 'unidades') || ':' || (:'r1'::jsonb -> 'avisos')::text,
     ${CLAVES(":'r1'::jsonb")},
     (select d.estado || ':' || d.version || ':' || (d.ubicacion_destino_id = :'tru') || ':' || d.numero_guia || ':' || d.nota || ':'
             || (d.despachado_por = :'micaela_p') || ':' || (d.token_cliente = :'tok') || ':' || (length(d.huella_envio) = 32) || ':'
             || (retail.fn_envio_numero_texto(d.numero) = :'r1'::jsonb ->> 'numero') || ':'
             || coalesce(d.abierto_por::text, '-') || coalesce(d.cerrado_por::text, '-') || coalesce(d.anulado_por::text, '-')
        from retail.despachos d where d.id = ${DID("r1")}),
     (select string_agg(case di.orden_compra_item_id when :'l1' then 'l1' when :'l2' then 'l2' end || ':' || di.cantidad || 'x' || di.precio_unitario
                        || ':' || (di.categoria_id = :'cat' and di.marca_id = :'marca') || ':' || coalesce(di.descripcion, '-') || ':'
                        || coalesce((di.compra_item_id = (select ci.id from retail.compra_items ci
                                                           where ci.compra_id = (:'comp'::jsonb ->> 'compra_id')::uuid))::text, 'sin papel'),
                        ' ' order by di.cantidad desc)
        from retail.despacho_items di where di.despacho_id = ${DID("r1")}),
     ((select count(*) from retail.movimientos) - :mov0) || ' movimientos',
     (select string_agg(${limpio("a.descripcion")}, ' | ' order by a.ocurrio_at, a.descripcion)
        from retail.actividad a where a.accion = 'orden_compra_envio' and a.registro_id = :'o1'));`,
  "t / 1 / Tienda Trujillo:10:[] / avisos,despacho_id,numero,sede,unidades / " +
    "en_camino:1:true:T001-55:Va en dos bolsas:true:true:true:true:--- / " +
    "l1:6x25.50:true:Polo básico:true l2:4x90.00:true:-:sin papel / 0 movimientos / " +
    "envió 10 unidades de la OC1 (Proveedor Envío OC Prueba) a Tienda Trujillo en la ENV | " +
    "envió 4 unidades de la OC1 (Proveedor Envío OC Prueba) a Tienda Trujillo en la ENV",
);
caso(
  "E2 una orden directo no va a otra tienda (ni escrita a mano), una anulada no se envía, ni al Taller ni a una sede que no existe",
  `${como(FELIPE)}
   select concat_ws(' / ',
     ${limpio(envia({ sede: ":'lim'", lineas: LINEAS(V("l1", 1)) }))},
     ${limpio(envia({ lineas: LINEAS(V("l_o3", 1)) }))},
     ${envia({ sede: ":'taller'", lineas: LINEAS(V("l_o2", 1)) })},
     ${envia({ sede: "gen_random_uuid()", lineas: LINEAS(V("l_o2", 1)) })}) as r \\gset
   reset role;
   select :'r' || ' / ' || ${limpio("pg_temp.a_mano(:'lim', :'l1', 1, :'felipe_p')")}
     || ' / ' || (select count(*) from retail.despacho_items di where di.orden_compra_item_id in (:'l1', :'l_o2', :'l_o3'));`,
  "P0001|La OC1 llega directo a Tienda Trujillo: no se envía a Tienda Lima / P0001|La OC3 está anulada: ya no se envía / " +
    "P0001|Elige una sede activa a la que enviar / P0001|Elige una sede activa a la que enviar / " +
    "23514|La OC1 llega directo a Tienda Trujillo: no se envía a Tienda Lima / 0",
);
caso(
  "E3 una «Por repartir» se reparte en dos guías a dos sedes; una guía lleva dos órdenes y dos proveedores; lo agotado no sale",
  `${como(FELIPE)}
   select ${envia({ lineas: LINEAS(V("l_o2", 4), V("l1", 1)) })} as r1 \\gset
   select ${envia({ sede: ":'lim'", lineas: LINEAS(V("l_o2", 2)) })} as r2 \\gset
   select ${limpio(envia({ lineas: LINEAS(V("l_o2", 1)) }))} as r3 \\gset
   select retail.fn_orden_compra_detalle(:'o2') as d \\gset
   select retail.fn_envio_detalle(${DID("r1")}) as e \\gset
   reset role;
   select concat_ws(' / ',
     (:'r1'::jsonb ->> 'sede') || ':' || (:'r1'::jsonb ->> 'unidades') || ', ' || (:'r2'::jsonb ->> 'sede') || ':' || (:'r2'::jsonb ->> 'unidades'),
     :'r3',
     (select string_agg(di.cantidad || 'x' || di.precio_unitario, ',' order by di.cantidad desc)
        from retail.despacho_items di where di.orden_compra_item_id = :'l_o2'),
     ${LINEAS_DE("d")},
     (select string_agg((x ->> 'sede') || ':' || (x ->> 'unidades'), ',' order by o) from jsonb_array_elements(:'d'::jsonb -> 'envios') with ordinality t(x, o)),
     ${limpio(`(select string_agg((l ->> 'orden') || ':' || (l ->> 'posicion') || ':' || (l -> 'proveedor' ->> 'nombre') || ':'
                                 || (l ->> 'cantidad') || 'x' || (l ->> 'precio_unitario'), ' | ' order by o)
                  from jsonb_array_elements(:'e'::jsonb -> 'lineas') with ordinality t(l, o))`)});`,
  "Tienda Trujillo:5, Tienda Lima:2 / P0001|De la línea 1 de la OC2 quedan 0 por enviar: no se pueden enviar 1 / 4x49.17,2x49.17 / " +
    "1:6/0 / Tienda Lima:2,Tienda Trujillo:4 / OC1:1:Proveedor Envío OC Prueba:1x25.50 | OC2:1:Proveedor Envío OC Dos:4x49.17",
);
caso(
  "E4 no sale más de lo pedido; lo de más que el papel facturó sí, y avisa; a mano, el tope diferido lo frena",
  `${como(FELIPE)}
   select ${limpio(envia({ lineas: LINEAS(V("l1", 11)) }))} as a \\gset
   select pg_temp.registra(:'o1', '901', ${LINEAS({ orden_compra_item_id: ":'l1'", cantidad: 12, costo_unitario: "25.50" })}) as comp \\gset
   select ${envia({ lineas: LINEAS(V("l1", 12)) })} as b \\gset
   select ${limpio(envia({ lineas: LINEAS(V("l1", 1)) }))} as c \\gset
   reset role;
   select ${limpio("pg_temp.a_mano(:'tru', :'l1', 1, :'felipe_p')")} as mano \\gset
   select concat_ws(' / ', :'a',
     ${limpio(`(select string_agg((x ->> 'tipo') || '{' || ${CLAVES("x")} || '}:' || (x ->> 'orden') || ':' || (x ->> 'posicion') || ':'
                                 || (x ->> 'descripcion') || ':' || (x ->> 'pedido') || ':' || (x ->> 'enviado') || ':'
                                 || ((x ->> 'orden_compra_item_id') = :'l1'), ' | ')
                  from jsonb_array_elements(:'b'::jsonb -> 'avisos') x)`)},
     :'c', :'mano',
     (select (di.compra_item_id is not null) from retail.despacho_items di where di.despacho_id = ${DID("b")}));`,
  "P0001|De la línea 1 de la OC1 quedan 10 por enviar: no se pueden enviar 11 / " +
    "de_mas{descripcion,enviado,orden,orden_compra_item_id,pedido,posicion,tipo}:OC1:1:Polos Envío OC · Marca Envío OC · Polo básico:10:12:true / " +
    "P0001|De la línea 1 de la OC1 quedan 0 por enviar: no se pueden enviar 1 / " +
    "23514|De la línea 1 de la OC1 se enviarían 13 y el tope es 12 (lo pedido o lo facturado, lo que sea mayor) / t",
);

// V. LO QUE NO SE ACEPTA ----------------------------------------------------------------------------------------------------
caso(
  "V1 sin líneas, línea repetida, cantidad 0 o con decimales, dato ilegible, línea que no existe, guía o nota largas, sin sede",
  `${como(FELIPE)}
   select concat_ws(' / ',
     ${envia({ lineas: "'[]'" })},
     ${envia({ lineas: LINEAS(V("l1", 1), V("l1", 2)) })},
     ${envia({ lineas: LINEAS(V("l1", 0)) })},
     ${envia({ lineas: LINEAS(V("l1", "1.5")) })},
     ${envia({ lineas: LINEAS({ orden_compra_item_id: "'no-es-uuid'", cantidad: 1 }) })},
     ${envia({ lineas: LINEAS({ orden_compra_item_id: "gen_random_uuid()", cantidad: 1 }) })},
     ${envia({ lineas: LINEAS(V("l1", 1)), guia: "repeat('x', 41)" })},
     ${envia({ lineas: LINEAS(V("l1", 1)), nota: "repeat('x', 501)" })},
     ${envia({ sede: "null", lineas: LINEAS(V("l1", 1)) })});`,
  [
    "P0001|Elige al menos una línea para enviar",
    "P0001|La línea 2 se repite en este envío",
    "P0001|La cantidad de la línea 1 va de 1 a 99 999 unidades, sin decimales",
    "P0001|La cantidad de la línea 1 va de 1 a 99 999 unidades, sin decimales",
    "P0001|La línea 1 tiene un número o un dato que no se entiende",
    "P0001|La línea 1 no es de ninguna orden: recarga la pantalla",
    "P0001|El número de guía es muy largo: hasta 40 letras",
    "P0001|La nota es muy larga: hasta 500 letras",
    "P0001|Elige una sede activa a la que enviar",
  ].join(" / "),
);

// D. LA ORDEN -------------------------------------------------------------------------------------------------------------
caso(
  "D1 la orden muestra enviado y por enviar por línea y sus envíos (el más reciente primero); la lista «Por enviar» las cuenta",
  `${como(FELIPE)}
   select retail.fn_orden_compra_detalle(:'o1') as d0 \\gset
   select ${envia({ lineas: LINEAS(V("l1", 6)) })} as r1 \\gset
   select ${envia({ lineas: LINEAS(V("l1", 1), V("l2", 4)), guia: "'G-7'" })} as r2 \\gset
   select retail.fn_orden_compra_detalle(:'o1') as d1 \\gset
   select (select string_agg(case p.orden_compra_id when :'o1' then 'o1' when :'o2' then 'o2' else 'o3' end || ':' || p.unidades_por_enviar,
                             ' ' order by case p.orden_compra_id when :'o1' then 1 when :'o2' then 2 else 3 end)
             from retail.fn_ordenes_compra_por_enviar() p where p.orden_compra_id in (:'o1', :'o2', :'o3')) as pe \\gset
   reset role;
   select concat_ws(' / ', ${LINEAS_DE("d0")}, (:'d0'::jsonb -> 'envios')::text, ${LINEAS_DE("d1")},
     (select string_agg((x ->> 'sede') || ':' || (x ->> 'estado') || ':' || (x ->> 'unidades') || ':' || coalesce(x ->> 'numero_guia', '-')
                        || ':' || (x ->> 'version') || ':' || ((x ->> 'numero') ~ '^ENV-[0-9]{6}$'), ',' order by o)
        from jsonb_array_elements(:'d1'::jsonb -> 'envios') with ordinality t(x, o)),
     ${CLAVES(":'d1'::jsonb -> 'envios' -> 0")},
     ((:'d1'::jsonb -> 'envios' -> 0 ->> 'id') = (:'r2'::jsonb ->> 'despacho_id')) || ':'
       || ((:'d1'::jsonb -> 'envios' -> 1 ->> 'id') = (:'r1'::jsonb ->> 'despacho_id')),
     :'pe');`,
  "1:0/10 2:0/4 / [] / 1:7/3 2:4/0 / Tienda Trujillo:en_camino:5:G-7:1:true,Tienda Trujillo:en_camino:6:-:1:true / " +
    "despachado_en,estado,id,numero,numero_guia,sede,unidades,version / true:true / o1:3 o2:6",
);

// T. EL MISMO TOKEN -------------------------------------------------------------------------------------------------------
caso(
  "T1 el mismo token con la misma huella devuelve lo mismo y no duplica; con otros datos, error",
  `${como(FELIPE)}
   select gen_random_uuid() as tok \\gset
   select ${envia({ lineas: LINEAS(V("l1", 2)), token: ":'tok'" })} as r1 \\gset
   select ${envia({ lineas: LINEAS(V("l1", 2)), token: ":'tok'" })} as r2 \\gset
   select ${envia({ lineas: LINEAS(V("l1", 2)), guia: "'G-1'", token: ":'tok'" })} as r3 \\gset
   reset role;
   select (:'r1' = :'r2') || ',' || (select count(*) from retail.despachos where token_cliente = :'tok') || ','
     || (select sum(di.cantidad) from retail.despacho_items di where di.orden_compra_item_id = :'l1') || ',' || :'r3';`,
  "true,1,2,P0001|Ese envío ya se guardó con otros datos: recarga la pantalla",
);

// N. ANULAR EL ENVÍO ------------------------------------------------------------------------------------------------------
caso(
  "N1 anular: con motivo y la versión vista; repetido devuelve lo mismo; libera lo enviado; abierto o cerrado no; el camino no vuelve atrás",
  `${como(FELIPE)}
   select ${envia({ lineas: LINEAS(V("l1", 10)) })} as r \\gset
   reset role;
   select d.version as v from retail.despachos d where d.id = ${DID("r")} \\gset
   ${como(FELIPE)}
   select ${anula(DID("r"), ":v", "'  '")} as a0 \\gset
   select ${anula(DID("r"), ":v + 1", "'Se mandó mal'")} as a1 \\gset
   select ${anula(DID("r"), ":v", "'Se mandó mal'")} as a2 \\gset
   select ${anula(DID("r"), ":v", "'Se mandó mal'")} as a3 \\gset
   select ${anula(DID("r"), ":v", "'Otro motivo'")} as a4 \\gset
   select retail.fn_orden_compra_detalle(:'o1') as d \\gset
   select ${envia({ lineas: LINEAS(V("l1", 10)) })} as r2 \\gset
   reset role;
   update retail.despachos set estado = 'abierto', abierto_por = :'felipe_p', abierto_en = now() where id = ${DID("r2")};
   ${como(FELIPE)}
   select ${anula(DID("r2"), "2", "'No va'")} as a5 \\gset
   reset role;
   update retail.despachos set estado = 'cerrado', cerrado_por = :'felipe_p', cerrado_en = now() where id = ${DID("r2")};
   ${como(FELIPE)}
   select ${anula(DID("r2"), "3", "'No va'")} as a6 \\gset
   reset role;
   select pg_temp.intento(format('update retail.despachos set estado = %L where id = %L', 'en_camino', ${DID("r2")})) as atras \\gset
   select pg_temp.intento(format('update retail.despachos set ubicacion_destino_id = %L where id = %L', :'lim', ${DID("r2")})) as sede \\gset
   select pg_temp.intento(format('delete from retail.despacho_items where despacho_id = %L', ${DID("r2")})) as borra_linea \\gset
   select pg_temp.intento(format('delete from retail.despachos where id = %L', ${DID("r")})) as borra \\gset
   select concat_ws(' / ', :'a0', :'a1',
     (:'a2'::jsonb ->> 'estado') || ':' || (:'a2'::jsonb ->> 'version') || ':' || ((:'a2'::jsonb ->> 'numero') = (:'r'::jsonb ->> 'numero'))
       || ':' || ${CLAVES(":'a2'::jsonb")},
     :'a2' = :'a3', :'a4', ${LINEAS_DE("d")}, :'d'::jsonb -> 'envios' -> 0 ->> 'estado',
     (select d.estado || ':' || (d.anulado_por = :'felipe_p') || ':' || d.motivo_anulacion || ':' || (d.anulado_en is not null)
        from retail.despachos d where d.id = ${DID("r")}),
     :'a5', :'a6', :'atras', :'sede', :'borra_linea', :'borra',
     (select count(*) from retail.actividad a where a.accion = 'orden_compra_envio_anulado' and a.registro_id = :'o1'
         and ${limpio("a.descripcion")} = 'anuló la ENV a Tienda Trujillo (OC1): «Se mandó mal»') || ' en Actividad');`,
  [
    "P0001|Escribe por qué se anula el envío",
    "PT409|Otra persona cambió este envío mientras lo mirabas. Recarga para verlo antes de anularlo.",
    "anulado:2:true:despacho_id,estado,numero,version",
    "t",
    "P0001|Este envío ya estaba anulado",
    "1:0/10 2:0/4",
    "anulado",
    "anulado:true:Se mandó mal:true",
    "P0001|Este envío ya se abrió en la sede: no se anula",
    "P0001|Este envío ya se recibió en la sede: no se anula",
    "23514|Un envío cerrado no pasa a en camino",
    "23514|El número, la sede, quién y cuándo despachó un envío no se cambian",
    "42501|Una línea de un envío no se borra: se anula el envío",
    "42501|Un envío no se borra: se anula",
    "1 en Actividad",
  ].join(" / "),
);

// O. LA ORDEN CON ENVÍO ---------------------------------------------------------------------------------------------------
const EDITA = `pg_temp.intento(format('select * from retail.editar_orden_compra(%L, %s, %L, %L, %L, null, %L::jsonb)', :'o1', :'v', :'prov', :'tru',
  retail.fn_hoy_lima() + 7, jsonb_build_array(jsonb_build_object('categoria_id', :'cat', 'marca_id', :'marca', 'cantidad', 10, 'precio_unitario', 25.50))::text))`;
const ANULA_ORDEN = `pg_temp.intento(format('select * from retail.anular_orden_compra(%L, %s, %L)', :'o1', :'v', 'Ya no va'))`;
caso(
  "O1 con un envío vigente la orden no se edita ni se anula; anulado el envío, se anula pero sigue sin editarse",
  `select version as v from retail.ordenes_compra where id = :'o1' \\gset
   ${como(FELIPE)}
   select ${envia({ lineas: LINEAS(V("l2", 4)) })} as r \\gset
   select ${limpio(EDITA)} as edita1 \\gset
   select ${limpio(ANULA_ORDEN)} as anula1 \\gset
   reset role;
   select d.version as dv from retail.despachos d where d.id = ${DID("r")} \\gset
   ${como(FELIPE)}
   select ${anula(DID("r"), ":dv", "'No va'")} as anula_envio \\gset
   select ${limpio(EDITA)} as edita2 \\gset
   select ${ANULA_ORDEN} as anula2 \\gset
   reset role;
   select concat_ws(' / ', :'edita1', :'anula1', :'anula_envio'::jsonb ->> 'estado', :'edita2', :'anula2',
     (select estado from retail.ordenes_compra where id = :'o1'));`,
  "P0001|Esta orden ya salió en un envío (ENV): no se edita / " +
    "P0001|Esta orden tiene un envío vigente (ENV): anula primero el envío y después la orden / anulado / " +
    "P0001|Esta orden ya salió en un envío (ENV): no se edita / SIN_ERROR / anulada",
);

// L. LECTURAS DE LA SEDE --------------------------------------------------------------------------------------------------
caso(
  "L1 con Recibir la sede ve lo que está en camino (no lo anulado ni lo de otra sede) y el envío por dentro; sin módulos, 42501",
  `${como(FELIPE)}
   select ${envia({ lineas: LINEAS(V("l1", 3), V("l_o2", 2)), guia: "'T009-1'" })} as r \\gset
   select ${envia({ sede: ":'lim'", lineas: LINEAS(V("l_o2", 1)) })} as r_lim \\gset
   select ${envia({ lineas: LINEAS(V("l2", 1)) })} as r_anulado \\gset
   reset role;
   select d.version as v from retail.despachos d where d.id = ${DID("r_anulado")} \\gset
   ${como(FELIPE)}
   select ${anula(DID("r_anulado"), ":v", "'Prueba'")} \\g /dev/null
   ${rolDeMicaela("recibir")}
   ${como(MICAELA)}
   select (select string_agg(${limpio("p.numero")} || ':' || coalesce(p.numero_guia, '-') || ':' || p.lineas || ':' || p.unidades || ':'
                             || p.despachado_por || ':' || ${limpio("array_to_string(p.ordenes, ',')")} || ':'
                             || array_to_string(p.proveedores, ',') || ':' || p.version, ' | ')
             from retail.fn_envios_por_abrir(:'tru') p
            where p.id in (${DID("r")}, ${DID("r_lim")}, ${DID("r_anulado")})) as pa \\gset
   select retail.fn_envio_detalle(${DID("r")}) as det \\gset
   ${rolDeMicaela()}
   ${como(MICAELA)}
   select pg_temp.intento(format('select * from retail.fn_envios_por_abrir(%L)', :'tru')) as pa_no \\gset
   select pg_temp.intento(format('select retail.fn_envio_detalle(%L)', ${DID("r")})) as det_no \\gset
   ${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   select (select count(*) from retail.fn_envios_por_abrir(:'lim') p where p.id = ${DID("r_lim")}) as pa_oc \\gset
   reset role;
   select concat_ws(' / ', :'pa', ${CLAVES(":'det'::jsonb")},
     (:'det'::jsonb ->> 'estado') || ':' || (:'det'::jsonb -> 'sede' ->> 'nombre') || ':' || (:'det'::jsonb ->> 'numero_guia') || ':'
       || (:'det'::jsonb ->> 'despachado_por') || ':' || (:'det'::jsonb ->> 'unidades') || ':' || (:'det'::jsonb ->> 'version') || ':'
       || coalesce(:'det'::jsonb ->> 'anulado_por', '-') || ':' || ((:'det'::jsonb ->> 'numero') = (:'r'::jsonb ->> 'numero')),
     ${limpio(`(select string_agg((l ->> 'orden') || ':' || (l ->> 'posicion') || ':' || (l -> 'proveedor' ->> 'nombre') || ':'
                                 || (l ->> 'categoria') || ' · ' || (l ->> 'marca') || ' · ' || coalesce(l ->> 'descripcion', '-') || ':'
                                 || (l ->> 'cantidad') || 'x' || (l ->> 'precio_unitario'), ' | ' order by o)
                  from jsonb_array_elements(:'det'::jsonb -> 'lineas') with ordinality t(l, o))`)},
     ${CLAVES(":'det'::jsonb -> 'lineas' -> 0")},
     :'pa_no', :'det_no', :'pa_oc');`,
  [
    "ENV:T009-1:2:5:Felipe Alvarez:OC1,OC2:Proveedor Envío OC Dos,Proveedor Envío OC Prueba:1",
    "abierto_en,abierto_por,anulado_en,anulado_por,cerrado_en,cerrado_por,despachado_en,despachado_por,estado,id,lineas," +
      "motivo_anulacion,nota,numero,numero_guia,sede,unidades,version",
    "en_camino:Tienda Trujillo:T009-1:Felipe Alvarez:5:1:-:true",
    "OC1:1:Proveedor Envío OC Prueba:Polos Envío OC · Marca Envío OC · Polo básico:3x25.50 | " +
      "OC2:1:Proveedor Envío OC Dos:Polos Envío OC · Marca Envío OC · -:2x49.17",
    "cantidad,categoria,categoria_id,compra_item_id,descripcion,id,marca,marca_id,orden,orden_compra_id,orden_compra_item_id," +
      "posicion,precio_unitario,proveedor",
    "42501|Ver los envíos necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol",
    "42501|Ver un envío necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol",
    "1",
  ].join(" / "),
);

// C. DE QUIÉN ES LA DEUDA (decisión 46) Y EL COMPROBANTE DE UNA «POR REPARTIR» ---------------------------------------------
const GESTORA = (v) => `(select case c.ubicacion_gestion_id when :'tru' then 'tru' when :'lim' then 'lim' else 'otra' end || ':'
    || (select string_agg(d.cantidad || '@' || case d.ubicacion_id when :'tru' then 'tru' when :'lim' then 'lim' else 'otra' end, ',')
          from retail.compra_item_destinos d join retail.compra_items ci on ci.id = d.compra_item_id where ci.compra_id = c.id)
  from retail.compras c where c.id = (:'${v}'::jsonb ->> 'compra_id')::uuid)`;
const DEUDA_DE = (d) => `coalesce(:'${d}'::jsonb -> 'deuda_de' ->> 'nombre', 'nadie')`;
caso(
  "C1 orden hecha por un líder sin sede asignada: la «Por repartir» queda en la sede de quien registra el papel, la directo en «Llega a»; sin sede, error",
  `${rolDeMicaela("ordenes_compra")}
   ${como(MICAELA)}
   ${SIN_COMBO_COMPROBANTE}
   select retail.fn_orden_compra_detalle(:'o2') as d_mica \\gset
   select pg_temp.registra(:'o2', '950', ${LINEAS({ orden_compra_item_id: ":'l_o2'", cantidad: 6, costo_unitario: "49.17" })}) as r1 \\gset
   ${como(FELIPE)}
   ${SIN_ENCABEZADOS}
   select retail.fn_orden_compra_detalle(:'o2') as d_feli \\gset
   select retail.fn_orden_compra_detalle(:'o1') as d_o1 \\gset
   select pg_temp.registra(:'o2', '951', ${LINEAS({ orden_compra_item_id: ":'l_o2'", cantidad: 1, costo_unitario: "49.17" })}) as r2 \\gset
   select pg_temp.registra(:'o1', '952', ${LINEAS({ orden_compra_item_id: ":'l1'", cantidad: 1, costo_unitario: "25.50" })}) as r3 \\gset
   reset role;
   -- Felipe es líder sin sede asignada: su sede de partida es la tienda de su sede de Dynamic. Sin ella, no tiene desde dónde trabajar.
   update retail.ubicaciones set sede_dynamic_id = null where id = :'lim';
   ${como(FELIPE)}
   select retail.fn_orden_compra_detalle(:'o2') as d_nadie \\gset
   select pg_temp.registra(:'o2', '953', ${LINEAS({ orden_compra_item_id: ":'l_o2'", cantidad: 1, costo_unitario: "49.17" })}) as r4 \\gset
   reset role;
   set constraints all immediate;
   select concat_ws(' / ', ${DEUDA_DE("d_mica")} || ':' || ${GESTORA("r1")}, ${DEUDA_DE("d_feli")} || ':' || ${GESTORA("r2")},
     ${DEUDA_DE("d_o1")} || ':' || ${GESTORA("r3")}, ${DEUDA_DE("d_nadie")} || ':' || :'r4');`,
  "Tienda Trujillo:tru:6@tru / Tienda Lima:lim:1@lim / Tienda Trujillo:tru:1@tru / nadie:P0001|Elige desde qué sede trabajas",
);
caso(
  "C2 la deuda es de la sede de quien hizo la orden: la hace alguien de Lima y llega a Trujillo → Lima (y deuda_de lo dice); con su sede inactiva, «Llega a»",
  `reset role;
   update retail.colaboradores set ubicacion_asignada_id = :'lim' where persona_id = :'micaela_p';
   insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'micaela_p')
     returning id as o4 \\gset
   insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, cantidad, precio_unitario)
     values (:'o4', 1, :'cat', :'marca', 5, 20) returning id as l_o4 \\gset
   ${como(FELIPE)}
   select retail.fn_orden_compra_detalle(:'o4') as d1 \\gset
   select pg_temp.registra(:'o4', '960', ${LINEAS({ orden_compra_item_id: ":'l_o4'", cantidad: 5, costo_unitario: 20 })}) as r1 \\gset
   reset role;
   update retail.ubicaciones set activo = false where id = :'lim';
   ${como(FELIPE)}
   select retail.fn_orden_compra_detalle(:'o4') as d2 \\gset
   select pg_temp.registra(:'o4', '961', ${LINEAS({ orden_compra_item_id: ":'l_o4'", cantidad: 1, costo_unitario: 20 })}) as r2 \\gset
   reset role;
   set constraints all immediate;
   select concat_ws(' / ',
     ${DEUDA_DE("d1")} || ':' || ((:'d1'::jsonb -> 'deuda_de' ->> 'id') = :'lim') || ':' || ${CLAVES(":'d1'::jsonb -> 'deuda_de'")}
       || ':' || (:'d1'::jsonb -> 'destino' ->> 'nombre'),
     ${GESTORA("r1")}, ${DEUDA_DE("d2")}, ${GESTORA("r2")});`,
  "Tienda Lima:true:id,nombre:Tienda Trujillo / lim:5@lim / Tienda Trujillo / tru:1@tru",
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------
const FUNCIONES = "('crear_envio', 'anular_envio', 'fn_envios_por_abrir', 'fn_envio_detalle', 'fn_ordenes_compra_por_enviar')";
const DE_RETAIL = `from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ${FUNCIONES}`;
caso(
  "S1 una función por nombre, security definer, authenticated sí y anon no; la respuesta interna no; RLS sin políticas; tope diferido; la clave",
  `select concat_ws(',',
     (select count(*) ${DE_RETAIL}),
     (select bool_and(p.prosecdef) ${DE_RETAIL}),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) ${DE_RETAIL}),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) ${DE_RETAIL}),
     has_function_privilege('authenticated', 'retail.fn_envio_resultado(uuid)', 'execute'),
     (select string_agg(c.relname || ':' || c.relrowsecurity, ' ' order by c.relname) from pg_class c
       where c.oid in ('retail.despachos'::regclass, 'retail.despacho_items'::regclass)),
     (select count(*) from pg_policies where schemaname = 'retail' and tablename in ('despachos', 'despacho_items')),
     has_table_privilege('authenticated', 'retail.despachos', 'select'),
     (select t.tgdeferrable || ':' || t.tginitdeferred from pg_trigger t
       where t.tgrelid = 'retail.despacho_items'::regclass and t.tgname = 'despacho_items_tope'),
     (select count(*) from retail.acciones_sin_responsable where clave = 'orden_compra_envio'),
     has_function_privilege('authenticated', 'retail.fn_orden_compra_gestora(uuid)', 'execute'));`,
  "5,t,t,f,f,despacho_items:true despachos:true,0,f,true:true,1,f",
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
