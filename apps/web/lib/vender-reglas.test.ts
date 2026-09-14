import { describe, it, expect } from "vitest";
import { motivoBloqueoCobro } from "./vender-reglas";

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
