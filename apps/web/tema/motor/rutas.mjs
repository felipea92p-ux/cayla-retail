// El inventario de rutas del ERP: se lee de las carpetas de `app/(app)` (cada `page.tsx` es una pantalla), así que una pantalla nueva
// entra sola. Las rutas con segmento dinámico ([id]) y las interceptadas (@modal) no se pueden abrir sin un dato real: se
// listan aparte y se auditan con un escenario (`tema/escenarios/`) que sabe a qué registro entrar.

import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "(app)");

function paginas(dir, salida = []) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) paginas(ruta, salida);
    else if (nombre === "page.tsx") salida.push(dirname(ruta));
  }
  return salida;
}

export function inventarioDeRutas() {
  const estaticas = [];
  const dinamicas = [];
  for (const carpeta of paginas(RAIZ_APP)) {
    const segmentos = relative(RAIZ_APP, carpeta).split(sep).filter(Boolean);
    if (segmentos.some((s) => s.startsWith("@") || s.startsWith("(."))) continue; // rutas paralelas e interceptadas: no son una URL propia
    const url = "/" + segmentos.filter((s) => !(s.startsWith("(") && s.endsWith(")"))).join("/");
    (segmentos.some((s) => s.startsWith("[")) ? dinamicas : estaticas).push(url === "/" ? "/" : url);
  }
  return { estaticas: estaticas.sort(), dinamicas: dinamicas.sort() };
}

/** El «módulo» de una ruta, para filtrar con `--modulo`: su primer segmento. */
export const moduloDeRuta = (ruta) => ruta.split("/")[1] || "inicio";
