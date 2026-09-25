import { describe, expect, it } from "vitest";
import {
  almacenDeLaSede,
  almacenReleido,
  avisoSinPiso,
  avisoTope,
  cantidadCobrable,
  conAlmacenAjustado,
  conStockAjustado,
  conStockReleido,
  descontarVendido,
  motivoNoCobrable,
} from "./vender-stock-local";
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

  it("el almacén de la sede: lo disponible (sin lo apartado); null en el Taller o sin fila", () => {
    const tienda = sumarCantidades([piso("a", 0), almacen("a", 3), { variante_id: "a", cantidad: 2, cantidad_apartada: 1, sububicacion: { tipo: "almacen_tienda" } }]);
    expect(almacenDeLaSede(tienda.get("a"))).toBe(4);
    const taller = sumarCantidades([{ variante_id: "b", cantidad: 7, cantidad_apartada: 0, sububicacion: null }]);
    expect(almacenDeLaSede(taller.get("b"))).toBeNull();
    expect(almacenDeLaSede(undefined)).toBeNull();
  });

  it("el almacén releído sale de las mismas filas; una prenda que no volvió queda en null", () => {
    const releido = sumarCantidades([piso("a", 1), almacen("a", 5)]);
    expect([...almacenReleido(["a", "b"], releido)]).toEqual([["a", 5], ["b", null]]);
  });

  it("aplica los ajustes y devuelve el mismo arreglo si no hay ninguno", () => {
    const variantes = [{ varianteId: "a", stockAqui: 3 }, { varianteId: "b", stockAqui: 2 }];
    expect(conStockAjustado(variantes, new Map())).toBe(variantes);
    expect(conStockAjustado(variantes, new Map([["b", 0]]))).toEqual([{ varianteId: "a", stockAqui: 3 }, { varianteId: "b", stockAqui: 0 }]);
  });

  it("el almacén se corrige solo con lo releído, aparte del piso; sin ajustes, el mismo arreglo", () => {
    const variantes = [{ varianteId: "a", stockAqui: 0, almacenAqui: 2 }, { varianteId: "b", stockAqui: 1, almacenAqui: null }];
    expect(conAlmacenAjustado(variantes, new Map())).toBe(variantes);
    // Se trasladó lo del almacén de «a»: queda en 0, y el piso no se toca.
    expect(conAlmacenAjustado(variantes, new Map([["a", 0]]))).toEqual([{ varianteId: "a", stockAqui: 0, almacenAqui: 0 }, variantes[1]]);
  });
});

// D-40: lo del almacén se puede vender y la caja no se frena por un trámite. Con el piso en 0 y la prenda en el almacén
// de la MISMA tienda, la caja no dice «agotada»: dice dónde está y qué hacer.
describe("¿agotada o en el almacén? (motivoNoCobrable)", () => {
  it("hay en el piso: se cobra, haya o no en el almacén", () => {
    expect(motivoNoCobrable({ stockAqui: 2, almacenAqui: 5 })).toBe("cobrable");
    expect(motivoNoCobrable({ stockAqui: 1, almacenAqui: 0 })).toBe("cobrable");
  });

  it("solo en el almacén de esta sede: no entra al ticket, pero no está agotada", () => {
    expect(motivoNoCobrable({ stockAqui: 0, almacenAqui: 2 })).toBe("en_almacen");
  });

  it("ni en el piso ni en el almacén: agotada", () => {
    expect(motivoNoCobrable({ stockAqui: 0, almacenAqui: 0 })).toBe("agotada");
  });

  it("Taller (sin almacén) o sin el dato: como antes, con el piso en 0 está agotada", () => {
    expect(motivoNoCobrable({ stockAqui: 0, almacenAqui: null })).toBe("agotada");
    expect(motivoNoCobrable({ stockAqui: 0 })).toBe("agotada");
    expect(motivoNoCobrable({ stockAqui: 3, almacenAqui: null })).toBe("cobrable");
  });
});

describe("los avisos de la caja dicen dónde está la prenda y qué hacer", () => {
  const base = { nombre: "Blusa Paracas · M", sede: "Tienda TRU" };

  it("en el almacén: cuántas hay y que la bajen", () => {
    expect(avisoSinPiso({ ...base, stockAqui: 0, almacenAqui: 2 })).toEqual({
      titulo: "Blusa Paracas · M está en el almacén",
      detalle: "En el piso no hay, pero hay 2 en el almacén de Tienda TRU. Pide que la bajen al piso para cobrarla.",
    });
  });

  it("agotada: con almacén en 0 dice que tampoco hay ahí; en el Taller, como siempre", () => {
    expect(avisoSinPiso({ ...base, stockAqui: 0, almacenAqui: 0 })).toEqual({
      titulo: "Blusa Paracas · M está agotada",
      detalle: "No hay en el piso ni en el almacén de Tienda TRU.",
    });
    expect(avisoSinPiso({ ...base, sede: "Taller", stockAqui: 0, almacenAqui: null })).toEqual({
      titulo: "Blusa Paracas · M está agotada",
      detalle: "No hay stock en Taller.",
    });
  });

  it("tope sin almacén: el aviso de siempre", () => {
    expect(avisoTope({ ...base, stockAqui: 2, almacenAqui: 0 })).toEqual({
      titulo: "No hay más de Blusa Paracas · M",
      detalle: "En Tienda TRU quedan 2 y ya están todas en el ticket.",
    });
    expect(avisoTope({ ...base, stockAqui: 2, almacenAqui: null, quedoEn: true }).detalle).toBe("En Tienda TRU quedan 2; la cantidad quedó en 2.");
  });

  it("tope con más en el almacén: lo dice, con singular y plural", () => {
    expect(avisoTope({ ...base, stockAqui: 1, almacenAqui: 1 })).toEqual({
      titulo: "No hay más de Blusa Paracas · M en el piso",
      detalle: "La del piso ya está en el ticket. Hay 1 más en el almacén de Tienda TRU: pide que la bajen.",
    });
    expect(avisoTope({ ...base, stockAqui: 2, almacenAqui: 3 }).detalle).toBe(
      "Las 2 del piso ya están en el ticket. Hay 3 más en el almacén de Tienda TRU: pide que bajen las que necesites.",
    );
    expect(avisoTope({ ...base, stockAqui: 2, almacenAqui: 3, quedoEn: true }).detalle).toBe(
      "En el piso quedan 2; la cantidad quedó en 2. Hay 3 más en el almacén de Tienda TRU: pide que bajen las que necesites.",
    );
  });
});
