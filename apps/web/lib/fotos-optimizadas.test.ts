import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toda foto de PRENDA pasa por `ImagenDePrenda` (el optimizador de Next, ADR-0168): una foto real de producción pesa ~214 KB (mediana;
 * 43 de más de 500 KB, 2026-10-14) y casi siempre se ve a 40–260 px. Medido con `sharp` (WebP 75): 214 KB → 1,2 KB a 96 px y 13 KB a 640 px.
 * Un `<Image unoptimized>` nuevo vuelve a bajar el original completo. Esta lista es la ÚNICA excepción: lo que no es una foto de prenda, o
 * lo que se quiere ver en su tamaño original. Un archivo nuevo no entra a la lista sin motivo.
 */
const PERMITIDOS: Record<string, string> = {
  "components/ui/ImagenDePrenda.tsx": "es la pieza: decide por foto si va optimizada o no (`fotoOptimizable`)",
  "components/existencias/FotoAmpliada.tsx": "«ver en grande»: la persona quiere el detalle del original, no una versión reducida",
  "components/GeneradorDibujo.tsx": "un dibujo recién generado (URL temporal), no una foto de prenda",
  "components/MuestraTejido.tsx": "la muestra de un tejido (otro bucket, una por tejido), no una foto de prenda",
  "components/MuestraPatron.tsx": "la muestra de un patrón (otro bucket, una por patrón), no una foto de prenda",
  "components/ui/AvatarPersona.tsx": "la foto de una persona (otro bucket), no de una prenda",
};

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (nombre === "node_modules" || nombre === ".next") return [];
    return statSync(ruta).isDirectory() ? archivos(ruta) : /\.tsx?$/.test(nombre) && !/\.test\./.test(nombre) ? [ruta] : [];
  });
}

describe("fotos de prenda optimizadas", () => {
  const raiz = join(__dirname, "..");
  const conUnoptimized = ["components", "app"]
    .flatMap((d) => archivos(join(raiz, d)))
    .filter((f) => /\bunoptimized\b/.test(readFileSync(f, "utf8")))
    .map((f) => relative(raiz, f).split("\\").join("/"))
    .sort();

  it("ningún archivo fuera de la lista usa `unoptimized`", () => {
    const sobran = conUnoptimized.filter((f) => !(f in PERMITIDOS));
    expect(sobran, `Estas fotos bajan el original completo. Usa <ImagenDePrenda> (components/ui) o suma el archivo a PERMITIDOS con su motivo: ${sobran.join(", ")}`).toEqual([]);
  });

  it("la lista no guarda archivos que ya no lo usan", () => {
    const viejos = Object.keys(PERMITIDOS).filter((f) => !conUnoptimized.includes(f));
    expect(viejos, `Quita de PERMITIDOS lo que ya no usa unoptimized: ${viejos.join(", ")}`).toEqual([]);
  });
});
