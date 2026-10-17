import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETA_DE_SIEMPRE, coloresEnTema, variablesDePaleta } from "@cayla-retail/portada";

// El héroe de la portada vive en @cayla-retail/portada (ADR-0436): sus colores son las variables `--t-hero*`. La tienda las define en
// sus tokens (las usan también la entrada y la banda de ofertas), y el ERP las toma de la paleta «Rojo CAYLA» para la vista previa de
// una campaña sin diseño. Si uno cambia y el otro no, el ERP mostraría una portada que el cliente no ve.

const CSS = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

// Las seis que la tienda define en sus tokens; las otras dos (`--t-hero-colibri`, `--t-hero-boton-letra`) solo las pone un diseño, y
// sin ellas `heroe.css` usa las de siempre.
const SEIS = ["--t-hero", "--t-hero-2", "--t-hero-tinta", "--t-hero-acento", "--t-hero-vidrio", "--t-hero-filo"] as const;
const seis = (v: Record<string, string>) => Object.fromEntries(SEIS.map((k) => [k, v[k]]));

function variablesDelBloque(bloque: string) {
  return Object.fromEntries([...bloque.matchAll(/(--t-hero[\w-]*):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

describe("los colores del héroe de la tienda son la paleta de siempre", () => {
  it("en claro: las seis variables de :root", () => {
    const raices = [...CSS.matchAll(/:root \{([^}]*)\}/g)].map((m) => variablesDelBloque(m[1])).filter((b) => Object.keys(b).length > 0);
    expect(raices).toHaveLength(1);
    expect(raices[0]).toEqual(seis(variablesDePaleta(coloresEnTema(PALETA_DE_SIEMPRE, "claro"))));
  });

  it("en oscuro: el fondo y su segundo tono bajan (las dos formas de pedirlo, por el sistema y a mano)", () => {
    const noche = variablesDePaleta(coloresEnTema(PALETA_DE_SIEMPRE, "oscuro"));
    const bloques = [...CSS.matchAll(/:root(?::not\(\[data-theme="light"\]\)|\[data-theme="dark"\]) \{([^}]*)\}/g)].map((m) => variablesDelBloque(m[1]))
      .filter((b) => Object.keys(b).length > 0);
    expect(bloques).toHaveLength(2);
    for (const b of bloques) expect(b).toEqual({ "--t-hero": noche["--t-hero"], "--t-hero-2": noche["--t-hero-2"] });
  });
});

// La vista previa del ERP dibuja el héroe fuera de la tienda (`@cayla-retail/portada/lienzo.css`) con una copia de las caras de la
// tienda que salen dentro de él. Si la tienda cambia su botón o su enlace, la copia tiene que cambiar con él.
const LIENZO = readFileSync(join(__dirname, "..", "..", "..", "packages", "portada", "src", "lienzo.css"), "utf8");

function declaraciones(css: string, selector: string): Record<string, string> {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regla = css.match(new RegExp(`(?:^|\\n)${escapado} \\{([^}]*)\\}`))?.[1];
  if (regla === undefined) throw new Error(`No encuentro la regla «${selector}»`);
  return Object.fromEntries(
    regla
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]),
  );
}

describe("las caras de la tienda dentro del héroe son las mismas en la vista previa del ERP", () => {
  for (const cara of [".t-btn", ".t-btn-claro", ".t-enlace"]) {
    it(cara, () => {
      const tienda = declaraciones(CSS, cara);
      const copia = declaraciones(LIENZO, `.portada-lienzo ${cara}`);
      expect(Object.keys(copia).length).toBeGreaterThan(0);
      for (const [propiedad, valor] of Object.entries(copia)) expect([propiedad, tienda[propiedad]]).toEqual([propiedad, valor]);
    });
  }
});
