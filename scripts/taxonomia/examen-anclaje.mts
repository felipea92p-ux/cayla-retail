/**
 * El examen de admisión del modelo (ADR-0030).
 *
 * QUÉ HACE. Corre el anclaje real del vocabulario de la marca —el MISMO prompt
 * y el mismo código que usa la pantalla— e imprime lo que propondría, sin
 * escribir nada en la base.
 *
 * PARA QUÉ SIRVE. `claude-haiku-4-5` se eligió por medición, no por opinión, y
 * el caso de prueba es el vocabulario de CAYLA: 30 colores y 37 categorías que
 * Felipe conoce de memoria, así que un error se ve sin herramientas. Este script
 * es esa medición, repetible. Correrlo cuando:
 *   · se cambie de modelo (¿el más barato sigue acertando?)
 *   · salga una versión nueva del estándar (¿se movió algo bajo los pies?)
 *   · se toque el prompt de `anclar-ia.ts`
 *
 * NO ESCRIBE NADA. Es solo el examen; guardar es decisión de una persona en
 * /inventario/taxonomia.
 *
 * LO QUE YA ENCONTRÓ, y por eso existe: la primera corrida (2026-09-10) destapó
 * que `getCategoriasUniversales` mandaba solo las hojas del árbol y escondía
 * "Bolsos", "Lencería" y "Trajes de baño" —que tienen hijos—, así que el modelo
 * devolvía "no encontré nada" para categorías que sí estaban. Un bug de diseño
 * que ninguna prueba unitaria habría visto.
 *
 * USO (desde apps/web, que es donde viven las dependencias)
 *   cd apps/web
 *   npx tsx --conditions=react-server ../../scripts/taxonomia/examen-anclaje.mts colores
 *   npx tsx --conditions=react-server ../../scripts/taxonomia/examen-anclaje.mts categorias
 *
 * `--conditions=react-server` no es opcional: `anclar-ia.ts` importa
 * `server-only`, que fuera de Next resuelve a la versión que lanza error salvo
 * bajo esa condition.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { anclar } from "../../apps/web/lib/taxonomia/anclar-ia.ts";
import type { TerminoPropio, TerminoUniversal } from "../../apps/web/lib/taxonomia/anclar.ts";

const CONTENEDOR = "supabase_db_cayla-retail";

/** Lee del Postgres local. El examen corre contra local a propósito: es gratis
 *  equivocarse ahí, y el vocabulario es el mismo que en producción. */
function consultar<T>(sql: string): T {
  const salida = execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", "-tAqc", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(salida.trim());
}

const que = process.argv[2] === "categorias" ? "categorias" : "colores";

const propios = consultar<TerminoPropio[]>(
  que === "colores"
    ? `select coalesce(json_agg(json_build_object('clave',codigo,'nombre',nombre,'contexto',familia_color) order by orden,nombre),'[]') from retail.colores where activo;`
    : `select coalesce(json_agg(json_build_object('clave',id::text,'nombre',nombre,'contexto',familia) order by familia,nombre),'[]') from retail.categorias;`
);

const universales = consultar<TerminoUniversal[]>(
  que === "colores"
    ? `select coalesce(json_agg(json_build_object('id',v.id,'nombre',v.nombre) order by v.nombre),'[]') from retail.taxonomia_valores v join retail.taxonomia_atributos a on a.id=v.atributo_id where a.handle='color';`
    : // nivel > 1 y NO solo hojas: ver el comentario de getCategoriasUniversales.
      `select coalesce(json_agg(json_build_object('id',c.id,'nombre',c.nombre,'ruta',c.ruta) order by c.ruta),'[]') from retail.taxonomia_categorias c where c.nivel > 1;`
);

// La clave sale de .env.local igual que en la app: un examen que use otra
// credencial no estaría probando lo que corre de verdad.
const env = readFileSync(new URL("../../apps/web/.env.local", import.meta.url), "utf8");
const clave = /^ANTHROPIC_API_KEY=(.+)$/m.exec(env);
if (!clave) throw new Error("Falta ANTHROPIC_API_KEY en apps/web/.env.local");
process.env.ANTHROPIC_API_KEY = clave[1].trim();

const t0 = Date.now();
const { anclajes, conIA } = await anclar(
  propios,
  universales,
  que === "colores" ? "colores" : "categorías de producto"
);
const seg = ((Date.now() - t0) / 1000).toFixed(1);

const nombrePropio = new Map(propios.map((p) => [p.clave, p.nombre]));
const nombreUniv = new Map(universales.map((u) => [u.id, u.ruta ?? u.nombre]));

console.log(
  `\n${propios.length} términos · ${propios.length - conIA} por código (gratis) · ${conIA} por IA · ${seg}s\n`
);

// De menor a mayor confianza: lo dudoso primero, que es lo que hay que mirar.
const orden = { baja: 0, media: 1, alta: 2, exacta: 3 } as const;
for (const a of [...anclajes].sort((x, y) => orden[x.confianza] - orden[y.confianza])) {
  if (a.confianza === "exacta") continue; // el nombre coincide: nada que revisar
  console.log(
    `[${a.confianza.padEnd(5)}] ${String(nombrePropio.get(a.clave)).padEnd(22)} → ${
      a.universalId ? nombreUniv.get(a.universalId) : "SIN ANCLAR"
    }`
  );
  if (a.porque) console.log(`          ${a.porque}`);
}

const exactas = anclajes.filter((a) => a.confianza === "exacta");
console.log(
  `\n(${exactas.length} por coincidencia exacta, sin gastar un token: ${exactas
    .map((a) => nombrePropio.get(a.clave))
    .join(", ")})`
);
