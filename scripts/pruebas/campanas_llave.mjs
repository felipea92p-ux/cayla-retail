#!/usr/bin/env node
/**
 * Tienda web ▸ Campañas, actividad 2 (ADR-0436) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261017151000_campanas_una_sola_llave.sql`:
 *   1. LA llave de cada etiqueta (`fn_puede_tocar_etiqueta`): una campaña la configura quien tiene Campañas; cualquier otra etiqueta
 *      (Para liquidar), quien tiene Etiquetas. Con una sola de las dos llaves no se toca lo de la otra. El líder, todo.
 *   2. Al crear: nace aprobada si quien la crea tiene la llave de esa etiqueta (una campaña con Campañas; otra, por aprobar).
 *   3. Prendas (`etiquetar_variantes`): con Campañas se ponen prendas a una campaña y no a otra etiqueta.
 *   4. `crear_campana`: el nombre (vacío, largo, repetido sin importar tildes ni mayúsculas), las fechas al revés, y con fechas nace con
 *      ellas y sin descuento.
 *   5. `guardar_campana`: nombre, descuento, fechas y categorías juntos; si algo está mal, no cambia NADA (tampoco el nombre).
 *   6. `activar_campana`: no se desactiva con prendas a mano; sin ellas sí, y se vuelve a activar.
 *   7. `campana_detalle`: sus categorías, sus variantes y sus prendas por modelo; una etiqueta que no es campaña «no existe».
 *   8. La ficha de la prenda (`20261017212000`, la puerta de Editar producto): con Productos y sin Campañas (como las terminales), una
 *      campaña no se pone (42501) ni se quita —la prenda la conserva aunque la ficha no la mande—; las demás etiquetas, sí; con Campañas,
 *      se pone y se quita.
 *   9. Quién: sin Campañas no se lee ni se guarda nada (42501). (La migración ya está pegada en producción y congelada: no se vuelve a
 *      pegar aquí, ver `apps/web/lib/campanas-migraciones-pegadas.test.ts`.)
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK. La sesión se simula con `request.jwt.claim.sub`; los módulos de Micaela
 * se le dan DENTRO de la transacción (`rol_modulos`), así que nunca queda nada.
 *
 * DA POR SENTADO (el seed): Felipe líder, Micaela colaboradora (rol «Integrante», sin Etiquetas ni Campañas), la etiqueta «Para
 * liquidar» (estilo urgencia) y alguna variante y categoría activas.
 *
 * USO
 *   pnpm pruebas:campanas-llave                                            → contra el stack local compartido
 *   pnpm pruebas:campanas-llave -- --contenedor supabase_db_<mi-pila>      → contra una pila propia
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261017151000_campanas_una_sola_llave.sql";
const MIGRACION_FICHA = "supabase/migrations/20261017212000_campanas_llave_en_editar_producto.sql";
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
    if (detalle) console.log(`    ${String(typeof detalle === "string" ? detalle : JSON.stringify(detalle)).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);
const como = (id) => `reset role;\nset local request.jwt.claim.sub = '${id}';\n`;
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
/** Le da a Micaela un módulo dentro de la transacción (se revierte con todo). */
const darle = (modulo) => `${como(MICAELA)}insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_mi_rol_id(), '${modulo}') on conflict do nothing;\n`;

/** La campaña «Prueba Gato» (aprobada, sin descuento), «Para liquidar» (no es campaña) y una variante y una categoría a mano. */
const ESCENA = `
begin;
${APLICAR_ANTES}
${INTENTO}
${como(FELIPE)}
select id as variante from retail.variantes where activo order by id limit 1 \\gset
select id as variante2 from retail.variantes where activo order by id offset 1 limit 1 \\gset
select id as categoria from retail.categorias where activo order by id limit 1 \\gset
select retail.crear_campana('Prueba Gato', null, null) as gato \\gset
select id as liquidar from retail.etiquetas where nombre = 'Para liquidar' \\gset
`;
const configurar = (id, pct) =>
  `select pg_temp.intento(format('select retail.actualizar_campana_etiqueta(%L, ${pct}, null, null, %L)', :'${id}', '{}'));\n`;
