#!/usr/bin/env node
/**
 * El tablero de auditorías de «Al milímetro», armado desde la carpeta (ADR-0259, act. 2026-11-17).
 *
 * EL PROBLEMA. Cada auditoría de `/milimetro` dejaba su informe en `docs/milimetro/auditorias/` Y una fila escrita a mano
 * en la primera línea de la tabla de `docs/milimetro/README.md`. Como la skill es obligatoria en todo cambio visual, dos
 * PR abiertos a la vez escribían siempre en la misma línea y el segundo en fusionarse chocaba. La fila no decía nada que
 * el informe no dijera ya: era una copia, y la copia era lo que chocaba.
 *
 * QUÉ PROMETE. Lee los informes de la carpeta y arma el tablero, el más nuevo arriba: fecha, ruta o pieza, resumen e
 * informe. No escribe nada: el tablero no se guarda en un archivo, porque un archivo que todo PR regenera volvería a
 * chocar. Con `--verificar` (lo corre el CI) falla si un informe posterior al corte no trae con qué armar su fila.
 *
 * QUÉ ASUME. Un informe se llama `AAAA-MM-DD-<tema>.md`, empieza con un título `# …` y dice su resultado en una línea
 * `Resumen: …`. Los informes hasta el corte nacieron sin ese acuerdo: de esos se toma la primera línea que cuente
 * graves, y si no hay ninguna la fila dice «sin resumen» en vez de fallar.
 *
 *   pnpm milimetro:auditorias              el tablero completo
 *   pnpm milimetro:auditorias --verificar  solo revisa los informes nuevos (sale con 1 si alguno no cumple)
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONGELADOS } from "../docs/entradas-por-archivo.mjs";

const CARPETA = "docs/milimetro/auditorias";
/** El mismo día en que la tabla del README dejó de recibir filas: desde ahí el informe es el único registro. */
export const CORTE = CONGELADOS.find((c) => c.archivo === "docs/milimetro/README.md").corte;

const NOMBRE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const LINEA_RESUMEN = /^\*{0,2}Resumen\b[^:]*:/;
const TOPE_RESUMEN = 150;

const sinMarcas = (texto) => texto.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();
const recortar = (texto, tope) => (texto.length > tope ? `${texto.slice(0, tope - 1).trimEnd()}…` : texto);

/** «# Auditoría al milímetro — `/productos` ▸ el «+» · 2026-11-17 · `claude/x`» → «`/productos` ▸ el «+»». */
function piezaDelTitulo(titulo) {
  return sinMarcas(titulo)
    .replace(/^(Auditoría al milímetro|Al milímetro)\s*[—·:-]\s*/i, "")
    .replace(/^(auditar|auditoría)\s*[—·:-]?\s*/i, "")
    .replace(/\s*[·—(]\s*\d{4}-\d{2}-\d{2}.*$/, "")
    .trim();
}

/** «**Resumen: 0 graves · 1 media**» o «## Resultado: 0 graves» → «0 graves · 1 media». La etiqueta se va; el dato queda. */
function datoDelResumen(linea) {
  return sinMarcas(linea)
    .replace(/^[^\d:]{1,45}:\s*/, "")
    .trim();
}

/** Lo que el tablero muestra de un informe. `texto` = el contenido del archivo. */
export function leerInforme(nombre, texto) {
  const lineas = texto.split("\n");
  const titulo = lineas.find((l) => l.startsWith("# ")) ?? "";
  const cuerpo = lineas.filter((l) => l !== titulo);
  const resumen = cuerpo.find((l) => LINEA_RESUMEN.test(l)) ?? cuerpo.find((l) => /\b\d+ graves?\b/i.test(l));
  return {
    archivo: `${CARPETA}/${nombre}`,
    fecha: NOMBRE.exec(nombre)?.[1] ?? "",
    pieza: piezaDelTitulo(titulo) || nombre,
    resumen: resumen ? recortar(datoDelResumen(resumen), TOPE_RESUMEN) : "sin resumen",
  };
}

/** Por qué un informe no alcanza para armar su fila. Solo se exige a los posteriores al corte: los de antes son historia. */
export function problemasDelInforme(nombre, texto, corte = CORTE) {
  const fecha = NOMBRE.exec(nombre)?.[1];
  if (!fecha) return [`el nombre no es AAAA-MM-DD-<tema>.md (minúsculas, números y guiones)`];
  if (fecha <= corte) return [];
  const lineas = texto.split("\n");
  const problemas = [];
  if (!lineas[0]?.startsWith("# ")) problemas.push("la primera línea no es su título (`# Auditoría al milímetro — <ruta o pieza> · …`)");
  if (!lineas.some((l) => LINEA_RESUMEN.test(l))) problemas.push("falta la línea `Resumen: <n> graves · <n> medias · <n> leves`");
  return problemas;
}

const celda = (texto) => texto.replace(/\|/g, "\\|");

/** `informes` = lo que devuelve `leerInforme`. La más nueva arriba; en un mismo día, por nombre. */
export function tablero(informes) {
  const filas = [...informes]
    .sort((a, b) => (a.archivo < b.archivo ? 1 : a.archivo > b.archivo ? -1 : 0))
    .map((i) => `| ${i.fecha} | ${celda(i.pieza)} | ${celda(i.resumen)} | ${i.archivo} |`);
  return ["| Fecha | Ruta o pieza | Resumen | Informe |", "|---|---|---|---|", ...filas].join("\n");
}

function main() {
  const raiz = fileURLToPath(new URL("../../", import.meta.url));
  const informes = readdirSync(`${raiz}${CARPETA}`)
    .filter((nombre) => nombre.endsWith(".md"))
    .map((nombre) => ({ nombre, texto: readFileSync(`${raiz}${CARPETA}/${nombre}`, "utf8") }));
  const conProblemas = informes
    .map(({ nombre, texto }) => ({ nombre, problemas: problemasDelInforme(nombre, texto) }))
    .filter(({ problemas }) => problemas.length > 0);

  if (!process.argv.includes("--verificar")) {
    console.log(tablero(informes.map(({ nombre, texto }) => leerInforme(nombre, texto))));
    console.log(`\n${informes.length} auditorías en ${CARPETA}/. Las que no dejaron informe (hasta el ${CORTE}) están en docs/milimetro/README.md.`);
  }
  if (conProblemas.length === 0) {
    if (process.argv.includes("--verificar")) console.log(`✓ Los informes posteriores al ${CORTE} traen su título y su resumen.`);
    return;
  }
  console.error("\n✗ Informes de auditoría que no alcanzan para armar su fila del tablero (ADR-0259, act. 2026-11-17):\n");
  for (const { nombre, problemas } of conProblemas) for (const problema of problemas) console.error(`  ${CARPETA}/${nombre}: ${problema}`);
  console.error("\nEl informe es el único registro de la auditoría: ya no hay una fila en docs/milimetro/README.md que lo resuma.");
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
