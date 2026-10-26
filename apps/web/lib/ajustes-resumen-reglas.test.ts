import { describe, expect, it } from "vitest";
import { AJUSTES_DE_FABRICA, cambiaAlgo, campanasQueSeVen, conCampana, leerAjustes } from "./ajustes-resumen-reglas";
import type { CampanaInversion } from "./inversion-mercaderia-reglas";

const c = (id: string, visible = true): CampanaInversion => ({ id, nombre: id, desde: "2026-12-01", hasta: "2026-12-24", planSinIgv: 100, igv: 18, tope: null, pedido: 0, pagado: 0, fechaLimite: null, pagos: [], visible, hrefPlan: null });

describe("«Qué se ve» en el Resumen", () => {
  it("por defecto se ve todo", () => {
    expect(leerAjustes(null)).toEqual(AJUSTES_DE_FABRICA);
    expect(cambiaAlgo(AJUSTES_DE_FABRICA)).toBe(false);
    expect(campanasQueSeVen([c("nav"), c("cyb")], AJUSTES_DE_FABRICA).map((x) => x.id)).toEqual(["nav", "cyb"]);
  });

  it("lo guardado que está roto vuelve a la fábrica en vez de esconder la inversión", () => {
    expect(leerAjustes("{no es json")).toEqual(AJUSTES_DE_FABRICA);
    expect(leerAjustes('{"global":"no","ocultas":[3,"nav"]}')).toMatchObject({ global: true, ocultas: ["nav"] });
  });

  it("el interruptor general apaga todas; uno por campaña apaga solo esa; el Plan manda sobre las dos", () => {
    const todas = [c("nav"), c("cyb"), c("dia", false)];
    expect(campanasQueSeVen(todas, { ...AJUSTES_DE_FABRICA, global: false })).toEqual([]);
    expect(campanasQueSeVen(todas, conCampana(AJUSTES_DE_FABRICA, "nav", false)).map((x) => x.id)).toEqual(["cyb"]);
    expect(campanasQueSeVen(todas, AJUSTES_DE_FABRICA).map((x) => x.id)).toEqual(["nav", "cyb"]);
  });

  it("volver a prender una campaña la saca de las escondidas, y apagarla dos veces no la repite", () => {
    const a = conCampana(conCampana(AJUSTES_DE_FABRICA, "nav", false), "nav", false);
    expect(a.ocultas).toEqual(["nav"]);
    expect(conCampana(a, "nav", true).ocultas).toEqual([]);
  });

  it("el ícono avisa con un punto cuando algo está distinto de la fábrica", () => {
    expect(cambiaAlgo({ ...AJUSTES_DE_FABRICA, conIgv: false })).toBe(true);
    expect(cambiaAlgo(conCampana(AJUSTES_DE_FABRICA, "nav", false))).toBe(true);
    expect(cambiaAlgo({ ...AJUSTES_DE_FABRICA, enCaja: false })).toBe(true);
  });
});
