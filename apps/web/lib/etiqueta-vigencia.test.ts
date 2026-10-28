import { describe, it, expect } from "vitest";
import { avisoDiaDeSemana, ordenarPorTemporada, repetirTemporada, vigenciaDe } from "./etiqueta-vigencia";

describe("vigenciaDe", () => {
  it("sin fechas es permanente: no hay temporada", () => {
    expect(vigenciaDe(null, null, "2026-09-18")).toBeNull();
  });

  it("dentro del rango está vigente, incluidos el primer y el último día", () => {
    expect(vigenciaDe("2026-09-01", "2026-09-30", "2026-09-18")).toEqual({ estado: "vigente", hasta: "2026-09-30" });
    expect(vigenciaDe("2026-09-18", "2026-09-30", "2026-09-18")?.estado).toBe("vigente");
    expect(vigenciaDe("2026-09-01", "2026-09-18", "2026-09-18")?.estado).toBe("vigente");
  });

  it("antes de empezar es próxima y dice en cuántos días", () => {
    expect(vigenciaDe("2026-11-09", "2026-11-30", "2026-09-18")).toEqual({ estado: "proxima", desde: "2026-11-09", enDias: 52 });
  });

  it("después de terminar es terminada", () => {
    expect(vigenciaDe("2026-04-26", "2026-05-10", "2026-09-18")).toEqual({ estado: "terminada", hasta: "2026-05-10" });
  });

  it("con solo una fecha, la otra punta queda abierta", () => {
    expect(vigenciaDe("2026-09-01", null, "2026-09-18")?.estado).toBe("vigente");
    expect(vigenciaDe(null, "2026-12-31", "2026-09-18")?.estado).toBe("vigente");
    expect(vigenciaDe(null, "2026-09-01", "2026-09-18")?.estado).toBe("terminada");
  });
});

describe("repetirTemporada — las mismas fechas, un año después", () => {
  const HOY = "2026-10-17";
  it("solo se repite lo que ya pasó", () => {
    expect(repetirTemporada("2026-10-17", "2026-10-31", HOY)).toBeNull();
    expect(repetirTemporada("2026-11-09", "2026-11-30", HOY)).toBeNull();
    expect(repetirTemporada(null, null, HOY)).toBeNull();
  });
  it("Día de la Madre 2026: propone 2027 y, aparte, el mismo 2.º domingo de mayo con la temporada corrida entera", () => {
    const r = repetirTemporada("2026-04-26", "2026-05-10", HOY)!;
    expect(r).toMatchObject({ anio: 2027, desde: "2027-04-26", hasta: "2027-05-10" });
    expect(r.mismoDia).toMatchObject({ desde: "2027-04-25", hasta: "2027-05-09", regla: "2.º domingo de mayo" });
  });
  it("el quinto de un mes es «el último» (Black Friday cierra el último lunes de noviembre)", () => {
    const r = repetirTemporada("2026-11-09", "2026-11-30", "2026-12-05")!;
    expect(r.mismoDia).toMatchObject({ hasta: "2027-11-29", regla: "último lunes de noviembre" });
  });
  it("si pasaron varios años, salta hasta la próxima que no haya pasado", () => {
    expect(repetirTemporada("2024-04-26", "2024-05-10", HOY)).toMatchObject({ anio: 2027, hasta: "2027-05-10" });
  });
  it("el 29 de febrero, en un año sin él, pasa al 28", () => {
    expect(repetirTemporada(null, "2028-02-29", "2028-03-10")).toMatchObject({ anio: 2029, desde: null, hasta: "2029-02-28" });
  });
});

describe("avisoDiaDeSemana — lo que dice la hoja al repetir", () => {
  const r = repetirTemporada("2026-04-26", "2026-05-10", "2026-10-17")!;
  it("con las fechas de sumar un año, dice que cambió el día y ofrece el mismo", () => {
    expect(avisoDiaDeSemana(r, { desde: "2027-04-26", hasta: "2027-05-10" })).toEqual({
      modo: "sumando-un-anio",
      titulo: "En 2027, el 10 may. cae lunes",
      detalle: "En 2026 fue domingo. Si la fiesta va siempre el mismo día de la semana, usa el domingo 9: toda la temporada se corre igual.",
      boton: "Usar el domingo 9",
    });
  });
  it("con las del mismo día, dice qué regla siguió", () => {
    expect(avisoDiaDeSemana(r, { desde: "2027-04-25", hasta: "2027-05-09" })).toMatchObject({
      modo: "mismo-dia",
      titulo: "Termina el domingo 9 de mayo",
      detalle: "El 2.º domingo de mayo, como en 2026.",
    });
  });
  it("con otras fechas escritas a mano, calla: la persona ya decidió", () => {
    expect(avisoDiaDeSemana(r, { desde: "2027-05-01", hasta: "2027-05-09" })).toBeNull();
  });
});

describe("ordenarPorTemporada — lo que rige, lo que viene, lo que pasó y lo que no tiene fechas", () => {
  it("ordena las festividades de producción como se viven, no por abecedario", () => {
    const e = (nombre: string, vigenteDesde: string | null, vigenteHasta: string | null) => ({ nombre, vigenteDesde, vigenteHasta });
    const lista = [
      e("Aniversario CAYLA", "2026-10-01", "2026-10-14"),
      e("Black Friday", "2026-11-09", "2026-11-30"),
      e("CyberWow", null, null),
      e("Día de la Madre", "2026-04-26", "2026-05-10"),
      e("Galentine's Day", "2026-02-06", "2026-02-13"),
      e("Halloween", "2026-10-17", "2026-10-31"),
      e("Navidad", "2026-12-11", "2026-12-25"),
    ];
    expect(ordenarPorTemporada(lista, "2026-10-17").map((x) => x.nombre)).toEqual([
      "Halloween", // rige hoy
      "Black Friday", // viene primero
      "Navidad",
      "Galentine's Day", // ya pasó: vuelve en feb. 2027
      "Día de la Madre",
      "Aniversario CAYLA", // pasó hace 3 días: vuelve en oct. 2027
      "CyberWow", // sin fechas
    ]);
  });
  it("las que no tienen fechas quedan por nombre, y no se pierde ninguna", () => {
    const lista = [{ nombre: "Top ventas", vigenteDesde: null, vigenteHasta: null }, { nombre: "Nuevo", vigenteDesde: null, vigenteHasta: null }];
    expect(ordenarPorTemporada(lista, "2026-10-17").map((x) => x.nombre)).toEqual(["Nuevo", "Top ventas"]);
  });
});
