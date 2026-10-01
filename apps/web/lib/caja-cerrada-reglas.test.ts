import { describe, expect, it } from "vitest";
import { bajadaDelCartel, cuandoCerro, lineaUltimoCierre, TIEMPOS_SALIDA } from "./caja-cerrada-reglas";

// 2026-10-01 10:00 en Lima (UTC-5).
const AHORA = new Date("2026-10-01T15:00:00Z");

describe("cuandoCerro", () => {
  it("cerrada esta mañana dice «hoy»", () => {
    expect(cuandoCerro("2026-10-01T13:10:00Z", AHORA)).toBe("hoy, 08:10");
  });
  it("cerrada anoche dice «ayer», con la hora de Lima", () => {
    // 2026-10-01T02:04Z = 30/09 21:04 en Lima: en UTC ya era «hoy», en la tienda era ayer.
    expect(cuandoCerro("2026-10-01T02:04:00Z", AHORA)).toBe("ayer, 21:04");
  });
  it("más atrás dice el día", () => {
    expect(cuandoCerro("2026-09-28T23:30:00Z", AHORA)).toBe("el 28/09, 18:30");
  });
  it("un reloj adelantado (cierre «en el futuro») no dice nada raro: es hoy", () => {
    expect(cuandoCerro("2026-10-01T16:00:00Z", AHORA)).toBe("hoy, 11:00");
  });
});

describe("bajadaDelCartel", () => {
  it("con cierre: la sede y desde cuándo", () => {
    expect(bajadaDelCartel("Tienda TRU", { cerradaEn: "2026-10-01T02:04:00Z", cerradaPorNombre: "Rosa", montoFondo: 200 }, AHORA)).toBe(
      "Tienda TRU · desde ayer, 21:04",
    );
  });
  it("sin cierre: solo la sede", () => {
    expect(bajadaDelCartel("Tienda TRU", null, AHORA)).toBe("Tienda TRU");
  });
});

describe("lineaUltimoCierre", () => {
  it("cuándo, quién y cuánto quedó en el cajón", () => {
    expect(lineaUltimoCierre({ cerradaEn: "2026-10-01T02:04:00Z", cerradaPorNombre: "Rosa", montoFondo: 200 }, AHORA)).toEqual([
      "Último cierre ayer, 21:04 · Rosa",
      "En el cajón S/ 200.00",
    ]);
  });
  it("sin nombre de quién cerró y sin fondo (cierres anteriores a ADR-0186): no inventa nada", () => {
    expect(lineaUltimoCierre({ cerradaEn: "2026-10-01T02:04:00Z", cerradaPorNombre: null, montoFondo: null }, AHORA)).toEqual([
      "Último cierre ayer, 21:04",
    ]);
  });
  it("un fondo de cero sí se dice: quedó el cajón vacío", () => {
    expect(lineaUltimoCierre({ cerradaEn: "2026-10-01T02:04:00Z", cerradaPorNombre: "Rosa", montoFondo: 0 }, AHORA)[1]).toBe("En el cajón S/ 0.00");
  });
  it("sede sin ningún cierre: avisa que la primera apertura se escribe", () => {
    expect(lineaUltimoCierre(null, AHORA)).toEqual(["Primera apertura de la sede: escribes con cuánto abres"]);
  });
});

describe("TIEMPOS_SALIDA", () => {
  it("el giro del cartel termina antes de que suba la persiana", () => {
    // El giro dura 900 ms en el CSS: la persiana no puede arrancar antes.
    expect(TIEMPOS_SALIDA.giro).toBeGreaterThanOrEqual(900);
    // La subida dura 1 s en el CSS: la capa no se desmonta a media subida.
    expect(TIEMPOS_SALIDA.subida).toBeGreaterThanOrEqual(1000);
  });
});
