#!/usr/bin/env node
/**
 * Tienda web ▸ Campañas, actividad 1 (ADR-0436) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261017144000_campanas_modulo_y_portada_por_dia.sql`:
 *   1. LA regla de la portada (`fn_campana_en_portada`): ese día, la campaña aprobada, activa, con descuento, vigente y con prendas o
 *      categorías que termina primero; a igual fin, la de mayor descuento. Una sin prendas, sin descuento, desactivada o por aprobar no
 *      sale; fuera de sus fechas, tampoco; sin ninguna, null.
 *   2. La tienda pregunta lo mismo: `tienda_portada()` nombra la campaña de `fn_campana_en_portada(hoy)`, con su % y su fin.
 *   3. `campanas_portada_dias`: un día por fila, con la misma regla; no acepta un rango al revés ni de más de 400 días.
 *   4. `campanas_lista`: solo las de estilo campaña, sin las rechazadas y con las desactivadas; cuenta modelos, variantes y categorías.
 *   5. Quién: el líder; una colaboradora sin el módulo «Campañas» no lee nada (42501); con el módulo en su rol, sí. `authenticated` no
 *      llama a la regla directo, y `tienda_web` lee `tienda_portada` pero no las funciones del ERP.
 *   6. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK: nunca se commitea nada. La sesión se simula con
 * `request.jwt.claim.sub`. `APLICAR_ANTES=<migración>` la mete dentro de cada transacción (que se revierte); sin la variable, prueba
 * lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO (el seed): a Felipe como líder, a Micaela como colaboradora (rol «Integrante», sin «Campañas»), alguna variante y
 * alguna categoría activas, y el rol `tienda_web` (20261014220000).
 *
 * USO
 *   pnpm pruebas:campanas-portada                                            → contra el stack local compartido
 *   pnpm pruebas:campanas-portada -- --contenedor supabase_db_<mi-pila>      → contra una pila propia
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261017144000_campanas_modulo_y_portada_por_dia.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora, sin «Campañas»

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(typeof detalle === "string" ? detalle : JSON.stringify(detalle)).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

const como = (id) => `reset role;\nset local request.jwt.claim.sub = '${id}';\n`;
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_estado text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text, v_estado = returned_sqlstate;
  return v_estado || ' ' || v_msg;
end;
$f$;
`;

/**
 * Cada escenario parte igual: ninguna campaña con descuento salvo las de la prueba, y estas cinco (h = hoy en Lima):
 *   A: −10 %, h−2 a h+10, con una variante        → sale en la portada desde h+6 hasta h+10
 *   B: −20 %, h a h+5, con una categoría           → sale hoy (termina primero)
 *   C: −30 %, h a h+3, sin prendas ni categorías   → nunca (no tiene qué mostrar)
 *   D: −40 %, h a h+2, con una variante, desactivada → nunca
 *   E: sin descuento, h a h+30, con una variante   → nunca (con la regla de hoy; la actividad 6 la cambia)
 */
