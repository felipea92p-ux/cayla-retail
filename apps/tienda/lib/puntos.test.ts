import { describe, expect, it } from "vitest";
import {
  conservacionDicha,
  cuponDicho,
  cuponYSuPedido,
  diasQueFaltan,
  estadoDeRechazo,
  leerMisPuntos,
  leerRespuestaCanje,
  movimientoDicho,
  MENSAJES_PUNTOS,
  opcionesDeCanje,
  puntosDichos,
  reglaDeLosPuntos,
  resumenDePuntos,
  valorDePuntos,
  venceDicho,
} from "./puntos";

const HOY = { anio: 2026, mes: 10, dia: 19 };
const CONFIG = { puntos_por_sol: 1, soles_por_100: 5, canje_minimo: 200, compra_minima_x: 3, vigencia_dias: 7, regalo_cumple: 100 };
const COMPLETA = {
  ...CONFIG,
  miembro: true,
  saldo: 1240,
  valor_saldo: 60,
  cumple_dia: 14,
  cumple_mes: 10,
  regalo_disponible: true,
  pierde_el: "2029-10-19",
  cupones: [{ codigo: "CAY-4K7P-9H2M", puntos: 200, valor: 10, compra_minima: 30, vence_el: "2026-10-26" }],
  movimientos: [{ tipo: "canje", puntos: -200, dia: "2026-10-19", codigo: "CAY-4K7P-9H2M" }],
};

describe("leerMisPuntos", () => {
  it("lee la respuesta completa en camelCase", () => {
    const p = leerMisPuntos(COMPLETA)!;
    expect(p.saldo).toBe(1240);
    expect(p.valorSaldo).toBe(60);
    expect(p.regaloDisponible).toBe(true);
    expect(p.config).toEqual({ puntosPorSol: 1, solesPor100: 5, canjeMinimo: 200, compraMinimaX: 3, vigenciaDias: 7, regaloCumple: 100 });
    // Una base sin el pedido web (antes de 20261019224000) se lee como activo, sin pedido.
    expect(p.cupones).toEqual([
      { codigo: "CAY-4K7P-9H2M", puntos: 200, valor: 10, compraMinima: 30, venceEl: "2026-10-26", estado: "activo", pedido: null, volvioDe: null },
    ]);
    expect(p.movimientos).toHaveLength(1);
  });

  it("sin ficha del Club: solo la configuración", () => {
    const p = leerMisPuntos({ ...CONFIG, miembro: false })!;
    expect(p.miembro).toBe(false);
    expect(p.saldo).toBe(0);
    expect(p.cupones).toEqual([]);
  });

  it("una respuesta rara no se muestra a medias", () => {
    expect(leerMisPuntos(null)).toBeNull();
    expect(leerMisPuntos({ miembro: true })).toBeNull();
    expect(leerMisPuntos({ ...COMPLETA, saldo: -5 })).toBeNull();
  });

  it("un cupón o un movimiento raro se deja fuera, no tumba lo demás", () => {
    const p = leerMisPuntos({ ...COMPLETA, cupones: [...COMPLETA.cupones, { codigo: "otro" }], movimientos: [...COMPLETA.movimientos, { tipo: "raro", puntos: 1, dia: "2026-10-01", codigo: null }] })!;
    expect(p.cupones).toHaveLength(1);
    expect(p.movimientos).toHaveLength(1);
  });
});

describe("cómo se dicen", () => {
  it("los puntos y su valor (solo cuentan los cientos completos)", () => {
    expect(puntosDichos(1)).toBe("1 punto");
    expect(puntosDichos(1240)).toMatch(/^1\D?240 puntos$/);
    expect(valorDePuntos(840, { solesPor100: 5 })).toBe(40);
    expect(valorDePuntos(99, { solesPor100: 5 })).toBe(0);
    expect(valorDePuntos(250, { solesPor100: 2.5 })).toBe(5);
  });

  it("la regla de los puntos usa los números de hoy", () => {
    const cfg = leerMisPuntos(COMPLETA)!.config;
    expect(reglaDeLosPuntos(cfg)).toBe("Ganas 1 punto por cada S/ 1 que pagas. 100 puntos valen S/ 5.");
    expect(reglaDeLosPuntos({ ...cfg, puntosPorSol: 2, solesPor100: 2.5 })).toBe("Ganas 2 puntos por cada S/ 1 que pagas. 100 puntos valen S/ 2.50.");
  });

  it("cuándo vence un cupón", () => {
    expect(diasQueFaltan("2026-10-26", HOY)).toBe(7);
    expect(diasQueFaltan("2026-11-02", HOY)).toBe(14);
    expect(venceDicho("2026-10-19", HOY)).toBe("Vence hoy");
    expect(venceDicho("2026-10-20", HOY)).toBe("Vence mañana");
    expect(venceDicho("2026-10-26", HOY)).toBe("Vence el 26 de octubre · te quedan 7 días");
    expect(venceDicho("2026-10-18", HOY)).toBe("Vence hoy");
  });

  it("la conservación: la regla de los 3 años con la fecha de la base", () => {
    expect(conservacionDicha("2029-10-19", HOY)).toBe(
      "Tus puntos y tus datos se guardan mientras compres: si pasan 3 años sin compras, se eliminan. Tu fecha: 19 de octubre de 2029. Cada compra la corre 3 años más.",
    );
    expect(conservacionDicha(null, HOY)).toBe("Tus puntos y tus datos se guardan mientras compres: si pasan 3 años sin compras, se eliminan.");
    expect(leerMisPuntos(COMPLETA)!.pierdeEl).toBe("2029-10-19");
    expect(leerMisPuntos({ ...COMPLETA, pierde_el: undefined })!.pierdeEl).toBeNull();
  });

  it("el cupón en una línea", () => {
    expect(cuponDicho({ valor: 10, compraMinima: 30 })).toBe("S/ 10 · para una compra desde S/ 30");
  });

  it("los movimientos, con el código solo en canje y devuelve", () => {
    expect(movimientoDicho({ tipo: "canje", puntos: -200, dia: "2026-10-03", codigo: "CAY-4K7P-9H2M" }, HOY)).toEqual({
      titulo: "Canje por cupón CAY-4K7P-9H2M",
      dia: "3 de octubre",
      puntos: "−200",
      sube: false,
    });
    expect(movimientoDicho({ tipo: "compra", puntos: 150, dia: "2026-10-12", codigo: null }, HOY)).toMatchObject({ titulo: "Compra", puntos: "+150", sube: true });
    expect(movimientoDicho({ tipo: "cumple", puntos: 100, dia: "2026-10-12", codigo: null }, HOY).titulo).toBe("Regalo de cumpleaños");
    // Un código en una compra no se dice: la base solo lo manda en canje y devuelve.
    expect(movimientoDicho({ tipo: "compra", puntos: 10, dia: "2026-10-12", codigo: "CAY-AAAA-BBBB" }, HOY).titulo).toBe("Compra");
  });
});

