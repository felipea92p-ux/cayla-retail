import { describe, expect, it } from "vitest";
import {
  bajadaTarjeta,
  estadoRecordatorio,
  hora12,
  horaLima12,
  instanteDeCierre,
  lineaDelDia,
  minutosDeHora,
  nivelPorMinutos,
  nombreCorto,
  progreso,
  rotuloPildora,
  textoCorto,
  tituloTarjeta,
} from "./recordatorio-cierre-reglas";

// Lima = UTC−5. 10:02 a. m. de Lima del 1 de octubre = 15:02 UTC.
const ABRIO_AQP = "2026-10-01T15:02:00Z";
const lima = (aaaammdd: string, hhmm: string) => new Date(`${aaaammdd}T${hhmm}:00-05:00`);

describe("minutosDeHora y hora12", () => {
  it("lee la hora de la base con o sin segundos", () => {
    expect(minutosDeHora("21:30")).toBe(1290);
    expect(minutosDeHora("19:45:00")).toBe(1185);
    expect(minutosDeHora("")).toBeNull();
    expect(minutosDeHora(null)).toBeNull();
    expect(minutosDeHora("25:00")).toBeNull();
  });
  it("la dice como en el mostrador", () => {
    expect(hora12("21:30")).toBe("9:30 p. m.");
    expect(hora12("19:45")).toBe("7:45 p. m.");
    expect(hora12("00:05")).toBe("12:05 a. m.");
    expect(hora12("12:00")).toBe("12:00 p. m.");
  });
});

describe("estadoRecordatorio: las horas de AQP (21:30) y TRU (19:45)", () => {
  it("antes de la hora no hay recordatorio", () => {
    expect(estadoRecordatorio({ ahora: lima("2026-10-01", "21:29"), abiertaEn: ABRIO_AQP, horaCierre: "21:30" })).toEqual({ nivel: 0, minutos: -1 });
  });
  it("a la hora en punto se activa", () => {
    expect(estadoRecordatorio({ ahora: lima("2026-10-01", "21:30"), abiertaEn: ABRIO_AQP, horaCierre: "21:30" })).toEqual({ nivel: 1, minutos: 0 });
  });
  it("Trujillo se activa a las 7:45 p. m.", () => {
    const abrio = "2026-10-01T14:58:00Z";
    expect(estadoRecordatorio({ ahora: lima("2026-10-01", "19:44"), abiertaEn: abrio, horaCierre: "19:45" }).nivel).toBe(0);
    expect(estadoRecordatorio({ ahora: lima("2026-10-01", "19:45"), abiertaEn: abrio, horaCierre: "19:45" }).nivel).toBe(1);
  });
  it("sube de nivel a los 30 y a los 60 minutos", () => {
    const en = (hhmm: string) => estadoRecordatorio({ ahora: lima("2026-10-01", hhmm), abiertaEn: ABRIO_AQP, horaCierre: "21:30" });
    expect(en("21:59").nivel).toBe(1);
    expect(en("22:00").nivel).toBe(2);
    expect(en("22:29").nivel).toBe(2);
    expect(en("22:30").nivel).toBe(3);
  });
  it("pasada la medianoche sigue contando desde el cierre del día en que se abrió", () => {
    expect(estadoRecordatorio({ ahora: lima("2026-10-02", "00:15"), abiertaEn: ABRIO_AQP, horaCierre: "21:30" })).toEqual({ nivel: 3, minutos: 165 });
  });
  it("una caja abierta después de la hora no nace atrasada: su cierre es el del día siguiente", () => {
    const abrioTarde = lima("2026-10-01", "22:10").toISOString();
    expect(estadoRecordatorio({ ahora: lima("2026-10-01", "22:40"), abiertaEn: abrioTarde, horaCierre: "21:30" }).nivel).toBe(0);
    expect(estadoRecordatorio({ ahora: lima("2026-10-02", "21:30"), abiertaEn: abrioTarde, horaCierre: "21:30" }).nivel).toBe(1);
  });
  it("una tienda sin hora de cierre no tiene recordatorio", () => {
    expect(estadoRecordatorio({ ahora: lima("2026-10-01", "23:00"), abiertaEn: ABRIO_AQP, horaCierre: null }).nivel).toBe(0);
    expect(instanteDeCierre(ABRIO_AQP, "")).toBeNull();
    expect(instanteDeCierre("no-es-fecha", "21:30")).toBeNull();
  });
  it("una caja abierta antes de la medianoche UTC (7 p. m. de Lima) cierra el mismo día de Lima", () => {
    const abrio = lima("2026-10-01", "19:30").toISOString(); // 00:30 UTC del día 2
    expect(new Date(instanteDeCierre(abrio, "21:30")!).toISOString()).toBe("2026-10-02T02:30:00.000Z");
  });
});

describe("nivelPorMinutos y progreso", () => {
  it("cortes exactos", () => {
    expect([-1, 0, 29, 30, 59, 60, 600].map(nivelPorMinutos)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
  it("el anillo se llena en la primera hora y no se pasa", () => {
    expect(progreso(-5)).toBe(0);
    expect(progreso(30)).toBe(0.5);
    expect(progreso(200)).toBe(1);
  });
});

describe("textos", () => {
  it("lo que pasó desde la hora", () => {
    expect(textoCorto(0)).toBe("ahora");
    expect(textoCorto(12)).toBe("12 min");
    expect(textoCorto(60)).toBe("1 h");
    expect(textoCorto(70)).toBe("1 h 10 min");
    expect(textoCorto(1500)).toBe("1 día");
    expect(textoCorto(35)).toBe("35 min");
    expect(textoCorto(3000)).toBe("2 días");
  });
  it("títulos y frases por nivel", () => {
    expect(rotuloPildora(1)).toBe("Cerrar caja");
    expect(rotuloPildora(3)).toBe("Caja sin cerrar");
    expect(tituloTarjeta(1)).toBe("Es hora de cerrar caja");
    expect(tituloTarjeta(2)).toBe("La caja sigue abierta");
    expect(tituloTarjeta(3)).toBe("Caja sin cerrar");
    expect(bajadaTarjeta(1, "Arequipa", "21:30")).toBe("Arequipa cierra a las 9:30 p. m.");
    expect(bajadaTarjeta(2, "Arequipa", "21:30")).toBe("Pasó la hora de cierre (9:30 p. m.).");
    expect(bajadaTarjeta(3, "Arequipa", "21:30")).toBe("Desde las 9:30 p. m. Ciérrala antes de irte.");
  });
  it("la hora de apertura en Lima y el nombre corto de la sede", () => {
    expect(horaLima12(ABRIO_AQP)).toBe("10:02 a. m.");
    expect(nombreCorto("Tienda Arequipa")).toBe("Arequipa");
    expect(nombreCorto("Taller")).toBe("Taller");
  });
});

describe("lineaDelDia", () => {
  it("lo que pasó después del cierre ocupa una parte del 20 % final", () => {
    expect(lineaDelDia(ABRIO_AQP, "21:30", -3).extraPct).toBe(0);
    const media = lineaDelDia(ABRIO_AQP, "21:30", 35).extraPct;
    expect(media).toBeGreaterThan(0);
    expect(media).toBeLessThan(20);
    expect(lineaDelDia(ABRIO_AQP, "21:30", 5000).extraPct).toBe(20);
  });
});
