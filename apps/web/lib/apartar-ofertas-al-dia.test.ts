import { describe, expect, it } from "vitest";
import { firmaDeApartar, firmaReleida } from "./apartar-ofertas-al-dia";
import type { OfertaDeGrupoDeVariante } from "./ofertas-de-grupo";

const TRES: OfertaDeGrupoDeVariante = {
  reglaId: "r", tipo: "nxm", lleva: 3, paga: 2, monto: null, porcentaje: null, agrupa: "campana", modeloId: null, nombre: "Verano", titular: "3 x 2",
};
const prendas = [
  { varianteId: "a", campana: { etiquetaId: "c", pct: 20 }, ofertaGrupo: null },
  { varianteId: "b", campana: null, ofertaGrupo: TRES },
];

describe("Apartar al día con las ofertas y campañas de hoy", () => {
  it("lo releído igual a lo de la pantalla da la misma firma, aunque la lectura traiga más prendas del catálogo", () => {
    const releida = firmaReleida(["a", "b"], new Map([["a", { etiquetaId: "c", pct: 20 }], ["z", { etiquetaId: "c", pct: 20 }]]), { b: TRES, z: TRES }, []);
    expect(releida).toBe(firmaDeApartar(prendas, []));
  });
  it("un 3x2 que se activó para una prenda de la pantalla cambia la firma", () => {
    expect(firmaReleida(["a", "b"], new Map([["a", { etiquetaId: "c", pct: 20 }]]), { a: TRES, b: TRES }, [])).not.toBe(firmaDeApartar(prendas, []));
  });
  it("una campaña que cambió de % cambia la firma", () => {
    expect(firmaReleida(["a", "b"], new Map([["a", { etiquetaId: "c", pct: 30 }]]), { b: TRES }, [])).not.toBe(firmaDeApartar(prendas, []));
  });
  it("un monto nuevo cambia la firma", () => {
    const monto = { regla_id: "m", oferta_nombre: "M", etiqueta_nombre: "V", escalones: [{ desde: 300, ahorra: 30 }], ahorro_en: "soles", cuenta: "compra", variantes: null, excluidas: [] };
    expect(firmaReleida(["a", "b"], new Map([["a", { etiquetaId: "c", pct: 20 }]]), { b: TRES }, [monto])).not.toBe(firmaDeApartar(prendas, []));
  });
});
