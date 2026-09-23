import { describe, expect, it } from "vitest";
import { cantidadCobrable, conStockAjustado, conStockReleido, descontarVendido } from "./vender-stock-local";
import { sumarCantidades } from "./inventario-reglas";

const piso = (variante_id: string, cantidad: number, cantidad_apartada = 0) => ({ variante_id, cantidad, cantidad_apartada, sububicacion: { tipo: "piso_venta" } });
const almacen = (variante_id: string, cantidad: number) => ({ variante_id, cantidad, cantidad_apartada: 0, sububicacion: { tipo: "almacen_tienda" } });

describe("stock de la caja tras vender", () => {
  it("cobrable = piso disponible (no el almacén, no lo apartado); sin piso/almacén, el total disponible", () => {
    const tienda = sumarCantidades([piso("a", 5, 1), almacen("a", 10)]);
    expect(cantidadCobrable(tienda.get("a"))).toBe(4);
    const taller = sumarCantidades([{ variante_id: "b", cantidad: 7, cantidad_apartada: 2, sububicacion: null }]);
    expect(cantidadCobrable(taller.get("b"))).toBe(5);
    expect(cantidadCobrable(undefined)).toBe(0);
  });

  it("descuenta lo vendido sin bajar de 0 y sin inventar prendas fuera del catálogo", () => {
    const stock = new Map([["a", 3], ["b", 1]]);
    const r = descontarVendido(new Map(), stock, [
      { varianteId: "a", cantidad: 2 },
      { varianteId: "b", cantidad: 5 },
      { varianteId: "libre", cantidad: 1 },
    ]);
    expect([...r]).toEqual([["a", 1], ["b", 0]]);
    // Una segunda venta parte del ajuste anterior, no del stock original.
    expect(descontarVendido(r, stock, [{ varianteId: "a", cantidad: 1 }]).get("a")).toBe(0);
  });

  it("lo releído manda; una prenda sin fila de stock queda en 0", () => {
    const releido = sumarCantidades([piso("a", 4)]);
    const r = conStockReleido(new Map([["a", 1], ["c", 9]]), ["a", "b"], releido);
    expect([...r]).toEqual([["a", 4], ["c", 9], ["b", 0]]);
  });

  it("aplica los ajustes y devuelve el mismo arreglo si no hay ninguno", () => {
    const variantes = [{ varianteId: "a", stockAqui: 3 }, { varianteId: "b", stockAqui: 2 }];
    expect(conStockAjustado(variantes, new Map())).toBe(variantes);
    expect(conStockAjustado(variantes, new Map([["b", 0]]))).toEqual([{ varianteId: "a", stockAqui: 3 }, { varianteId: "b", stockAqui: 0 }]);
  });
});
