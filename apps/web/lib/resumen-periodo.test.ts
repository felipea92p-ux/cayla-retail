import { describe, expect, it } from "vitest";
import {
  diasDelRango,
  etiquetaRango,
  hoyEnLima,
  mismoDiaAnioAnterior,
  parseIso,
  resolverComparacion,
  resolverPeriodo,
  sumarDias,
  textoDemandaAnalizada,
  textoInstanteLima,
} from "./resumen-periodo";

// «Hoy» de las pruebas: viernes 18 de septiembre de 2026.
const HOY = "2026-09-18";

describe("fechas sin zona horaria", () => {
  it("parseIso rechaza lo que no es una fecha real", () => {
    expect(parseIso("2026-09-18")).toEqual({ a: 2026, m: 9, d: 18 });
    expect(parseIso("2026-02-30")).toBeNull();
    expect(parseIso("2026-13-01")).toBeNull();
    expect(parseIso("18/09/2026")).toBeNull();
    expect(parseIso("")).toBeNull();
    expect(parseIso(null)).toBeNull();
  });

  it("sumarDias cruza meses y años sin correrse un día", () => {
    expect(sumarDias("2026-09-18", -29)).toBe("2026-08-20");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(sumarDias("2026-02-28", 1)).toBe("2026-03-01");
    expect(sumarDias("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("diasDelRango incluye ambos extremos", () => {
    expect(diasDelRango({ desde: "2026-09-18", hasta: "2026-09-18" })).toBe(1);
    expect(diasDelRango({ desde: "2026-08-20", hasta: "2026-09-18" })).toBe(30);
  });

  it("mismoDiaAnioAnterior lleva el 29 de febrero al 28", () => {
    expect(mismoDiaAnioAnterior("2026-09-18")).toBe("2025-09-18");
    expect(mismoDiaAnioAnterior("2024-02-29")).toBe("2023-02-28");
  });

  it("hoyEnLima no se corre un día por la zona horaria", () => {
    // 2026-09-19 02:00 UTC = 2026-09-18 21:00 en Lima.
    expect(hoyEnLima(new Date("2026-09-19T02:00:00Z"))).toBe("2026-09-18");
    // 2026-09-18 05:30 UTC = 2026-09-18 00:30 en Lima (recién empezó el día).
    expect(hoyEnLima(new Date("2026-09-18T05:30:00Z"))).toBe("2026-09-18");
    // 2026-09-18 04:30 UTC = 2026-09-17 23:30 en Lima (todavía ayer).
    expect(hoyEnLima(new Date("2026-09-18T04:30:00Z"))).toBe("2026-09-17");
  });
});

describe("resolverPeriodo — presets", () => {
  it("30 días: hoy y los 29 anteriores", () => {
    const p = resolverPeriodo({ preset: "30d" }, HOY);
    expect(p).toMatchObject({ preset: "30d", desde: "2026-08-20", hasta: HOY, dias: 30, etiqueta: "Últimos 30 días", advertencia: null });
  });

  it("7 y 90 días", () => {
    expect(resolverPeriodo({ preset: "7d" }, HOY)).toMatchObject({ desde: "2026-09-12", dias: 7 });
    expect(resolverPeriodo({ preset: "90d" }, HOY)).toMatchObject({ desde: "2026-06-21", dias: 90 });
  });

  it("este mes: del día 1 a hoy", () => {
    const p = resolverPeriodo({ preset: "mes" }, HOY);
    expect(p).toMatchObject({ desde: "2026-09-01", hasta: HOY, dias: 18 });
    expect(p.etiqueta).toBe("Este mes (1–18 sep.)");
  });

  it("el primer día del mes es un período de un solo día", () => {
    expect(resolverPeriodo({ preset: "mes" }, "2026-10-01")).toMatchObject({ desde: "2026-10-01", dias: 1 });
  });

  it("sin preset o con uno desconocido cae en 30 días", () => {
    expect(resolverPeriodo({}, HOY).preset).toBe("30d");
    expect(resolverPeriodo({ preset: "semana-pasada" }, HOY).preset).toBe("30d");
  });
});

describe("resolverPeriodo — personalizado", () => {
  it("respeta un rango válido", () => {
    const p = resolverPeriodo({ preset: "personalizado", desde: "2026-09-01", hasta: "2026-09-15" }, HOY);
    expect(p).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-15", dias: 15, advertencia: null });
    expect(p.etiqueta).toBe("1–15 sep.");
  });

  it("si vienen al revés los ordena", () => {
    const p = resolverPeriodo({ preset: "personalizado", desde: "2026-09-15", hasta: "2026-09-01" }, HOY);
    expect(p).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-15" });
  });

  it("recorta hasta hoy: no hay ventas de días que no pasaron", () => {
    const p = resolverPeriodo({ preset: "personalizado", desde: "2026-09-10", hasta: "2026-12-31" }, HOY);
    expect(p.hasta).toBe(HOY);
    expect(p.advertencia).toContain("hasta hoy");
  });

  it("un rango que empieza en el futuro cae en 30 días con aviso", () => {
    const p = resolverPeriodo({ preset: "personalizado", desde: "2026-10-01", hasta: "2026-10-05" }, HOY);
    expect(p).toMatchObject({ desde: "2026-08-20", hasta: HOY });
    expect(p.advertencia).toContain("futuro");
  });

  it("con fechas incompletas o inválidas cae en 30 días y lo avisa", () => {
    for (const e of [{ desde: "2026-09-01" }, { hasta: "2026-09-01" }, { desde: "x", hasta: "y" }, {}]) {
      const p = resolverPeriodo({ preset: "personalizado", ...e }, HOY);
      expect(p.dias).toBe(30);
      expect(p.advertencia).not.toBeNull();
    }
  });

  it("acorta un rango de más de un año", () => {
    const p = resolverPeriodo({ preset: "personalizado", desde: "2020-01-01", hasta: HOY }, HOY);
    expect(p.dias).toBe(366);
    expect(p.hasta).toBe(HOY);
    expect(p.advertencia).toContain("366");
  });
});

describe("resolverComparacion", () => {
  it("período anterior: los mismos días corridos justo antes, sin solaparse", () => {
    const actual = resolverPeriodo({ preset: "30d" }, HOY);
    const previo = resolverComparacion(actual, "anterior")!;
    expect(previo).toEqual({ desde: "2026-07-21", hasta: "2026-08-19" });
    expect(diasDelRango(previo)).toBe(actual.dias);
    expect(previo.hasta < actual.desde).toBe(true);
  });

  it("período anterior de «este mes» tiene la misma cantidad de días que lo transcurrido", () => {
    const actual = resolverPeriodo({ preset: "mes" }, HOY); // 1–18 sep = 18 días
    const previo = resolverComparacion(actual, "anterior")!;
    expect(previo).toEqual({ desde: "2026-08-14", hasta: "2026-08-31" });
    expect(diasDelRango(previo)).toBe(18);
  });

  it("mismo período del año anterior", () => {
    const actual = resolverPeriodo({ preset: "personalizado", desde: "2026-09-01", hasta: "2026-09-15" }, HOY);
    expect(resolverComparacion(actual, "anio")).toEqual({ desde: "2025-09-01", hasta: "2025-09-15" });
  });

  it("sin comparación no hay rango", () => {
    expect(resolverComparacion(resolverPeriodo({ preset: "7d" }, HOY), "ninguna")).toBeNull();
  });
});

describe("textos", () => {
  it("etiquetaRango según cruce de mes o de año", () => {
    expect(etiquetaRango({ desde: "2026-09-18", hasta: "2026-09-18" })).toBe("18 sep.");
    expect(etiquetaRango({ desde: "2026-08-28", hasta: "2026-09-15" })).toBe("28 ago. – 15 sep.");
    expect(etiquetaRango({ desde: "2025-12-28", hasta: "2026-01-03" })).toBe("28 dic. 2025 – 3 ene. 2026");
  });

  it("con el año pedido siempre lo dice (comparar con el año anterior no debe leerse como el período de hoy)", () => {
    expect(etiquetaRango({ desde: "2025-08-20", hasta: "2025-09-18" }, true)).toBe("20 ago. – 18 sep. 2025");
    expect(etiquetaRango({ desde: "2025-09-01", hasta: "2025-09-15" }, true)).toBe("1–15 sep. 2025");
    expect(etiquetaRango({ desde: "2025-09-18", hasta: "2025-09-18" }, true)).toBe("18 sep. 2025");
  });

  it("«demanda analizada» y la marca de tiempo del stock (siempre el actual)", () => {
    expect(textoDemandaAnalizada(resolverPeriodo({ preset: "30d" }, HOY))).toBe("Demanda analizada: últimos 30 días");
    expect(textoDemandaAnalizada(resolverPeriodo({ preset: "mes" }, HOY))).toBe("Demanda analizada: este mes (1–18 sep.)");
    // 2026-09-18 23:24 UTC = 18:24 en Lima.
    expect(textoInstanteLima(new Date("2026-09-18T23:24:00Z"))).toBe("18 sep. 2026, 18:24");
  });
});
