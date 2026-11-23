import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Las cifras de DM Sans en Inter (ADR-0694, act. 2026-11-23; Felipe eligió «B · Inter en las cifras» mirando la lámina).
 *
 * DM Sans no trae cifras tabulares: con `tabular-nums`, «1111» medía 18 px y «0000» 41 px a 14 px, y una columna de montos no
 * alineaba. La fuente `cifras` es Inter recortada a los dígitos 0–9 y va delante de DM Sans en `--font-sans`: el navegador la usa
 * solo para los dígitos. Esta prueba cuida lo que la hace funcionar y lo que la rompería sin que nadie lo note.
 */

const raiz = join(__dirname, "..");
const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

describe("las cifras en Inter (ADR-0694)", () => {
  it("la fuente de los dígitos va primera en --font-sans, antes de DM Sans", () => {
    expect(leer("app/globals.css")).toMatch(/--font-sans:\s*var\(--font-cifras\),\s*var\(--font-dm-sans\),/);
  });

  it("se carga solo para los dígitos y sin fuente de respaldo", () => {
    const layout = leer("app/layout.tsx");
    const bloque = layout.slice(layout.indexOf("localFont({"), layout.indexOf("});", layout.indexOf("localFont({")));
    expect(bloque).toContain('variable: "--font-cifras"');
    expect(bloque).toContain('src: "./fuentes/inter-cifras.woff2"');
    // Sin unicode-range, Inter se quedaría con todas las letras. Con el respaldo de next/font (Arial, sin unicode-range), también.
    expect(bloque).toMatch(/prop:\s*"unicode-range",\s*value:\s*"U\+0030-0039"/);
    expect(bloque).toContain("adjustFontFallback: false");
    expect(layout).toMatch(/className=\{`[^`]*\$\{cifras\.variable\}/);
  });

  it("el archivo es el recorte (no la Inter entera) y lleva su licencia OFL al lado", () => {
    const fuente = join(raiz, "app/fuentes/inter-cifras.woff2");
    expect(statSync(fuente).size).toBeLessThan(16 * 1024);
    expect(existsSync(join(raiz, "app/fuentes/inter-LICENCIA.txt"))).toBe(true);
    expect(leer("app/fuentes/inter-LICENCIA.txt")).toContain("SIL Open Font License");
  });

  it("los estilos piden la letra del sistema por --font-sans, no a DM Sans directo (sus dígitos no alinearían)", () => {
    // navegador-viejo.css es la excepción: se pinta en un navegador que quizá no entiende las capas, con su propio respaldo.
    const EXCEPCIONES = new Set(["app/estilos/navegador-viejo.css"]);
    const css: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) recorrer(ruta);
        else if (e.name.endsWith(".css")) css.push(ruta);
      }
    };
    recorrer(join(raiz, "app"));
    const directos = css
      .filter((f) => !f.endsWith("globals.css") && !EXCEPCIONES.has(relative(raiz, f)))
      .filter((f) => readFileSync(f, "utf8").includes("var(--font-dm-sans"))
      .map((f) => relative(raiz, f));
    expect(directos).toEqual([]);
  });
});
