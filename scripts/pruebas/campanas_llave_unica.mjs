#!/usr/bin/env node
/**
 * La llave de las campañas (ADR-0476) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261022203000_campanas_llave_de_los_tres_modulos.sql` (Felipe 2026-10-22: «quiero que se pueda editar, agregar
 * prendas y demás cosas a las campañas desde ambos módulos»):
 *   1. Con CUALQUIERA de los tres módulos —«Campañas» (`campanas`), «Campañas de la tienda web» (`campanas_web`) o «Sellos»
 *      (`etiquetas`)— una integrante crea una campaña (nace aprobada), la lee, le guarda nombre, descuento, fechas y categorías, le
 *      pone y le quita prendas, y la desactiva.
 *   2. Sin ninguno de los tres, cada una de esas puertas la rechaza con un mensaje que nombra los tres módulos.
 *   3. Un sello que NO es campaña sigue siendo solo de Sellos: con un módulo de Campañas no se le ponen prendas ni descuento.
 *   4. La migración se puede volver a correr, y lo que #1190 dejó para su editor de diseño (si existe) queda sin permiso de ejecutar.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Micaela (integrante de Trujillo): nunca se commitea nada en el
 * Postgres local que comparten los worktrees. El módulo `campanas` todavía no existe en el repo (lo crea la migración de Catálogo ▸
 * Campañas, ADR-0473): el escenario que lo usa lo inserta dentro de su transacción.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261022203000_campanas_llave_de_los_tres_modulos.sql` mete la
 * migración dentro de cada transacción. Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: el seed (Felipe líder, Micaela integrante sin Sellos ni Campañas, «Blusa Emma» con varias tallas).
 *
 * USO
 *   pnpm pruebas:campanas-llave-unica    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:campanas-llave-unica -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261022203000_campanas_llave_de_los_tres_modulos.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante, fija a Tienda Trujillo

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
    return { ok: true, salida: psql(sql).trim() };
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
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}
function esperarError(nombre, r, contiene) {
  esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `no falló: ${r.salida}` : `falló distinto: ${r.mensaje}`);
}

// ---- El punto de partida de cada escenario: como Felipe, con una campaña y un sello que no es campaña ----
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select v.id as talla from retail.variantes v where v.producto_id = :'emma' and v.activo order by v.id limit 1 \\gset
select categoria_id as cat_emma from retail.productos where id = :'emma' \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña de prueba', 'campana') returning id as camp \\gset
insert into retail.etiquetas (nombre) values ('ZZ Sello de prueba') returning id as sello \\gset
`;
const COMO_MICAELA = `set local request.jwt.claim.sub = '${MICAELA}';\n`;
// `campanas` todavía no existe en el repo (en producción sí; ADR-0473 la muda a Catálogo), y una base local a medio migrar puede no
// tener `campanas_web`: la fila del módulo se crea aquí, dentro de la transacción, si falta.
const CREAR_MODULO = (clave) => `insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable)
  values ('${clave}', 'Catálogo', '${clave}', 'prueba', 135, false, true) on conflict (clave) do nothing;\n`;
const MODULO_A_INTEGRANTE = (clave) =>
  `${clave === "etiquetas" ? "" : CREAR_MODULO(clave)}insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${clave}');\n`;
const PONER = (etq) => `select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :'${etq}', 'agregar', jsonb_build_array(:'talla'))))`;
const QUITAR = (etq) => `select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', :'${etq}', 'quitar', jsonb_build_array(:'talla'))))`;
const TRES = "«Campañas», «Campañas de la tienda web» o «Sellos»";

async function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regprocedure('retail.guardar_campana(uuid,text,numeric,date,date,uuid[])') is not null;");
    if (hay.salida !== "t") {
      console.error(`Falta la llave de las campañas: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }

  // ---------------------------------------------------------------- 1. Con cualquiera de los tres módulos
  for (const clave of ["campanas", "campanas_web", "etiquetas"]) {
    console.log(`\n— Con «${clave}» —`);
    esperarValor(
      `crea una campaña y nace aprobada`,
      correr(`${PREPARAR}${MODULO_A_INTEGRANTE(clave)}${COMO_MICAELA}
        select retail.crear_campana('ZZ Nueva de Micaela', current_date, current_date + 10) as nueva \\gset
        select estado || '|' || estilo || '|' || vigente_hasta - vigente_desde from retail.etiquetas where id = :'nueva';
        rollback;`),
      "aprobado|campana|10",
    );
    esperarValor(
      `guarda nombre, descuento, fechas y categorías, y la lee`,
      correr(`${PREPARAR}${MODULO_A_INTEGRANTE(clave)}${COMO_MICAELA}
        select retail.guardar_campana(:'camp', 'ZZ Campaña renombrada', 15, current_date, current_date + 3, array[:'cat_emma']::uuid[]);
        select concat_ws('|', d ->> 'nombre', d ->> 'pct', jsonb_array_length(d -> 'categoria_ids')) from retail.campana_detalle(:'camp') d;
        rollback;`),
      "ZZ Campaña renombrada|15.00|1",
    );
    esperarValor(
      `le pone y le quita prendas`,
      correr(`${PREPARAR}${MODULO_A_INTEGRANTE(clave)}${COMO_MICAELA}
        ${PONER("camp")};
        select count(*) from retail.variante_etiquetas where etiqueta_id = :'camp';
        ${QUITAR("camp")};
        select count(*) from retail.variante_etiquetas where etiqueta_id = :'camp';
        rollback;`),
      '{"quitadas": 0, "agregadas": 1}\n1\n{"quitadas": 1, "agregadas": 0}\n0',
    );
    esperarValor(
      `la desactiva y la vuelve a activar`,
      correr(`${PREPARAR}${MODULO_A_INTEGRANTE(clave)}${COMO_MICAELA}
        select retail.activar_campana(:'camp', false);
        select activo from retail.etiquetas where id = :'camp';
        select retail.activar_campana(:'camp', true);
        select activo from retail.etiquetas where id = :'camp';
        rollback;`),
      "f\n\nt", // la primera línea (el void de activar_campana) se va con el trim
    );
  }

  // ---------------------------------------------------------------- 2. Sin ninguno
  console.log("\n— Sin ninguno de los tres —");
  esperarError("no crea una campaña", correr(`${PREPARAR}${COMO_MICAELA}select retail.crear_campana('ZZ No');\nrollback;`), `Crear una campaña necesita el módulo ${TRES}`);
  esperarError("no la lee", correr(`${PREPARAR}${COMO_MICAELA}select retail.campana_detalle(:'camp');\nrollback;`), `Ver una campaña necesita el módulo ${TRES}`);
  esperarError(
    "no la guarda",
    correr(`${PREPARAR}${COMO_MICAELA}select retail.guardar_campana(:'camp', 'ZZ', null, null, null, '{}');\nrollback;`),
    `Configurar una campaña necesita el módulo ${TRES}`,
  );
  esperarError(
    "no le cambia el descuento por el camino de siempre",
    correr(`${PREPARAR}${COMO_MICAELA}select retail.actualizar_campana_etiqueta(:'camp', 10, null, null, '{}');\nrollback;`),
    `Una campaña se configura con ${TRES}`,
  );
  esperarError(
    "no le pone prendas",
    correr(`${PREPARAR}${COMO_MICAELA}${PONER("camp")};\nrollback;`),
    "Poner o quitar prendas necesita el módulo «Sellos», «Campañas» o «Campañas de la tienda web»",
  );
  esperarError(
    "no la desactiva",
    correr(`${PREPARAR}${COMO_MICAELA}select retail.activar_campana(:'camp', false);\nrollback;`),
    `Configurar una campaña necesita el módulo ${TRES}`,
  );
  esperarValor(
    "una campaña que crea directo nace por aprobar",
    correr(`${PREPARAR}${COMO_MICAELA}insert into retail.etiquetas (nombre, estilo) values ('ZZ Propuesta', 'campana') returning estado;\nrollback;`),
    "pendiente",
  );

  // ---------------------------------------------------------------- 3. Un sello que no es campaña sigue siendo de Sellos
  console.log("\n— Un sello que no es campaña —");
  for (const clave of ["campanas", "campanas_web"]) {
    esperarError(
      `con «${clave}» no se le ponen prendas`,
      correr(`${PREPARAR}${MODULO_A_INTEGRANTE(clave)}${COMO_MICAELA}${PONER("sello")};\nrollback;`),
      "las de otro sello, con «Sellos»",
    );
    esperarError(
      `con «${clave}» no se le pone descuento`,
      correr(`${PREPARAR}${MODULO_A_INTEGRANTE(clave)}${COMO_MICAELA}select retail.actualizar_campana_etiqueta(:'sello', 10, null, null, '{}');\nrollback;`),
      "otro sello con descuento, con «Sellos»",
    );
    esperarValor(
      `con «${clave}», un sello que crea nace por aprobar`,
      correr(`${PREPARAR}${MODULO_A_INTEGRANTE(clave)}${COMO_MICAELA}insert into retail.etiquetas (nombre) values ('ZZ Sello nuevo') returning estado;\nrollback;`),
      "pendiente",
    );
  }
  esperarValor(
    "con «etiquetas», al sello sí",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE("etiquetas")}${COMO_MICAELA}${PONER("sello")};\nrollback;`),
    '{"quitadas": 0, "agregadas": 1}',
  );

  // ---------------------------------------------------------------- 4. La migración
  console.log("\n— La migración —");
  const migracion = readFileSync(MIGRACION, "utf8");
  esperarValor(
    "se puede volver a correr, y lo de #1190 queda sin permiso de ejecutar",
    correr(`begin;
      create table if not exists retail.campana_disenos (id int);
      create or replace function retail.campana_diseno(uuid) returns int language sql as 'select 1';
      grant execute on function retail.campana_diseno(uuid) to authenticated;
      ${migracion}
      ${migracion}
      select concat_ws('|', has_function_privilege('authenticated', 'retail.campana_diseno(uuid)', 'EXECUTE'),
        obj_description('retail.campana_disenos'::regclass) like 'ARCHIVADA%',
        has_function_privilege('anon', 'retail.guardar_campana(uuid,text,numeric,date,date,uuid[])', 'EXECUTE'),
        has_function_privilege('authenticated', 'retail.fn_campana_nombre_valido(text,uuid)', 'EXECUTE'));
      rollback;`),
    "f|t|f|f",
  );

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  process.exit(fallos ? 1 : 0);
}

main();
