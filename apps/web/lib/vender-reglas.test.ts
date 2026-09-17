import { describe, it, expect } from "vitest";
import {
  aplicarDescuento,
  aplicarDescuentoMonto,
  conCodigoDelCatalogo,
  descuentoUnitarioPorMonto,
  descuentoUnitarioPorPorcentaje,
  esperaAlCargar,
  motivoBloqueoCobro,
  necesitaArgumentoEscrito,
  porcentajeDeLinea,
  restanteDePagos,
  SIN_DETALLE_DESCUENTO,
  vueltoDe,
  type DetalleDescuento,
} from "./vender-reglas";

// Un solo motivo alimenta tres cosas en el ticket de Vender: el `disabled` del botón
// principal, la línea que lo explica debajo, y el freno dentro de `cobrar()`. Si el
// orden de las reglas cambia sin querer, la pantalla pediría el método de pago con
// el ticket vacío — justo la decisión antes de tiempo que este cambio elimina.

const listo = {
  cajaAbierta: true,
  prendas: 2,
  momento: "cobrar",
  total: 143.82,
  pagos: [{ metodo: "efectivo", monto: 143.82 }],
  facturaSinRuc: false,
} as const;

describe("motivoBloqueoCobro — qué falta para cobrar, en orden", () => {
  it("con la caja cerrada pide abrirla, aunque todo lo demás esté completo", () => {
    expect(motivoBloqueoCobro({ ...listo, cajaAbierta: false })).toBe("Abre la caja para vender.");
  });

  it("con el ticket vacío pide una prenda", () => {
    expect(motivoBloqueoCobro({ ...listo, prendas: 0 })).toBe("Agrega una prenda para cobrar.");
  });

  it("mientras se arma la venta no exige método de pago: eso se decide al cobrar", () => {
    expect(motivoBloqueoCobro({ ...listo, momento: "armar", pagos: [] })).toBeNull();
  });

  it("al cobrar sin ningún pago dice exactamente qué falta", () => {
    expect(motivoBloqueoCobro({ ...listo, pagos: [] })).toBe("Elige cómo pagó la clienta.");
  });

  it("con pagos que no llegan al total dice cuánto falta cubrir", () => {
    expect(motivoBloqueoCobro({ ...listo, pagos: [{ metodo: "yape", monto: 50 }] })).toBe("Falta cubrir S/93.82.");
  });

  it("con pagos que se pasan del total lo dice — la RPC los rechazaría por no cuadrar", () => {
    expect(motivoBloqueoCobro({ ...listo, pagos: [{ metodo: "yape", monto: 50 }, { metodo: "efectivo", monto: 100 }] })).toBe(
      "Los pagos superan el total."
    );
  });

  it("dos métodos que cubren justo el total no bloquean", () => {
    expect(motivoBloqueoCobro({ ...listo, pagos: [{ metodo: "yape", monto: 50 }, { metodo: "efectivo", monto: 93.82 }] })).toBeNull();
  });

  it("el recibido en efectivo no cuenta para cubrir: cubre el monto, no lo entregado", () => {
    expect(motivoBloqueoCobro({ ...listo, pagos: [{ metodo: "efectivo", monto: 100, recibido: 200 }] })).toBe("Falta cubrir S/43.82.");
  });

  it("cubrir manda sobre la factura sin RUC: primero la plata, después el papel", () => {
    expect(motivoBloqueoCobro({ ...listo, pagos: [{ metodo: "yape", monto: 50 }], facturaSinRuc: true })).toBe("Falta cubrir S/93.82.");
  });

  it("al cobrar una factura sin RUC pide el RUC", () => {
    expect(motivoBloqueoCobro({ ...listo, facturaSinRuc: true })).toBe("La factura necesita el RUC de la empresa.");
  });

  it("con todo completo no bloquea", () => {
    expect(motivoBloqueoCobro(listo)).toBeNull();
  });

  it("el ticket vacío manda sobre el método: no se pide cómo pagó cuando no hay nada que pagar", () => {
    expect(motivoBloqueoCobro({ ...listo, prendas: 0, pagos: [] })).toBe("Agrega una prenda para cobrar.");
  });
});

// ---- Descuento manual (2026-09-14): viaja como `descuentoUnitario` por línea, que es
// lo que `venta_items` ya guarda. Un % se vuelve monto por unidad, con 2 decimales.
const linea = (claveLinea: string, precioUnitario: number, descuentoUnitario = 0) => ({
  claveLinea,
  precioUnitario,
  descuentoUnitario,
  razonDescuento: "",
  razonDescuentoOtro: "",
  argumentoDescuento: "",
});

const cumpleanos: DetalleDescuento = { razon: "cumpleanos_clienta_top", razonOtro: "", argumento: "" };

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

