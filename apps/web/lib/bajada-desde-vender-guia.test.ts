import { describe, expect, it } from "vitest";
import { camposDeBajadaDesdeVender } from "./bajada-desde-vender-guia";

describe("la guía de la hoja de la bajada en Vender (camposDeBajadaDesdeVender)", () => {
  it("un solo campo, obligatorio: quién atiende", () => {
    const campos = camposDeBajadaDesdeVender({ responsableListo: false, responsableMotivo: null });
    expect(campos.map((c) => [c.id, c.requerido])).toEqual([["quien", true]]);
  });

  it("está hecho exactamente cuando la firma existe (lo mismo que exige la base, sin reglas nuevas)", () => {
    expect(camposDeBajadaDesdeVender({ responsableListo: true, responsableMotivo: null })[0].hecho).toBe(true);
    expect(camposDeBajadaDesdeVender({ responsableListo: false, responsableMotivo: "Elige quién está atendiendo." })[0].hecho).toBe(false);
  });

  it("lo pendiente lo dice el combo cuando tiene su motivo (salió de turno, nadie marcó); si no, la frase de siempre", () => {
    expect(camposDeBajadaDesdeVender({ responsableListo: false, responsableMotivo: "Micaela ya no está de turno." })[0].pendiente).toBe("Micaela ya no está de turno.");
    expect(camposDeBajadaDesdeVender({ responsableListo: false, responsableMotivo: null })[0].pendiente).toBe("Elige quién está atendiendo.");
  });
});
