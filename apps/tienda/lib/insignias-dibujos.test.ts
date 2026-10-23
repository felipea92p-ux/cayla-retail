import { describe, expect, it } from "vitest";
import {
  DIBUJOS_DE_INSIGNIA,
  DIBUJOS_ELEGIBLES,
  NOMBRE_DEL_DIBUJO,
  dibujoDeInsignia,
  dibujoElegido,
  iconoDeInsignia,
  type PiezaDeInsignia,
} from "@cayla-retail/shared/insignias-visual";

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
    expect(Object.keys(DIBUJOS_DE_INSIGNIA)).toHaveLength(21);
    expect(Object.keys(DIBUJOS_DE_INSIGNIA)).toContain("halloween");
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

  it("la lista para elegir tiene cada dibujo exactamente una vez, y todos tienen nombre para quien elige", () => {
    expect([...DIBUJOS_ELEGIBLES].sort()).toEqual(Object.keys(DIBUJOS_DE_INSIGNIA).sort());
    expect(new Set(DIBUJOS_ELEGIBLES).size).toBe(DIBUJOS_ELEGIBLES.length);
    for (const clave of DIBUJOS_ELEGIBLES) expect(NOMBRE_DEL_DIBUJO[clave].length).toBeGreaterThan(2);
    // Los nombres no se repiten: dos dibujos con el mismo nombre no se pueden elegir con la mirada.
    expect(new Set(Object.values(NOMBRE_DEL_DIBUJO)).size).toBe(DIBUJOS_ELEGIBLES.length);
  });
});

describe("el dibujo de una insignia: lo elegido manda, si no el nombre (ADR-0490)", () => {
  it("una clave válida se reconoce; una desconocida, vacía o de otro tipo no", () => {
    expect(dibujoElegido("halloween")).toBe("halloween");
    expect(dibujoElegido("generico")).toBe("generico");
    for (const raro of ["Halloween", "ya-no-existe", "", " ", null, undefined, 7, {}, "toString", "constructor", "__proto__"]) expect(dibujoElegido(raro)).toBeNull();
  });

  it("lo elegido manda sobre el nombre; sin elegir, el del nombre; si el nombre no se reconoce, la etiqueta", () => {
    expect(dibujoDeInsignia({ nombre: "Día del Padre", icono: "aniversario" })).toBe("aniversario");
    expect(dibujoDeInsignia({ nombre: "Halloween", icono: "gato" })).toBe("gato");
    expect(dibujoDeInsignia({ nombre: "Halloween", icono: null })).toBe("halloween");
    expect(dibujoDeInsignia({ nombre: "Halloween" })).toBe("halloween");
    expect(dibujoDeInsignia({ nombre: "Halloween", icono: "ya-no-existe" })).toBe("halloween");
    expect(dibujoDeInsignia({ nombre: "Estreno" })).toBe("generico");
    expect(dibujoDeInsignia({ nombre: "Reedición bonita", icono: "generico" })).toBe("generico");
    // El reconocimiento por nombre sigue siendo el de siempre.
    expect(iconoDeInsignia("Galentine's Day")).toBe("galentine");
    expect(iconoDeInsignia("San Valentín")).toBe("valentin");
  });
});
