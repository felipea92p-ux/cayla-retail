import { describe, expect, it } from "vitest";
import type { LineaCompra, TiendaEnLinea } from "@/lib/compras-reglas";
import {
  destinosParaRpc,
  estadoDeMiTienda,
  estadoDelReparto,
  lineaEnMiTienda,
  nombresDeDestinos,
  otrasTiendasDeJson,
  pendienteDeMiTienda,
  repartirEnPartesIguales,
  textoDeLaParte,
  textoDelReparto,
  textoOtrasTiendas,
  textoTeToca,
  valorPorRecibirDeMiTienda,
} from "./reparto-reglas";

describe("reparto de una línea (Registrar)", () => {
  it("12 + 12 de 24 cuadra y lo dice con las dos cifras", () => {
    expect(estadoDelReparto(24, { trujillo: 12, taller: 12 })).toEqual({ asignado: 24, faltan: 0, sobran: 0, cuadra: true });
    expect(textoDelReparto(24, { trujillo: 12, taller: 12 })).toEqual({ tono: "ok", texto: "Repartidas 24 de 24" });
  });

  it("dice LO QUE FALTA, no solo que hay un error", () => {
    expect(textoDelReparto(24, { trujillo: 12, taller: 8 })).toEqual({ tono: "falta", texto: "Faltan 4 por repartir" });
    expect(textoDelReparto(24, {})).toEqual({ tono: "falta", texto: "Faltan 24 por repartir" });
  });

  it("dice cuánto se pasó", () => {
    expect(textoDelReparto(24, { trujillo: 14, taller: 12 })).toEqual({ tono: "sobra", texto: "Sobran 2" });
  });

  it("lo que se teclea mal (vacío, decimales, negativos) no rompe la cuenta", () => {
    expect(estadoDelReparto(10, { a: Number.NaN, b: -3, c: 4.9, d: "6" as unknown as number })).toEqual({ asignado: 10, faltan: 0, sobran: 0, cuadra: true });
  });

  it("una línea de 0 unidades nunca «cuadra»", () => {
    expect(estadoDelReparto(0, {}).cuadra).toBe(false);
  });

  it("partes iguales: el resto va de a una unidad a las primeras y la suma siempre cuadra", () => {
    expect(repartirEnPartesIguales(24, ["a", "b", "c"])).toEqual({ a: 8, b: 8, c: 8 });
    expect(repartirEnPartesIguales(25, ["a", "b", "c"])).toEqual({ a: 9, b: 8, c: 8 });
    expect(repartirEnPartesIguales(1, ["a", "b", "c"])).toEqual({ a: 1, b: 0, c: 0 });
    for (const [cant, n] of [[7, 2], [100, 3], [5, 5], [3, 7]] as const) {
      const ids = Array.from({ length: n }, (_, i) => `t${i}`);
      expect(estadoDelReparto(cant, repartirEnPartesIguales(cant, ids)).cuadra).toBe(true);
    }
  });

  it("partes iguales sin tiendas o sin unidades no inventa nada", () => {
    expect(repartirEnPartesIguales(24, [])).toEqual({});
    expect(repartirEnPartesIguales(0, ["a"])).toEqual({});
    expect(repartirEnPartesIguales(10, ["a", "a"])).toEqual({ a: 10 });
  });

  it("a la RPC solo van las tiendas con unidades, en enteros", () => {
    expect(destinosParaRpc({ trujillo: 12, taller: 0, lima: 12.7 })).toEqual([
      { ubicacion_id: "trujillo", cantidad: 12 },
      { ubicacion_id: "lima", cantidad: 12 },
    ]);
  });
});

describe("lo que ve una tienda (Recibir)", () => {
  it("«Te toca 12 · Recibidas aquí 4 · Faltan 8»", () => {
    expect(textoTeToca({ asignado: 12, recibido: 4, cerrado: 0 })).toBe("Te toca 12 · Recibidas aquí 4 · Faltan 8");
  });

  it("si hubo faltante cerrado lo dice al final y no cuenta como pendiente", () => {
    expect(textoTeToca({ asignado: 12, recibido: 4, cerrado: 2 })).toBe("Te toca 12 · Recibidas aquí 4 · Faltan 6 · Cerradas 2");
    expect(pendienteDeMiTienda({ asignado: 12, recibido: 4, cerrado: 2 })).toBe(6);
  });

  it("nunca queda un pendiente negativo", () => {
    expect(pendienteDeMiTienda({ asignado: 5, recibido: 5, cerrado: 3 })).toBe(0);
  });

  it("el estado se lee desde la tienda, no desde el comprobante entero", () => {
    expect(estadoDeMiTienda({ asignado: 12, recibido: 0, cerrado: 0 })).toBe("sin_recibir");
    expect(estadoDeMiTienda({ asignado: 12, recibido: 4, cerrado: 0 })).toBe("parcial");
    expect(estadoDeMiTienda({ asignado: 12, recibido: 8, cerrado: 4 })).toBe("recibida");
    expect(estadoDeMiTienda({ asignado: 12, recibido: 12, cerrado: 0 })).toBe("recibida");
  });

  it("para el líder: dónde más falta, y si ya no falta en ninguna", () => {
    const otras: TiendaEnLinea[] = [
      { ubicacionId: "a", nombre: "Taller", asignado: 12, recibido: 0, cerrado: 0, pendiente: 12 },
      { ubicacionId: "b", nombre: "Tienda Lima", asignado: 4, recibido: 4, cerrado: 0, pendiente: 0 },
    ];
    expect(textoOtrasTiendas(otras)).toBe("También falta en Taller: 12");
    expect(textoOtrasTiendas(otras.map((t) => ({ ...t, pendiente: 0 })))).toBe("Las demás tiendas ya recibieron lo suyo");
    expect(textoOtrasTiendas([])).toBeNull();
    expect(textoOtrasTiendas(undefined)).toBeNull();
  });

  it("los destinos con nombre; un id sin nombre no aparece", () => {
    expect(nombresDeDestinos(["a", "b", "z"], { a: "Tienda Trujillo", b: "Taller" })).toBe("Tienda Trujillo · Taller");
  });
});

