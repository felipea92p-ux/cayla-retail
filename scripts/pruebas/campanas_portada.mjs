#!/usr/bin/env node
/**
 * Tienda web ▸ Campañas, actividad 1 (ADR-0436) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261017144000_campanas_modulo_y_portada_por_dia.sql`, con la regla como queda después de
 * `20261017204000_campanas_sin_descuento_en_la_portada.sql` (actividad 6a) y `20261017210000_campanas_carrusel_en_la_portada.sql` (6b: todas
 * las que salen, en orden, para el carrusel; `fn_campana_en_portada` es la primera):
 *   1. LA regla de la portada (`fn_campana_en_portada`): ese día, de las campañas aprobadas, activas y vigentes con prendas o categorías
 *      (o, sin descuento, con su diseño publicado), primero las que tienen descuento y, entre ellas, la que termina primero; a igual fin,
 *      la de mayor descuento. Una con descuento sin prendas, una desactivada o por aprobar no sale; fuera de sus fechas, tampoco; sin
 *      ninguna, null. Una sin descuento sale cuando no corre ninguna con descuento.
 *   2. La tienda pregunta lo mismo: `tienda_portada()` nombra la campaña de `fn_campana_en_portada(hoy)`, con su % y su fin, su id y sus
 *      modelos (a mano y por categoría).
 *   3. `campanas_portada_dias`: un día por fila, con la misma regla; no acepta un rango al revés ni de más de 400 días.
 *   4. `campanas_lista`: solo las de estilo campaña, sin las rechazadas y con las desactivadas; cuenta modelos, variantes y categorías.
 *   5. Quién: el líder; una colaboradora sin el módulo «Campañas» no lee nada (42501); con el módulo en su rol, sí. `authenticated` no
 *      llama a la regla directo, y `tienda_web` lee `tienda_portada` pero no las funciones del ERP.
 *   6. Las dos migraciones se pueden pegar dos veces.
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
const MIGRACION_SIN_DESCUENTO = "supabase/migrations/20261017204000_campanas_sin_descuento_en_la_portada.sql";
const MIGRACION_CARRUSEL = "supabase/migrations/20261017210000_campanas_carrusel_en_la_portada.sql";
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
 * Cada escenario parte igual: ninguna otra campaña activa, y estas cinco (h = hoy en Lima):
 *   A: −10 %, h−2 a h+10, con una variante        → sale en la portada desde h+6 hasta h+10
 *   B: −20 %, h a h+5, con una categoría           → sale hoy (termina primero)
 *   C: −30 %, h a h+3, sin prendas ni categorías   → nunca (con descuento y sin prendas no tiene qué mostrar)
 *   D: −40 %, h a h+2, con una variante, desactivada → nunca
 *   E: sin descuento, h a h+30, con una variante   → sale cuando ya no corre ninguna con descuento (h+11 en adelante; actividad 6a)
 */
const ESCENA = `
begin;
${APLICAR_ANTES}
${INTENTO}
${como(FELIPE)}
update retail.etiquetas set descuento_pct = null where descuento_pct is not null;
-- Desde la actividad 6a una campaña sin descuento también sale: las de la base se apagan (dentro de la transacción) para que solo
-- cuenten las de la prueba.
update retail.etiquetas set activo = false where estilo = 'campana' and activo;
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
    esperar("después de A sale E, sin descuento (la de descuento va primero mientras corre)", h11 === "Prueba E", h11);
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
  {
    // La actividad 6a: sin descuento sale; la de descuento va primero aunque termine después; sin prendas, solo con su diseño.
    const r = correr(`${ESCENA}
update retail.etiquetas set vigente_hasta = :'h'::date + 1 where id = :'e';
${nombreEn(0)}
update retail.etiquetas set descuento_pct = null where id in (:'a', :'b');
${nombreEn(0)}
update retail.etiquetas set descuento_pct = null where nombre like 'Prueba %';
delete from retail.variante_etiquetas where etiqueta_id = :'e';
${nombreEn(12)}
update retail.etiquetas set vigente_hasta = :'h'::date + 30 where id = :'e';
insert into retail.campana_disenos (etiqueta_id, estado, paleta, fondo, patron, intensidad, acomodo, tamano, cuenta, pct_gigante, colibri, sello, publicado_en)
values (:'e', 'publicado', 'bosque', 'degradado', 'huellitas', 'medio', 'polaroids', 'grande', true, false, true, 'ninguno', now());
${nombreEn(12)}
update retail.etiquetas set activo = false where id in (:'a', :'b');
update retail.etiquetas set descuento_pct = 10 where nombre = 'Prueba C';
insert into retail.campana_disenos (etiqueta_id, estado, paleta, fondo, patron, intensidad, acomodo, tamano, cuenta, pct_gigante, colibri, sello, publicado_en)
values ((select id from retail.etiquetas where nombre = 'Prueba C'), 'publicado', 'bosque', 'degradado', 'huellitas', 'medio', 'polaroids', 'grande', true, false, true, 'ninguno', now());
${nombreEn(2)}`);
    const [descuentoPrimero, sinDescuentoTermina, sinNada, conDiseno, conDescuentoSinPrendas] = lineas(r);
    esperar("la de descuento va primero aunque una sin descuento termine antes (B, no E)", descuentoPrimero === "Prueba B", r.ok ? r.salida : r.mensaje);
    esperar("sin descuento en ninguna, sale la que termina primero (E)", sinDescuentoTermina === "Prueba E", sinDescuentoTermina);
    esperar("sin descuento, sin prendas ni diseño, no sale", sinNada === "—", sinNada);
    esperar("sin descuento y sin prendas, con su diseño publicado, sí sale", conDiseno === "Prueba E", conDiseno);
    esperar("con descuento y sin prendas no sale ni con diseño (anunciaría un % sin prendas)", conDescuentoSinPrendas === "Prueba E", conDescuentoSinPrendas);
  }

  console.log("— El carrusel: todas las que salen, en orden —");
  {
    const lista = (dia) =>
      `select coalesce((select string_agg(e.nombre, ' > ' order by x.n) from unnest(retail.fn_campanas_en_portada(:'h'::date + ${dia})) with ordinality x(id, n) join retail.etiquetas e on e.id = x.id), '—');`;
    const r = correr(`${ESCENA}
