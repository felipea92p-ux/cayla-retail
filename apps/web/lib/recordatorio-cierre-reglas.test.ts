import { describe, expect, it } from "vitest";
import {
  MINUTOS_PREAVISO,
  bajadaTarjeta,
  cicloDeDespliegue,
  estadoAviso,
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

describe("estadoAviso: el preaviso de 15 minutos (ADR-0357)", () => {
  const ABRIO_TRU = "2026-10-01T14:58:00Z"; // 9:58 a. m. de Lima
  const en = (hhmm: string) => estadoAviso({ ahora: lima("2026-10-01", hhmm), abiertaEn: ABRIO_TRU, horaCierre: "19:45" });

  it("Trujillo (cierra 7:45 p. m.) empieza a avisar a las 7:30 p. m., no antes", () => {
    expect(MINUTOS_PREAVISO).toBe(15);
    expect(en("19:29").nivel).toBe(0);
    expect(en("19:30")).toEqual({ nivel: 1, minutos: -15, previo: true });
    expect(en("19:44")).toEqual({ nivel: 1, minutos: -1, previo: true });
  });
  it("a la hora y después es idéntico a estadoRecordatorio, sin «previo»", () => {
    expect(en("19:45")).toEqual({ nivel: 1, minutos: 0, previo: false });
    expect(en("20:15")).toEqual({ nivel: 2, minutos: 30, previo: false });
    expect(en("20:45")).toEqual({ nivel: 3, minutos: 60, previo: false });
  });
  it("el botón de Caja no cambia: estadoRecordatorio sigue en 0 durante el preaviso", () => {
    expect(estadoRecordatorio({ ahora: lima("2026-10-01", "19:40"), abiertaEn: ABRIO_TRU, horaCierre: "19:45" }).nivel).toBe(0);
  });
  it("sin hora de cierre, o con una caja abierta tarde, no hay preaviso", () => {
    expect(estadoAviso({ ahora: lima("2026-10-01", "19:40"), abiertaEn: ABRIO_TRU, horaCierre: null })).toEqual({ nivel: 0, minutos: 0, previo: false });
    expect(estadoAviso({ ahora: lima("2026-10-01", "19:40"), abiertaEn: ABRIO_TRU, horaCierre: "" }).nivel).toBe(0);
    // Una caja abierta a las 7:50 p. m. cierra mañana: a las 7:55 de hoy no hay nada que avisar.
    const abrioTarde = lima("2026-10-01", "19:50").toISOString();
    expect(estadoAviso({ ahora: lima("2026-10-01", "19:55"), abiertaEn: abrioTarde, horaCierre: "19:45" }).nivel).toBe(0);
    // Pero sí 15 min antes del cierre de mañana.
    expect(estadoAviso({ ahora: lima("2026-10-02", "19:31"), abiertaEn: abrioTarde, horaCierre: "19:45" }).previo).toBe(true);
  });
});

describe("cicloDeDespliegue: la pestaña baja cada 5 minutos desde la hora", () => {
  it("no hay despliegue antes de la hora, ni durante el preaviso", () => {
    expect([-15, -5, -1].map(cicloDeDespliegue)).toEqual([-1, -1, -1]);
  });
  it("sube a las 7:45, 7:50, 7:55… y se queda quieto entre medias", () => {
    expect([0, 1, 4, 5, 9, 10, 14, 15].map(cicloDeDespliegue)).toEqual([0, 0, 0, 1, 1, 2, 2, 3]);
  });
  it("sigue subiendo con las horas y con los días (hasta que se cierre la caja)", () => {
    expect(cicloDeDespliegue(60)).toBe(12);
    expect(cicloDeDespliegue(1500)).toBe(300);
  });
});

describe("textos del preaviso", () => {
  it("dice que cierra pronto y a qué hora", () => {
    expect(rotuloPildora(1, true)).toBe("Cierra en");
    expect(tituloTarjeta(1, true)).toBe("Se acerca la hora de cierre");
    expect(bajadaTarjeta(1, "Trujillo", "19:45", true)).toBe("Trujillo cierra a las 7:45 p. m. Ve contando el cajón.");
  });
  it("sin «previo» los textos de siempre no cambian", () => {
    expect(rotuloPildora(1, false)).toBe("Cerrar caja");
    expect(tituloTarjeta(1, false)).toBe("Es hora de cerrar caja");
  });
});
