import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// P15 del análisis del Taller (2026-11-02): una colaboradora de tienda que abría una pantalla de Producción caía en Inicio sin una palabra y parecía que el
// sistema se había roto. Toda pantalla de Producción que se cierra por no estar parado en el Taller muestra `<ProduccionSoloEnTaller>` a TODOS, sin redirigir a nadie,
// y le dice a cada quien lo que sí puede hacer (el líder cambia la sede; quien no lo es, lo pide). Una pantalla nueva con esa puerta entra sola a esta prueba.

const RAIZ = join(__dirname, "..", "app", "(app)", "produccion");

function paginas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return paginas(ruta);
    return n === "page.tsx" ? [ruta] : [];
  });
}

const conLaPuerta = paginas(RAIZ).filter((p) => readFileSync(p, "utf8").includes("puedeVerProduccion"));

describe("las pantallas de Producción no mandan a nadie a Inicio sin decirle por qué", () => {
  it("hay pantallas con la puerta del Taller (la prueba no puede quedar vacía)", () => {
    expect(conLaPuerta.length).toBeGreaterThanOrEqual(9);
  });
  it.each(conLaPuerta.map((p) => [p.slice(RAIZ.length)]))("%s muestra el aviso a todos y no redirige", (ruta) => {
    const codigo = readFileSync(join(RAIZ, ruta), "utf8");
    expect(codigo).not.toMatch(/redirect\("\/"\)/);
    expect(codigo).toMatch(/<ProduccionSoloEnTaller [^>]*puedeCambiarUbicacion=\{persona\.puedeCambiarUbicacion\}/);
  });
});
