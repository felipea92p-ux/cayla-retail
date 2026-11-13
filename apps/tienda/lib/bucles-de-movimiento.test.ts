import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Los bucles de movimiento de la tienda (ADR-0524; la regla de la tienda es «ricas, una vez, sin rebote ni bucle», ADR-0430). Un movimiento que se repite
// sin parar cansa y gasta batería: solo se permiten los que son una SEÑAL de espera (el brillo del esqueleto, el hilo del velo, el hilo del probador) o una
// decisión explícita de Felipe (el desfile de la portada, con su pausa; las campañas que el líder arma en el ERP). Esta prueba cuenta los bucles de CSS por archivo,
// exactos: uno nuevo —o uno que cambia de archivo— hace fallar la prueba y obliga a escribir aquí por qué existe. Y vigila las condiciones del desfile, el único
// bucle hecho con código: que se pueda pausar, que se detenga fuera de la pantalla y con la pestaña oculta, y que no corra con «reducir movimiento».

const APP = join(__dirname, "..", "app");
const COMPONENTES = join(__dirname, "..", "components");

function archivos(carpeta: string, termina: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    return statSync(ruta).isDirectory() ? archivos(ruta, termina) : ruta.endsWith(termina) ? [ruta] : [];
  });
}

const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Los bucles de CSS que existen hoy, por archivo (cuenta exacta de `infinite`), con la razón de cada uno. */
const BUCLES_DE_CSS: Record<string, { cuantos: number; razon: string }> = {
  "estilos/catalogo.css": { cuantos: 2, razon: "el brillo de la foto vacía del esqueleto (`brillo`): dice «ya viene» mientras llega la página y se apaga al llegar" },
  "estilos/cabecera.css": { cuantos: 1, razon: "el hilo que barre bajo el nombre en el velo del cambio de tienda (ADR-0466): señal de espera, se apaga al llegar la página" },
  "estilos/probador.css": {
    cuantos: 5,
    razon: "las señales de espera de «Arma el tuyo» (el hilo que corre, la aguja, los puntos de la etiqueta y el brillo de las fotos que cargan): se apagan al llegar el resultado",
  },
  "estilos/campana-efectos.css": {
    cuantos: 2,
    razon: "los efectos de una campaña que el líder arma en el ERP (la marquesina y la frase que rota, Tienda web ▸ Campañas): decisión suya, con «reducir movimiento» no se mueve nada",
  },
};

describe("los bucles de movimiento de la tienda", () => {
  it("los de CSS son solo los declarados, con su cuenta exacta (uno nuevo hay que justificarlo aquí)", () => {
    const hallados: Record<string, number> = {};
    for (const ruta of archivos(APP, ".css")) {
      const n = (sinComentarios(readFileSync(ruta, "utf8")).match(/\binfinite\b/g) ?? []).length;
      if (n > 0) hallados[relative(APP, ruta).replaceAll("\\", "/")] = n;
    }
    const esperados = Object.fromEntries(Object.entries(BUCLES_DE_CSS).map(([archivo, { cuantos }]) => [archivo, cuantos]));
    expect(hallados).toEqual(esperados);
  });

  it("cada bucle declarado dice por qué existe", () => {
    for (const [archivo, { razon }] of Object.entries(BUCLES_DE_CSS)) expect(razon.length, archivo).toBeGreaterThan(30);
  });

  it("ninguna animación hecha con código se repite sin parar (`iterations: Infinity`), salvo el desfile, que es un ciclo propio con pausa", () => {
    const culpables = archivos(COMPONENTES, ".tsx")
      .filter((ruta) => /iterations:\s*Infinity/.test(readFileSync(ruta, "utf8")))
      .map((ruta) => relative(COMPONENTES, ruta));
    expect(culpables).toEqual([]);
  });

  it("el desfile se puede pausar, se detiene fuera de la pantalla y con la pestaña oculta, y no corre con «reducir movimiento»", () => {
    const desfile = readFileSync(join(COMPONENTES, "desfile", "EscenarioDelDesfile.tsx"), "utf8");
    expect(desfile).toContain("Pausar el desfile");
    expect(desfile).toContain("IntersectionObserver");
    expect(desfile).toContain("document.hidden");
    expect(desfile).toContain("prefers-reduced-motion");
    // Con «reducir movimiento» no arranca el ciclo: `calma` lo impide.
    expect(desfile).toMatch(/calma !== false/);
  });

  it("«reducir movimiento» apaga las transiciones de vista y la regla general acorta toda animación", () => {
    const vistas = sinComentarios(readFileSync(join(APP, "estilos", "vistas.css"), "utf8"));
    expect(vistas).toMatch(/prefers-reduced-motion: reduce[\s\S]*view-transition-group\(\*\)[\s\S]*animation: none !important/);
    const globales = sinComentarios(readFileSync(join(APP, "globals.css"), "utf8"));
    expect(globales).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation-iteration-count: 1 !important/);
  });
});
