import { describe, expect, it } from "vitest";
import { diasEntreFechas, diasHastaLima, hoyLima } from "./fechas-lima";

describe("hoyLima", () => {
  it("a las 19:30 de Lima todavía es el mismo día (en UTC ya es mañana)", () => {
    // 2026-09-19T00:30Z = 2026-09-18 19:30 en Lima (UTC-5)
    expect(hoyLima(new Date("2026-09-19T00:30:00Z"))).toBe("2026-09-18");
  });
  it("a las 00:10 de Lima ya es el día siguiente", () => {
    expect(hoyLima(new Date("2026-09-19T05:10:00Z"))).toBe("2026-09-19");
  });
});

describe("diasEntreFechas / diasHastaLima", () => {
  it("cuenta días de calendario, con signo", () => {
    expect(diasEntreFechas("2026-09-18", "2026-09-25")).toBe(7);
    expect(diasEntreFechas("2026-09-18", "2026-09-04")).toBe(-14);
    expect(diasEntreFechas("2026-09-18", "2026-09-18")).toBe(0);
  });
  it("una factura que vence hoy (Lima) sigue en 0 días a las 19:30, no «venció ayer»", () => {
    const ahora = new Date("2026-09-19T00:30:00Z"); // 18/09 19:30 Lima
    expect(diasHastaLima("2026-09-18", ahora)).toBe(0);
  });
  it("cruza cambio de mes", () => {
    expect(diasEntreFechas("2026-09-28", "2026-10-03")).toBe(5);
  });
});