const etiquetar = (id) =>
  `select pg_temp.intento(format('select retail.etiquetar_variantes(%L::jsonb)', jsonb_build_array(jsonb_build_object('etiqueta_id', :'${id}', 'agregar', jsonb_build_array(:'variante')))));\n`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regprocedure('retail.guardar_campana(uuid,text,numeric,date,date,uuid[])') is not null;");
    if (hay.salida !== "t") {
      console.error(`Falta la migración: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }

  console.log("— La llave de cada etiqueta —");
  {
    const r = correr(`${ESCENA}
${darle("etiquetas")}${configurar("gato", 10)}${configurar("liquidar", 20)}${etiquetar("gato")}${etiquetar("liquidar")}`);
    const [campana, otra, prendasCampana, prendasOtra] = lineas(r);
    esperar("con Etiquetas (sin Campañas) no se configura una campaña", campana?.startsWith("42501"), r.ok ? r.salida : r.mensaje);
    esperar("…pero sí otra etiqueta con descuento (Para liquidar)", otra === "SIN_ERROR", otra);
    esperar("con Etiquetas no se le ponen prendas a una campaña; a otra etiqueta, sí", prendasCampana?.startsWith("42501") && prendasOtra === "SIN_ERROR", `${prendasCampana} / ${prendasOtra}`);
  }
  {
    const r = correr(`${ESCENA}
${darle("campanas")}${configurar("gato", 10)}${configurar("liquidar", 20)}${etiquetar("gato")}${etiquetar("liquidar")}`);
    const [campana, otra, prendasCampana, prendasOtra] = lineas(r);
    esperar("con Campañas (sin Etiquetas) se configura una campaña, descuento incluido", campana === "SIN_ERROR", r.ok ? r.salida : r.mensaje);
    esperar("…pero no otra etiqueta", otra?.startsWith("42501"), otra);
    esperar("con Campañas se le ponen prendas a una campaña y no a otra etiqueta", prendasCampana === "SIN_ERROR" && prendasOtra?.startsWith("42501"), `${prendasCampana} / ${prendasOtra}`);
  }
  {
    const r = correr(`${ESCENA}
${como(MICAELA)}${configurar("gato", 10)}${etiquetar("gato")}
select pg_temp.intento(format('select retail.campana_detalle(%L)', :'gato'));
select pg_temp.intento(format('select retail.guardar_campana(%L, %L, null, null, null, null)', :'gato', 'X'));
select pg_temp.intento($q$select retail.crear_campana('Otra', null, null)$q$);
select pg_temp.intento(format('select retail.activar_campana(%L, false)', :'gato'));`);
    const ls = lineas(r);
    esperar("sin ninguna de las dos, nada (configurar, prendas, detalle, guardar, crear, activar: 42501)", ls.length === 6 && ls.every((l) => l.startsWith("42501")), r.ok ? r.salida : r.mensaje);
  }

  console.log("— Al crear: la aprueba quien tiene su llave —");
  {
    const r = correr(`${ESCENA}
${darle("campanas")}
select retail.crear_campana('Campaña de Micaela', null, null) as de_micaela \\gset
select estado from retail.etiquetas where id = :'de_micaela';
insert into retail.etiquetas (nombre) values ('Etiqueta de Micaela') returning estado;`);
    const [campana, otra] = lineas(r);
    esperar("con Campañas, su campaña nace aprobada", campana === "aprobado", r.ok ? r.salida : r.mensaje);
    esperar("…y una etiqueta que no es campaña, por aprobar (esa llave es Etiquetas)", otra === "pendiente", otra);
  }

  console.log("— Crear una campaña —");
  {
    const r = correr(`${ESCENA}
select pg_temp.intento($q$select retail.crear_campana('   ', null, null)$q$);
select pg_temp.intento($q$select retail.crear_campana(repeat('a', 61), null, null)$q$);
select pg_temp.intento($q$select retail.crear_campana('prueba  gató', null, null)$q$);
select pg_temp.intento($q$select retail.crear_campana('Navidad 2027', '2027-12-25', '2027-12-01')$q$);
select retail.crear_campana('  Aniversario   Lima 2027 ', '2027-06-01', '2027-06-20') as nueva \\gset
select vigente_desde, vigente_hasta, coalesce(descuento_pct::text, 'sin'), estilo, nombre from retail.etiquetas where id = :'nueva';`);
    const [vacio, largo, repetido, alReves, conFechas] = lineas(r);
    esperar("sin nombre, no", vacio?.includes("campana_nombre"), r.ok ? r.salida : r.mensaje);
    esperar("más de 60 letras, no", largo?.includes("campana_nombre"), largo);
    esperar("un nombre que ya existe (sin importar tildes, mayúsculas ni espacios), no", repetido?.includes("campana_existe"), repetido);
    esperar("terminar antes de empezar, no", alReves?.includes("campana_fechas"), alReves);
    esperar("con fechas: nace con ellas, sin descuento, de estilo campaña y con el nombre limpio", conFechas === "2027-06-01|2027-06-20|sin|campana|Aniversario Lima 2027", conFechas);
  }

  console.log("— Guardar, todo o nada —");
  {
    const r = correr(`${ESCENA}
select retail.guardar_campana(:'gato', 'Día del Gato', 15, '2026-10-01', '2026-10-30', array[:'categoria']::uuid[]) as _g \\gset
select nombre, descuento_pct, vigente_desde, vigente_hasta, (select count(*) from retail.etiqueta_categorias where etiqueta_id = :'gato') from retail.etiquetas where id = :'gato';
select pg_temp.intento(format('select retail.guardar_campana(%L, %L, 150, null, null, null)', :'gato', 'Nombre nuevo'));
select nombre, descuento_pct from retail.etiquetas where id = :'gato';
select pg_temp.intento(format('select retail.guardar_campana(%L, %L, null, null, null, null)', :'gato', 'Para liquidar'));
select pg_temp.intento(format('select retail.guardar_campana(%L, %L, null, null, null, null)', :'liquidar', 'Otra cosa'));
select pg_temp.intento(format('select retail.guardar_campana(%L, %L, null, null, null, null)', :'gato', 'día del GATO'));`);
    const [guardada, malo, intacta, repetido, noCampana, mismoNombre] = lineas(r);
    esperar("guarda nombre, descuento, fechas y categorías juntos", guardada === "Día del Gato|15.00|2026-10-01|2026-10-30|1", r.ok ? r.salida : r.mensaje);
    esperar("un descuento de 150 % se rechaza…", malo !== "SIN_ERROR", malo);
    esperar("…y no cambia nada: tampoco el nombre", intacta === "Día del Gato|15.00", intacta);
    esperar("un nombre que ya usa otra etiqueta, no", repetido?.includes("campana_existe"), repetido);
    esperar("una etiqueta que no es campaña no se guarda por aquí", noCampana?.includes("campana_no_existe"), noCampana);
    esperar("su propio nombre con otras mayúsculas sí (no choca consigo misma)", mismoNombre === "SIN_ERROR", mismoNombre);
  }

  console.log("— Desactivar y volver a activar —");
  {
    const r = correr(`${ESCENA}
${etiquetar("gato")}
select pg_temp.intento(format('select retail.activar_campana(%L, false)', :'gato'));
delete from retail.variante_etiquetas where etiqueta_id = :'gato';
select pg_temp.intento(format('select retail.activar_campana(%L, false)', :'gato'));
select activo from retail.etiquetas where id = :'gato';
select pg_temp.intento(format('select retail.activar_campana(%L, true)', :'gato'));
select activo from retail.etiquetas where id = :'gato';`);
    const [, conPrendas, sinPrendas, apagada, otraVez, encendida] = lineas(r);
    esperar("con prendas a mano no se desactiva, y dice cuántas", conPrendas?.includes("campana_con_prendas") && conPrendas.includes("1 prenda"), r.ok ? r.salida : r.mensaje);
    esperar("sin prendas, se desactiva", sinPrendas === "SIN_ERROR" && apagada === "f", `${sinPrendas} / ${apagada}`);
    esperar("y se vuelve a activar", otraVez === "SIN_ERROR" && encendida === "t", `${otraVez} / ${encendida}`);
  }

  console.log("— La ficha de la prenda (la puerta de Editar producto) —");
  {
    // Como guarda la ficha: la lista completa de etiquetas de la variante (`asignacionesDeEtiquetas`).
    const ficha = (ids) =>
      `select pg_temp.intento(format('select retail.actualizar_variantes_etiquetas(%L::jsonb)', jsonb_build_array(jsonb_build_object('variante_id', :'variante', 'etiqueta_ids', ${ids}))));\n`;
    const tiene = (id) => `select exists (select 1 from retail.variante_etiquetas where variante_id = :'variante' and etiqueta_id = :'${id}');\n`;
    // Micaela, como una terminal: Productos sí, Campañas no (dentro de la transacción).
    const terminal = `${darle("productos")}delete from retail.rol_modulos where rol_id = retail.fn_mi_rol_id() and modulo = 'campanas';\n`;
    const r = correr(`${ESCENA}
${configurar("gato", 15)}
delete from retail.variante_etiquetas where variante_id = :'variante' and etiqueta_id in (:'gato', :'liquidar');
${terminal}
${ficha("jsonb_build_array(:'gato')")}${tiene("gato")}
${ficha("jsonb_build_array(:'liquidar')")}${tiene("liquidar")}
${como(FELIPE)}${etiquetar("gato")}
${terminal}
${ficha("'[]'::jsonb")}${tiene("gato")}${tiene("liquidar")}
${ficha("jsonb_build_array(:'gato', :'liquidar')")}${tiene("gato")}
${darle("campanas")}
${ficha("jsonb_build_array(:'liquidar')")}${tiene("gato")}
${ficha("jsonb_build_array(:'gato')")}${tiene("gato")}`);
    // La primera línea es la de `configurar`, y la quinta la de `etiquetar` (Felipe pone la campaña).
    const [, ponerSin, gatoSin, ponerOtra, liquidarSi, , guardarVacio, gatoSeQueda, liquidarSale, guardarConEl, gatoSigue, quitarCon, gatoSale, ponerCon, gatoVuelve] = lineas(r);
    esperar("sin Campañas, la ficha no pone una prenda en una campaña (42501, campana_sin_llave)", ponerSin?.startsWith("42501 campana_sin_llave") && gatoSin === "f", r.ok ? `${ponerSin} / ${gatoSin}` : r.mensaje);
    esperar("sin Campañas, la ficha sí pone una etiqueta que no es campaña (Productos, ADR-0293)", ponerOtra === "SIN_ERROR" && liquidarSi === "t", `${ponerOtra} / ${liquidarSi}`);
    esperar("guardar la ficha sin la campaña no la quita: la prenda la conserva (y lo demás sí sale)", guardarVacio === "SIN_ERROR" && gatoSeQueda === "t" && liquidarSale === "f", `${guardarVacio} / ${gatoSeQueda} / ${liquidarSale}`);
    esperar("guardar la ficha con la campaña que ya tenía no cambia nada", guardarConEl === "SIN_ERROR" && gatoSigue === "t", `${guardarConEl} / ${gatoSigue}`);
    esperar("con Campañas, la ficha quita la campaña y la vuelve a poner", quitarCon === "SIN_ERROR" && gatoSale === "f" && ponerCon === "SIN_ERROR" && gatoVuelve === "t", `${quitarCon} / ${gatoSale} / ${ponerCon} / ${gatoVuelve}`);
  }
  {
    const migracion = readFileSync(MIGRACION_FICHA, "utf8");
    const r = correr(`begin;\n${migracion}\n${migracion}\nselect 'ok';`);
    esperar("la de la ficha (20261017212000), dos veces seguidas, sin error", r.ok && r.salida.split("\n").at(-1) === "ok", r.ok ? r.salida : r.mensaje);
  }

  console.log("— La campaña por dentro —");
  {
    const r = correr(`${ESCENA}
select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :'gato', 'agregar', jsonb_build_array(:'variante', :'variante2')))) as _e \\gset
select retail.actualizar_campana_etiqueta(:'gato', null, null, null, array[:'categoria']::uuid[]) as _a \\gset
select jsonb_array_length(d->'variante_ids'), jsonb_array_length(d->'categoria_ids'), (select sum((p->>'variantes')::int) from jsonb_array_elements(d->'prendas') p), d->>'nombre'
  from (select retail.campana_detalle(:'gato') d) x;
select pg_temp.intento(format('select retail.campana_detalle(%L)', :'liquidar'));`);
    const [detalle, noCampana] = lineas(r);
    esperar("trae sus variantes, sus categorías y sus prendas por modelo (que suman sus variantes)", detalle === "2|1|2|Prueba Gato", r.ok ? r.salida : r.mensaje);
    esperar("una etiqueta que no es campaña «no existe» aquí", noCampana?.includes("campana_no_existe"), noCampana);
  }

  // Las migraciones de Campañas ya pegadas en producción (144000, 151000, 160000 y 200000, el 2026-10-17) están CONGELADAS: no se vuelven
  // a pegar aquí sobre la base final (las que siguen redefinen sus funciones, y su comprobación compara con lo que había antes de ellas).
  // Que no cambien lo vigila `apps/web/lib/campanas-migraciones-pegadas.test.ts`. Se prueban dos veces solo las que aún no se pegaron.

  console.log(`\n${total - fallos} de ${total} · contenedor: ${CONTENEDOR_LOCAL}`);
  if (fallos > 0) process.exit(1);
}

main();
