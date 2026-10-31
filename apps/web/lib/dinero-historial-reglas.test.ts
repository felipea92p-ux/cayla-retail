import { describe, expect, it } from "vitest";
import { agruparPorDia, delPeriodo, etiquetaDePeriodo, haySiguiente, moverPeriodo, nombreDeDia, rangoDe, tocaALaCuenta, ultimoDiaConMovimientos } from "./dinero-historial-reglas";

const m = (fecha: string, monto: number, origenId: string | null = null, destinoId: string | null = null) => ({ fecha, monto, origenId, destinoId });
const HOY = "2026-10-15"; // jueves

describe("períodos", () => {
  it("el día, la semana (lunes a domingo), el mes y todo", () => {
    expect(rangoDe("dia", HOY)).toEqual({ desde: HOY, hasta: HOY });
    expect(rangoDe("semana", HOY)).toEqual({ desde: "2026-10-12", hasta: "2026-10-18" });
    expect(rangoDe("mes", HOY)).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(rangoDe("todo", HOY).desde < "2000-01-01").toBe(true);
  });
  it("una semana que cruza de mes y un domingo caen en su lunes", () => {
    expect(rangoDe("semana", "2026-11-01")).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" });
  });
  it("las etiquetas se leen como se dicen", () => {
    expect(etiquetaDePeriodo("dia", HOY)).toBe("jueves 15 de octubre de 2026");
    expect(etiquetaDePeriodo("semana", HOY)).toBe("12 – 18 de octubre");
    expect(etiquetaDePeriodo("semana", "2026-11-01")).toBe("26 de octubre – 1 de noviembre");
    expect(etiquetaDePeriodo("mes", HOY)).toBe("octubre 2026");
    expect(etiquetaDePeriodo("todo", HOY)).toBe("Todo el historial");
  });
  it("va al período de al lado y nunca pasa de hoy", () => {
    expect(moverPeriodo("dia", HOY, -1, HOY)).toBe("2026-10-14");
    expect(moverPeriodo("dia", HOY, 1, HOY)).toBe(HOY);
    expect(moverPeriodo("semana", HOY, -1, HOY)).toBe("2026-10-08");
    expect(moverPeriodo("mes", HOY, -1, HOY)).toBe("2026-09-01");
    expect(moverPeriodo("mes", "2026-09-01", 1, HOY)).toBe("2026-10-01");
  });
  it("«siguiente» se apaga cuando el período ya llega a hoy", () => {
    expect(haySiguiente("mes", HOY, HOY)).toBe(false); // octubre contiene a hoy
    expect(haySiguiente("dia", HOY, HOY)).toBe(false);
    expect(haySiguiente("semana", HOY, HOY)).toBe(false);
    expect(haySiguiente("todo", HOY, HOY)).toBe(false);
    expect(haySiguiente("mes", "2026-09-10", HOY)).toBe(true);
    expect(haySiguiente("dia", "2026-10-14", HOY)).toBe(true);
    expect(haySiguiente("semana", "2026-10-05", HOY)).toBe(true);
  });
});

describe("filtrar y agrupar", () => {
  const movs = [m("2026-10-13", 5800), m("2026-10-13", 3960), m("2026-10-09", 2400), m("2026-09-28", 900)];
  it("deja los del período y usa el día de Lima de un instante en UTC", () => {
    expect(delPeriodo(movs, "semana", HOY)).toHaveLength(2);
    expect(delPeriodo(movs, "mes", HOY)).toHaveLength(3);
    expect(delPeriodo(movs, "todo", HOY)).toHaveLength(4);
    // 02:00 UTC del 14 son las 21:00 del 13 en Lima
    expect(delPeriodo([m("2026-10-14T02:00:00Z", 1)], "dia", "2026-10-13")).toHaveLength(1);
  });
  it("agrupa por día, del más nuevo al más viejo, con lo que sumó cada día", () => {
    const g = agruparPorDia(movs);
    expect(g.map((d) => [d.titulo, d.movs.length, d.total])).toEqual([
      ["martes 13 de octubre", 2, 9760],
      ["viernes 9 de octubre", 1, 2400],
      ["lunes 28 de septiembre", 1, 900],
    ]);
  });
  it("mirando una cuenta, lo que sale resta y lo que entra suma", () => {
    const g = agruparPorDia([m("2026-10-13", 5800, "cf", "bcp"), m("2026-10-13", 1900, "bcp", "tc")], "bcp");
    expect(g[0].total).toBe(3900);
  });
  it("encuentra el último día con movimientos antes de una fecha, o nada", () => {
    expect(ultimoDiaConMovimientos(movs, "2026-10-12")).toBe("2026-10-09");
    expect(ultimoDiaConMovimientos(movs, "2026-09-01")).toBeNull();
  });
  it("un movimiento toca una cuenta si sale de ella o llega a ella", () => {
    expect(tocaALaCuenta(m("2026-10-13", 1, "a", "b"), "b")).toBe(true);
    expect(tocaALaCuenta(m("2026-10-13", 1, "a", "b"), "c")).toBe(false);
  });
  it("nombra el día como se dice", () => expect(nombreDeDia("2026-10-15")).toBe("jueves 15 de octubre"));
});
