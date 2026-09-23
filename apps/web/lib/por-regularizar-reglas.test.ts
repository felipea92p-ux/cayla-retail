import { describe, expect, it } from "vitest";
import { cifrasPorRegularizar, estaVencida, tipoDiferencia } from "./por-regularizar-reglas";

const ahora = new Date("2026-09-23T15:00:00-05:00");

describe("estaVencida", () => {
  it("un día después, todavía no", () => expect(estaVencida("2026-09-22T15:00:00-05:00", ahora)).toBe(false));
  it("justo a los 2 días, sí", () => expect(estaVencida("2026-09-21T15:00:00-05:00", ahora)).toBe(true));
});

describe("tipoDiferencia", () => {
  it("cobrar menos es descuento no planificado", () => expect(tipoDiferencia(-20)).toBe("descuento"));
  it("cobrar más es sobreprecio", () => expect(tipoDiferencia(10)).toBe("sobreprecio"));
  it("igual al precio oficial", () => expect(tipoDiferencia(0)).toBe("exacto"));
});

describe("cifrasPorRegularizar", () => {
  it("cuenta pendientes y vencidas, y separa descuento y sobreprecio del mes (Lima)", () => {
    const f = (estado: string, vendidoEn: string, diferencia: number | null) => ({ estado, vendidoEn, diferencia });
    expect(
      cifrasPorRegularizar(
        [
          f("pendiente", "2026-09-23T10:00:00-05:00", null),
          f("pendiente", "2026-09-20T10:00:00-05:00", null),
          f("regularizada", "2026-09-10T10:00:00-05:00", -20),
          f("regularizada", "2026-09-11T10:00:00-05:00", 10),
          f("regularizada", "2026-08-31T20:00:00-05:00", -99), // agosto en Lima, aunque en UTC ya es septiembre
          f("anulada", "2026-09-12T10:00:00-05:00", null),
        ],
        ahora,
      ),
    ).toEqual({ pendientes: 2, vencidas: 1, descuentoMes: 20, sobreprecioMes: 10 });
  });
});
