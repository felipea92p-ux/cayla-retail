import { describe, expect, it } from "vitest";
import { clavePendiente, escalaDeRenta, limiteParaDibujar, pendientesDelContador, valorDeFila, valorLegible } from "./impuestos-config-reglas";
import type { PanelImpuestos, ParametroFila } from "./impuestos-reglas";

const fila = (nombre: ParametroFila["nombre"], vigenteDesde: string, valor: number | null, provisional = true, texto: string | null = null) =>
  ({ nombre, vigenteDesde, valor, texto, provisional, nota: null, registradoPor: null, registradoEn: null, correcciones: 0 }) as ParametroFila;

const umbral = (x: Partial<PanelImpuestos["umbral"]>) =>
  ({ anio: 2026, ventasAnio: 500, ventasAnioErp: 500, ajuste: 0, umbralSoles: 1000, avance: 0.5, cruzado: false, primerMes: null, ventasMeses: [], avisoSoles: 800, avisoAlcanzado: false, ...x }) as PanelImpuestos["umbral"];

describe("lo que falta confirmar con el contador", () => {
  it("lista solo lo provisional, con lo que define el año primero", () => {
    const lista = pendientesDelContador([fila("uit", "2026-01-01", 5500), fila("igv", "2011-03-01", 0.18, false), fila("regimen", "2026-01-01", null, true, "rmt"), fila("umbral_uit", "2026-01-01", 300)]);
    expect(lista.map((p) => p.que)).toEqual(["Régimen 2026", "Límite de ventas 2026", "UIT 2026"]);
    expect(valorDeFila(lista[0]!.parametro)).toBe("Régimen MYPE Tributario");
    expect(valorDeFila(lista[1]!.parametro)).toBe("300 UIT");
  });

  it("lo más nuevo va antes que lo viejo", () => {
    expect(pendientesDelContador([fila("uit", "2025-01-01", 5350), fila("uit", "2026-01-01", 5500)]).map((p) => p.que)).toEqual(["UIT 2026", "UIT 2025"]);
  });

  it("la escala de la ley y el ajuste de ventas no se le preguntan al contador", () => {
    expect(pendientesDelContador([fila("renta_tramo_uit", "2026-01-01", 15), fila("ventas_previas_erp", "2026-01-01", 0)])).toEqual([]);
  });

  it("conserva la fila tal cual: confirmar es volver a escribir el mismo valor", () => {
    const p = fila("regimen", "2026-01-01", null, true, "rmt");
    expect(pendientesDelContador([p])[0]!.parametro).toBe(p);
    expect(clavePendiente(p)).toBe("regimen|2026-01-01");
  });
});

describe("cómo se lee cada valor", () => {
  it("el porcentaje, los soles y las UIT", () => {
    expect(valorLegible("igv", 0.18)).toBe("18 %");
    expect(valorLegible("renta_pago_cuenta", 0.01)).toBe("1 %");
    expect(valorLegible("aviso_umbral_uit", 250)).toBe("250 UIT");
    expect(valorLegible("tope_planilla_movilidad", 45.2)).toContain("45.20 por persona y día");
    expect(valorLegible("renta_pagada_previa", 10)).toContain("10.00");
  });
});

describe("lo vendido contra el límite", () => {
  it("dice cuánto va, cuánto queda y dónde cae el aviso", () => {
    expect(limiteParaDibujar(umbral({}), 2026)).toEqual({ vendido: 500, quedan: 500, umbralSoles: 1000, pct: 50, avisoPct: 80, tono: "tinta" });
  });

  it("solo dibuja el año que la base mide", () => {
    expect(limiteParaDibujar(umbral({}), 2025)).toBeNull();
    expect(limiteParaDibujar(null, 2026)).toBeNull();
  });

  it("una base más vieja o sin límite no dibuja nada", () => {
    expect(limiteParaDibujar(umbral({ ventasAnio: null }), 2026)).toBeNull();
    expect(limiteParaDibujar(umbral({ umbralSoles: null }), 2026)).toBeNull();
    expect(limiteParaDibujar(umbral({ umbralSoles: 0 }), 2026)).toBeNull();
  });

  it("el aviso pinta en ámbar y pasarse, en rojo; lo que queda nunca baja de cero", () => {
    expect(limiteParaDibujar(umbral({ ventasAnio: 900, avisoAlcanzado: true }), 2026)!.tono).toBe("ambar");
    const pasado = limiteParaDibujar(umbral({ ventasAnio: 1200, cruzado: true }), 2026)!;
    expect(pasado.tono).toBe("rojo");
    expect(pasado.quedan).toBe(0);
    expect(pasado.pct).toBe(120);
  });

  it("sin aviso no hay rayita", () => {
    expect(limiteParaDibujar(umbral({ avisoSoles: null }), 2026)!.avisoPct).toBeNull();
  });
});

describe("la escala de la renta", () => {
  it("se arma con la ley, y sin un dato no dice nada", () => {
    const ley = [fila("renta_tramo_uit", "2026-01-01", 15), fila("renta_tasa_tramo", "2026-01-01", 0.1), fila("renta_tasa_resto", "2026-01-01", 0.295), fila("boletas_tope_pct", "2026-01-01", 0.06)];
    expect(escalaDeRenta(ley, 2026)).toBe("Escala de 2026: 10 % hasta 15 UIT y 29.5 % sobre el resto; las boletas restan hasta 6 %.");
    expect(escalaDeRenta(ley.slice(1), 2026)).toBeNull();
  });
});
