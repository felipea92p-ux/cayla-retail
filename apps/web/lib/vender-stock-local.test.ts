import { describe, expect, it } from "vitest";
import { apartadoEnPiso, cantidadCobrable, conApartadoAjustado, conApartadoReleido, conStockAjustado, conStockReleido, descontarVendido } from "./vender-stock-local";
import { sumarCantidades } from "./inventario-reglas";
import { textoSinStock } from "./vender-reglas";

const piso = (variante_id: string, cantidad: number, cantidad_apartada = 0) => ({ variante_id, cantidad, cantidad_apartada, sububicacion: { tipo: "piso_venta" } });
const almacen = (variante_id: string, cantidad: number, cantidad_apartada = 0) => ({ variante_id, cantidad, cantidad_apartada, sububicacion: { tipo: "almacen_tienda" } });

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

// De las filas de `stock` a la palabra que lee la colaboradora: lo apartado solo explica el piso vacío si está EN el piso.
describe("«apartada» o «agotada» según dónde está lo apartado", () => {
  const palabra = (filas: Parameters<typeof sumarCantidades>[0], id: string) => {
    const c = sumarCantidades(filas).get(id);
    return textoSinStock({ stockAqui: cantidadCobrable(c), apartadoAqui: apartadoEnPiso(c) });
  };

  it("todo el piso apartado: cobrable 0, apartado 1 → «apartada para una clienta»", () => {
    const c = sumarCantidades([piso("a", 1, 1)]).get("a");
    expect([cantidadCobrable(c), apartadoEnPiso(c)]).toEqual([0, 1]);
    expect(palabra([piso("a", 1, 1)], "a")).toBe("apartada para una clienta");
  });

  it("piso apartado y almacén con stock libre: la palabra habla del piso, que es de donde vende la caja", () => {
    const filas = [piso("a", 1, 1), almacen("a", 5)];
    expect(cantidadCobrable(sumarCantidades(filas).get("a"))).toBe(0);
    expect(palabra(filas, "a")).toBe("apartada para una clienta");
  });

  it("piso en 0 y lo apartado está en el ALMACÉN: sigue siendo agotada aquí", () => {
    const filas = [piso("a", 0), almacen("a", 5, 2)];
    expect(apartadoEnPiso(sumarCantidades(filas).get("a"))).toBe(0);
    expect(palabra(filas, "a")).toBe("agotada");
  });

  it("piso en 0 sin nada apartado (stock solo en el almacén): agotada", () => {
    expect(palabra([almacen("a", 5)], "a")).toBe("agotada");
  });

  it("con parte del piso libre no se dice nada: hay algo que vender", () => {
    const c = sumarCantidades([piso("a", 3, 1)]).get("a");
    expect([cantidadCobrable(c), apartadoEnPiso(c)]).toEqual([2, 1]);
  });

  it("en una ubicación sin piso/almacén (Taller) lo apartado es del total", () => {
    const taller = sumarCantidades([{ variante_id: "b", cantidad: 7, cantidad_apartada: 7, sububicacion: null }]).get("b");
    expect([cantidadCobrable(taller), apartadoEnPiso(taller)]).toEqual([0, 7]);
    expect(palabra([{ variante_id: "b", cantidad: 7, cantidad_apartada: 7, sububicacion: null }], "b")).toBe("apartada para una clienta");
  });

  it("sin fila de stock en la sede no hay nada apartado", () => {
    expect(apartadoEnPiso(undefined)).toBe(0);
  });
});

describe("lo apartado releído", () => {
  it("lo releído manda; una prenda sin fila queda en 0", () => {
    // Piso 5 con 1 apartada (cobrable 4) y almacén 3 con 2 apartadas: lo apartado EN EL PISO es 1 — ni el cobrable (4)
    // ni el apartado total (3, con el almacén). Con un fixture donde los tres números coinciden la prueba no distingue
    // «lo apartado en el piso» de «lo cobrable» ni del total (mutaciones M10 y M11 de la revisión).
    const releido = sumarCantidades([piso("a", 5, 1), almacen("a", 3, 2)]);
    const c = releido.get("a");
    expect([cantidadCobrable(c), c?.apartado, apartadoEnPiso(c)]).toEqual([4, 3, 1]);
    const r = conApartadoReleido(new Map([["a", 0], ["c", 9]]), ["a", "b"], releido);
    expect([...r]).toEqual([["a", 1], ["c", 9], ["b", 0]]);
  });

  it("se aplica a las variantes y devuelve el mismo arreglo si no hay ajustes", () => {
    const variantes = [{ varianteId: "a", apartadoAqui: 0 }, { varianteId: "b" }];
    expect(conApartadoAjustado(variantes, new Map())).toBe(variantes);
    expect(conApartadoAjustado(variantes, new Map([["b", 1]]))).toEqual([{ varianteId: "a", apartadoAqui: 0 }, { varianteId: "b", apartadoAqui: 1 }]);
  });
});
