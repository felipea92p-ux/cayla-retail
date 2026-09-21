import { describe, expect, it } from "vitest";
import { diaMes, diasEntreFechas, diasHastaLima, diaYHoraLima, hoyLima, sumarDias } from "./fechas-lima";

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

describe("sumarDias", () => {
  it("suma y resta días de calendario cruzando meses y años", () => {
    expect(sumarDias("2026-09-18", 30)).toBe("2026-10-18");
    expect(sumarDias("2026-12-25", 10)).toBe("2027-01-04");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("diaMes", () => {
  it("da dd/mm; sin fecha, una raya", () => {
    expect(diaMes("2026-09-04")).toBe("04/09");
    expect(diaMes(null)).toBe("—");
  });
});

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
