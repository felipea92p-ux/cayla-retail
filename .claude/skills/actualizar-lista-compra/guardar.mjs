// Saca el resultado de una consulta de la respuesta del conector de Supabase y lo guarda como la copia que lee el tablero.
// Uso: node guardar.mjs <archivo con la respuesta> <lista|gustos> <carpeta de salida>
// Escribe copia-<nombre>.json ({"motor": …} o {"gustos": …}) y <nombre>.json (el objeto solo, para comprobar.mjs).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [, , entrada, cual, salida] = process.argv;
const CAMPO = { lista: "motor", gustos: "gustos" }[cual];
if (!entrada || !CAMPO || !salida) { console.error("Uso: node guardar.mjs <respuesta> <lista|gustos> <carpeta>"); process.exit(2); }

let texto = readFileSync(entrada, "utf8");
try { const j = JSON.parse(texto); if (j && typeof j.result === "string") texto = j.result; } catch { /* ya es el texto */ }
const desde = texto.indexOf("[{");
const hasta = texto.lastIndexOf("}]");
if (desde < 0 || hasta < desde) { console.error("La respuesta no trae filas. ¿La consulta dio error?"); process.exit(1); }
const fila = JSON.parse(texto.slice(desde, hasta + 2))[0];
const dato = typeof fila[CAMPO] === "string" ? JSON.parse(fila[CAMPO]) : fila[CAMPO];
if (!dato || typeof dato !== "object") { console.error("La fila no trae la columna «" + CAMPO + "»."); process.exit(1); }

mkdirSync(salida, { recursive: true });
writeFileSync(join(salida, "copia-" + cual + ".json"), JSON.stringify({ [CAMPO]: dato }));
writeFileSync(join(salida, cual + ".json"), JSON.stringify(dato));
console.log("guardado copia-" + cual + ".json · datos al " + dato.hoy);
