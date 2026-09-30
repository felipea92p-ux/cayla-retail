import { describe, expect, it } from "vitest";
import { COMPRAS_PARA_FRECUENTE, comprasRecientes, deducirTallas, estadoFrecuente } from "./clienta-actividad-reglas";
import { agruparCompras, type Compra, type FilaCompra } from "./clientas-reglas";

/** Un ítem comprado para ella (`esRegalo: false`), salvo que se diga lo contrario. */
type ItemPrueba = Omit<Compra["items"][number], "esRegalo"> & { esRegalo?: boolean };

function compra(fecha: string, items: ItemPrueba[]): Compra {
  return { ventaId: fecha, fecha, ubicacion: "Tienda Trujillo", total: 0, items: items.map((i) => ({ esRegalo: false, ...i })) };
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

  // ADR-0288 D-7 (D-101): la prenda «es para regalo» no es su talla.
  it("salta la prenda marcada para regalo: la talla sale de la compra anterior para ella", () => {
    const compras = [
      compra("2026-09-28", [{ categoria: "Blusas", talla: "S", cantidad: 1, esRegalo: true }]),
      compra("2026-08-10", [{ categoria: "Blusas", talla: "M", cantidad: 1 }]),
    ];
    expect(deducirTallas(compras)).toEqual([{ categoria: "Blusas", talla: "M" }]);
  });

  it("en una misma compra, el regalo no pisa la talla de lo que llevó para ella", () => {
    const compras = [
      compra("2026-09-28", [
        { categoria: "Blusas", talla: "XS", cantidad: 1, esRegalo: true },
        { categoria: "Blusas", talla: "L", cantidad: 1 },
        { categoria: "Pantalones", talla: "30", cantidad: 1, esRegalo: true },
      ]),
    ];
    expect(deducirTallas(compras)).toEqual([{ categoria: "Blusas", talla: "L" }]);
  });

  it("si solo compró para regalar, no se deduce ninguna talla", () => {
    const compras = [compra("2026-09-28", [{ categoria: "Casacas", talla: "S", cantidad: 2, esRegalo: true }])];
    expect(deducirTallas(compras)).toEqual([]);
  });

  it("el regalo sí cuenta como compra para «frecuente»: la compró ella", () => {
    const ahora = new Date("2026-09-30T00:00:00Z");
    const compras = [compra("2026-09-28T00:00:00Z", [{ categoria: "Casacas", talla: "S", cantidad: 1, esRegalo: true }])];
    expect(estadoFrecuente(compras, ahora).comprasEnVentana).toBe(1);
  });
});

describe("agruparCompras (filas de fn_clienta_compras)", () => {
  const fila = (venta: string, talla: string, es_regalo?: boolean | null): FilaCompra => ({
    venta_id: venta,
    fecha: "2026-09-28T15:00:00Z",
    ubicacion: "Tienda Trujillo",
    categoria: "Blusas",
    talla,
    cantidad: 1,
    subtotal: 89.9,
    ...(es_regalo === undefined ? {} : { es_regalo }),
  });

  it("lleva es_regalo de la base a cada prenda", () => {
    const [c] = agruparCompras([fila("v1", "S", true), fila("v1", "M", false)]);
    expect(c.items.map((i) => [i.talla, i.esRegalo])).toEqual([
      ["S", true],
      ["M", false],
    ]);
    expect(c.total).toBeCloseTo(179.8);
  });

  it("sin la columna (base sin la tanda 1d) o con null, la prenda no es regalo", () => {
    const [c] = agruparCompras([fila("v1", "S"), fila("v1", "M", null)]);
    expect(c.items.every((i) => i.esRegalo === false)).toBe(true);
  });

  it("de la base a la talla: una compra con un regalo deduce la talla de lo suyo", () => {
    const compras = agruparCompras([fila("v2", "S", true), fila("v2", "M", false)]);
    expect(deducirTallas(compras)).toEqual([{ categoria: "Blusas", talla: "M" }]);
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
