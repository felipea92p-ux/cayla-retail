import { describe, expect, it } from "vitest";
import { accionHoyPorVariante, calcularAccionHoy, recomendacionesDeSede, type FilaParaAccionHoy, type FilaParaRecomendaciones, type TipoAccionHoy } from "./existencias-recomendaciones";
import type { PoliticaOperativaInventario } from "./politica-operativa-inventario";

// «Acción hoy» — REGLA FÍSICA DE PISO, TOTALMENTE INDEPENDIENTE del Ritmo reciente/Cobertura
// piso (Felipe, cuarta ronda, 2026-09-25): `stock_piso <= politica.umbralStockPisoReposicion` es
// SIEMPRE «Reponer a piso»; por encima, SIEMPRE «Sin acción» — sin importar jornadas de
// exposición, ritmo medido o «sin salida reciente». «Base insuficiente» se retiró por completo:
// esa combinación ahora describe la CALIDAD del Ritmo reciente/Cobertura piso, no una acción.
// Por eso `calcularAccionHoy` ya ni siquiera recibe Ritmo/Cobertura como parámetro.

const POLITICA: PoliticaOperativaInventario = { minDiasExposicionRitmo: 3, umbralStockPisoReposicion: 4 };

const filaBase = (o: Partial<FilaParaAccionHoy> = {}): FilaParaAccionHoy => ({
  varianteId: "v1",
  pisoDisponible: 0,
  almacenDisponible: 0,
  enTransito: 0,
  ...o,
});

describe("TipoAccionHoy — solo 2 valores, «base_insuficiente» ya no existe", () => {
  it("el tipo union es exactamente reponer_a_piso | sin_accion (guarda de tipos, no de runtime)", () => {
    const tipos: readonly TipoAccionHoy[] = ["reponer_a_piso", "sin_accion"];
    expect(tipos).toHaveLength(2);
    // @ts-expect-error — «base_insuficiente» ya no es un TipoAccionHoy válido: si esta línea deja
    // de dar error de compilación, es que el tipo se reabrió sin querer.
    const invalido: TipoAccionHoy = "base_insuficiente";
    void invalido;
  });
});

describe("calcularAccionHoy — casos A-F del pedido (independiente de Ritmo reciente/Cobertura piso)", () => {
  it("Caso A — piso 10, «1 jornada» (irrelevante): Sin acción — piso > umbral manda, sin importar el ritmo", () => {
    const f = filaBase({ pisoDisponible: 10, almacenDisponible: 20 });
    expect(calcularAccionHoy(f, POLITICA).tipo).toBe("sin_accion");
  });

  it("Caso B — piso 5, «2 jornadas» (irrelevante): Sin acción", () => {
    const f = filaBase({ pisoDisponible: 5, almacenDisponible: 20 });
    expect(calcularAccionHoy(f, POLITICA).tipo).toBe("sin_accion");
  });

  it("Caso C — piso 4 (el umbral incluido), «1 jornada» (irrelevante): Reponer a piso", () => {
    const f = filaBase({ pisoDisponible: 4, almacenDisponible: 20 });
    expect(calcularAccionHoy(f, POLITICA).tipo).toBe("reponer_a_piso");
  });

  it("Caso D — piso 3, «0 jornadas» (irrelevante): Reponer a piso", () => {
    const f = filaBase({ pisoDisponible: 3, almacenDisponible: 20 });
    expect(calcularAccionHoy(f, POLITICA).tipo).toBe("reponer_a_piso");
  });

  it("Caso E — piso 4, «sin salida reciente» (irrelevante): Reponer a piso", () => {
    const f = filaBase({ pisoDisponible: 4, almacenDisponible: 20 });
    expect(calcularAccionHoy(f, POLITICA).tipo).toBe("reponer_a_piso");
  });

  it("Caso F — piso 5, «sin salida reciente» (irrelevante): Sin acción", () => {
    const f = filaBase({ pisoDisponible: 5, almacenDisponible: 20 });
    expect(calcularAccionHoy(f, POLITICA).tipo).toBe("sin_accion");
  });
});