${lista(0)}
${lista(8)}
${lista(40)}
select (select string_agg(x->>'nombre', ' > ') from jsonb_array_elements(retail.tienda_portada()->'campanas') x), retail.tienda_portada()->'campana'->>'nombre';
${como(FELIPE)}select jsonb_array_length(retail.campanas_portada_dias(:'h'::date, :'h'::date)->0->'campanas'), retail.campanas_portada_dias(:'h'::date, :'h'::date)->0->>'campana' = :'b';`);
    const [hoy, h8, h40, tienda, dias] = lineas(r);
    esperar("hoy salen tres, primero las de descuento (B termina antes que A) y después E, sin descuento", hoy === "Prueba B > Prueba A > Prueba E", r.ok ? r.salida : r.mensaje);
    esperar("cuando B termina, A y E", h8 === "Prueba A > Prueba E", h8);
    esperar("pasadas todas, ninguna", h40 === "—", h40);
    esperar("la tienda recibe las tres en ese orden y la primera como «campana»", tienda === "Prueba B > Prueba A > Prueba E|Prueba B", tienda);
    esperar("el ERP recibe las tres del día y la primera", dias === "3|t", dias);
  }

  console.log("— La tienda pregunta lo mismo —");
  {
    const r = correr(`${ESCENA}
select retail.tienda_portada()->'campana'->>'nombre', retail.tienda_portada()->'campana'->>'pct', retail.tienda_portada()->'campana'->>'hasta' = (:'h'::date + 5)::text,
       retail.tienda_portada()->'campana'->>'id' = :'b';
-- B rige en una categoría: sus modelos son los de esa categoría. Sin descuento en ninguna sale B igual (termina primero), con pct null.
select (select count(*) from retail.productos p where p.categoria_id = :'categoria' and p.estado <> 'descontinuado') = jsonb_array_length(retail.tienda_portada()->'campana'->'prendas');
update retail.etiquetas set descuento_pct = null;
select retail.tienda_portada()->'campana'->>'nombre', (retail.tienda_portada()->'campana'->>'pct') is null;
update retail.etiquetas set activo = false where nombre like 'Prueba %';
select retail.tienda_portada()::text;`);
    const [hoy, modelos, sinDescuento, sinNinguna] = lineas(r);
    esperar("tienda_portada() anuncia B, con su %, su último día y su id", hoy === "Prueba B|20.00|t|t", r.ok ? r.salida : r.mensaje);
    esperar("y sus modelos: los de su categoría", modelos === "t", modelos);
    esperar("sin descuento sale igual, con el % vacío", sinDescuento === "Prueba B|t", sinDescuento);
    esperar("sin ninguna campaña, la portada sale sin campaña (y el carrusel, vacío)", sinNinguna === '{"campana": null, "campanas": []}', sinNinguna);
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
    esperar("B los 6 primeros, A los 5 siguientes (el resto, E: sin descuento)", deB === "6" && deA === "5", `${deB} / ${deA}`);
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
  for (const [archivo, nombre] of [[MIGRACION_SIN_DESCUENTO, "la de la actividad 6a"], [MIGRACION_CARRUSEL, "la del carrusel (6b)"]]) {
    const migracion = readFileSync(archivo, "utf8");
    const r = correr(`begin;\n${migracion}\n${migracion}\nselect 'ok';`);
    esperar(`${nombre}, dos veces seguidas, sin error`, r.ok && r.salida.split("\n").at(-1) === "ok", r.ok ? r.salida : r.mensaje);
  }

  console.log(`\n${total - fallos} de ${total} · contenedor: ${CONTENEDOR_LOCAL}`);
  if (fallos > 0) process.exit(1);
}

main();
