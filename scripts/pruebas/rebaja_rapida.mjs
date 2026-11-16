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

const HOY = "retail.fn_hoy_lima()";
const PARTIDA = (quien = FELIPE) => `begin;
${FALTA}
-- Nada más rige: sin otras campañas con descuento ni ofertas.
update retail.etiquetas set descuento_pct = null where descuento_pct is not null;
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
select string_agg((x ->> 'pct') || ':' || (x ->> 'como') || ':' || (x ->> 'movible'), ',') from jsonb_array_elements(retail.rebaja_de_prenda(:'a1', :'u') -> 'tiene') x;\n`),
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
from (select retail.rebaja_de_prenda(:'a1', :'u') -> 'prenda' as p) x;\n`),
  `Blusa Emma:${correr("select count(*) from retail.variantes v where v.producto_id = (select producto_id from retail.variantes where sku = 'BLU-EMMA-NEG-M') and v.activo;").salida}:true:true`,
);
esperarValor(
  "los lugares de la tienda, con cuántas prendas (modelo en su color)",
  caso(`${EN_LIMA(15)}${PONER(20)}select string_agg(pct::text || ':' || es_cajon || ':' || movible || ':' || prendas, ',' order by pct) from retail.rebajas_de_tienda(:'u');\n`),
  `15.00:false:true:0,20.00:true:true:${correr("select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = (select producto_id from retail.variantes where sku = 'BLU-EMMA-NEG-M') and v.activo;").salida}`,
);
esperarValor(
  "las prendas de un lugar, para verlas y quitarlas",
  caso(`${PONER(20, "prenda")}select string_agg(referencia || ' ' || coalesce(talla, ''), ',') from retail.rebaja_cajon_prendas((select etiqueta_id from retail.rebaja_cajones where pct = 20), :'u');\n`),
  "Blusa Emma M",
);

console.log("\n— La migración —");
esperarValor("se puede pegar dos veces", correr(`begin;\n${MIG}\n${MIG}\nselect 'ok';\nrollback;`), "ok");

console.log(`\n${total - fallos} de ${total} en verde.`);
process.exit(fallos ? 1 : 0);
