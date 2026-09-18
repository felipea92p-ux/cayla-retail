import { describe, it, expect } from "vitest";
import {
  comparativoSemanaAnterior,
  egresosElevados,
  iniciales,
  rangoHorasCaja,
  senalCaja,
  tendenciaCierres7Dias,
  ventasPorHora,
} from "./caja-panel-reglas";

function lima(anio: number, mes: number, dia: number, hora = 0, min = 0): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, hora + 5, min));
}

describe("iniciales", () => {
  it("toma la primera letra de las dos primeras palabras", () => {
    expect(iniciales("Felipe Alvarez")).toBe("FA");
  });
  it("un solo nombre da una sola letra", () => {
    expect(iniciales("Sofía")).toBe("S");
  });
});

describe("ventasPorHora / rangoHorasCaja", () => {
  it("agrupa por hora de Lima, no de UTC", () => {
    const eventos = [
      { hora: lima(2026, 9, 18, 14, 10).toISOString(), total: 50 },
      { hora: lima(2026, 9, 18, 14, 45).toISOString(), total: 30 },
      { hora: lima(2026, 9, 18, 15, 0).toISOString(), total: 20 },
    ];
    const mapa = ventasPorHora(eventos);
    expect(mapa.get(14)).toBe(80);
    expect(mapa.get(15)).toBe(20);
  });

  it("el rango va desde la hora de apertura hasta ahora, sin horas inventadas", () => {
    const abierta = lima(2026, 9, 18, 9, 0).toISOString();
    const ahora = lima(2026, 9, 18, 12, 30);
    expect(rangoHorasCaja(abierta, ahora)).toEqual([9, 10, 11, 12]);
  });
});

describe("tendenciaCierres7Dias", () => {
  const ubicacionId = "sede-1";
  const ahora = lima(2026, 9, 18, 20, 0);

  it("suma cierres del mismo día y marca descuadre si alguno no cuadró", () => {
    const cierres = [
      { ubicacionId, cerradaEn: lima(2026, 9, 18, 13, 0).toISOString(), montoApertura: 100, montoCierreReal: 400, diferencia: 0 },
      { ubicacionId, cerradaEn: lima(2026, 9, 18, 19, 0).toISOString(), montoApertura: 400, montoCierreReal: 450, diferencia: 5 },
      { ubicacionId: "otra-sede", cerradaEn: lima(2026, 9, 18, 13, 0).toISOString(), montoApertura: 0, montoCierreReal: 9999, diferencia: 0 },
    ];
    const serie = tendenciaCierres7Dias(cierres, ubicacionId, ahora);
    expect(serie).toHaveLength(7);
    const hoy = serie[serie.length - 1]!;
    expect(hoy.esHoy).toBe(true);
    expect(hoy.monto).toBe(300 + 50);
    expect(hoy.descuadre).toBe(true);
  });

  it("un día sin cierres queda en cero, no se inventa un valor", () => {
    const serie = tendenciaCierres7Dias([], ubicacionId, ahora);
    expect(serie.every((p) => p.monto === 0 && !p.descuadre)).toBe(true);
  });
});

describe("comparativoSemanaAnterior", () => {
  it("null si la semana pasada fue cero — no hay con qué comparar", () => {
    expect(comparativoSemanaAnterior(500, 0, "jueves")).toBeNull();
  });
  it("positivo cuando hoy va mejor", () => {
    expect(comparativoSemanaAnterior(560, 500, "jueves")).toEqual({ texto: "▲ 12% vs. jueves pasado", positivo: true });
  });
  it("negativo cuando hoy va peor", () => {
    expect(comparativoSemanaAnterior(400, 500, "jueves")).toEqual({ texto: "▼ 20% vs. jueves pasado", positivo: false });
  });
});

describe("egresosElevados", () => {
  it("no alerta sin ventas todavía, aunque haya egresos", () => {
    expect(egresosElevados(50, 0)).toEqual({ alerta: false, pct: 0 });
  });
  it("alerta al cruzar el umbral", () => {
    expect(egresosElevados(20, 100)).toEqual({ alerta: true, pct: 20 });
  });
  it("no alerta bajo el umbral", () => {
    expect(egresosElevados(10, 100)).toEqual({ alerta: false, pct: 10 });
  });
});

describe("senalCaja", () => {
  it("verde sin cola pendiente", () => {
    expect(senalCaja(0)).toEqual({ tono: "verde", texto: "Caja abierta · sin pendientes" });
  });
  it("ámbar con cola pendiente, singular vs plural", () => {
    expect(senalCaja(1).texto).toBe("1 venta sin subir");
    expect(senalCaja(3).texto).toBe("3 ventas sin subir");
  });
});
