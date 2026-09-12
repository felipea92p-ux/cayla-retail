#!/usr/bin/env node
/**
 * Carga la taxonomía universal (Shopify Standard Product Taxonomy) a Postgres.
 *
 * QUÉ HACE. Descarga un release FIJADO del estándar, se queda con los verticales
 * que le interesan a CAYLA, y genera un archivo .sql idempotente. Con `--aplicar`
 * además lo corre contra el Postgres local.
 *
 * POR QUÉ GENERA SQL EN VEZ DE ESCRIBIR DIRECTO A SUPABASE. Las tablas de
 * taxonomía no tienen policy de insert a propósito (0052): el estándar no se
 * edita desde la app. Escribir por la API pediría una service key que este repo
 * hoy no guarda. Generar SQL resuelve los dos caminos con una sola pieza: local
 * se aplica con psql, y producción se pega en el SQL Editor — ahí sí con el
 * prefijo `retail.` (CLAUDE.md §"Cómo aplicar SQL a producción").
 *
 * POR QUÉ EL .SQL NO VA A GIT. Es dato derivado: ~2 MB reproducibles con un
 * comando desde un release inmutable. Versionarlo sería guardar el resultado de
 * una descarga en vez de la instrucción para hacerla.
 *
 * USO
 *   node scripts/taxonomia/cargar.mjs              # solo genera el .sql
 *   node scripts/taxonomia/cargar.mjs --aplicar    # genera y aplica en local
 *   node scripts/taxonomia/cargar.mjs --version 2026-11 --verticales aa,sg
 */

import { gunzipSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { VERSION_FIJADA } from "./version.mjs";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

/**
 * La versión va FIJADA (en version.mjs, compartida por los tres scripts), no se
 * resuelve a "latest". El estándar saca release cada trimestre y v2026-08 sumó
 * 2.000 categorías; un catálogo que se reclasifica solo de un día para otro es
 * peor que uno desactualizado. Subir de versión es editar esa línea a
 * conciencia — y `revisar-version.mjs` avisa cuándo vale la pena.
 */

/**
 * Los verticales que cubren las 6 familias de CAYLA (`categorias.familia`):
 *   aa → indumentaria, calzado, accesorios, bisutería   hb → belleza
 *   os → papelería                                      lb → bolsos de viaje
 * Cargar los 26 verticales serían ~14.500 categorías, y las 12.600 que sobran
 * (electrónica, vehículos, mascotas) solo harían más ruidoso el prompt de la IA
 * y más lenta cada búsqueda. Agregar uno después no necesita migración: se
 * corre este script con `--verticales` y listo.
 */
const VERTICALES_CAYLA = ["aa", "hb", "os", "lb"];

const BASE = "https://github.com/Shopify/product-taxonomy/releases/download";

/* ---------------- argumentos ---------------- */

function arg(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

const version = arg("version", VERSION_FIJADA);
const verticales = arg("verticales", VERTICALES_CAYLA.join(",")).split(",").map((v) => v.trim());
const aplicar = process.argv.includes("--aplicar");

/* ---------------- descarga ---------------- */

async function bajarJson(archivo) {
  const url = `${BASE}/v${version}/${archivo}.gz`;
  const res = await fetch(url, { redirect: "follow" });
  // Un 404 acá casi siempre significa versión inexistente, no red caída: el
  // mensaje lo dice en vez de dejar un "unexpected token" de JSON.parse.
  if (!res.ok) {
    throw new Error(
      `No se pudo bajar ${archivo} de la versión ${version} (HTTP ${res.status}).\n` +
        `Verifica que exista: https://github.com/Shopify/product-taxonomy/releases`
    );
  }
  return JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"));
}

/* ---------------- utilidades ---------------- */

/** 'gid://shopify/TaxonomyCategory/aa-1-1-2-4' -> 'aa-1-1-2-4' */
const idCorto = (gid) => String(gid).split("/").pop();

/** Escapa para literal SQL. Null explícito, nunca la cadena 'null'. */
const lit = (v) => (v == null || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);

/** INSERTs en lotes: 20.000 filas en un solo statement ahoga al parser. */
function insertar(tabla, columnas, filas, conflicto) {
  if (filas.length === 0) return "";
  const trozos = [];
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    trozos.push(
      `insert into ${tabla} (${columnas.join(", ")}) values\n` +
        lote.map((f) => `  (${f.join(", ")})`).join(",\n") +
        `\n${conflicto};`
    );
  }
  return trozos.join("\n\n");
}

/* ---------------- construcción ---------------- */

async function main() {
  console.log(`Taxonomía universal v${version} — verticales: ${verticales.join(", ")}\n`);

  const [catsJson, attrsJson] = await Promise.all([
    bajarJson("categories.es.json"),
    bajarJson("attributes.es.json"),
  ]);

  // --- categorías de los verticales pedidos ---
  const categorias = [];
  for (const prefijo of verticales) {
    const v = (catsJson.verticals || []).find((x) => x.prefix === prefijo);
    if (!v) {
      throw new Error(`El vertical '${prefijo}' no existe en la versión ${version}.`);
    }
    for (const c of v.categories || []) {
      categorias.push({
        id: idCorto(c.id),
        nombre: c.name,
        ruta: c.full_name,
        padreId: c.parent_id ? idCorto(c.parent_id) : null,
        nivel: c.level,
        vertical: prefijo,
        // `extended: true` son variantes específicas del atributo base ("Color de
        // la correa" cuelga de "Color"). Se descartan: multiplican el volumen y
        // para clasificar una prenda alcanza el atributo base.
        atributos: (c.attributes || []).filter((a) => !a.extended).map((a) => idCorto(a.id)),
      });
    }
    console.log(`  ${prefijo}: ${(v.categories || []).length} categorías`);
  }

  // --- solo los atributos que alguna de esas categorías realmente usa ---
  const usados = new Set(categorias.flatMap((c) => c.atributos));
  const atributos = (attrsJson.attributes || []).filter((a) => usados.has(idCorto(a.id)));
  const valores = atributos.flatMap((a) =>
    (a.values || []).map((v) => ({
      id: idCorto(v.id),
      atributoId: idCorto(a.id),
      handle: v.handle,
      nombre: v.name,
    }))
  );

  console.log(
    `\n  ${categorias.length} categorías · ${atributos.length} atributos · ${valores.length} valores`
  );

  /**
   * El padre es FK a la misma tabla, así que un hijo insertado antes que su
   * padre revienta. Ordenar por nivel ascendente lo garantiza sin necesitar
   * constraints diferidas — el JSON no promete venir ordenado.
   */
  categorias.sort((a, b) => a.nivel - b.nivel);

  const sql = [
    `-- Taxonomía universal v${version} — GENERADO por scripts/taxonomia/cargar.mjs`,
    `-- Verticales: ${verticales.join(", ")}`,
    `-- No editar a mano: se regenera con: node scripts/taxonomia/cargar.mjs`,
    ``,
    `-- El search_path va DENTRO del archivo, y dice \`retail\` para los dos entornos.`,
    `-- No es un descuido de CLAUDE.md §"Cómo aplicar SQL a producción": esa regla`,
    `-- habla de las MIGRACIONES, que corren durante \`db reset\` cuando todo vive`,
    `-- todavía en \`public\` y el seed aún no lo renombró (ADR-0010). Este seed corre`,
    `-- DESPUÉS de ese renombrado, así que local y producción tienen la misma forma`,
    `-- y el mismo prefijo — que es justamente lo que ADR-0010 buscaba.`,
    `set search_path to retail, public;`,
    ``,
    `begin;`,
    ``,
    `insert into taxonomia_versiones (version, es_activa) values (${lit(version)}, false)`,
    `  on conflict (version) do nothing;`,
    ``,
    insertar(
      "taxonomia_atributos",
      ["id", "handle", "nombre", "descripcion"],
      atributos.map((a) => [lit(idCorto(a.id)), lit(a.handle), lit(a.name), lit(a.description)]),
      "on conflict (id) do update set handle = excluded.handle, nombre = excluded.nombre, descripcion = excluded.descripcion"
    ),
    ``,
    insertar(
      "taxonomia_valores",
      ["id", "atributo_id", "handle", "nombre"],
      valores.map((v) => [lit(v.id), lit(v.atributoId), lit(v.handle), lit(v.nombre)]),
      "on conflict (id) do update set atributo_id = excluded.atributo_id, handle = excluded.handle, nombre = excluded.nombre"
    ),
    ``,
    insertar(
      "taxonomia_categorias",
      ["id", "nombre", "ruta", "padre_id", "nivel", "vertical"],
      categorias.map((c) => [lit(c.id), lit(c.nombre), lit(c.ruta), lit(c.padreId), c.nivel, lit(c.vertical)]),
      "on conflict (id) do update set nombre = excluded.nombre, ruta = excluded.ruta, padre_id = excluded.padre_id, nivel = excluded.nivel, vertical = excluded.vertical"
    ),
    ``,
    insertar(
      "taxonomia_categoria_atributos",
      ["categoria_id", "atributo_id"],
      categorias.flatMap((c) => c.atributos.map((a) => [lit(c.id), lit(a)])),
      "on conflict do nothing"
    ),
    ``,
    `-- La versión se activa al final: si algo de arriba falló, la transacción vuelve`,
    `-- atrás y sigue activa la anterior. Nunca hay una versión activa a medio cargar.`,
    `update taxonomia_versiones set es_activa = false where es_activa;`,
    `update taxonomia_versiones set es_activa = true, cargada_en = now() where version = ${lit(version)};`,
    ``,
    `commit;`,
    ``,
  ].join("\n");

  const dir = join(RAIZ, "supabase", "seed-taxonomia");
  mkdirSync(dir, { recursive: true });
  const salida = arg("salida", join(dir, `taxonomia-${version}.sql`));
  writeFileSync(salida, sql, "utf8");
  console.log(`\n  -> ${salida} (${(sql.length / 1024 / 1024).toFixed(2)} MB)`);

  if (!aplicar) {
    console.log(`\nPara aplicarlo en local:  node scripts/taxonomia/cargar.mjs --aplicar`);
    return;
  }

  console.log(`\nAplicando contra el Postgres local (supabase_db_cayla-retail)…`);
  try {
    const salidaPsql = execFileSync(
      "docker",
      [
        "exec", "-i", "supabase_db_cayla-retail",
        "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-",
      ],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }
    );
    console.log(salidaPsql.trim().split("\n").slice(-6).join("\n"));
    console.log(`\n  Listo. Verifica:  select count(*) from taxonomia_categorias where vertical = 'aa';`);
  } catch (e) {
    // stderr de psql dice exactamente qué statement falló; tragarlo obligaría a
    // reproducir el error a ciegas.
    console.error(`\nFalló al aplicar:\n${e.stderr || e.message}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exitCode = 1;
});
