// ¿Qué archivo dibuja esta variante? El navegador no sabe de qué componente salió un elemento, pero sus clases de Tailwind están
// escritas tal cual en el código: se buscan las más raras (las que casi ningún archivo usa) y gana el archivo que las tiene todas.
// Es una pista, no una prueba: el informe la marca [probable] y `/unificar` la confirma con `grep` antes de tocar nada.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CARPETAS = ["components", "app"];

// Clases que dicen «es una pieza del sistema» aunque no se sepa el archivo.
const DEL_SISTEMA = /\b(btn-cayla|btn-(?:primario|secundario|peligro|sutil|enlace)|pildora-cayla|nota-cayla|label-cayla|card-cayla|fila-cayla|encabezado-tabla-cayla|caja|fin-[a-z-]+)\b/g;

function recorrer(dir, salida = []) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    const st = statSync(ruta);
    if (st.isDirectory()) recorrer(ruta, salida);
    else if (/\.(tsx|ts|css)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

let INDICE = null;
function indice() {
  if (INDICE) return INDICE;
  const archivos = CARPETAS.flatMap((c) => recorrer(join(WEB, c))).map((ruta) => ({ ruta: relative(WEB, ruta), texto: readFileSync(ruta, "utf8") }));
  INDICE = { archivos, frecuencia: new Map() };
  return INDICE;
}

function frecuencia(token) {
  const ix = indice();
  if (!ix.frecuencia.has(token)) ix.frecuencia.set(token, ix.archivos.reduce((n, a) => n + (a.texto.includes(token) ? 1 : 0), 0));
  return ix.frecuencia.get(token);
}

/** Los archivos que probablemente dibujan un elemento con estas clases (hasta 4), y las piezas del sistema que nombra. */
export function archivosProbables(listaDeClases) {
  const ix = indice();
  const sistema = new Set();
  const votos = new Map();
  for (const clases of listaDeClases.filter(Boolean)) {
    for (const m of clases.matchAll(DEL_SISTEMA)) sistema.add(m[1]);
    // Las clases que dependen del estado (`data-[state=…]`, `aria-…`) o de React (`__`) despistan: se usan las de forma.
    const tokens = [...new Set(clases.split(/\s+/))].filter((t) => t.length > 3 && !t.includes("__") && !/^(flex|grid|block|inline|relative|absolute|hidden|items-center|justify-between|w-full|min-w-0|shrink-0|truncate)$/.test(t));
    const raros = tokens
      .map((t) => ({ t, f: frecuencia(t) }))
      .filter((x) => x.f > 0 && x.f <= 60)
      .sort((a, b) => a.f - b.f)
      .slice(0, 5)
      .map((x) => x.t);
    if (!raros.length) continue;
    for (let exigir = raros.length; exigir >= Math.max(2, Math.ceil(raros.length / 2)); exigir--) {
      const encontrados = ix.archivos.filter((a) => raros.filter((t) => a.texto.includes(t)).length >= exigir);
      if (encontrados.length && encontrados.length <= 8) {
        for (const a of encontrados) votos.set(a.ruta, (votos.get(a.ruta) || 0) + exigir);
        break;
      }
    }
  }
  const archivos = [...votos.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([ruta]) => ruta);
  return { archivos, sistema: [...sistema] };
}
