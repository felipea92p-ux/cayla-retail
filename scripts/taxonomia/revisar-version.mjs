#!/usr/bin/env node
/**
 * ¿Salió una versión nueva del estándar, y qué me movería?
 *
 * LA DECISIÓN QUE ESTE SCRIPT SIRVE (ADR-0030): la versión de la taxonomía va
 * FIJADA. El estándar saca release cada trimestre y v2026-08 sumó 2.000
 * categorías; un catálogo que se reclasifica solo de un día para otro es peor
 * que uno desactualizado. Pero "fijada" sin aviso es "olvidada": este script es
 * el aviso. Dice si hay una versión nueva y —lo que de verdad importa— cuáles
 * de las categorías que la marca YA ANCLÓ cambiarían de nombre o desaparecerían
 * si se subiera. Con eso, subir es una decisión informada y no un salto.
 *
 * QUÉ HACE
 *   1. Pregunta a GitHub cuál es la última release.
 *   2. Lee de la base cuál está activa y qué categorías propias cuelgan de cuál.
 *   3. Si hay una nueva, la descarga (sin cargarla) y cruza: por cada anclaje,
 *      ¿la categoría universal sigue existiendo? ¿con el mismo nombre?
 *
 * NO ESCRIBE NADA. Subir de versión es editar VERSION_FIJADA en cargar.mjs y
 * correrlo — a conciencia, con esta lista delante.
 *
 * USO
 *   node scripts/taxonomia/revisar-version.mjs
 */

import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const CONTENEDOR = "supabase_db_cayla-retail";
const REPO = "Shopify/product-taxonomy";

function consultar(sql) {
  const salida = execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", "-tAqc", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  return salida.trim();
}

async function main() {
  // ---------- 1. la última release ----------
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "cayla-retail" },
  });
  if (!res.ok) throw new Error(`GitHub respondió ${res.status} al consultar la última release.`);
  const release = await res.json();
  const ultima = String(release.tag_name).replace(/^v/, "");
  const publicada = String(release.published_at).slice(0, 10);

  // ---------- 2. la activa ----------
  const activa = consultar(`select version from retail.taxonomia_versiones where es_activa limit 1;`);
  if (!activa) {
    console.log("No hay ninguna versión activa en la base. Carga una con: node scripts/taxonomia/cargar.mjs --aplicar");
    return;
  }

  console.log(`Activa en la base:  v${activa}`);
  console.log(`Última publicada:   v${ultima}  (${publicada})`);

  if (ultima === activa) {
    console.log(`\nEstás al día. Nada que hacer.`);
    return;
  }

  // ---------- 3. qué se movería ----------
  // Solo interesan las categorías universales de las que cuelga algo propio: son
  // las únicas cuyo cambio le importa a la marca. Las otras 1.800 pueden cambiar
  // cuanto quieran.
  const ancladas = JSON.parse(
    consultar(`select coalesce(json_agg(json_build_object(
        'propia', c.nombre, 'universalId', c.taxonomia_categoria_id, 'universalNombre', t.nombre)), '[]')
      from retail.categorias c join retail.taxonomia_categorias t on t.id = c.taxonomia_categoria_id;`) || "[]"
  );

  console.log(`\nHay una versión nueva. ${ancladas.length} categorías propias cuelgan del estándar; revisando cuáles se moverían…`);

  const url = `https://github.com/${REPO}/releases/download/v${ultima}/categories.es.json.gz`;
  const gz = await fetch(url, { redirect: "follow" });
  if (!gz.ok) throw new Error(`No se pudo bajar la v${ultima} (HTTP ${gz.status}).`);
  const nuevo = JSON.parse(gunzipSync(Buffer.from(await gz.arrayBuffer())).toString("utf8"));

  const enNueva = new Map();
  for (const v of nuevo.verticals ?? []) {
    for (const c of v.categories ?? []) enNueva.set(String(c.id).split("/").pop(), c.name);
  }

  const desaparecen = [];
  const renombradas = [];
  for (const a of ancladas) {
    const nombreNuevo = enNueva.get(a.universalId);
    if (nombreNuevo === undefined) desaparecen.push(a);
    else if (nombreNuevo !== a.universalNombre) renombradas.push({ ...a, nombreNuevo });
  }

  if (desaparecen.length === 0 && renombradas.length === 0) {
    console.log(`\nNinguna de tus categorías ancladas cambia en la v${ultima}. Subir es seguro.`);
  } else {
    if (desaparecen.length) {
      console.log(`\n  DESAPARECEN en la v${ultima} (habría que re-anclar a mano):`);
      for (const a of desaparecen) console.log(`    · ${a.propia}  →  ${a.universalId} "${a.universalNombre}"`);
    }
    if (renombradas.length) {
      console.log(`\n  CAMBIAN DE NOMBRE (el anclaje sigue válido; solo cambia cómo se muestra):`);
      for (const a of renombradas) console.log(`    · ${a.propia}  →  "${a.universalNombre}" pasa a "${a.nombreNuevo}"`);
    }
  }

  console.log(`\nPara subir: editar VERSION_FIJADA en scripts/taxonomia/cargar.mjs a "${ultima}" y correr:`);
  console.log(`  node scripts/taxonomia/cargar.mjs --aplicar`);
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exitCode = 1;
});
