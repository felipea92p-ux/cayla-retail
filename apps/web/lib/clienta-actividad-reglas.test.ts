import { describe, expect, it } from "vitest";
import { COMPRAS_PARA_FRECUENTE, comprasRecientes, deducirTallas, estadoFrecuente } from "./clienta-actividad-reglas";
import type { Compra } from "./clientas-reglas";

function compra(fecha: string, items: Compra["items"]): Compra {
  return { ventaId: fecha, fecha, ubicacion: "Tienda Trujillo", total: 0, items };
}

describe("deducirTallas", () => {
  it("toma la talla MÁS RECIENTE por categoría, no la más frecuente", () => {
    // Compras ya vienen ordenadas de más reciente a más antigua (como las entrega fn_clienta_compras).
    const compras = [
      compra("2026-09-20", [{ categoria: "Blusas", talla: "M", cantidad: 1 }]),
      compra("2026-06-10", [{ categoria: "Blusas", talla: "S", cantidad: 1 }]),
      compra("2026-06-10", [{ categoria: "Blusas", talla: "S", cantidad: 1 }]),
    ];
    expect(deducirTallas(compras)).toEqual([{ categoria: "Blusas", talla: "M" }]);
  });

  it("una talla por categoría distinta, ignora ítems sin categoría o sin talla", () => {
    const compras = [
      compra("2026-09-20", [
        { categoria: "Blusas", talla: "M", cantidad: 1 },
        { categoria: "Pantalones", talla: "28", cantidad: 1 },
        { categoria: null, talla: "M", cantidad: 1 },
        { categoria: "Accesorios", talla: null, cantidad: 1 },
      ]),
    ];
    expect(deducirTallas(compras)).toEqual([
      { categoria: "Blusas", talla: "M" },
      { categoria: "Pantalones", talla: "28" },
    ]);
  });

  it("sin compras, no deduce nada", () => {
    expect(deducirTallas([])).toEqual([]);
  });
});

describe("comprasRecientes / estadoFrecuente", () => {
  const ahora = new Date("2026-09-27T00:00:00Z");

  it("cuenta solo las compras dentro de la ventana de 6 meses", () => {
    const compras = [
      compra("2026-09-01T00:00:00Z", []),
      compra("2026-06-01T00:00:00Z", []), // dentro (hace ~3.9 meses)
      compra("2026-01-01T00:00:00Z", []), // fuera (hace ~9 meses)
    ];
    expect(comprasRecientes(compras, ahora)).toBe(2);
  });

  it(`con menos de ${COMPRAS_PARA_FRECUENTE} compras recientes, dice cuántas faltan`, () => {
    const compras = [compra("2026-09-01T00:00:00Z", []), compra("2026-08-01T00:00:00Z", [])];
    expect(estadoFrecuente(compras, ahora)).toEqual({ esFrecuente: false, faltanParaFrecuente: 1, comprasEnVentana: 2 });
  });

  it(`con ${COMPRAS_PARA_FRECUENTE} o más compras recientes, ya es frecuente`, () => {
    const compras = [compra("2026-09-01T00:00:00Z", []), compra("2026-08-01T00:00:00Z", []), compra("2026-07-01T00:00:00Z", [])];
    expect(estadoFrecuente(compras, ahora)).toEqual({ esFrecuente: true, faltanParaFrecuente: 0, comprasEnVentana: 3 });
  });

  it("sin compras, faltan todas", () => {
    expect(estadoFrecuente([], ahora)).toEqual({ esFrecuente: false, faltanParaFrecuente: COMPRAS_PARA_FRECUENTE, comprasEnVentana: 0 });
  });
});