describe("la línea vista desde una tienda", () => {
  const linea: LineaCompra = {
    id: "l1", compraId: "c1", productoId: "p1", referencia: "Blusa Lino", varianteId: "v1", sku: "BL-M", talla: "M", color: "Arena",
    descripcion: null, cantidad: 24, costoUnitario: 50, subtotal: 1200, recibido: 4, cerrado: 0, pendiente: 20,
  };

  it("cantidad, recibido y pendiente pasan a ser los de la tienda; lo facturado queda aparte", () => {
    const v = lineaEnMiTienda(linea, { asignado: 12, recibido: 4, cerrado: 0 });
    expect(v).toMatchObject({ cantidad: 12, recibido: 4, cerrado: 0, pendiente: 8, cantidadFacturada: 24, asignadoAqui: 12, pendienteAqui: 8 });
    expect(v.subtotal).toBe(600);
  });

  it("sin números de tienda (base vieja) la línea queda tal cual", () => {
    expect(lineaEnMiTienda(linea, null)).toBe(linea);
  });

  it("sin costo (quien no es líder) el subtotal sigue en 0", () => {
    expect(lineaEnMiTienda({ ...linea, costoUnitario: 0, subtotal: 0 }, { asignado: 12, recibido: 0, cerrado: 0 }).subtotal).toBe(0);
  });
});

describe("otras_tiendas (json de la RPC)", () => {
  it("lo convierte y descarta lo que no es una tienda", () => {
    expect(
      otrasTiendasDeJson([
        { ubicacion_id: "a", nombre: "Taller", asignado: 12, recibido: 2, cerrado: 0, pendiente: 10 },
        { nombre: "sin id" },
        null,
      ])
    ).toEqual([{ ubicacionId: "a", nombre: "Taller", asignado: 12, recibido: 2, cerrado: 0, pendiente: 10 }]);
  });
  it("un colaborador no lo recibe (null) y eso queda como «sin dato»", () => {
    expect(otrasTiendasDeJson(null)).toBeUndefined();
    expect(otrasTiendasDeJson("x")).toBeUndefined();
  });
});

describe("«S/ por llegar» de una tienda (solo líder)", () => {
  it("lo que le falta a ELLA, a su costo y con el IGV del comprobante", () => {
    // 8 por llegar × S/ 50 × 1.18 = S/ 472
    expect(valorPorRecibirDeMiTienda([{ id: "c1", subtotal: 1200, total: 1416 }], [{ compraId: "c1", pendiente: 8, costoUnitario: 50 }])).toBe(472);
  });
  it("suma varios comprobantes y nunca resta (un pendiente negativo cuenta 0)", () => {
    const compras = [
      { id: "c1", subtotal: 100, total: 118 },
      { id: "c2", subtotal: 0, total: 0 },
    ];
    const lineas = [
      { compraId: "c1", pendiente: 1, costoUnitario: 100 },
      { compraId: "c2", pendiente: 2, costoUnitario: 10 },
      { compraId: "c2", pendiente: -5, costoUnitario: 10 },
    ];
    expect(valorPorRecibirDeMiTienda(compras, lineas)).toBe(138);
  });
});

describe("la parte de una línea repartida", () => {
  it("dice «Te toca 12 de 24 del comprobante»; al líder, además, dónde más falta", () => {
    expect(textoDeLaParte({ asignadoAqui: 12, cantidadFacturada: 24 })).toBe("Te toca 12 de 24 del comprobante");
    expect(
      textoDeLaParte({ asignadoAqui: 12, cantidadFacturada: 24, otrasTiendas: [{ ubicacionId: "a", nombre: "Taller", asignado: 12, recibido: 0, cerrado: 0, pendiente: 12 }] })
    ).toBe("Te toca 12 de 24 del comprobante · También falta en Taller: 12");
  });
  it("una línea que es toda de esta tienda no muestra nada extra (el flujo de siempre no cambia)", () => {
    expect(textoDeLaParte({ asignadoAqui: 24, cantidadFacturada: 24 })).toBeNull();
  });
  it("sin números de tienda (base vieja) tampoco", () => {
    expect(textoDeLaParte({})).toBeNull();
  });
});