describe("descuentoUnitarioPorMonto — un S/ por unidad, la otra entrada del apartado", () => {
  it("un monto menor al precio se aplica tal cual, a 2 decimales", () => {
    expect(descuentoUnitarioPorMonto(79.9, 15)).toBe(15);
    expect(descuentoUnitarioPorMonto(79.9, 15.005)).toBe(15.01);
  });
  it("nunca supera el precio — el candado de venta_items lo rechazaría igual", () => {
    expect(descuentoUnitarioPorMonto(50, 80)).toBe(50);
  });
  it("un monto inválido (0, negativo, NaN) no descuenta nada", () => {
    expect(descuentoUnitarioPorMonto(79.9, 0)).toBe(0);
    expect(descuentoUnitarioPorMonto(79.9, -5)).toBe(0);
    expect(descuentoUnitarioPorMonto(79.9, Number.NaN)).toBe(0);
  });
});

describe("aplicarDescuento — a todo el ticket o solo a las prendas elegidas", () => {
  const carrito = [linea("a", 79.9), linea("b", 179.9), linea("c", 50, 5)];

  it("sin claves descuenta todas las líneas", () => {
    expect(aplicarDescuento(carrito, 10, [], cumpleanos).map((l) => l.descuentoUnitario)).toEqual([7.99, 17.99, 5]);
  });
  it("con claves descuenta solo esas y deja las demás como estaban", () => {
    expect(aplicarDescuento(carrito, 20, ["b"], cumpleanos).map((l) => l.descuentoUnitario)).toEqual([0, 35.98, 5]);
  });
  it("0 % quita el descuento de las líneas alcanzadas", () => {
    expect(aplicarDescuento(carrito, 0, ["c"], SIN_DETALLE_DESCUENTO).map((l) => l.descuentoUnitario)).toEqual([0, 0, 0]);
  });
  it("no muta el carrito original", () => {
    aplicarDescuento(carrito, 50, [], cumpleanos);
    expect(carrito[0].descuentoUnitario).toBe(0);
  });

  it("guarda el motivo en cada línea alcanzada, y deja las demás sin tocar", () => {
    const resultado = aplicarDescuento(carrito, 10, ["a"], cumpleanos);
    expect(resultado[0].razonDescuento).toBe("cumpleanos_clienta_top");
    expect(resultado[1].razonDescuento).toBe("");
  });
  it('con motivo "otro" guarda también el detalle; con cualquier otro motivo lo limpia', () => {
    const otro: DetalleDescuento = { razon: "otro", razonOtro: "Pedido especial de la clienta", argumento: "" };
    const resultado = aplicarDescuento(carrito, 10, ["a"], otro);
    expect(resultado[0].razonDescuentoOtro).toBe("Pedido especial de la clienta");

    const conMotivoDistinto = aplicarDescuento(resultado, 10, ["a"], cumpleanos);
    expect(conMotivoDistinto[0].razonDescuentoOtro).toBe("");
  });
  it("quitar el descuento (SIN_DETALLE_DESCUENTO) también limpia motivo y argumento", () => {
    const conDescuento = aplicarDescuento(carrito, 25, ["a"], { razon: "cerrar_venta", razonOtro: "", argumento: "Cierre de caja" });
    const sinDescuento = aplicarDescuento(conDescuento, 0, ["a"], SIN_DETALLE_DESCUENTO);
    expect(sinDescuento[0]).toMatchObject({ descuentoUnitario: 0, razonDescuento: "", argumentoDescuento: "" });
  });
});

describe("aplicarDescuentoMonto — lo mismo que aplicarDescuento, pero en S/", () => {
  const carrito = [linea("a", 79.9), linea("b", 50)];

  it("aplica el mismo monto por unidad a las líneas alcanzadas, recortado al precio", () => {
    expect(aplicarDescuentoMonto(carrito, 60, [], cumpleanos).map((l) => l.descuentoUnitario)).toEqual([60, 50]);
  });
  it("guarda el motivo igual que la versión por %", () => {
    expect(aplicarDescuentoMonto(carrito, 10, ["a"], cumpleanos)[0].razonDescuento).toBe("cumpleanos_clienta_top");
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
    expect(motivoBloqueoCobro({ ...listo, momento: "descuento", pagos: [] })).toBeNull();
  });
  it("mirando los tickets en espera tampoco", () => {
    expect(motivoBloqueoCobro({ ...listo, momento: "espera", pagos: [] })).toBeNull();
  });
});

// ---- Pago mixto y vuelto (2026-09-14): la base ya recibe `p_pagos` como lista y exige
// que sume igual que los ítems al centavo. El `recibido` es solo de pantalla.

