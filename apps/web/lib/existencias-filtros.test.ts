import { describe, expect, it } from "vitest";
import { coincideConFiltroAccion, coincideConFiltroDanado, OPCIONES_FILTRO_ACCION } from "./existencias-filtros";

// El filtro «Acción» de Existencias (Felipe, 2026-09-25): separado de «Estado» (dañado/cuarentena)
// — dos preguntas distintas («qué hacer hoy» vs. «en qué condición está el inventario») que antes
// vivían mezcladas en un solo dropdown.

describe("OPCIONES_FILTRO_ACCION — Caso A/B del pedido", () => {
  it("Caso A — contiene exactamente Reponer a piso y Sin acción", () => {
    expect(OPCIONES_FILTRO_ACCION).toEqual(["reponer_a_piso", "sin_accion"]);
  });

  it("Caso B — NO contiene Dañado ni Cuarentena: son un eje de Estado, no de Acción", () => {
    expect(OPCIONES_FILTRO_ACCION).not.toContain("danado");
    expect(OPCIONES_FILTRO_ACCION).not.toContain("cuarentena");
    expect(OPCIONES_FILTRO_ACCION).toHaveLength(2);
  });
});

describe("coincideConFiltroAccion — Caso D/E del pedido", () => {
  it("Caso D — filtro «Reponer a piso» devuelve exactamente accionHoy.tipo === \"reponer_a_piso\"", () => {
    expect(coincideConFiltroAccion("reponer_a_piso", "reponer_a_piso")).toBe(true);
    expect(coincideConFiltroAccion("sin_accion", "reponer_a_piso")).toBe(false);
  });

  it("Caso E — filtro «Sin acción» devuelve exactamente accionHoy.tipo === \"sin_accion\"", () => {
    expect(coincideConFiltroAccion("sin_accion", "sin_accion")).toBe(true);
    expect(coincideConFiltroAccion("reponer_a_piso", "sin_accion")).toBe(false);
  });

  it("«Acción: todas» (filtro null) deja pasar cualquier tipo, incluida una fila sin accionHoy (N/D)", () => {
    expect(coincideConFiltroAccion("reponer_a_piso", null)).toBe(true);
    expect(coincideConFiltroAccion("sin_accion", null)).toBe(true);
    expect(coincideConFiltroAccion(undefined, null)).toBe(true);
  });
});

describe("coincideConFiltroDanado — Caso C del pedido: eje independiente de Acción hoy", () => {
  it("con el filtro activo, solo pasan las filas con unidades dañadas — sin importar su Acción hoy", () => {
    expect(coincideConFiltroDanado(3, true)).toBe(true);
    expect(coincideConFiltroDanado(0, true)).toBe(false);
    expect(coincideConFiltroDanado(null, true)).toBe(false);
  });

  it("con el filtro apagado, cualquier fila pasa (dañada o no)", () => {
    expect(coincideConFiltroDanado(3, false)).toBe(true);
    expect(coincideConFiltroDanado(0, false)).toBe(true);
    expect(coincideConFiltroDanado(null, false)).toBe(true);
  });
});
