import { afterEach, describe, expect, it } from "vitest";
import { dejarDescuentosParaApartar, descuentosDelTicket, tomarDescuentosParaApartar } from "./apartar-desde-ticket";

// ADR-0584: el descuento puesto a mano en el ticket de Vender llega a Apartar con las prendas.

const linea = (varianteId: string, descuentoUnitario = 0, razonDescuento = "", argumentoDescuento = "") => ({
  varianteId,
  descuentoUnitario,
  razonDescuento,
  razonDescuentoOtro: "",
  argumentoDescuento,
});

describe("descuentosDelTicket", () => {
  it("viaja el descuento a mano; el de campaña y las prendas sin descuento, no", () => {
    const r = descuentosDelTicket([linea("a", 8, "cerrar_venta"), linea("b", 16, "campana"), linea("c")]);
    expect(r).toEqual({ descuentos: { a: { unitario: 8, razon: "cerrar_venta", razonOtro: "", argumento: "" } }, sinLlevar: 0 });
  });

  it("dos líneas de la misma prenda con el mismo descuento viajan juntas", () => {
    expect(descuentosDelTicket([linea("a", 8, "cerrar_venta"), linea("a", 8, "cerrar_venta")]).descuentos.a?.unitario).toBe(8);
  });

  it("con dos descuentos distintos, o uno a medias, no se adivina: no viaja y se cuenta", () => {
    expect(descuentosDelTicket([linea("a", 8, "cerrar_venta"), linea("a", 12, "cerrar_venta")])).toEqual({ descuentos: {}, sinLlevar: 1 });
    expect(descuentosDelTicket([linea("a", 8, "cerrar_venta"), linea("a")])).toEqual({ descuentos: {}, sinLlevar: 1 });
  });
});

describe("el viaje por la pestaña", () => {
  const almacen = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => almacen.get(k) ?? null,
    setItem: (k: string, v: string) => void almacen.set(k, v),
    removeItem: (k: string) => void almacen.delete(k),
  };
  const conVentana = () => Object.assign(globalThis, { window: { sessionStorage } });
  afterEach(() => {
    almacen.clear();
    delete (globalThis as { window?: unknown }).window;
  });
  const lineas = [{ varianteId: "a", cantidad: 1 }];
  const d = { a: { unitario: 8, razon: "cerrar_venta", razonOtro: "", argumento: "" } };

  it("llega a las mismas prendas y se toma una sola vez", () => {
    conVentana();
    dejarDescuentosParaApartar(lineas, d);
    expect(tomarDescuentosParaApartar(lineas)).toEqual(d);
    expect(tomarDescuentosParaApartar(lineas)).toEqual({});
  });

  it("uno viejo no se cuela en otro apartado: si las prendas cambiaron, no se usa", () => {
    conVentana();
    dejarDescuentosParaApartar(lineas, d);
    expect(tomarDescuentosParaApartar([{ varianteId: "a", cantidad: 2 }])).toEqual({});
  });

  it("lo guardado se lee sin confiar: un monto que no es positivo no pasa", () => {
    conVentana();
    almacen.set("cayla-apartar-desde-ticket-descuentos", JSON.stringify({ prendas: "a:1", descuentos: { a: { unitario: -5, razon: "x" } } }));
    expect(tomarDescuentosParaApartar(lineas)).toEqual({});
  });

  it("sin almacenamiento (ventana privada, servidor) no se rompe nada", () => {
    expect(() => dejarDescuentosParaApartar(lineas, d)).not.toThrow();
    expect(tomarDescuentosParaApartar(lineas)).toEqual({});
  });
});