describe("restanteDePagos — lo que falta cubrir, a 2 decimales", () => {
  it("sin pagos falta todo", () => {
    expect(restanteDePagos(143.82, [])).toBe(143.82);
  });
  it("resta lo pagado, sin arrastrar decimales de coma flotante", () => {
    expect(restanteDePagos(143.82, [{ metodo: "yape", monto: 50 }, { metodo: "efectivo", monto: 93.82 }])).toBe(0);
    expect(restanteDePagos(0.3, [{ metodo: "yape", monto: 0.1 }, { metodo: "plin", monto: 0.1 }])).toBe(0.1);
  });
  it("es negativo cuando los pagos se pasan", () => {
    expect(restanteDePagos(100, [{ metodo: "tarjeta", monto: 120 }])).toBe(-20);
  });
});

describe("vueltoDe — recibido menos monto, solo en efectivo", () => {
  it("S/100 recibidos por S/93.82 devuelven S/6.18", () => {
    expect(vueltoDe({ metodo: "efectivo", monto: 93.82, recibido: 100 })).toBe(6.18);
  });
  it("sin recibido no hay vuelto que mostrar", () => {
    expect(vueltoDe({ metodo: "efectivo", monto: 93.82 })).toBe(0);
  });
  it("si lo recibido no llega al monto, el vuelto es 0 — nunca negativo", () => {
    expect(vueltoDe({ metodo: "efectivo", monto: 93.82, recibido: 50 })).toBe(0);
  });
  it("Yape, Plin, tarjeta y transferencia no dan vuelto aunque traigan recibido", () => {
    expect(vueltoDe({ metodo: "yape", monto: 50, recibido: 100 })).toBe(0);
  });
});


// La espera de la sede se vacía al cerrar caja (ADR-0049), y eso incluye abrir Vender al
// día siguiente con la caja todavía cerrada: lo guardado ayer no vuelve a la pantalla.
// Antes el efecto de hidratación cargaba la espera sin mirar la caja y el de borrado
// solo tocaba la llave — el chip «En espera · N» mostraba tickets de ayer.
describe("esperaAlCargar — con la caja cerrada no vuelve ningún ticket de ayer", () => {
  const guardados = [{ id: "a" }, { id: "b" }];
  it("con la caja abierta carga lo guardado", () => {
    expect(esperaAlCargar(false, guardados)).toBe(guardados);
  });
  it("con la caja cerrada la espera arranca vacía aunque haya algo guardado", () => {
    expect(esperaAlCargar(true, guardados)).toEqual([]);
  });
});

// Un ticket en espera guardado en el navegador antes del 2026-09-16 no tiene `codigo`
// (el carrito solo guardaba `sku`), y una prenda del censo tampoco tiene sku: al
// retomarlo, la línea del ticket salía sin nada que diga qué talla/color era.
describe("conCodigoDelCatalogo — un ticket en espera viejo recupera el código al retomarlo", () => {
  const catalogo = [
    { varianteId: "v-blusa-m", codigo: "BLU-0003-NEG-M" },
    { varianteId: "v-vestido-s", codigo: "VES-0002-NEG-S" },
  ];
  it("completa desde el catálogo la línea guardada sin el campo", () => {
    const guardado = [{ varianteId: "v-blusa-m", sku: "", cantidad: 1 }];
    expect(conCodigoDelCatalogo(guardado, catalogo)).toEqual([{ varianteId: "v-blusa-m", sku: "", cantidad: 1, codigo: "BLU-0003-NEG-M" }]);
  });
  it("respeta el código que la línea ya traía", () => {
    expect(conCodigoDelCatalogo([{ varianteId: "v-vestido-s", codigo: "VES-0002-NEG-S" }], [])[0].codigo).toBe("VES-0002-NEG-S");
  });
  it("sin la prenda en el catálogo queda en null, no rompe el ticket", () => {
    expect(conCodigoDelCatalogo([{ varianteId: "v-cargo-especial" }], catalogo)[0].codigo).toBeNull();
  });
});

// R-45: el escalonado (20-35 % con argumento escrito, más de 35 % nadie) es solo del
// Líder — la Colaboradora sigue con su propio tope, el código. El candado real vive en
// `registrar_venta`; esto solo decide cuándo el apartado MUESTRA el campo.
describe("necesitaArgumentoEscrito — la banda 20-35 % es solo del Líder", () => {
  it("a un Líder por debajo de 20 % no le pide nada", () => {
    expect(necesitaArgumentoEscrito(true, 20)).toBe(false);
    expect(necesitaArgumentoEscrito(true, 15)).toBe(false);
  });
  it("a un Líder pasado el 20 % le pide argumento", () => {
    expect(necesitaArgumentoEscrito(true, 21)).toBe(true);
    expect(necesitaArgumentoEscrito(true, 35)).toBe(true);
  });
  it("a una Colaboradora nunca — su tope es el código, no el escalonado", () => {
    expect(necesitaArgumentoEscrito(false, 30)).toBe(false);
    expect(necesitaArgumentoEscrito(false, 90)).toBe(false);
  });
});
