import { describe, expect, it } from "vitest";
import { siguienteDe } from "./guia-campos";
import { camposGuiaPrenda } from "./prenda-sin-registrar-guia";
import { faltaEnPrendaSinRegistrar, type DatosPrendaSinRegistrar } from "./prenda-sin-registrar-reglas";

const completa: DatosPrendaSinRegistrar = { descripcion: "Vestidos · Negro · Talla M", categoriaId: "c", tallaId: "t", colorCodigo: "NEG", precio: 89 };
const vacios: Partial<DatosPrendaSinRegistrar>[] = [
  { categoriaId: "" },
  { tallaId: "" },
  { colorCodigo: "" },
  { descripcion: "   " },
  { precio: 0 },
  { precio: Number.NaN },
];

/** Todas las combinaciones de datos vacíos (2^6): la guía no puede decir otra cosa que la regla que apaga el botón. */
function escenarios(): DatosPrendaSinRegistrar[] {
  const out: DatosPrendaSinRegistrar[] = [];
  for (let m = 0; m < 1 << vacios.length; m++) out.push(vacios.reduce<DatosPrendaSinRegistrar>((d, v, i) => (m & (1 << i) ? { ...d, ...v } : d), { ...completa }));
  return out;
}

describe("camposGuiaPrenda", () => {
  it("los cinco campos, en el orden de pantalla y todos requeridos", () => {
    expect(camposGuiaPrenda(completa).map((c) => [c.id, c.requerido])).toEqual([
      ["categoria", true],
      ["talla", true],
      ["color", true],
      ["descripcion", true],
      ["precio", true],
    ]);
  });
  it("coherencia: «hay algo requerido sin hacer» ⇔ «Agregar al ticket» está apagado, en 64 escenarios", () => {
    for (const d of escenarios()) {
      const pendiente = camposGuiaPrenda(d).some((c) => c.requerido && !c.hecho);
      expect(pendiente).toBe(faltaEnPrendaSinRegistrar(d) !== null);
    }
  });
  it("el primero que falta para la guía es el que dice la regla", () => {
    for (const d of escenarios()) {
      const siguiente = siguienteDe(camposGuiaPrenda(d));
      expect(siguiente ? siguiente.pendiente : null).toBe(faltaEnPrendaSinRegistrar(d) === null ? null : `${faltaEnPrendaSinRegistrar(d)}.`);
    }
  });
  it("una letra en la descripción no mueve la luz mientras se escribe", () => {
    const d = { ...completa, descripcion: "V", precio: 0 };
    expect(siguienteDe(camposGuiaPrenda(d), "descripcion")?.id).toBe("descripcion");
    expect(siguienteDe(camposGuiaPrenda(d))?.id).toBe("precio");
  });
});