describe("calcularAccionHoy — nunca N/D: el piso siempre se conoce, no depende de una RPC", () => {
  it("piso > umbral: siempre devuelve un valor definido (no null, no undefined)", () => {
    const f = filaBase({ pisoDisponible: 100, almacenDisponible: 5 });
    const accion = calcularAccionHoy(f, POLITICA);
    expect(accion).not.toBeNull();
    expect(accion.tipo).toBe("sin_accion");
  });

  it("Taller (no separa piso/almacén): Sin acción — no vende a clientas", () => {
    const f = filaBase({ pisoDisponible: null, almacenDisponible: null });
    expect(calcularAccionHoy(f, POLITICA).tipo).toBe("sin_accion");
  });
});

describe("calcularAccionHoy — contexto (piso <= umbral, según almacén/en camino)", () => {
  it("piso 3, almacén 20: Reponer a piso, sin contexto (hay de dónde bajar)", () => {
    const f = filaBase({ pisoDisponible: 3, almacenDisponible: 20 });
    const accion = calcularAccionHoy(f, POLITICA);
    expect(accion.tipo).toBe("reponer_a_piso");
    expect(accion.contexto).toBeNull();
  });

  it("piso 3, almacén 0: Reponer a piso, contexto «Sin stock en almacén»", () => {
    const f = filaBase({ pisoDisponible: 3, almacenDisponible: 0 });
    const accion = calcularAccionHoy(f, POLITICA);
    expect(accion.tipo).toBe("reponer_a_piso");
    expect(accion.contexto).toBe("Sin stock en almacén");
  });

  it("piso 3, almacén 0, en camino 8: Reponer a piso, contexto «Sin stock en almacén · 8 uds en camino» — «en camino» NO sustituye la acción", () => {
    const f = filaBase({ pisoDisponible: 3, almacenDisponible: 0, enTransito: 8 });
    const accion = calcularAccionHoy(f, POLITICA);
    expect(accion.tipo).toBe("reponer_a_piso");
    expect(accion.contexto).toBe("Sin stock en almacén · 8 uds en camino");
  });
});

describe("accionHoyPorVariante / recomendacionesDeSede — una sola fuente de verdad", () => {
  it("coherencia total: el conteo de «Reponer a piso» del mapa es EXACTAMENTE el de las recomendaciones", () => {
    const filas: FilaParaRecomendaciones[] = [
      { varianteId: "v1", pisoDisponible: 3, almacenDisponible: 20, enTransito: 0, referencia: "Blusa A", sku: "SKU1", talla: "M", fotoUrl: null, colorHex: null }, // reponer
      { varianteId: "v2", pisoDisponible: 10, almacenDisponible: 20, enTransito: 0, referencia: "Blusa B", sku: "SKU2", talla: "M", fotoUrl: null, colorHex: null }, // sin_accion
      { varianteId: "v3", pisoDisponible: 0, almacenDisponible: 0, enTransito: 0, referencia: "Blusa C", sku: "SKU3", talla: "M", fotoUrl: null, colorHex: null }, // reponer, sin almacén
    ];

    const mapa = accionHoyPorVariante(filas, POLITICA);
    const recomendaciones = recomendacionesDeSede(filas, POLITICA);

    expect(mapa.size).toBe(3); // SIEMPRE una entrada por fila — nunca N/D
    const enMapaReponer = [...mapa.values()].filter((a) => a.tipo === "reponer_a_piso").length;
    expect(enMapaReponer).toBe(2); // v1 y v3
    expect(enMapaReponer).toBe(recomendaciones.length);

    expect(mapa.get("v2")?.tipo).toBe("sin_accion");
    expect(recomendaciones.some((r) => r.fila.varianteId === "v2")).toBe(false);
  });
});
