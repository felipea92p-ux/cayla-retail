#!/usr/bin/env node
/**
 * Pruebas de «Poner un %» (20261116182000, ADR-0669, Felipe 2026-11-16) contra el Postgres local.
 *
 * QUÉ PRUEBA.
 *   · Poner un % nuevo crea su cajón (uno por % y tienda) y la caja lo cobra en esa tienda y no en otra; el mismo % lo reusa.
 *   · «Solo esta prenda» marca una talla de un color; «todo el modelo», todas las del modelo.
 *   · Una prenda, un lugar: ponerla en otro % la saca del anterior (cajón o campaña de esa misma tienda) y la caja cobra el nuevo; una
 *     campaña que rige en todas las tiendas no se toca y la caja cobra el mayor (y la hoja lo dice: «movible» falso).
 *   · Quitar la saca de los lugares movibles.
 *   · Los candados: % de 1 a 70, un lugar que no rige en la tienda, «todas las tiendas» solo un líder, sin el módulo no se puede.
 *   · Lo que lee la pantalla: la prenda, lo que tiene y de dónde, los lugares con sus prendas, y las prendas de un lugar.
 *   · CONTROL: sin sacarla del lugar anterior, la prenda quedaría en dos (la prueba ve la diferencia).
 *   · La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK; nada más rige dentro del escenario (se apagan las demás campañas con descuento).
 *
 * USO
 *   pnpm pruebas:rebaja-rapida
 *   pnpm pruebas:rebaja-rapida -- --base otra --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const arg = (n, d) => (process.argv.indexOf(n) > 0 ? process.argv[process.argv.indexOf(n) + 1] : d);
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const MIGRACION = "supabase/migrations/20261116182000_rebaja_rapida_por_prenda.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante

function correr(sql) {
  try {
    const salida = execFileSync(
      "docker",
      ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
      { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
    );
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
let total = 0;
let fallos = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 6).join("\n    ")}`);
  }
}
const ultima = (r) => (r.ok ? (r.salida.split("\n").filter(Boolean).at(-1) ?? "") : "");
const esperarValor = (nombre, r, esperado) => esperar(nombre, r.ok && ultima(r) === esperado, r.ok ? `dio «${ultima(r)}», se esperaba «${esperado}»` : r.mensaje);
const esperarError = (nombre, r, contiene) => esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `pasó y debía fallar con «${contiene}»` : r.mensaje);

if (!correr("select 1;").ok) {
  console.error(`No hay Postgres local en ${CONTENEDOR}/${BASE}. Levántalo con: npx supabase start`);
  process.exit(2);
}
const MIG = readFileSync(MIGRACION, "utf8");
const FALTA = correr("select to_regprocedure('retail.poner_rebaja(uuid, text, numeric, uuid, uuid, boolean)') is null;").salida === "t" ? MIG : "";
// La lista de descuentos de la pantalla nueva (20261118001000, ADR-0677).
const MIG_DESCUENTOS = readFileSync("supabase/migrations/20261118001000_campanas_descuentos.sql", "utf8");
const FALTA_DESCUENTOS = correr("select to_regprocedure('retail.campanas_descuentos(uuid)') is null;").salida === "t" ? MIG_DESCUENTOS : "";
// Dónde está cada talla antes de agregarla (20261118010000, ADR-0677): lo que usa «Deshacer».
const MIG_VARIANTES = readFileSync("supabase/migrations/20261118010000_campanas_rebaja_de_variantes.sql", "utf8");
const FALTA_VARIANTES = correr("select to_regprocedure('retail.campanas_rebaja_de_variantes(uuid[], uuid, boolean)') is null;").salida === "t" ? MIG_VARIANTES : "";
// Nuevo descuento, cambiar el % y desactivar (20261118030000, ADR-0677).
const MIG_MENU = readFileSync("supabase/migrations/20261118030000_descuentos_crear_cambiar_desactivar.sql", "utf8");
const FALTA_MENU = correr("select to_regprocedure('retail.desactivar_descuento(uuid, uuid, boolean)') is null;").salida === "t" ? MIG_MENU : "";

const HOY = "retail.fn_hoy_lima()";
const PARTIDA = (quien = FELIPE) => `begin;
${FALTA}
${FALTA_DESCUENTOS}
${FALTA_VARIANTES}
${FALTA_MENU}
-- Nada más rige: sin otras campañas con descuento ni ofertas.
update retail.etiquetas set descuento_pct = null where descuento_pct is not null;
-- Ni cajones de antes: el escenario parte de una tienda sin «Poner un %» (una base de trabajo puede tenerlos). Va dentro de la
-- transacción del escenario, que termina en ROLLBACK: no se borra nada de verdad.
-- Sus campañas se apartan con otro nombre (el cajón nuevo se llama igual) en vez de borrarse.
update retail.etiquetas e set nombre = e.nombre || ' · antes de la prueba', activo = false from retail.rebaja_cajones c where c.etiqueta_id = e.id;
delete from retail.variante_etiquetas ve using retail.rebaja_cajones c where ve.etiqueta_id = c.etiqueta_id;
delete from retail.rebaja_cajones;
update retail.campana_reglas set estado = 'desactivada' where estado <> 'desactivada';
set local request.jwt.claim.sub = '${quien}';
select id as u from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as t from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select v.id as a1, v.producto_id as modelo from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
select count(*) as n_modelo from retail.variantes v where v.producto_id = :'modelo' and v.activo \\gset
`;
const caso = (cuerpo, quien) => correr(`${PARTIDA(quien)}${cuerpo}rollback;`);
const CAJA = (sede = "u") =>
  `select coalesce((select max(c.descuento_pct)::text from retail.fn_campanas_en_sede(${HOY}, 0, array[:'a1']::uuid[], :'${sede}') c), 'nada');\n`;
const PONER = (pct, alcance = "modelo", destino = "null", todas = "false", sede = "u") =>
  `select retail.poner_rebaja(:'a1', '${alcance}', ${pct}, ${destino}, :'${sede}', ${todas});\n`;
// Una campaña con descuento de siempre en Lima (como «Para liquidar»), y otra en todas las tiendas.
const EN_LIMA = (pct, v = "lima") => `insert into retail.etiquetas (nombre, estilo, descuento_pct) values ('ZZ Liquidar ${v}', 'campana', ${pct}) returning id as ${v} \\gset
insert into retail.campana_sedes (etiqueta_id, ubicacion_id) values (:'${v}', :'u');
`;
const EN_TODAS = (pct, v = "todas") => `insert into retail.etiquetas (nombre, estilo, descuento_pct) values ('ZZ Top ${v}', 'campana', ${pct}) returning id as ${v} \\gset
`;

console.log("\n— Poner un % —");
esperarValor(
  "un % nuevo crea su cajón y la caja lo cobra en Lima",
  caso(`${PONER(20)}${CAJA()}`),
  "20.00",
);
esperarValor("…y no en Trujillo", caso(`${PONER(20)}${CAJA("t")}`), "nada");
esperarValor(
  "«todo el modelo» marca todas sus prendas a la venta",
  caso(`${PONER(20)}select (select count(*) from retail.variante_etiquetas ve join retail.rebaja_cajones c on c.etiqueta_id = ve.etiqueta_id) = :'n_modelo'::int;\n`),
  "t",
);
esperarValor(
  "«solo esta prenda» marca una sola",
  caso(`${PONER(20, "prenda")}select count(*) from retail.variante_etiquetas ve join retail.rebaja_cajones c on c.etiqueta_id = ve.etiqueta_id;\n`),
  "1",
);
esperarValor(
  "el mismo % en la misma tienda reusa su cajón",
  caso(`${PONER(20, "prenda")}${PONER(20, "modelo")}select count(*) from retail.rebaja_cajones where pct = 20;\n`),
  "1",
);
esperarValor(
  "un cajón apagado vuelve a encenderse al usarlo",
  caso(`${PONER(20, "prenda")}update retail.etiquetas set activo = false where id = (select etiqueta_id from retail.rebaja_cajones where pct = 20);
${PONER(20, "prenda")}${CAJA()}`),
  "20.00",
);

console.log("\n— Una prenda, un lugar —");
esperarValor(
  "ponerla a −30 % la saca del cajón de −20 % y la caja cobra 30",
  caso(`${PONER(20)}${PONER(30)}select (select count(*) from retail.variante_etiquetas ve join retail.rebaja_cajones c on c.etiqueta_id = ve.etiqueta_id and c.pct = 20) || ':' || coalesce((select max(c.descuento_pct)::text from retail.fn_campanas_en_sede(${HOY}, 0, array[:'a1']::uuid[], :'u') c), 'nada');\n`),
  "0:30.00",
);
esperarValor(
  "una campaña de Lima con su % es un lugar: se suma ahí, y al ponerla en otro % sale de ella",
  caso(`${EN_LIMA(15)}${PONER("null", "modelo", ":'lima'")}${CAJA()}${PONER(20)}select (select count(*) from retail.variante_etiquetas where etiqueta_id = :'lima') || ':' || coalesce((select max(c.descuento_pct)::text from retail.fn_campanas_en_sede(${HOY}, 0, array[:'a1']::uuid[], :'u') c), 'nada');\n`),
  "0:20.00",
);
esperarValor(
  "una campaña de todas las tiendas no se toca (Arequipa no pierde su %): la caja cobra el mayor",
  caso(`${EN_TODAS(25)}insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'a1', :'todas');
${PONER(20)}select (select count(*) from retail.variante_etiquetas where etiqueta_id = :'todas') || ':' || coalesce((select max(c.descuento_pct)::text from retail.fn_campanas_en_sede(${HOY}, 0, array[:'a1']::uuid[], :'u') c), 'nada');\n`),
  "1:25.00",
);
esperarValor(
  "…y la hoja lo dice: esa campaña llega a mano pero no se mueve desde Lima",
  caso(`${EN_TODAS(25)}insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'a1', :'todas');
select string_agg((x ->> 'pct') || ':' || (x ->> 'como') || ':' || (x ->> 'movible'), ',') from jsonb_array_elements(retail.campanas_rebaja_de_prenda(:'a1', :'u') -> 'tiene') x;\n`),
  "25.00:a_mano:false",
);
esperarValor(
  "CONTROL: sin sacarla del lugar anterior, quedaría en dos (−20 y −30)",
  caso(`${PONER(20)}${PONER(30)}insert into retail.variante_etiquetas (variante_id, etiqueta_id) select :'a1', etiqueta_id from retail.rebaja_cajones where pct = 20;
select count(*) from retail.fn_campanas_en_sede(${HOY}, 0, array[:'a1']::uuid[], :'u');\n`),
  "2",
);

console.log("\n— Quitar —");
esperarValor(
  "quitar saca la prenda de los lugares movibles y la caja ya no la rebaja",
  caso(`${PONER(20)}select retail.quitar_rebaja(:'a1', 'modelo', :'u', false);\n${CAJA()}`),
  "nada",
);
esperarValor(
  "quitar «solo esta prenda» deja al resto del modelo",
  caso(`${PONER(20)}select retail.quitar_rebaja(:'a1', 'prenda', :'u', false);
select (select count(*) from retail.variante_etiquetas ve join retail.rebaja_cajones c on c.etiqueta_id = ve.etiqueta_id) = :'n_modelo'::int - 1;\n`),
  "t",
);

console.log("\n— Los candados —");
esperarError("71 % no", caso(PONER(71)), "va de 1 a 70");
esperarError("0 % no", caso(PONER(0)), "va de 1 a 70");
esperarError(
  "un lugar que no rige en esta tienda no",
  caso(`insert into retail.etiquetas (nombre, estilo, descuento_pct) values ('ZZ Solo Trujillo', 'campana', 15) returning id as tru \\gset
insert into retail.campana_sedes (etiqueta_id, ubicacion_id) values (:'tru', :'t');
${PONER("null", "modelo", ":'tru'")}`),
  "ya no rige en esta tienda",
);
esperarError("sin elegir a qué va, no", caso(PONER(20, "talla")), "Elige si va solo a esta prenda");
esperarValor("un líder puede ponerlo en todas las tiendas", caso(`${PONER(20, "modelo", "null", "true")}${CAJA("t")}`), "20.00");
esperarError("sin ver Campañas y ofertas, no", caso(PONER(20), MICAELA), "rebaja_sin_modulo");
esperarError(
  "con el módulo, una integrante no pone en todas las tiendas",
  correr(`begin;\n${FALTA}\ninsert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'campanas' from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${MICAELA}' on conflict do nothing;
set local request.jwt.claim.sub = '${MICAELA}';
select id as u from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as a1 from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
${PONER(20, "modelo", "null", "true")}rollback;`),
  "rebaja_todas_solo_lider",
);

console.log("\n— Lo que lee la pantalla —");
esperarValor(
  "la prenda: su modelo, su precio en la tienda y el piso para no perder",
  caso(`select (p ->> 'referencia') || ':' || (p ->> 'modelo_prendas') || ':' || ((p ->> 'precio')::numeric > 0) || ':' || ((p ->> 'piso_sin_perder') is not null)
from (select retail.campanas_rebaja_de_prenda(:'a1', :'u') -> 'prenda' as p) x;\n`),
  `Blusa Emma:${correr("select count(*) from retail.variantes v where v.producto_id = (select producto_id from retail.variantes where sku = 'BLU-EMMA-NEG-M') and v.activo;").salida}:true:true`,
);
esperarValor(
  "los lugares de la tienda, con cuántas prendas (modelo en su color)",
  caso(`${EN_LIMA(15)}${PONER(20)}select string_agg(pct::text || ':' || es_cajon || ':' || movible || ':' || prendas, ',' order by pct) from retail.campanas_rebajas_de_tienda(:'u');\n`),
  `15.00:false:true:0,20.00:true:true:${correr("select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = (select producto_id from retail.variantes where sku = 'BLU-EMMA-NEG-M') and v.activo;").salida}`,
);
esperarValor(
  "una campaña que llega por categoría cuenta también esas prendas (antes decía «0 prendas»)",
  caso(`${EN_LIMA(15)}insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) select :'lima', p.categoria_id from retail.productos p where p.id = :'modelo';
select (por_categoria and prendas > 0)::text from retail.campanas_rebajas_de_tienda(:'u') where etiqueta_id = :'lima';\n`),
  "true",
);
esperarValor(
  "las prendas de un lugar, para verlas y quitarlas",
  caso(`${PONER(20, "prenda")}select string_agg(referencia || ' ' || coalesce(talla, ''), ',') from retail.campanas_rebaja_prendas((select etiqueta_id from retail.rebaja_cajones where pct = 20), :'u');\n`),
  "Blusa Emma M",
);

console.log("\n— Los descuentos de la lista (ADR-0677) —");
const COLORES_DEL_MODELO = correr("select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = (select producto_id from retail.variantes where sku = 'BLU-EMMA-NEG-M') and v.activo;").salida;
const DESCUENTOS = (sede = "u") =>
  `select string_agg(pct::text || ':' || todas || ':' || rige_aqui || ':' || activo || ':' || prendas, ',' order by pct, todas) from retail.campanas_descuentos(:'${sede}');\n`;
esperarValor(
  "el −20 % de Lima y el de todas las tiendas son dos filas, y la de todas lo dice",
  caso(`${PONER(20)}${PONER(20, "modelo", "null", "true")}${DESCUENTOS()}`),
  `20.00:false:true:true:${COLORES_DEL_MODELO},20.00:true:true:true:${COLORES_DEL_MODELO}`,
);
esperarValor(
  "el descuento de otra tienda también sale (para no dibujarlo como campaña), pero no rige aquí ni cuenta prendas",
  caso(`${PONER(30, "modelo", "null", "false", "t")}${DESCUENTOS()}`),
  "30.00:false:false:true:0",
);
esperarValor("…y en su tienda sí rige", caso(`${PONER(30, "modelo", "null", "false", "t")}${DESCUENTOS("t")}`), `30.00:false:true:true:${COLORES_DEL_MODELO}`);
esperarValor(
  "un descuento apagado sale apagado y sin prendas",
  caso(`${PONER(20)}update retail.etiquetas set activo = false where id = (select etiqueta_id from retail.rebaja_cajones where pct = 20);\n${DESCUENTOS()}`),
  "20.00:false:true:false:0",
);
esperarValor("una campaña con su % no es un descuento: no sale", caso(`${EN_LIMA(15)}${DESCUENTOS()}`), "");
esperarError("sin ver Campañas y ofertas, no", caso(DESCUENTOS(), MICAELA), "rebaja_sin_modulo");

console.log("\n— Dónde está cada talla antes de agregarla (ADR-0677) —");
const DONDE = (variantes = "array[:'a1']::uuid[]", sede = "u", todas = "false") =>
  `select coalesce(string_agg(coalesce((select c.pct::text from retail.rebaja_cajones c where c.etiqueta_id = x.etiqueta_id), (select e.nombre from retail.etiquetas e where e.id = x.etiqueta_id)), ','), 'ninguno') from retail.campanas_rebaja_de_variantes(${variantes}, :'${sede}', ${todas}) x;\n`;
esperarValor("una talla sin % no está en ningún lugar", caso(DONDE()), "ninguno");
esperarValor("una talla en el −20 % de Lima dice ese cajón", caso(`${PONER(20, "prenda")}${DONDE()}`), "20.00");
esperarValor(
  "una talla en una campaña de Lima con su % dice esa campaña (es un lugar movible)",
  caso(`${EN_LIMA(15)}${PONER("null", "prenda", ":'lima'")}${DONDE()}`),
  "ZZ Liquidar lima",
);
esperarValor(
  "una campaña de todas las tiendas no es un lugar movible desde Lima: no sale",
  caso(`${EN_TODAS(25)}insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'a1', :'todas');\n${DONDE()}`),
  "ninguno",
);
esperarValor(
  "…y mirando «todas las tiendas» (un líder), sí",
  caso(`${EN_TODAS(25)}insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'a1', :'todas');\n${DONDE("array[:'a1']::uuid[]", "u", "true")}`),
  "ZZ Top todas",
);
const N_MODELO = () => TALLAS_DEL_MODELO;
const TALLAS_DEL_MODELO = Number(correr("select count(*) from retail.variantes v where v.producto_id = (select producto_id from retail.variantes where sku = 'BLU-EMMA-NEG-M') and v.activo;").salida);
esperarValor(
  "cada talla del modelo dice el suyo: todo el modelo a −20 %, una talla a −30 % (es lo que necesita «Deshacer»)",
  caso(`${PONER(20, "modelo")}${PONER(30, "prenda")}select string_agg(x, ',' order by x) from (
  select (select c.pct::text from retail.rebaja_cajones c where c.etiqueta_id = d.etiqueta_id) || ':' || count(*) as x
  from retail.campanas_rebaja_de_variantes((select array_agg(v.id) from retail.variantes v where v.producto_id = :'modelo' and v.activo), :'u', false) d
  group by d.etiqueta_id) y;\n`),
  `20.00:${TALLAS_DEL_MODELO - 1},30.00:1`,
);
esperarError("sin ver Campañas y ofertas, no", caso(DONDE(), MICAELA), "rebaja_sin_modulo");

console.log("\n— Nuevo, cambiar el % y desactivar (ADR-0677) —");
const CREAR = (pct, todas = "false", sede = "u") => `select retail.crear_descuento(${pct}, :'${sede}', ${todas}) as r \\gset\n`;
const ID_DE = (pct, sede = ":'u'") => `(select c.etiqueta_id from retail.rebaja_cajones c where c.pct = ${pct} and c.ubicacion_id is not distinct from ${sede})`;
esperarValor(
  "«Nuevo descuento» crea su cajón vacío y encendido; la segunda vez devuelve el mismo",
  caso(`${CREAR(25)}select (:'r'::jsonb ->> 'ya_existia') || ':' || (select count(*) from retail.rebaja_cajones where pct = 25) || ':' || (select count(*) from retail.variante_etiquetas where etiqueta_id = ${ID_DE(25)}) || ':' || (select retail.crear_descuento(25, :'u', false) ->> 'ya_existia');\n`),
  "false:1:0:true",
);
esperarValor(
  "un descuento apagado se enciende al crearlo otra vez, sin las prendas que tenía",
  caso(`${PONER(20)}select retail.desactivar_descuento(${ID_DE(20)}, :'u', false);\n${CREAR(20)}select (:'r'::jsonb ->> 'ya_existia') || ':' || (select e.activo from retail.etiquetas e where e.id = ${ID_DE(20)}) || ':' || (${CAJA().trim().replace(/;$/, "")});\n`),
  "false:true:nada",
);
esperarValor(
  "cambiar el % sin otro igual: el mismo descuento pasa a −25 %, cambia su nombre y la caja cobra 25",
  caso(`${PONER(20)}select retail.cambiar_pct_de_descuento(${ID_DE(20)}, 25, :'u', false) as r \\gset
select (:'r'::jsonb ->> 'juntado') || ':' || (position('25 %' in (select e.nombre from retail.etiquetas e where e.id = (:'r'::jsonb ->> 'etiqueta_id')::uuid)) > 0)::text || ':' || (${CAJA().trim().replace(/;$/, "")});\n`),
  "false:true:25.00",
);
esperarValor(
  "cambiar a un % que ya existe JUNTA las prendas ahí (Felipe 2026-11-17): el de antes se apaga vacío y la caja cobra el nuevo",
  caso(`${PONER(20)}${CREAR(30)}select retail.cambiar_pct_de_descuento(${ID_DE(20)}, 30, :'u', false) as r \\gset
select (:'r'::jsonb ->> 'juntado') || ':' || jsonb_array_length(:'r'::jsonb -> 'movidas') || ':' || (select count(*) from retail.variante_etiquetas where etiqueta_id = ${ID_DE(30)}) || ':' || (select e.activo from retail.etiquetas e where e.id = ${ID_DE(20)}) || ':' || (${CAJA().trim().replace(/;$/, "")});\n`),
  `true:${N_MODELO()}:${N_MODELO()}:false:30.00`,
);
esperarValor(
  "…y «Deshacer» las devuelve al −20 % (lo enciende otra vez) de una sola llamada",
  caso(`${PONER(20)}${CREAR(30)}select retail.cambiar_pct_de_descuento(${ID_DE(20)}, 30, :'u', false) as r \\gset
select retail.poner_rebaja_varias(array(select jsonb_array_elements_text(:'r'::jsonb -> 'movidas')::uuid), 20, null, :'u', false);
select (select count(*) from retail.variante_etiquetas where etiqueta_id = ${ID_DE(20)}) || ':' || (select count(*) from retail.variante_etiquetas where etiqueta_id = ${ID_DE(30)}) || ':' || (${CAJA().trim().replace(/;$/, "")});\n`),
  `${N_MODELO()}:0:20.00`,
);
esperarValor(
  "desactivar: sus prendas vuelven a su precio y el descuento se apaga (Felipe 2026-11-17)",
  caso(`${PONER(20)}select retail.desactivar_descuento(${ID_DE(20)}, :'u', false) as r \\gset
select jsonb_array_length(:'r'::jsonb -> 'quitadas') || ':' || (select e.activo from retail.etiquetas e where e.id = ${ID_DE(20)}) || ':' || (${CAJA().trim().replace(/;$/, "")});\n`),
  `${N_MODELO()}:false:nada`,
);
esperarValor(
  "…y «Deshacer» devuelve todas sus tallas al −20 %",
  caso(`${PONER(20)}select retail.desactivar_descuento(${ID_DE(20)}, :'u', false) as r \\gset
select retail.poner_rebaja_varias(array(select jsonb_array_elements_text(:'r'::jsonb -> 'quitadas')::uuid), 20, null, :'u', false);
select (select count(*) from retail.variante_etiquetas where etiqueta_id = ${ID_DE(20)}) || ':' || (select e.activo from retail.etiquetas e where e.id = ${ID_DE(20)}) || ':' || (${CAJA().trim().replace(/;$/, "")});\n`),
  `${N_MODELO()}:true:20.00`,
);
esperarValor(
  "CONTROL: apagar sin sacar sus prendas las volvería a rebajar todas al encender otra vez ese %",
  caso(`${PONER(20)}update retail.etiquetas set activo = false where id = ${ID_DE(20)};\n${CREAR(20)}${CAJA()}`),
  "20.00",
);
esperarError("un % de 71 no", caso(CREAR(71)), "va de 1 a 70");
esperarError("cambiar a 0 % no", caso(`${PONER(20)}select retail.cambiar_pct_de_descuento(${ID_DE(20)}, 0, :'u', false);\n`), "va de 1 a 70");
esperarError(
  "desactivar desde Lima el descuento de Trujillo no",
  caso(`${PONER(30, "modelo", "null", "false", "t")}select retail.desactivar_descuento(${ID_DE(30, ":'t'")}, :'u', false);\n`),
  "ya no está en esta tienda",
);
esperarError("un descuento ya apagado no se desactiva otra vez", caso(`${PONER(20)}select retail.desactivar_descuento(${ID_DE(20)}, :'u', false);\nselect retail.desactivar_descuento(${ID_DE(20)}, :'u', false);\n`), "ya no está en esta tienda");
esperarError("sin ver Campañas y ofertas, no se crea", caso(CREAR(25), MICAELA), "rebaja_sin_modulo");
esperarError("poner varias con una que no existe falla entera", caso(`select retail.poner_rebaja_varias(array[:'a1', gen_random_uuid()], 20, null, :'u', false);\n`), "Esa prenda no existe");

console.log("\n— La migración —");
esperarValor("se puede pegar dos veces", correr(`begin;\n${MIG}\n${MIG}\nselect 'ok';\nrollback;`), "ok");
esperarValor("la de los descuentos se puede pegar dos veces", correr(`begin;\n${MIG_DESCUENTOS}\n${MIG_DESCUENTOS}\nselect 'ok';\nrollback;`), "ok");
esperarValor("la del menú del descuento se puede pegar dos veces", correr(`begin;\n${MIG_MENU}\n${MIG_MENU}\nselect 'ok';\nrollback;`), "ok");
esperarValor("la de dónde está cada talla se puede pegar dos veces", correr(`begin;\n${MIG_VARIANTES}\n${MIG_VARIANTES}\nselect 'ok';\nrollback;`), "ok");

console.log(`\n${total - fallos} de ${total} en verde.`);
process.exit(fallos ? 1 : 0);
