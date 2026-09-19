import { describe, expect, it } from "vitest";
import { diaYHoraLima } from "./fecha-lima";

describe("diaYHoraLima", () => {
  it("Lima va cinco horas detrás de UTC: las 21:34 UTC son las 16:34 del mismo día", () => {
    expect(diaYHoraLima("2026-09-19T21:34:00Z")).toEqual({ dia: "19/09", hora: "16:34" });
  });

  it("cruza la medianoche de Lima, no la de UTC (ADR-0110: las 7:30 pm de Lima ya son mañana en UTC)", () => {
    expect(diaYHoraLima("2026-09-20T04:59:00Z")).toEqual({ dia: "19/09", hora: "23:59" });
    expect(diaYHoraLima("2026-09-20T05:00:00Z")).toEqual({ dia: "20/09", hora: "00:00" });
    expect(diaYHoraLima("2026-09-20T00:30:00Z")).toEqual({ dia: "19/09", hora: "19:30" });
  });

  it("rellena con cero el día, el mes y la hora, y cruza el cambio de mes y de año", () => {
    expect(diaYHoraLima("2026-01-05T10:07:00Z")).toEqual({ dia: "05/01", hora: "05:07" });
    expect(diaYHoraLima("2027-01-01T03:00:00Z")).toEqual({ dia: "31/12", hora: "22:00" });
  });

  it("acepta el offset explícito que devuelve Postgres", () => {
    expect(diaYHoraLima("2026-09-19T16:34:00-05:00")).toEqual({ dia: "19/09", hora: "16:34" });
  });
});
