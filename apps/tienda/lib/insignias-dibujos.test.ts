import { describe, expect, it } from "vitest";
import { DIBUJOS_DE_INSIGNIA, type PiezaDeInsignia } from "@cayla-retail/shared/insignias-visual";

// Los dibujos de las insignias (ADR-0489) son DATOS compartidos con el ERP (`packages/shared/src/insignias-visual.ts`); la tienda los
// pinta con los colores de la tienda. Aquí se cuida lo que haría que se vieran mal en un chip: un color suelto (no cambiaría con el
// tema) o una pieza que el pintor no sabe dibujar.
const COLORES = new Set(["$acento", "$hueco", "$tinta"]);
const ETIQUETAS = new Set(["path", "rect", "circle", "ellipse", "g"]);

function recorrer(piezas: readonly PiezaDeInsignia[], f: (p: PiezaDeInsignia) => void) {
  for (const p of piezas) {
    f(p);
    if (p.hijos) recorrer(p.hijos, f);
  }
}

describe("los dibujos de las insignias", () => {
  it("hay uno por cada familia, más el genérico, y ninguno está vacío", () => {
    expect(Object.keys(DIBUJOS_DE_INSIGNIA)).toHaveLength(22);
    expect(Object.keys(DIBUJOS_DE_INSIGNIA)).toContain("halloween");
    expect(Object.keys(DIBUJOS_DE_INSIGNIA)).toContain("findeano");
    expect(Object.keys(DIBUJOS_DE_INSIGNIA)).toContain("generico");
    for (const piezas of Object.values(DIBUJOS_DE_INSIGNIA)) expect(piezas.length).toBeGreaterThan(0);
  });

  it("solo usan colores con nombre: ningún hex, rgb ni nombre de color suelto (cada lugar pone el suyo, claro u oscuro)", () => {
    for (const piezas of Object.values(DIBUJOS_DE_INSIGNIA)) {
      recorrer(piezas, (p) => {
        expect(ETIQUETAS.has(p.tag)).toBe(true);
        for (const [k, v] of Object.entries(p.props)) {
          if (typeof v !== "string") continue;
          if (k === "fill" || k === "stroke") expect(v === "none" || COLORES.has(v)).toBe(true);
          expect(v).not.toMatch(/#|rgb|hsl|var\(/i);
        }
      });
    }
  });
});