const ESCENA = `
begin;
${APLICAR_ANTES}
${INTENTO}
${como(FELIPE)}
update retail.etiquetas set descuento_pct = null where descuento_pct is not null;
select retail.fn_hoy_lima() as h \\gset
select id as variante from retail.variantes where activo order by id limit 1 \\gset
select id as variante2 from retail.variantes where activo order by id offset 1 limit 1 \\gset
select id as categoria from retail.categorias where activo order by id limit 1 \\gset
insert into retail.etiquetas (nombre, estilo, estado, activo, descuento_pct, vigente_desde, vigente_hasta) values
  ('Prueba A', 'campana', 'aprobado', true, 10, :'h'::date - 2, :'h'::date + 10),
  ('Prueba B', 'campana', 'aprobado', true, 20, :'h'::date, :'h'::date + 5),
  ('Prueba C', 'campana', 'aprobado', true, 30, :'h'::date, :'h'::date + 3),
  ('Prueba D', 'campana', 'aprobado', false, 40, :'h'::date, :'h'::date + 2),
  ('Prueba E', 'campana', 'aprobado', true, null, :'h'::date, :'h'::date + 30);
select id as a from retail.etiquetas where nombre = 'Prueba A' \\gset
select id as b from retail.etiquetas where nombre = 'Prueba B' \\gset
select id as d from retail.etiquetas where nombre = 'Prueba D' \\gset
select id as e from retail.etiquetas where nombre = 'Prueba E' \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'variante', :'a'), (:'variante2', :'a'), (:'variante', :'d'), (:'variante', :'e');
insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) values (:'b', :'categoria');
`;
const nombreEn = (desplazamiento) =>
  `select coalesce((select nombre from retail.etiquetas where id = retail.fn_campana_en_portada(:'h'::date + ${desplazamiento})), '—');`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regprocedure('retail.fn_campana_en_portada(date)') is not null and to_regprocedure('retail.campanas_lista()') is not null;");
    if (hay.salida !== "t") {
      console.error(`Falta la migración: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }

  console.log("— La regla: qué campaña anuncia la portada cada día —");
  {
    const r = correr(`${ESCENA}
${nombreEn(0)}
${nombreEn(5)}
${nombreEn(6)}
${nombreEn(10)}
${nombreEn(11)}
${nombreEn(-1)}
${nombreEn(-3)}`);
    const [hoy, h5, h6, h10, h11, ayer, antes] = lineas(r);
    esperar("hoy sale B: de las que tienen prendas y descuento, la que termina primero (C no tiene prendas, D está desactivada)", hoy === "Prueba B", r.ok ? r.salida : r.mensaje);
    esperar("B sigue hasta su último día", h5 === "Prueba B", h5);
    esperar("cuando B termina, sale A", h6 === "Prueba A" && h10 === "Prueba A", `${h6} / ${h10}`);
    esperar("después de A no queda ninguna (E no tiene descuento)", h11 === "—", h11);
    esperar("ayer ya estaba A (B empezaba hoy)", ayer === "Prueba A", ayer);
    esperar("antes de que empiece A, ninguna", antes === "—", antes);
  }
  {
    const r = correr(`${ESCENA}
update retail.etiquetas set vigente_hasta = :'h'::date + 5 where id = :'a';
update retail.etiquetas set estado = 'pendiente', descuento_pct = null where id = :'b';
${nombreEn(0)}
update retail.etiquetas set estado = 'aprobado', notas = 'Prueba de la portada', descuento_pct = 5 where id = :'b';
${nombreEn(0)}`);
    const [sinB, empate] = lineas(r);
    esperar("una campaña por aprobar no sale (queda A)", sinB === "Prueba A", r.ok ? r.salida : r.mensaje);
    esperar("a igual fin, la de mayor descuento (A −10 % gana a B −5 %)", empate === "Prueba A", empate);
  }

  console.log("— La tienda pregunta lo mismo —");
  {
    const r = correr(`${ESCENA}
select retail.tienda_portada()->'campana'->>'nombre', retail.tienda_portada()->'campana'->>'pct', retail.tienda_portada()->'campana'->>'hasta' = (:'h'::date + 5)::text;
update retail.etiquetas set descuento_pct = null;
select retail.tienda_portada()::text;`);
    const [hoy, sinNinguna] = lineas(r);
    esperar("tienda_portada() anuncia B, con su % y su último día", hoy === "Prueba B|20.00|t", r.ok ? r.salida : r.mensaje);
    esperar("sin campañas con descuento, la portada sale sin campaña", sinNinguna === '{"campana": null}', sinNinguna);
  }

  console.log("— Día por día, para el ERP —");
  {
    const r = correr(`${ESCENA}
select jsonb_array_length(retail.campanas_portada_dias(:'h'::date, :'h'::date + 13));
select (select count(*) from jsonb_array_elements(retail.campanas_portada_dias(:'h'::date, :'h'::date + 13)) x where x->>'campana' = :'b');
select (select count(*) from jsonb_array_elements(retail.campanas_portada_dias(:'h'::date, :'h'::date + 13)) x where x->>'campana' = :'a');
select (retail.campanas_portada_dias(:'h'::date, :'h'::date)->0->>'dia') = :'h';
select pg_temp.intento(format('select retail.campanas_portada_dias(%L::date, %L::date)', :'h', :'h'::date - 1));
select pg_temp.intento(format('select retail.campanas_portada_dias(%L::date, %L::date)', :'h', :'h'::date + 401));`);
    const [dias, deB, deA, primero, alReves, muchos] = lineas(r);
    esperar("catorce días, catorce filas", dias === "14", r.ok ? r.salida : r.mensaje);
    esperar("B los 6 primeros, A los 5 siguientes (el resto, ninguna)", deB === "6" && deA === "5", `${deB} / ${deA}`);
    esperar("cada fila trae su día", primero === "t", primero);
    esperar("un rango al revés se rechaza", alReves?.startsWith("22023"), alReves);
    esperar("más de 400 días se rechaza", muchos?.startsWith("22023"), muchos);
  }

  console.log("— La lista de la pantalla —");
  {
    const r = correr(`${ESCENA}
-- Sin los disparadores del alta (que deciden el estado según quién crea): la fila tal cual, para probar solo la lectura.
set local session_replication_role = replica;
insert into retail.etiquetas (nombre, estilo, estado, activo) values ('Prueba rechazada', 'campana', 'rechazado', false), ('Prueba no campaña', 'urgencia', 'aprobado', true);
set local session_replication_role = origin;
select x->>'modelos', x->>'variantes', x->>'categorias' from jsonb_array_elements(retail.campanas_lista()) x where x->>'nombre' = 'Prueba A';
select x->>'categorias' from jsonb_array_elements(retail.campanas_lista()) x where x->>'nombre' = 'Prueba B';
select x->>'activo' from jsonb_array_elements(retail.campanas_lista()) x where x->>'nombre' = 'Prueba D';
select count(*) from jsonb_array_elements(retail.campanas_lista()) x where x->>'nombre' in ('Prueba rechazada', 'Prueba no campaña');`);
    const [a, b, d, fuera] = lineas(r);
    const [, variantes] = (a ?? "").split("|");
    esperar("cuenta las variantes de una campaña y sus categorías", variantes === "2" && a?.endsWith("|0"), r.ok ? r.salida : r.mensaje);
    esperar("una campaña por categoría dice en cuántas rige", b === "1", b);
    esperar("la desactivada aparece, como desactivada", d === "false", d);
    esperar("ni la rechazada ni una etiqueta que no es campaña", fuera === "0", fuera);
  }

  console.log("— Quién —");
  {
    const r = correr(`${ESCENA}
${como(MICAELA)}
select pg_temp.intento('select retail.campanas_lista()');
select pg_temp.intento(format('select retail.campanas_portada_dias(%L::date, %L::date)', :'h', :'h'));
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_mi_rol_id(), 'campanas');
select pg_temp.intento('select retail.campanas_lista()');
select pg_temp.intento(format('select retail.campanas_portada_dias(%L::date, %L::date)', :'h', :'h'));
${como(FELIPE)}
set local role authenticated;
select pg_temp.intento(format('select retail.fn_campana_en_portada(%L::date)', :'h'));
select pg_temp.intento('select retail.tienda_portada()');
reset role;
-- Sin cambiar al rol (el «grant … with set» tumba el Postgres local de la imagen de Supabase a mitad de una transacción).
select has_function_privilege('tienda_web', 'retail.tienda_portada()', 'execute'), has_function_privilege('tienda_web', 'retail.campanas_lista()', 'execute');`);
    const [sinListar, sinDias, conListar, conDias, authRegla, authTienda, web] = lineas(r);
    esperar("sin el módulo, la colaboradora no lee la lista (42501)", sinListar?.startsWith("42501"), r.ok ? r.salida : r.mensaje);
    esperar("sin el módulo, tampoco los días", sinDias?.startsWith("42501"), sinDias);
    esperar("con «Campañas» en su rol, lee la lista y los días", conListar === "SIN_ERROR" && conDias === "SIN_ERROR", `${conListar} / ${conDias}`);
    esperar("authenticated no llama a la regla directo ni a tienda_portada", authRegla?.startsWith("42501") && authTienda?.startsWith("42501"), `${authRegla} / ${authTienda}`);
    esperar("tienda_web lee la portada pero no la lista del ERP", web === "t|f", web);
  }

  console.log("— La migración se puede pegar dos veces —");
  {
    const migracion = readFileSync(MIGRACION, "utf8");
    const r = correr(`begin;\n${migracion}\n${migracion}\nselect count(*) from retail.modulos where clave = 'campanas';`);
    esperar("dos veces seguidas, sin error y con un solo módulo", r.ok && r.salida.split("\n").at(-1) === "1", r.ok ? r.salida : r.mensaje);
  }

  console.log(`\n${total - fallos} de ${total} · contenedor: ${CONTENEDOR_LOCAL}`);
  if (fallos > 0) process.exit(1);
}

main();
