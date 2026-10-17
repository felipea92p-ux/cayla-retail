#!/usr/bin/env node
/**
 * Tienda web ▸ Campañas, actividad 4 (ADR-0436): el diseño de la portada de cada campaña, contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261017160000_campanas_diseno.sql`:
 *   1. Los estados imposibles los impide la base: paleta propia sin colores o curada con colores, un color mal escrito, una paleta o un
 *      fondo que no existen, una frase de más de 60 letras (o con espacios a los lados), más de 4 prendas, un publicado sin fecha o un
 *      borrador con fecha, dos borradores o dos publicados de la misma campaña.
 *   2. `guardar_diseno_borrador`: guarda y sube la versión; con una versión vieja (otra persona lo cambió o lo publicó) no pisa nada;
 *      rechaza un diseño mal armado y una prenda que no está en la campaña. Se guarda sin elegir responsable (suelto del combo), aunque
 *      la empresa lo exija; sin el encabezado, lo pide.
 *   3. `publicar_diseno_campana`: pide responsable; publica la versión que se vio (una vieja, no); el publicado pasa a anterior y el
 *      anterior a archivado (nunca se borra nada); después de publicar, el borrador viejo ya no se puede guardar encima.
 *   4. `volver_al_diseno_anterior`: cambia el publicado por el anterior y otra vez lo regresa; sin anterior, la portada vuelve a la de
 *      siempre y otra vez lo regresa; sin nada publicado, lo dice.
 *   5. `campanas_lista`: el diseño publicado, si hay borrador y tres prendas con la foto primero.
 *   6. Quién: sin Campañas, nada (42501); una etiqueta que no es campaña «no existe» aquí. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK; la sesión se simula con `request.jwt.claim.sub` y los encabezados con
 * `request.headers`. Micaela recibe Campañas DENTRO de la transacción (`rol_modulos`).
 *
 * DA POR SENTADO (el seed): Felipe líder y Admin, Micaela colaboradora sin Campañas, la etiqueta «Para liquidar» y variantes activas.
 *
 * USO
 *   pnpm pruebas:campanas-diseno                                            → contra el stack local compartido
 *   pnpm pruebas:campanas-diseno -- --contenedor supabase_db_<mi-pila>      → contra una pila propia
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261017160000_campanas_diseno.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
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
    if (detalle) console.log(`    ${String(typeof detalle === "string" ? detalle : JSON.stringify(detalle)).trim().split("\n").slice(0, 10).join("\n    ")}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);
const como = (id) => `reset role;\nset local request.jwt.claim.sub = '${id}';\nset local request.headers = '{}';\n`;
const soltado = `set local request.headers = '{"x-responsable-omitido":"campana_diseno_borrador"}';\n`;
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_estado text; v_pista text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text, v_estado = returned_sqlstate, v_pista = pg_exception_hint;
  return v_estado || ' ' || coalesce(nullif(v_pista, ''), '-') || ' ' || v_msg;
end;
$f$;
`;
// La empresa exige elegir responsable (como producción). Se cambia la función dentro de la transacción: la base local puede no tener
// fila de configuración, y el ROLLBACK la deja como estaba.
const EXIGE = `create or replace function retail.fn_exige_responsable() returns boolean language sql stable as 'select true';`;
const darle = (modulo) => `${como(MICAELA)}insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_mi_rol_id(), '${modulo}') on conflict do nothing;\n`;

// Un diseño válido (el de siempre) y sus variantes, como los manda la pantalla.
const DISENO = {
  paleta: "cayla",
  colores: null,
  fondo: "degradado",
  patron: "huellitas",
  intensidad: "medio",
  acomodo: "polaroids",
  corte: null,
  tamano: "grande",
  frase: "",
  prendas: null,
  cuenta: true,
  pctGigante: false,
  colibri: true,
  sello: "ninguno",
};
const j = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const guardar = (diseno, version) => `select pg_temp.intento(format('select retail.guardar_diseno_borrador(%L, %L::jsonb, ${version})', :'camp', ${j(diseno)}::text));\n`;
const publicar = (version) => `select pg_temp.intento(format('select retail.publicar_diseno_campana(%L, ${version})', :'camp'));\n`;
const volver = `select pg_temp.intento(format('select retail.volver_al_diseno_anterior(%L)', :'camp'));\n`;
const estados = `select string_agg(estado || ':' || paleta, ',' order by estado, paleta) from retail.campana_disenos where etiqueta_id = :'camp';\n`;

/** «Prueba Diseño» (aprobada) con dos variantes de un modelo, «Para liquidar» (no es campaña), y Micaela con Campañas. */
const ESCENA = `
begin;
${APLICAR_ANTES}
${INTENTO}
${como(FELIPE)}
select id as variante, producto_id as producto from retail.variantes where activo order by id limit 1 \\gset
select id as otro_producto from retail.productos where id <> :'producto' order by id limit 1 \\gset
select retail.crear_campana('Prueba Diseño', null, null) as camp \\gset
select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :'camp', 'agregar', jsonb_build_array(:'variante')))) as _e \\gset
select id as liquidar from retail.etiquetas where nombre = 'Para liquidar' \\gset
${darle("campanas")}${soltado}
`;

