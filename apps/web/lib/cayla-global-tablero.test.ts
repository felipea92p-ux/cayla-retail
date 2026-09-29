import { describe, expect, it } from "vitest";
import { estadoDeCobertura, fechaCorta, leerCobertura, resumenCobertura, type FilaCobertura } from "./cayla-global-tablero";

// CAYLA Global ▸ Salud del negocio (ADR-0275). Lo que vigila: que «no opera en el ERP» nunca se lea como «vendió cero».

const base: FilaCobertura = { ubicacionId: "u1", nombre: "Tienda TRU", tipo: "tienda", primeraVenta: "2026-09-28", ultimaVenta: "2026-09-28", ventas30d: 1, unidadesStock: 311 };

describe("leer lo que devuelve fn_global_cobertura", () => {
  it("lee números que llegan como texto (bigint de Postgres) y fechas vacías como nulas", () => {
    expect(
      leerCobertura([{ ubicacion_id: "u2", nombre: "Tienda LIM", tipo: "tienda", primera_venta: null, ultima_venta: "", ventas_30d: "0", unidades_stock: "12" }]),
    ).toEqual([{ ubicacionId: "u2", nombre: "Tienda LIM", tipo: "tienda", primeraVenta: null, ultimaVenta: null, ventas30d: 0, unidadesStock: 12 }]);
  });

  it("descarta una fila sin id o sin nombre (no inventa una sede) y aguanta lo que no es una lista", () => {
    expect(leerCobertura([{ nombre: "Sin id" }, { ubicacion_id: "x" }, null])).toEqual([]);
    expect(leerCobertura(null)).toEqual([]);
    expect(leerCobertura({ algo: 1 })).toEqual([]);
  });

  it("un tipo desconocido se lee como tienda (el caso que más exige)", () => {
    expect(leerCobertura([{ ubicacion_id: "u", nombre: "X", tipo: "raro" }])[0]?.tipo).toBe("tienda");
  });
});

describe("qué se dice de cada sede", () => {
  it("una tienda que nunca vendió en el ERP: «Aún no vende en el ERP», nunca «vendió 0»", () => {
    expect(estadoDeCobertura({ ...base, primeraVenta: null, ultimaVenta: null, ventas30d: 0 })).toEqual({ texto: "Aún no vende en el ERP", tono: "pizarra" });
  });

  it("una tienda que vendió antes pero no en 30 días: aviso en ámbar", () => {
    expect(estadoDeCobertura({ ...base, primeraVenta: "2026-01-01", ventas30d: 0 }).tono).toBe("ambar");
  });

  it("una tienda que vende: verde", () => {
    expect(estadoDeCobertura(base)).toEqual({ texto: "Vende en el ERP", tono: "verde" });
  });

  it("el Taller no vende a clientas: lo que dice si opera es su stock", () => {
    const taller: FilaCobertura = { ...base, tipo: "taller", primeraVenta: null, ultimaVenta: null, ventas30d: 0 };
    expect(estadoDeCobertura({ ...taller, unidadesStock: 0 }).texto).toBe("Aún no opera en el ERP");
    expect(estadoDeCobertura({ ...taller, unidadesStock: 40 }).tono).toBe("verde");
  });
});

describe("el resumen de arriba", () => {
  it("cuenta sedes con datos, suma ventas y unidades, y dice desde cuándo hay historia propia", () => {
    const filas: FilaCobertura[] = [
      base,
      { ...base, ubicacionId: "u2", nombre: "Tienda AQP", primeraVenta: "2026-09-27", ventas30d: 3, unidadesStock: 12 },
      { ...base, ubicacionId: "u3", nombre: "Tienda LIM", primeraVenta: null, ultimaVenta: null, ventas30d: 0, unidadesStock: 0 },
      { ...base, ubicacionId: "u4", nombre: "Taller", tipo: "taller", primeraVenta: null, ultimaVenta: null, ventas30d: 0, unidadesStock: 0 },
    ];
    expect(resumenCobertura(filas)).toEqual({ conDatos: 2, total: 4, ventas30d: 4, unidadesStock: 323, desde: "2026-09-27" });
  });

  it("sin ninguna venta en el ERP, «desde» es nulo (la pantalla lo dice en palabras)", () => {
    expect(resumenCobertura([]).desde).toBeNull();
  });
});

describe("fechaCorta", () => {
  it("«28 sep 2026», y «—» sin fecha o con una fecha rota", () => {
    expect(fechaCorta("2026-09-28")).toBe("28 sep 2026");
    expect(fechaCorta("2026-01-05T10:00:00")).toBe("5 ene 2026");
    expect(fechaCorta(null)).toBe("—");
    expect(fechaCorta("roto")).toBe("—");
  });
});