describe("opcionesDeCanje", () => {
  const cfg = { canjeMinimo: 200 };
  it("de a 100, desde el mínimo, hasta el saldo (sin pasar de los cientos completos)", () => {
    expect(opcionesDeCanje(1240, cfg)).toEqual({ tipo: "posible", min: 200, max: 1200, paso: 100 });
    expect(opcionesDeCanje(200, cfg)).toEqual({ tipo: "posible", min: 200, max: 200, paso: 100 });
  });
  it("saldo corto: dice cuánto falta", () => {
    expect(opcionesDeCanje(120, cfg)).toEqual({ tipo: "saldo_corto", faltan: 80 });
    expect(opcionesDeCanje(0, cfg)).toEqual({ tipo: "saldo_corto", faltan: 200 });
  });
  it("un mínimo que no es múltiplo de 100 sube al siguiente", () => {
    expect(opcionesDeCanje(1000, { canjeMinimo: 150 })).toMatchObject({ tipo: "posible", min: 200 });
  });
});

describe("el canje", () => {
  it("lee el cupón creado y si fue un reintento", () => {
    const r = leerRespuestaCanje({ codigo: "CAY-4K7P-9H2M", puntos: 200, valor: 10, compra_minima: 30, vence_el: "2026-10-26", estado: "activo", repetido: true, saldo: 1040 });
    expect(r).toEqual({ estado: "ok", repetido: true, cupon: { codigo: "CAY-4K7P-9H2M", puntos: 200, valor: 10, compraMinima: 30, venceEl: "2026-10-26", saldo: 1040 } });
  });
  it("una respuesta rara nunca se muestra como un cupón", () => {
    expect(leerRespuestaCanje(null)).toEqual({ estado: "sin_respuesta" });
    expect(leerRespuestaCanje({ codigo: "x" })).toEqual({ estado: "sin_respuesta" });
  });
  it("cada rechazo de la base tiene su mensaje", () => {
    for (const hint of ["puntos_insuficientes", "canje_menor_al_minimo", "canje_no_multiplo", "sin_cuenta", "token_reusado", "otra_cosa", null, undefined]) {
      const e = estadoDeRechazo(hint);
      expect(MENSAJES_PUNTOS[e].length).toBeGreaterThan(10);
    }
    expect(estadoDeRechazo("puntos_insuficientes")).toBe("saldo");
    expect(estadoDeRechazo("raro")).toBe("sin_respuesta");
  });
});

describe("resumenDePuntos", () => {
  const p = leerMisPuntos({ ...COMPLETA, cupones: [], regalo_disponible: false })!;
  it("una cuenta simple todavía no es del Club", () => {
    expect(resumenDePuntos(p, false)).toEqual({ texto: "Únete: completa tus datos", tono: "ambar" });
  });
  it("lo que se puede usar va primero, en verde", () => {
    expect(resumenDePuntos(leerMisPuntos(COMPLETA), true)).toEqual({ texto: "1 cupón para usar", tono: "verde" });
    expect(resumenDePuntos(leerMisPuntos({ ...COMPLETA, cupones: [], regalo_disponible: true }), true)).toEqual({ texto: "+100 puntos de regalo", tono: "verde" });
  });
  it("si no hay nada que usar, sus puntos", () => {
    expect(resumenDePuntos(p, true).tono).toBe("neutro");
    expect(resumenDePuntos(p, true).texto).toMatch(/^1\D?240 puntos$/);
  });
  it("sin respuesta o sin ficha activa", () => {
    expect(resumenDePuntos(null, true).texto).toBe("No se pudo cargar");
    expect(resumenDePuntos(leerMisPuntos({ ...CONFIG, miembro: false }), true)).toEqual({ texto: "Tu ficha no está activa", tono: "ambar" });
  });
});

describe("el cupón y su pedido web (20261019224000)", () => {
  it("reservado dice para qué pedido; vuelto de uno, de cuál; uno suelto no dice nada", () => {
    expect(cuponYSuPedido({ estado: "reservado", pedido: "W-0012", volvioDe: null })).toBe("Reservado para tu pedido W-0012: se usa cuando lo pagues");
    expect(cuponYSuPedido({ estado: "reservado", pedido: null, volvioDe: null })).toBe("Reservado para un pedido web");
    expect(cuponYSuPedido({ estado: "activo", pedido: null, volvioDe: "W-0012" })).toBe("Volvió de tu pedido W-0012: puedes usarlo de nuevo");
    expect(cuponYSuPedido({ estado: "activo", pedido: null, volvioDe: null })).toBeNull();
  });
});
