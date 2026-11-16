#!/usr/bin/env node
/**
 * Pruebas de los tres candados de 20261116172000 (ADR-0655, casuística del 2026-11-16) contra el Postgres local.
 *
 * QUÉ PRUEBA.
 *   · Cesiones sin ciclo: A cede a B y B a C se puede; C cede a A no (ni por `elegir_oferta_que_queda` ni por `ceder_ofertas`), y sin el
 *     candado la caja no cobraría ninguna de las tres (el control).
 *   · La campaña que se achica: acortar sus fechas o quitarle una tienda bajo una oferta que todavía rige se rechaza; con la oferta ya
 *     terminada o desactivada, se puede (así «Repetir en 2027» sigue funcionando).
 *   · La revisión de choques toma su candado de transacción.
 *   · La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK; los disparadores diferidos se fuerzan con `set constraints all immediate`.
 *
 * USO
 *   pnpm pruebas:ofertas-candados
 *   pnpm pruebas:ofertas-candados -- --base otra --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const arg = (n, d) => (process.argv.indexOf(n) > 0 ? process.argv[process.argv.indexOf(n) + 1] : d);
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const MIGRACION = "supabase/migrations/20261116172000_ofertas_candados_ciclo_y_campana.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

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
if (correr("select to_regclass('retail.campana_regla_cesiones') is null;").salida === "t") {
  console.error("La base no tiene las ofertas de ADR-0655 (20261113223000 en adelante): aplica las migraciones antes.");
  process.exit(2);
}
const MIG = readFileSync(MIGRACION, "utf8");
const CON_MIGRACION = correr("select to_regprocedure('retail.fn_cesion_hace_ciclo(uuid, uuid)') is null;").salida === "t" ? MIG : "";

const HOY = "retail.fn_hoy_lima()";
const PARTIDA = `begin;
${CON_MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
select id as u from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as t from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select v.id as a1, p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Candados (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 30, array[:'cat']::uuid[]);
`;
const PCT = (pct, v, { activar = false, hasta = `${HOY} + 20`, sedes = "'{}'::uuid[]" } = {}) =>
  `select retail.guardar_oferta_completa(null, :'camp', 'ZZ ${v}', '{"tipo":"pct","porcentaje":${pct}}'::jsonb, ${HOY}, ${hasta}, null,
     '{}'::uuid[], '{}'::uuid[], false, ${sedes}, '{}'::uuid[], '{}'::uuid[], ${activar}) as ${v} \\gset\n`;
const TRES = `${PCT(10, "ra")}${PCT(20, "rb")}${PCT(30, "rc")}`;
const caso = (cuerpo) => correr(`${PARTIDA}${cuerpo}rollback;`);
const CAJA = `select coalesce((select string_agg(descuento_pct::text, ',') from retail.fn_campanas_en_sede(${HOY}, 0, array[:'a1']::uuid[], :'u')), 'ninguna');\n`;

console.log("\n— Cesiones sin ciclo —");
esperarValor(
  "un orden sin ciclo (A cede a B y a C, B cede a C) se puede, y la caja cobra la que gana: −30 %",
  caso(`${TRES}select retail.elegir_oferta_que_queda(:'rb', :'ra'); select retail.elegir_oferta_que_queda(:'rc', :'rb');
select retail.elegir_oferta_que_queda(:'rc', :'ra');
select retail.activar_campana_regla(:'ra'); select retail.activar_campana_regla(:'rb'); select retail.activar_campana_regla(:'rc');
set constraints all immediate;
${CAJA}`),
  "30.00",
);
esperarError(
  "cerrar el ciclo (C cede a A) desde el aviso «elige cuál queda» se rechaza",
  caso(`${TRES}select retail.elegir_oferta_que_queda(:'rb', :'ra'); select retail.elegir_oferta_que_queda(:'rc', :'rb');
select retail.elegir_oferta_que_queda(:'ra', :'rc');`),
  "cediéndose en círculo",
);
esperarError(
  "…y desde la hoja de la oferta («que estas cedan»)",
  caso(`${TRES}select retail.elegir_oferta_que_queda(:'rb', :'ra'); select retail.elegir_oferta_que_queda(:'rc', :'rb');
select retail.ceder_ofertas(:'ra', array[:'rc']::uuid[]);`),
  "cediéndose en círculo",
);
esperarError(
  "…y escribiendo directo en la tabla",
  caso(`${TRES}insert into retail.campana_regla_cesiones (cede_regla_id, gana_regla_id) values (:'ra', :'rb'), (:'rb', :'rc'), (:'rc', :'ra');`),
  "oferta_ciclo",
);
esperarValor(
  "CONTROL: sin el candado, el ciclo entra y la caja no cobra ninguna de las tres",
  caso(`${TRES}alter table retail.campana_regla_cesiones disable trigger campana_regla_cesiones_sin_ciclo;
select retail.elegir_oferta_que_queda(:'rb', :'ra'); select retail.elegir_oferta_que_queda(:'rc', :'rb'); select retail.elegir_oferta_que_queda(:'ra', :'rc');
select retail.activar_campana_regla(:'ra'); select retail.activar_campana_regla(:'rb'); select retail.activar_campana_regla(:'rc');
set constraints all immediate;
${CAJA}`),
  "ninguna",
);

console.log("\n— La campaña que se achica —");
esperarError(
  "acortar la campaña bajo una oferta activa se rechaza, con el nombre de la oferta",
  caso(`${PCT(15, "r", { activar: true })}set constraints all immediate;
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
set constraints all immediate;`),
  "su oferta «ZZ r» sigue hasta",
);
esperarError(
  "…también bajo un borrador (al activarlo regiría fuera)",
  caso(`${PCT(15, "r")}select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
set constraints all immediate;`),
  "oferta_fuera_de_campana",
);
esperarValor(
  "acortarla hasta donde llega la oferta se puede",
  caso(`${PCT(15, "r", { activar: true })}select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 20, array[:'cat']::uuid[]);
set constraints all immediate; select 'ok';`),
  "ok",
);
esperarValor(
  "con la oferta desactivada, se puede",
  caso(`${PCT(15, "r", { activar: true })}select retail.retirar_campana_regla(:'r');
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
set constraints all immediate; select 'ok';`),
  "ok",
);
esperarValor(
  "con la oferta ya terminada, se puede mover la campaña a otro año («Repetir en 2027»)",
  caso(`${PCT(15, "r", { activar: true })}set constraints all immediate;
update retail.campana_reglas set desde = ${HOY} - 20, hasta = ${HOY} - 5 where id = :'r';
update retail.etiquetas set vigente_desde = ${HOY} + 340, vigente_hasta = ${HOY} + 370 where id = :'camp';
set constraints all immediate; select 'ok';`),
  "ok",
);
esperarError(
  "quitarle a la campaña la tienda de una oferta se rechaza",
  caso(`select retail.actualizar_campana_etiqueta_con_sedes(:'camp', null, ${HOY} - 1, ${HOY} + 30, array[:'cat']::uuid[], array[:'u', :'t']::uuid[]);
${PCT(15, "r", { activar: true, sedes: "array[:'t']::uuid[]" })}set constraints all immediate;
select retail.actualizar_campana_etiqueta_con_sedes(:'camp', null, ${HOY} - 1, ${HOY} + 30, array[:'cat']::uuid[], array[:'u']::uuid[]);
set constraints all immediate;`),
  "ya no regiría en Tienda Trujillo",
);
esperarValor(
  "una oferta sin tiendas propias no frena que la campaña elija tiendas (rige donde rija la campaña)",
  caso(`${PCT(15, "r", { activar: true })}
select retail.actualizar_campana_etiqueta_con_sedes(:'camp', null, ${HOY} - 1, ${HOY} + 30, array[:'cat']::uuid[], array[:'u']::uuid[]);
set constraints all immediate; select 'ok';`),
  "ok",
);

console.log("\n— Dos activaciones a la vez —");
esperar(
  "la revisión de choques toma el candado de transacción",
  /pg_advisory_xact_lock\(hashtext\('retail\.campana_reglas_choques'\)\)/.test(
    correr("select pg_get_functiondef('retail.fn_exigir_sin_choques'::regproc);").salida ?? "",
  ) || CON_MIGRACION !== "",
);

console.log("\n— La migración —");
esperarValor("se puede pegar dos veces", correr(`begin;\n${MIG}\n${MIG}\nselect 'ok';\nrollback;`), "ok");

console.log(`\n${total - fallos} de ${total} en verde.`);
process.exit(fallos ? 1 : 0);
