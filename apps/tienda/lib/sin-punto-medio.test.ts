import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { detalleDicho } from "./detalle-dicho";

// Felipe, 2026-11-25: en la tienda, «a toda costa», nunca «·» (punto medio) como separador entre datos («Negro · Talla M», «Pedido W-0012 ·
// Trujillo»). Amontona datos distintos en una línea y no dice dónde termina uno y empieza el otro. Cada dato va en su pieza (el pie legal,
// el código y el total de un pedido) o, si comparten una línea, en una frase («Negro, talla M», «Pedido W-0012 en Trujillo», «3 prendas por
// S/ 120.00»). Los títulos de la pestaña del navegador usan «|». Esta prueba mira todo lo que la tienda dibuja o escribe (componentes,
// páginas, `lib/`), sin sus comentarios: en un comentario el «·» no lo ve nadie.

const TIENDA = join(__dirname, "..");
const FUERA = new Set(["node_modules", ".next", "public", "coverage", "scripts"]);

function archivos(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    if (FUERA.has(e.name)) return [];
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [ruta] : [];
  });
}

/** El código sin comentarios de bloque (también los `{/* … *\/}` de JSX) ni de línea. Un `//` dentro de un texto («https://») no se toca:
 *  solo cuenta como comentario al empezar la línea o después de un espacio. */
const sinComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

const PUNTO_MEDIO = /·|\\u00b7|&middot;/i;

describe("la tienda no separa datos con «·» (Felipe 2026-11-25)", () => {
  it("ningún texto que se ve lleva un punto medio", () => {
    const conPunto = [join(TIENDA, "app"), join(TIENDA, "components"), join(TIENDA, "lib")].flatMap(archivos).flatMap((ruta) =>
      sinComentarios(readFileSync(ruta, "utf8"))
        .split("\n")
        .flatMap((linea, i) => (PUNTO_MEDIO.test(linea) ? [`${relative(TIENDA, ruta)}:${i + 1}  ${linea.trim()}`] : [])),
    );
    expect(conPunto, "Separa con piezas o con una frase («Negro, talla M»), nunca con «·».").toEqual([]);
  });

  it("el detalle de una prenda es una frase: comas, sin lo vacío y con mayúscula al empezar", () => {
    expect(detalleDicho(["Negro", "talla M"])).toBe("Negro, talla M");
    expect(detalleDicho([null, "talla M"])).toBe("Talla M");
    expect(detalleDicho(["Negro", null, "en Trujillo"])).toBe("Negro, en Trujillo");
    expect(detalleDicho([undefined, false, null])).toBe("");
  });
});
