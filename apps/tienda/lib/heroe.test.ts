import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETA_DE_SIEMPRE, coloresEnTema, variablesDePaleta } from "@cayla-retail/portada";

// El héroe de la portada vive en @cayla-retail/portada (ADR-0436): sus colores son las variables `--t-hero*`. La tienda las define en
// sus tokens (las usan también la entrada y la banda de ofertas), y el ERP las toma de la paleta «Rojo CAYLA» para la vista previa de
// una campaña sin diseño. Si uno cambia y el otro no, el ERP mostraría una portada que el cliente no ve.

const CSS = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

function variablesDelBloque(bloque: string) {
  return Object.fromEntries([...bloque.matchAll(/(--t-hero[\w-]*):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

describe("los colores del héroe de la tienda son la paleta de siempre", () => {
  it("en claro: las seis variables de :root", () => {
    const raices = [...CSS.matchAll(/:root \{([^}]*)\}/g)].map((m) => variablesDelBloque(m[1])).filter((b) => Object.keys(b).length > 0);
    expect(raices).toHaveLength(1);
    expect(raices[0]).toEqual(variablesDePaleta(coloresEnTema(PALETA_DE_SIEMPRE, "claro")));
  });

  it("en oscuro: el fondo y su segundo tono bajan (las dos formas de pedirlo, por el sistema y a mano)", () => {
    const noche = variablesDePaleta(coloresEnTema(PALETA_DE_SIEMPRE, "oscuro"));
    const bloques = [...CSS.matchAll(/:root(?::not\(\[data-theme="light"\]\)|\[data-theme="dark"\]) \{([^}]*)\}/g)].map((m) => variablesDelBloque(m[1]))
      .filter((b) => Object.keys(b).length > 0);
    expect(bloques).toHaveLength(2);
    for (const b of bloques) expect(b).toEqual({ "--t-hero": noche["--t-hero"], "--t-hero-2": noche["--t-hero-2"] });
  });
});