/** Una fila escrita directo (como postgres): para ver qué estados impide la base. */
function fila(cambios) {
  const d = {
    estado: "'borrador'",
    paleta: "'cayla'",
    colores: "null",
    fondo: "'degradado'",
    patron: "'huellitas'",
    intensidad: "'medio'",
    acomodo: "'polaroids'",
    corte: "null",
    tamano: "'grande'",
    frase: "''",
    prendas: "null",
    cuenta: "true",
    pct_gigante: "false",
    colibri: "true",
    sello: "'ninguno'",
    publicado_en: "null",
    ...cambios,
  };
  const cols = Object.keys(d);
  return `select pg_temp.intento(format($q$insert into retail.campana_disenos (etiqueta_id, ${cols.join(", ")}) values (%L, ${cols
    .map((c) => d[c].replace(/%/g, "%%"))
    .join(", ")})$q$, :'camp'));\n`;
}

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regprocedure('retail.publicar_diseno_campana(uuid,integer)') is not null;");
    if (hay.salida !== "t") {
      console.error(`Falta la migración: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }

  console.log("— Los estados imposibles —");
  {
    const propios = `'{"nombre":"Mi color","fondo":"#2f6f73","fondo2":"#527f82","letra":"#f6efe6","acento":"#c1d4d5"}'::jsonb`;
    const casos = [
      ["una paleta propia sin sus colores", { paleta: "'propia'" }, "23514"],
      ["una paleta curada con colores sueltos", { colores: propios }, "23514"],
      ["un color mal escrito en una paleta propia", { paleta: "'propia'", colores: propios.replace("#2f6f73", "rojo") }, "23514"],
      ["una paleta que no existe", { paleta: "'fucsia'" }, "23514"],
      ["un fondo que no existe", { fondo: "'video'" }, "23514"],
      ["una frase de 61 letras", { frase: `'${"x".repeat(61)}'` }, "23514"],
      ["una frase con espacios a los lados", { frase: "' Hola'" }, "23514"],
      ["cinco prendas", { prendas: "array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()]" }, "23514"],
      ["un publicado sin fecha de publicación", { estado: "'publicado'" }, "23514"],
      ["un borrador con fecha de publicación", { publicado_en: "now()" }, "23514"],
    ];
    const r = correr(`${ESCENA}${como(FELIPE)}${casos.map(([, c]) => fila(c)).join("")}`);
    const ls = lineas(r);
    casos.forEach(([nombre, , codigo], i) => esperar(`la base no deja guardar ${nombre}`, ls[i]?.startsWith(codigo), r.ok ? ls[i] : r.mensaje));
  }
  {
    const r = correr(`${ESCENA}${como(FELIPE)}${fila({})}${fila({})}${fila({ estado: "'publicado'", publicado_en: "now()" })}${fila({ estado: "'publicado'", publicado_en: "now()" })}${fila({ paleta: "'propia'", colores: `'{"nombre":"Mi color","fondo":"#f4d35e","fondo2":"#f8e49e","letra":"#1a1a18","acento":"#5d5024","noche":{"fondo":"#352e14"}}'::jsonb` })}`);
    const [b1, b2, p1, p2, propia] = lineas(r);
    esperar("un borrador por campaña: el segundo choca", b1 === "SIN_ERROR" && b2?.startsWith("23505"), `${b1} / ${b2}`);
    esperar("un publicado por campaña: el segundo choca", p1 === "SIN_ERROR" && p2?.startsWith("23505"), `${p1} / ${p2}`);
    esperar("una paleta propia con su noche a medias sí se guarda (borrador aparte: ya había uno, choca por eso)", propia?.startsWith("23505"), propia);
  }

  console.log("— Guardar el borrador —");
  {
    const r = correr(`${ESCENA}
select retail.guardar_diseno_borrador(:'camp', ${j(DISENO)}, 0);
select retail.guardar_diseno_borrador(:'camp', ${j({ ...DISENO, paleta: "bosque" })}, 1);
${guardar({ ...DISENO, paleta: "oliva" }, 1)}${estados}
select actualizado_por = (select id from public.personas where auth_user_id = '${MICAELA}') from retail.campana_disenos where etiqueta_id = :'camp';`);
    const [v1, v2, vieja, filas, quien] = lineas(r);
    esperar("el primero nace en la versión 1 y el siguiente sube a 2", v1 === "1" && v2 === "2", r.ok ? r.salida : r.mensaje);
    esperar("con una versión vieja no pisa el trabajo de otra persona (diseno_cambiado)", vieja?.includes("diseno_cambiado"), vieja);
    esperar("queda un solo borrador, con lo último que se guardó bien", filas === "borrador:bosque", filas);
    esperar("firma quien lo probó, sin elegir responsable", quien === "t", quien);
  }
  {
    const r = correr(`${ESCENA}
${guardar(DISENO, 3)}${guardar({ ...DISENO, fondo: "video" }, 0)}${guardar({ ...DISENO, prendas: ["no-es-un-id"] }, 0)}
select pg_temp.intento(format('select retail.guardar_diseno_borrador(%L, %L::jsonb, 0)', :'camp', jsonb_set(${j(DISENO)}, '{prendas}', jsonb_build_array(:'otro_producto'))::text));
select pg_temp.intento(format('select retail.guardar_diseno_borrador(%L, %L::jsonb, 0)', :'camp', jsonb_set(${j(DISENO)}, '{prendas}', jsonb_build_array(:'producto'))::text));
${estados}`);
    const [sinBorrador, fondo, id, fuera, dentro, filas] = lineas(r);
    esperar("sin borrador, una versión que no es 0 es que alguien lo publicó (diseno_cambiado)", sinBorrador?.includes("diseno_cambiado"), sinBorrador);
    esperar("un diseño mal armado no se guarda (diseno_invalido): un fondo que no existe", fondo?.includes("diseno_invalido"), fondo);
    esperar("…y una prenda que no es un id", id?.includes("diseno_invalido"), id);
    esperar("una prenda que no está en la campaña no se guarda (prenda_fuera)", fuera?.includes("prenda_fuera"), fuera);
    esperar("una que sí está, se guarda", dentro === "SIN_ERROR" && filas === "borrador:cayla", `${dentro} / ${filas}`);
  }
  {
    const r = correr(`${ESCENA}
${EXIGE}
${darle("campanas")}${soltado}${guardar(DISENO, 0)}
set local request.headers = '{}';
${guardar({ ...DISENO, paleta: "oliva" }, 1)}`);
    const [suelto, sinNadie] = lineas(r);
    esperar("aunque la empresa exija responsable, el borrador se guarda solo (suelto del combo)", suelto === "SIN_ERROR", r.ok ? r.salida : r.mensaje);
    esperar("…sin ese encabezado, pide quién (responsable_requerido)", sinNadie?.includes("responsable_requerido"), sinNadie);
  }

  console.log("— Publicar —");
  {
    const r = correr(`${ESCENA}
${EXIGE}
${darle("campanas")}${soltado}
select retail.guardar_diseno_borrador(:'camp', ${j({ ...DISENO, paleta: "bosque" })}, 0) as _v \\gset
set local request.headers = '{}';
${publicar(1)}
${como(FELIPE)}${publicar(2)}${publicar(1)}${estados}
select publicado_en is not null, publicado_por = (select id from public.personas where auth_user_id = '${FELIPE}') from retail.campana_disenos where etiqueta_id = :'camp' and estado = 'publicado';
${darle("campanas")}${soltado}${guardar({ ...DISENO, paleta: "oliva" }, 1)}`);
    const [sinResponsable, vieja, ok, filas, fecha, encima] = lineas(r);
    esperar("publicar pide quién lo hace (responsable_requerido)", sinResponsable?.includes("responsable_requerido"), r.ok ? sinResponsable : r.mensaje);
    esperar("publica solo la versión que se vio en la hoja (una distinta: diseno_cambiado)", vieja?.includes("diseno_cambiado"), vieja);
    esperar("con la versión que se vio, se publica y el borrador desaparece", ok === "SIN_ERROR" && filas === "publicado:bosque", `${ok} / ${filas}`);
    esperar("lleva su fecha y quién lo publicó", fecha === "t|t", fecha);
    esperar("el borrador viejo ya no se guarda encima de lo publicado (diseno_cambiado)", encima?.includes("diseno_cambiado"), encima);
  }
  {
    const r = correr(`${ESCENA}
select retail.guardar_diseno_borrador(:'camp', ${j({ ...DISENO, paleta: "bosque" })}, 0) as _v \\gset
${como(FELIPE)}select retail.publicar_diseno_campana(:'camp', 1) as _p \\gset
${darle("campanas")}${soltado}
select retail.guardar_diseno_borrador(:'camp', ${j({ ...DISENO, paleta: "oliva" })}, 0) as _v \\gset
${como(FELIPE)}select retail.publicar_diseno_campana(:'camp', 1) as _p \\gset
${estados}
${darle("campanas")}${soltado}
select retail.guardar_diseno_borrador(:'camp', ${j({ ...DISENO, paleta: "rosa" })}, 0) as _v \\gset
${como(FELIPE)}select retail.publicar_diseno_campana(:'camp', 1) as _p \\gset
${estados}`);
    const [dos, tres] = lineas(r);
    esperar("al publicar otro, el que estaba pasa a «anterior»", dos === "anterior:bosque,publicado:oliva", r.ok ? r.salida : r.mensaje);
    esperar("y al publicar un tercero, el más viejo queda archivado: no se borra nada", tres === "anterior:oliva,archivado:bosque,publicado:rosa", tres);
  }

  console.log("— Volver al anterior —");
  {
    const r = correr(`${ESCENA}
select retail.guardar_diseno_borrador(:'camp', ${j({ ...DISENO, paleta: "bosque" })}, 0) as _v \\gset
${como(FELIPE)}select retail.publicar_diseno_campana(:'camp', 1) as _p \\gset
${darle("campanas")}${soltado}
select retail.guardar_diseno_borrador(:'camp', ${j({ ...DISENO, paleta: "oliva" })}, 0) as _v \\gset
${como(FELIPE)}select retail.publicar_diseno_campana(:'camp', 1) as _p \\gset
${volver}${estados}${volver}${estados}`);
    const [v1, e1, v2, e2] = lineas(r);
    esperar("cambia el publicado por el anterior", v1 === "SIN_ERROR" && e1 === "anterior:oliva,publicado:bosque", r.ok ? `${v1} / ${e1}` : r.mensaje);
    esperar("y otra vez lo regresa", v2 === "SIN_ERROR" && e2 === "anterior:bosque,publicado:oliva", `${v2} / ${e2}`);
  }
  {
    const r = correr(`${ESCENA}
${como(FELIPE)}${volver}
${darle("campanas")}${soltado}
select retail.guardar_diseno_borrador(:'camp', ${j({ ...DISENO, paleta: "bosque" })}, 0) as _v \\gset
${como(FELIPE)}select retail.publicar_diseno_campana(:'camp', 1) as _p \\gset
${volver}${estados}
select retail.campana_diseno(:'camp') ->> 'publicado' is null;
${volver}${estados}`);
    const [nada, v1, e1, sinPublicado, v2, e2] = lineas(r);
    esperar("sin nada publicado, no hay a qué volver (sin_anterior)", nada?.includes("sin_anterior"), r.ok ? nada : r.mensaje);
    esperar("con un solo diseño publicado, la portada vuelve a la de siempre", v1 === "SIN_ERROR" && e1 === "anterior:bosque" && sinPublicado === "t", `${v1} / ${e1} / ${sinPublicado}`);
    esperar("y otra vez lo regresa", v2 === "SIN_ERROR" && e2 === "publicado:bosque", `${v2} / ${e2}`);
  }

  console.log("— La lista —");
  {
    const r = correr(`${ESCENA}
select (x->>'diseno') is null, (x->>'borrador'), jsonb_array_length(x->'piezas') from jsonb_array_elements(retail.campanas_lista()) x where x->>'id' = :'camp';
select retail.guardar_diseno_borrador(:'camp', ${j({ ...DISENO, paleta: "bosque" })}, 0) as _v \\gset
select (x->>'borrador') from jsonb_array_elements(retail.campanas_lista()) x where x->>'id' = :'camp';
${como(FELIPE)}select retail.publicar_diseno_campana(:'camp', 1) as _p \\gset
${darle("campanas")}
select x->'diseno'->>'paleta', (x->>'borrador') from jsonb_array_elements(retail.campanas_lista()) x where x->>'id' = :'camp';
select bool_and(jsonb_array_length(x->'piezas') <= 3) from jsonb_array_elements(retail.campanas_lista()) x;`);
    const [antes, conBorrador, despues, tope] = lineas(r);
    esperar("sin diseño ni borrador, con su prenda", antes === "t|false|1", r.ok ? antes : r.mensaje);
    esperar("dice cuándo hay un borrador sin publicar", conBorrador === "true", conBorrador);
    esperar("trae el diseño publicado", despues === "bosque|false", despues);
    esperar("a lo más tres prendas por campaña", tope === "t", tope);
  }

  console.log("— Quién —");
  {
    const r = correr(`${ESCENA}
${como(MICAELA)}delete from retail.rol_modulos where rol_id = retail.fn_mi_rol_id() and modulo = 'campanas';
select pg_temp.intento(format('select retail.campana_diseno(%L)', :'camp'));
${guardar(DISENO, 0)}${publicar(1)}${volver}
${darle("campanas")}${soltado}
select pg_temp.intento(format('select retail.campana_diseno(%L)', :'liquidar'));`);
    const ls = lineas(r);
    esperar("sin Campañas no se lee, ni se guarda, ni se publica, ni se vuelve (42501)", ls.slice(0, 4).every((l) => l.startsWith("42501")), r.ok ? r.salida : r.mensaje);
    esperar("una etiqueta que no es campaña «no existe» aquí", ls[4]?.includes("campana_no_existe"), ls[4]);
  }

  console.log("— La migración se puede pegar dos veces —");
  {
    const migracion = readFileSync(MIGRACION, "utf8");
    const r = correr(`begin;\n${migracion}\n${migracion}\nselect 'ok';`);
    esperar("dos veces seguidas, sin error", r.ok && r.salida.split("\n").at(-1) === "ok", r.ok ? r.salida : r.mensaje);
  }

  console.log(`\n${total - fallos} de ${total} · contenedor: ${CONTENEDOR_LOCAL}`);
  if (fallos > 0) process.exit(1);
}

main();
