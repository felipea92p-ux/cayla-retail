import { describe, it, expect } from "vitest";
import { aplicarDescuento, descuentoUnitarioPorPorcentaje, motivoBloqueoCobro, porcentajeDeLinea } from "./vender-reglas";

// Un solo motivo alimenta tres cosas en el ticket de Vender: el `disabled` del botón
// principal, la línea que lo explica debajo, y el freno dentro de `cobrar()`. Si el
// orden de las reglas cambia sin querer, la pantalla pediría el método de pago con
// el ticket vacío — justo la decisión antes de tiempo que este cambio elimina.

const listo = { cajaAbierta: true, prendas: 2, momento: "cobrar", metodoPago: "efectivo", facturaSinRuc: false } as const;

describe("motivoBloqueoCobro — qué falta para cobrar, en orden", () => {
  it("con la caja cerrada pide abrirla, aunque todo lo demás esté completo", () => {
    expect(motivoBloqueoCobro({ ...listo, cajaAbierta: false })).toBe("Abre la caja para vender.");
  });

  it("con el ticket vacío pide una prenda", () => {
    expect(motivoBloqueoCobro({ ...listo, prendas: 0 })).toBe("Agrega una prenda para cobrar.");
  });

  it("mientras se arma la venta no exige método de pago: eso se decide al cobrar", () => {
    expect(motivoBloqueoCobro({ ...listo, momento: "armar", metodoPago: null })).toBeNull();
  });

  it("al cobrar sin método elegido dice exactamente qué falta", () => {
    expect(motivoBloqueoCobro({ ...listo, metodoPago: null })).toBe("Elige cómo pagó la clienta.");
  });

  it("al cobrar una factura sin RUC pide el RUC", () => {
    expect(motivoBloqueoCobro({ ...listo, facturaSinRuc: true })).toBe("La factura necesita el RUC de la empresa.");
  });

  it("con todo completo no bloquea", () => {
    expect(motivoBloqueoCobro(listo)).toBeNull();
  });

  it("el ticket vacío manda sobre el método: no se pide cómo pagó cuando no hay nada que pagar", () => {
    expect(motivoBloqueoCobro({ ...listo, prendas: 0, metodoPago: null })).toBe("Agrega una prenda para cobrar.");
  });
});

// ---- Descuento manual (2026-09-14): viaja como `descuentoUnitario` por línea, que es
// lo que `venta_items` ya guarda. Un % se vuelve monto por unidad, con 2 decimales.
const linea = (claveLinea: string, precioUnitario: number, descuentoUnitario = 0) => ({ claveLinea, precioUnitario, descuentoUnitario });

describe("descuentoUnitarioPorPorcentaje — un % se vuelve monto por unidad", () => {
  it("10 % de S/79.90 son S/7.99", () => {
    expect(descuentoUnitarioPorPorcentaje(79.9, 10)).toBe(7.99);
  });
  it("redondea a 2 decimales (15 % de S/69.90 = 10.485 → 10.49)", () => {
    expect(descuentoUnitarioPorPorcentaje(69.9, 15)).toBe(10.49);
  });
  it("100 % descuenta el precio completo, nunca más (candado de venta_items)", () => {
    expect(descuentoUnitarioPorPorcentaje(79.9, 100)).toBe(79.9);
    expect(descuentoUnitarioPorPorcentaje(79.9, 150)).toBe(79.9);
  });
  it("un % inválido (0, negativo, NaN) no descuenta nada", () => {
    expect(descuentoUnitarioPorPorcentaje(79.9, 0)).toBe(0);
    expect(descuentoUnitarioPorPorcentaje(79.9, -5)).toBe(0);
    expect(descuentoUnitarioPorPorcentaje(79.9, Number.NaN)).toBe(0);
  });
});

describe("aplicarDescuento — a todo el ticket o solo a las prendas elegidas", () => {
  const carrito = [linea("a", 79.9), linea("b", 179.9), linea("c", 50, 5)];

  it("sin claves descuenta todas las líneas", () => {
    expect(aplicarDescuento(carrito, 10, []).map((l) => l.descuentoUnitario)).toEqual([7.99, 17.99, 5]);
  });
  it("con claves descuenta solo esas y deja las demás como estaban", () => {
    expect(aplicarDescuento(carrito, 20, ["b"]).map((l) => l.descuentoUnitario)).toEqual([0, 35.98, 5]);
  });
  it("0 % quita el descuento de las líneas alcanzadas", () => {
    expect(aplicarDescuento(carrito, 0, ["c"]).map((l) => l.descuentoUnitario)).toEqual([0, 0, 0]);
  });
  it("no muta el carrito original", () => {
    aplicarDescuento(carrito, 50, []);
    expect(carrito[0].descuentoUnitario).toBe(0);
  });
});

describe("porcentajeDeLinea — el chip «−10 %» se lee desde el monto guardado", () => {
  it("recupera el % entero aunque el monto esté redondeado", () => {
    expect(porcentajeDeLinea(linea("a", 69.9, 10.49))).toBe(15);
  });
  it("sin descuento es 0", () => {
    expect(porcentajeDeLinea(linea("a", 69.9))).toBe(0);
  });
});

describe("motivoBloqueoCobro — el momento «descuento» tampoco exige método", () => {
  it("mientras se decide un descuento no se pide cómo pagó", () => {
    expect(motivoBloqueoCobro({ ...listo, momento: "descuento", metodoPago: null })).toBeNull();
  });
});
