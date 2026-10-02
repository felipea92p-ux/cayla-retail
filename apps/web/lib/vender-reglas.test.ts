import { describe, it, expect } from "vitest";
import {
  aplicarDescuento,
  atendioCorto,
  conCampanas,
  conCodigoDelCatalogo,
  descuentoDeCampana,
  descuentoResultante,
  descuentoUnitarioPorPorcentaje,
  desgloseIgv,
  metodoDeAtajo,
  esDescuentoDeCampana,
  esperaAlCargar,
  hayDescuentoManual,
  motivoBloqueoCobro,
  necesitaArgumentoEscrito,
  pasoDelDescuento,
  pagosParaRpc,
  pagosTrasEditarMonto,
  pasoDelCobro,
  porcentajeDeLinea,
  quitarPagoTraspasando,
  restanteDePagos,
  SIN_DETALLE_DESCUENTO,
  sinStockPorApartado,
  textoSinStock,
  totalDeLineas,
  vueltoDe,
  type CampanaLinea,
  type DetalleDescuento,
  type PagoAplicado,
  type Vendedora,
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
  it("una proforma vencida no se cobra sin confirmar que va al precio de entonces (y solo al cobrar)", () => {
    expect(motivoBloqueoCobro({ ...listo, proformaVencidaSinConfirmar: true })).toBe("Confirma que cobras la proforma vencida al precio de entonces.");
    expect(motivoBloqueoCobro({ ...listo, momento: "armar", proformaVencidaSinConfirmar: true })).toBeNull();
  });

  it("con la caja cerrada pide abrirla, aunque todo lo demás esté completo", () => {
    expect(motivoBloqueoCobro({ ...listo, cajaAbierta: false })).toBe("Abre la caja para vender.");
  });

  it("un carné o un pasaporte mal escrito frena el cobro, pero solo al cobrar y después del pago (ADR-0288 D-3)", () => {
    const problema = "El pasaporte tiene de 6 a 12 letras o números, sin guiones.";
    expect(motivoBloqueoCobro({ ...listo, problemaDocumento: problema })).toBe(problema);
    expect(motivoBloqueoCobro({ ...listo, momento: "armar", problemaDocumento: problema })).toBeNull();
    expect(motivoBloqueoCobro({ ...listo, pagos: [], problemaDocumento: problema })).toBe("Elige cómo pagó la clienta.");
    expect(motivoBloqueoCobro({ ...listo, problemaDocumento: null })).toBeNull();
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

describe("metodoDeAtajo — F1 a F5 son los cinco medios, en el orden del selector", () => {
  const tecla = (key: string, extra: object = {}) => ({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...extra });

  it.each([
    ["F1", "efectivo"],
    ["F2", "tarjeta"],
    ["F3", "yape"],
    ["F4", "plin"],
    ["F5", "transferencia"],
  ])("%s → %s", (key, metodo) => {
    expect(metodoDeAtajo(tecla(key))).toBe(metodo);
  });

  it("otras teclas no son atajo (F6, F12, letras, números)", () => {
    for (const key of ["F6", "F12", "F0", "a", "1", "Enter", "Escape"]) expect(metodoDeAtajo(tecla(key))).toBeNull();
  });

  it("con modificador no se toca: Ctrl+F5 (recarga forzada), Alt+F4, Shift+F5, Meta", () => {
    for (const extra of [{ ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }]) {
      expect(metodoDeAtajo(tecla("F5", extra))).toBeNull();
    }
  });

  it("mantener la tecla (repeat) no repite el atajo", () => {
    expect(metodoDeAtajo(tecla("F2", { repeat: true }))).toBeNull();
  });
});

describe("desgloseIgv — subtotal + IGV = total, igual que el comprobante", () => {
  it("los totales de la pantalla y de la captura", () => {
    expect(desgloseIgv(239.81, 0.18)).toEqual({ subtotal: 203.23, igv: 36.58 });
    expect(desgloseIgv(374.7, 0.18)).toEqual({ subtotal: 317.54, igv: 57.16 });
    expect(desgloseIgv(118, 0.18)).toEqual({ subtotal: 100, igv: 18 });
  });

  it("ticket vacío: todo en cero", () => {
    expect(desgloseIgv(0, 0.18)).toEqual({ subtotal: 0, igv: 0 });
  });

  it("nunca descuadra: para cada total de S/0.01 a S/500.00, subtotal + IGV = total al centavo", () => {
    for (let c = 1; c <= 50_000; c++) {
      const total = c / 100;
      const { subtotal, igv } = desgloseIgv(total, 0.18);
      expect(Math.round((subtotal + igv) * 100)).toBe(c);
    }
  });
});

describe("quitarPagoTraspasando — quitar un medio no pierde lo que cubría", () => {
  it("el medio que llevaba el total pasa su monto al siguiente (el caso de la captura)", () => {
    const pagos = [
      { metodo: "efectivo", monto: 374.7 },
      { metodo: "tarjeta", monto: 0 },
      { metodo: "yape", monto: 0 },
    ] as const;
    const r = quitarPagoTraspasando(pagos, 0);
    expect(r).toEqual([
      { metodo: "tarjeta", monto: 374.7 },
      { metodo: "yape", monto: 0 },
    ]);
    expect(restanteDePagos(374.7, r)).toBe(0);
  });

  it("si era el último, el monto va al último que queda", () => {
    const r = quitarPagoTraspasando([{ metodo: "efectivo", monto: 100 }, { metodo: "yape", monto: 50 }], 1);
    expect(r).toEqual([{ metodo: "efectivo", monto: 150 }]);
  });

  it("suma a 2 decimales sin arrastrar error de punto flotante", () => {
    const r = quitarPagoTraspasando([{ metodo: "efectivo", monto: 0.1 }, { metodo: "yape", monto: 0.2 }], 0);
    expect(r).toEqual([{ metodo: "yape", monto: 0.3 }]);
  });

  it("sin otro medio, o con el quitado en 0, solo se quita", () => {
    expect(quitarPagoTraspasando([{ metodo: "efectivo", monto: 80 }], 0)).toEqual([]);
    const r = quitarPagoTraspasando([{ metodo: "efectivo", monto: 80 }, { metodo: "yape", monto: 0 }], 1);
    expect(r).toEqual([{ metodo: "efectivo", monto: 80 }]);
  });

  it("un índice que no existe no toca nada", () => {
    const pagos = [{ metodo: "efectivo", monto: 80 }] as const;
    expect(quitarPagoTraspasando(pagos, 5)).toEqual(pagos);
  });

  it("conserva lo recibido del que absorbe (el vuelto se recalcula solo)", () => {
    const r = quitarPagoTraspasando([{ metodo: "yape", monto: 40 }, { metodo: "efectivo", monto: 60, recibido: 100 }], 0);
    expect(r).toEqual([{ metodo: "efectivo", monto: 100, recibido: 100 }]);
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

// Felipe, 2026-09-25: todo descuento manual que pase el 15 % pide argumento escrito, sea
// quien sea (antes: solo un Líder pasado el 20 %). El candado real vive en `registrar_venta`;
// esto solo decide cuándo el apartado MUESTRA el campo — con la misma cuenta al céntimo.
describe("necesitaArgumentoEscrito — pasado el 15 % se escribe el porqué", () => {
  it("hasta el 15 % no pide nada", () => {
    expect(necesitaArgumentoEscrito(100, 10)).toBe(false);
    expect(necesitaArgumentoEscrito(100, 15)).toBe(false);
    // 15 % de 89.90 = 13.485 → el redondeo al céntimo no lo convierte en «pasa el 15 %».
    expect(necesitaArgumentoEscrito(89.9, 13.49)).toBe(false);
  });
  it("pasado el 15 % lo pide", () => {
    expect(necesitaArgumentoEscrito(100, 16)).toBe(true);
    expect(necesitaArgumentoEscrito(100, 15.02)).toBe(true);
    expect(necesitaArgumentoEscrito(89.9, 18.88)).toBe(true); // 21 %
  });
  it("sin precio o sin descuento no pide nada", () => {
    expect(necesitaArgumentoEscrito(0, 5)).toBe(false);
    expect(necesitaArgumentoEscrito(100, 0)).toBe(false);
  });
});

describe("pasoDelDescuento — el primer campo que falta, de arriba abajo", () => {
  const completo = {
    valorValido: true,
    razon: "cerrar_venta",
    razonOtro: "",
    pideArgumento: false,
    argumento: "",
    pideCodigo: false,
    codigo: "",
    prendas: 2,
  };
  it("sin % falta el valor, aunque lo demás esté puesto", () => {
    expect(pasoDelDescuento({ ...completo, valorValido: false })).toBe("valor");
  });
  it("después el motivo, y si es «Otro», su detalle", () => {
    expect(pasoDelDescuento({ ...completo, razon: "" })).toBe("motivo");
    expect(pasoDelDescuento({ ...completo, razon: "otro", razonOtro: "  " })).toBe("motivoOtro");
    expect(pasoDelDescuento({ ...completo, razon: "otro", razonOtro: "clienta frecuente" })).toBe("listo");
  });
  it("el argumento solo cuando se pide", () => {
    expect(pasoDelDescuento({ ...completo, pideArgumento: true })).toBe("argumento");
    expect(pasoDelDescuento({ ...completo, pideArgumento: true, argumento: "Se lleva 4 prendas" })).toBe("listo");
  });
  it("el código solo para quien lo necesita, y luego las prendas", () => {
    expect(pasoDelDescuento({ ...completo, pideCodigo: true })).toBe("codigo");
    expect(pasoDelDescuento({ ...completo, prendas: 0 })).toBe("prendas");
  });
  it("con todo puesto, listo para aplicar", () => {
    expect(pasoDelDescuento(completo)).toBe("listo");
  });
});

// ---- Descuento de campaña (ADR-0107, paso 3) ----------------------------------------
// La regla de negocio: UN solo descuento por prenda, el MAYOR. La campaña se aplica
// sola; un descuento manual solo la reemplaza si la supera. Estas pruebas replican lo
// que `registrar_venta` (20260918170000) acepta y rechaza — si divergen, la caja
// mandaría algo que la base rechaza en el mostrador.
//
// Desde ADR-0302 (2026-10-01) el descuento de campaña es EXACTO: el % sobre el precio, al céntimo. Con S/ 100 y 20 % se
// cobra S/ 80.00, así que el descuento de campaña de estas pruebas es 20.00 (y 40.00 con 40 %).

describe("descuentoDeCampana — exacto, al céntimo (ADR-0302)", () => {
  // [precio, %, descuento esperado, precio que paga la clienta]
  it.each([
    [39, 20, 7.8, 31.2], // la etiqueta de Luna: el papel dice −20 % y se cobra exactamente eso (con el .90 eran 30.90)
    [89.9, 20, 17.98, 71.92],
    [79.9, 30, 23.97, 55.93],
    [95.8, 25, 23.95, 71.85],
    [159.8, 50, 79.9, 79.9],
    [100, 20, 20, 80], // un precio redondo queda redondo
    [22, 10, 2.2, 19.8],
    [89.9, 12.5, 11.24, 78.66], // % con decimales: 11.2375 → 11.24
    [89.9, 33.33, 29.96, 59.94], // 29.96367 → 29.96
    [199.9, 30, 59.97, 139.93],
    [69.9, 15, 10.49, 59.41], // 10.485: el medio céntimo va hacia arriba, como `round(x, 2)` de Postgres
    [19.9, 25, 4.98, 14.92], // 4.975: con coma flotante daba 4.97
  ])("S/ %d con %d %% → descuento %d (paga S/ %d)", (precio, pct, descuento, paga) => {
    expect(descuentoDeCampana(precio, pct)).toBe(descuento);
    expect(Math.round((precio - descuentoDeCampana(precio, pct)) * 100) / 100).toBe(paga);
  });

  it("sin descuento, 0 %, negativo o inválido: no descuenta nada", () => {
    expect(descuentoDeCampana(89.9, 0)).toBe(0);
    expect(descuentoDeCampana(89.9, -5)).toBe(0);
    expect(descuentoDeCampana(89.9, Number.NaN)).toBe(0);
  });

  it("100 % regala la prenda: nunca un precio negativo", () => {
    expect(descuentoDeCampana(89.9, 100)).toBe(89.9);
  });

  it("los precios chicos también son exactos (ya no hay un caso aparte bajo S/ 0.90)", () => {
    expect(descuentoDeCampana(1, 50)).toBe(0.5);
    expect(descuentoDeCampana(1.5, 50)).toBe(0.75);
  });

  it("una campaña descuenta lo mismo que un % manual: una sola cuenta en la caja", () => {
    for (const [precio, pct] of [[39, 20], [19.9, 25], [89.9, 33.33], [0.29, 50]]) {
      expect(descuentoDeCampana(precio, pct)).toBe(descuentoUnitarioPorPorcentaje(precio, pct));
    }
  });

  // La propiedad, comprobada contra la cuenta exacta hecha aparte con BigInt (no con la misma fórmula que se prueba):
  // el descuento es el céntimo más cercano a precio × % / 100, y en el empate de medio céntimo, el de arriba. Nunca da
  // más de medio céntimo de más ni de menos, y nunca pasa del precio.
  it("siempre el céntimo más cercano a la cuenta exacta, en miles de combinaciones", () => {
    const MILLON = BigInt(1_000_000);
    const MEDIO = BigInt(500_000);
    const CERO = BigInt(0);
    // Se juntan los casos que fallan y se comprueba una vez al final: 300 000 `expect` sueltos pasaban de los 5 s de
    // límite cuando la suite corre en paralelo.
    const malos: string[] = [];
    for (let c = 1; c <= 60000; c += 7) {
      for (const pct of [0.5, 1, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 33.33, 40, 45, 50, 55, 66.67, 70, 99.99]) {
        const descuentoC = BigInt(Math.round(descuentoDeCampana(c / 100, pct) * 100));
        // exacto × 1 000 000 = céntimos × (% en diezmilésimas)
        const exactoPorMillon = BigInt(c) * BigInt(Math.round(pct * 10_000));
        const diferencia = descuentoC * MILLON - exactoPorMillon; // en millonésimas de céntimo
        const cercano = diferencia > -MEDIO && diferencia <= MEDIO;
        const dentroDelPrecio = descuentoC >= CERO && descuentoC <= BigInt(c);
        if (!cercano || !dentroDelPrecio) malos.push(`S/ ${c / 100} con ${pct} % → ${descuentoDeCampana(c / 100, pct)}`);
      }
    }
    expect(malos).toEqual([]);
  });
});

describe("totalDeLineas — el total del ticket, en céntimos exactos", () => {
  it("99.90 − 14.99 es 84.91, no 84.91000000000001 (la caja lo mostraba y Apartar no aceptaba 84.91 en efectivo)", () => {
    expect(totalDeLineas([{ cantidad: 1, precioUnitario: 99.9, descuentoUnitario: 14.99 }])).toBe(84.91);
  });
  it("suma cantidades y líneas sin arrastrar error: 2 × 71.91 + 3 × 84.91 = 398.55", () => {
    expect(
      totalDeLineas([
        { cantidad: 2, precioUnitario: 79.9, descuentoUnitario: 7.99 },
        { cantidad: 3, precioUnitario: 99.9, descuentoUnitario: 14.99 },
      ]),
    ).toBe(398.55);
  });
  it("sin líneas, cero", () => {
    expect(totalDeLineas([])).toBe(0);
  });
  it("con cualquier campaña y cantidad, el total es un número exacto de céntimos", () => {
    for (let c = 1990; c <= 29990; c += 500) {
      for (const pct of [5, 10, 15, 20, 25, 33.33]) {
        for (const cantidad of [1, 2, 3, 7]) {
          const precio = c / 100;
          const total = totalDeLineas([{ cantidad, precioUnitario: precio, descuentoUnitario: descuentoDeCampana(precio, pct) }]);
          expect(String(total)).toMatch(/^\d+(\.\d{1,2})?$/);
        }
      }
    }
  });
});

const blackFriday: CampanaLinea = { etiquetaId: "e-bf", nombre: "Black Friday", pct: 20 };
const liquidacion: CampanaLinea = { etiquetaId: "e-liq", nombre: "Liquidación", pct: 40 };

const lineaCampana = (clave: string, precio: number, campana: CampanaLinea | null = null) => ({
  ...linea(clave, precio),
  varianteId: clave,
  campana,
});

describe("descuentoResultante — un solo descuento, el mayor", () => {
  const conBF = lineaCampana("a", 100, blackFriday);

  it("sin campaña, lo pedido tal cual", () => {
    expect(descuentoResultante(lineaCampana("a", 100), 15)).toEqual({ monto: 15, prevaleceCampana: false });
  });
  it("un manual MENOR que la campaña no la baja: prevalece la campaña", () => {
    expect(descuentoResultante(conBF, 15)).toEqual({ monto: 20, prevaleceCampana: true });
  });
  it("un manual IGUAL a la campaña tampoco cuenta como manual", () => {
    expect(descuentoResultante(conBF, 20)).toEqual({ monto: 20, prevaleceCampana: true });
  });
  it("quitar el descuento (0) devuelve la campaña, no un precio sin descuento", () => {
    expect(descuentoResultante(conBF, 0)).toEqual({ monto: 20, prevaleceCampana: true });
  });
  it("un manual MAYOR reemplaza a la campaña (no se suman)", () => {
    expect(descuentoResultante(conBF, 30)).toEqual({ monto: 30, prevaleceCampana: false });
  });
  it("por un centavo de diferencia sigue siendo la campaña (redondeo del navegador)", () => {
    expect(descuentoResultante(conBF, 20.01).prevaleceCampana).toBe(true);
    expect(descuentoResultante(conBF, 20.02).prevaleceCampana).toBe(false);
  });
});

describe("aplicarDescuento con campaña", () => {
  const cumple: DetalleDescuento = { razon: "cumpleanos_clienta_top", razonOtro: "", argumento: "" };
  const carrito = [lineaCampana("a", 100, blackFriday), lineaCampana("b", 100)];

  it("un 10 % manual a todo el ticket deja la campaña (20 %) donde la hay y aplica 10 % donde no", () => {
    const r = aplicarDescuento(carrito, 10, [], cumple);
    expect(r.map((l) => l.descuentoUnitario)).toEqual([20, 10]);
    expect(r.map((l) => l.razonDescuento)).toEqual(["campana", "cumpleanos_clienta_top"]);
  });
  it("un 30 % manual reemplaza a la campaña con su motivo", () => {
    const r = aplicarDescuento(carrito, 30, ["a"], cumple);
    expect(r[0]).toMatchObject({ descuentoUnitario: 30, razonDescuento: "cumpleanos_clienta_top" });
  });
  it("«Quitar descuento» (0 %) en una línea con campaña la devuelve a la campaña", () => {
    const r = aplicarDescuento(aplicarDescuento(carrito, 30, ["a"], cumple), 0, ["a"], SIN_DETALLE_DESCUENTO);
    expect(r[0]).toMatchObject({ descuentoUnitario: 20, razonDescuento: "campana" });
  });
});

describe("conCampanas — un ticket en espera se pone al día", () => {
  const rige = new Map<string, CampanaLinea>([["a", blackFriday]]);

  it("una línea sin descuento recibe la campaña que ahora rige", () => {
    const [l] = conCampanas([lineaCampana("a", 100)], rige);
    expect(l).toMatchObject({ descuentoUnitario: 20, razonDescuento: "campana", campana: blackFriday });
  });
  it("si la campaña cambió de %, la línea se ajusta", () => {
    const [l] = conCampanas([conCampanas([lineaCampana("a", 100)], rige)[0]], new Map([["a", liquidacion]]));
    expect(l.descuentoUnitario).toBe(40);
  });
  it("si la campaña terminó, su descuento se va", () => {
    const con = conCampanas([lineaCampana("a", 100)], rige);
    const [l] = conCampanas(con, new Map());
    expect(l).toMatchObject({ descuentoUnitario: 0, razonDescuento: "", campana: null });
  });
  it("un descuento manual mayor que la campaña se respeta", () => {
    const manual = { ...lineaCampana("a", 100), descuentoUnitario: 35, razonDescuento: "cerrar_venta" };
    expect(conCampanas([manual], rige)[0]).toMatchObject({ descuentoUnitario: 35, razonDescuento: "cerrar_venta" });
  });
  it("un descuento manual menor que la campaña cede ante ella", () => {
    const manual = { ...lineaCampana("a", 100), descuentoUnitario: 10, razonDescuento: "cerrar_venta" };
    expect(conCampanas([manual], rige)[0]).toMatchObject({ descuentoUnitario: 20, razonDescuento: "campana" });
  });
  it("si la campaña terminó, un descuento manual NO se toca", () => {
    const manual = { ...lineaCampana("a", 100), descuentoUnitario: 10, razonDescuento: "cerrar_venta" };
    expect(conCampanas([manual], new Map())[0]).toMatchObject({ descuentoUnitario: 10, razonDescuento: "cerrar_venta" });
  });
  it("no toca una línea sin campaña ni campaña disponible", () => {
    const [l] = conCampanas([lineaCampana("z", 50)], rige);
    expect(l).toMatchObject({ descuentoUnitario: 0, razonDescuento: "" });
  });
});

describe("hayDescuentoManual — solo el manual pide código a una colaboradora", () => {
  it("una campaña sola no cuenta", () => {
    expect(hayDescuentoManual([{ descuentoUnitario: 20, razonDescuento: "campana" }])).toBe(false);
  });
  it("un descuento a mano sí, aunque haya campañas al lado", () => {
    expect(
      hayDescuentoManual([
        { descuentoUnitario: 20, razonDescuento: "campana" },
        { descuentoUnitario: 5, razonDescuento: "cerrar_venta" },
      ]),
    ).toBe(true);
  });
  it("sin descuento, no", () => {
    expect(hayDescuentoManual([{ descuentoUnitario: 0, razonDescuento: "" }])).toBe(false);
  });
  it("esDescuentoDeCampana exige monto > 0 además del motivo", () => {
    expect(esDescuentoDeCampana({ descuentoUnitario: 0, razonDescuento: "campana" })).toBe(false);
    expect(esDescuentoDeCampana({ descuentoUnitario: 8, razonDescuento: "campana" })).toBe(true);
  });
});

describe("pagosParaRpc — lo que viaja a registrar_venta", () => {
  it("el efectivo con recibido suficiente lo manda (para reimprimir el vuelto)", () => {
    expect(pagosParaRpc([{ metodo: "efectivo", monto: 100, recibido: 150 }])).toEqual([
      { metodo: "efectivo", monto: 100, recibido: 150 },
    ]);
  });

  it("sin recibido no inventa la clave", () => {
    const [p] = pagosParaRpc([{ metodo: "efectivo", monto: 100 }]);
    expect(p).toEqual({ metodo: "efectivo", monto: 100 });
    expect(p).not.toHaveProperty("recibido");
  });

  it("un recibido menor que lo que cubre no viaja: el candado de la base rechazaría toda la venta", () => {
    const [p] = pagosParaRpc([{ metodo: "efectivo", monto: 100, recibido: 80 }]);
    expect(p).not.toHaveProperty("recibido");
  });

  it("un recibido exacto viaja (vuelto cero)", () => {
    expect(pagosParaRpc([{ metodo: "efectivo", monto: 100, recibido: 100 }])[0]).toHaveProperty("recibido", 100);
  });

  it("solo el efectivo lleva recibido", () => {
    const [p] = pagosParaRpc([{ metodo: "yape", monto: 50, recibido: 60 }]);
    expect(p).not.toHaveProperty("recibido");
  });

  it("el nº de operación viaja limpio en Yape, Plin y transferencia (ADR-0230); vacío no inventa la clave", () => {
    expect(pagosParaRpc([{ metodo: "yape", monto: 50, referencia: " 0123 4567 " }])).toEqual([{ metodo: "yape", monto: 50, referencia: "01234567" }]);
    expect(pagosParaRpc([{ metodo: "plin", monto: 50, referencia: "" }])[0]).not.toHaveProperty("referencia");
    expect(pagosParaRpc([{ metodo: "tarjeta", monto: 50, referencia: "999" }])[0]).not.toHaveProperty("referencia");
    expect(pagosParaRpc([{ metodo: "efectivo", monto: 50, recibido: 50, referencia: "999" }])[0]).toEqual({ metodo: "efectivo", monto: 50, recibido: 50 });
  });

  it("descarta los pagos en 0 (venta_pagos exige monto > 0)", () => {
    expect(pagosParaRpc([{ metodo: "efectivo", monto: 0, recibido: 10 }, { metodo: "yape", monto: 30 }])).toEqual([
      { metodo: "yape", monto: 30 },
    ]);
  });
});

describe("pagosTrasEditarMonto — con dos medios, el otro toma lo que falta", () => {
  const plinYEfectivo: PagoAplicado[] = [
    { metodo: "plin", monto: 80 },
    { metodo: "efectivo", monto: 0 },
  ];

  it("total 80: Plin baja a 40 y el efectivo se llena con los 40 que faltan", () => {
    expect(pagosTrasEditarMonto(plinYEfectivo, 0, 40, 80)).toEqual([
      { metodo: "plin", monto: 40 },
      { metodo: "efectivo", monto: 40 },
    ]);
  });

  it("también al revés: editar el segundo ajusta el primero", () => {
    expect(pagosTrasEditarMonto(plinYEfectivo, 1, 30, 80)).toEqual([
      { metodo: "plin", monto: 50 },
      { metodo: "efectivo", monto: 30 },
    ]);
  });

  it("si lo escrito supera el total, el otro queda en 0 y el bloqueo de cobro avisa que se pasa", () => {
    const r = pagosTrasEditarMonto(plinYEfectivo, 0, 100, 80);
    expect(r.map((p) => p.monto)).toEqual([100, 0]);
    expect(restanteDePagos(80, r)).toBe(-20);
  });

  it("redondea a centavos y el reparto suma el total", () => {
    const r = pagosTrasEditarMonto(plinYEfectivo, 0, 33.333, 80);
    expect(r.map((p) => p.monto)).toEqual([33.33, 46.67]);
    expect(restanteDePagos(80, r)).toBe(0);
  });

  it("un campo vaciado (o roto) cuenta como 0 y el otro se lleva todo", () => {
    expect(pagosTrasEditarMonto(plinYEfectivo, 0, Number.NaN, 80).map((p) => p.monto)).toEqual([0, 80]);
  });

  it("no toca el recibido del efectivo", () => {
    const r = pagosTrasEditarMonto([{ metodo: "plin", monto: 80 }, { metodo: "efectivo", monto: 0, recibido: 50 }], 0, 40, 80);
    expect(r[1]).toEqual({ metodo: "efectivo", monto: 40, recibido: 50 });
  });

  it("con un solo medio o con tres, solo cambia el editado (no hay a quién repartirle)", () => {
    expect(pagosTrasEditarMonto([{ metodo: "efectivo", monto: 80 }], 0, 50, 80)).toEqual([{ metodo: "efectivo", monto: 50 }]);
    const tres: PagoAplicado[] = [{ metodo: "plin", monto: 40 }, { metodo: "yape", monto: 20 }, { metodo: "efectivo", monto: 20 }];
    expect(pagosTrasEditarMonto(tres, 1, 10, 80).map((p) => p.monto)).toEqual([40, 10, 20]);
  });

  it("un índice que no existe no rompe nada", () => {
    expect(pagosTrasEditarMonto(plinYEfectivo, 5, 40, 80)).toEqual(plinYEfectivo);
  });
});

describe("pasoDelCobro — cuál es el siguiente paso que la pantalla resalta", () => {
  it("sin ningún medio, o sin cubrir el total, o pasándose: falta elegir el medio", () => {
    expect(pasoDelCobro([], 80)).toBe("medio");
    expect(pasoDelCobro([{ metodo: "yape", monto: 50 }], 80)).toBe("medio");
    expect(pasoDelCobro([{ metodo: "yape", monto: 90 }], 80)).toBe("medio");
  });

  it("cubierto con un medio que no es efectivo: no hay 'recibido', sigue el comprobante", () => {
    expect(pasoDelCobro([{ metodo: "yape", monto: 80 }], 80)).toBe("comprobante");
  });

  it("efectivo cubierto pero sin anotar lo recibido: toca el recibido", () => {
    expect(pasoDelCobro([{ metodo: "efectivo", monto: 80 }], 80)).toBe("recibido");
  });

  it("recibido menor que lo que cubre sigue siendo el paso del recibido", () => {
    expect(pasoDelCobro([{ metodo: "efectivo", monto: 80, recibido: 50 }], 80)).toBe("recibido");
  });

  it("recibido suficiente (o exacto): sigue el comprobante", () => {
    expect(pasoDelCobro([{ metodo: "efectivo", monto: 80, recibido: 100 }], 80)).toBe("comprobante");
    expect(pasoDelCobro([{ metodo: "efectivo", monto: 80, recibido: 80 }], 80)).toBe("comprobante");
  });

  it("con pago mixto el recibido se pide solo si el efectivo cubre algo", () => {
    expect(pasoDelCobro([{ metodo: "plin", monto: 40 }, { metodo: "efectivo", monto: 40 }], 80)).toBe("recibido");
    expect(pasoDelCobro([{ metodo: "plin", monto: 80 }, { metodo: "efectivo", monto: 0 }], 80)).toBe("comprobante");
  });
});

// El nombre de quien atendió en el papel del ticket: el responsable de la venta (ADR-0161).

const MARIA: Vendedora = { personaId: "p-maria", nombre: "María Pérez Soto" };
const ROSA: Vendedora = { personaId: "p-rosa", nombre: "Rosa Díaz Luna" };
const MARIA_L: Vendedora = { personaId: "p-maria-l", nombre: "María López Vera" };

describe("atendioCorto — el nombre que sale en el papel", () => {
  it("el primer nombre basta cuando no hay otra igual en la fila", () => {
    expect(atendioCorto([MARIA, ROSA], "p-maria")).toBe("María");
  });

  it("dos «María» en la fila se distinguen con la inicial del apellido", () => {
    expect(atendioCorto([MARIA, MARIA_L], "p-maria")).toBe("María P.");
    expect(atendioCorto([MARIA, MARIA_L], "p-maria-l")).toBe("María L.");
  });

  it("sin elegida o con una que no está en la fila no se inventa nadie", () => {
    expect(atendioCorto([MARIA, ROSA], null)).toBeNull();
    expect(atendioCorto([MARIA, ROSA], "p-otra")).toBeNull();
  });
});

describe("motivoBloqueoCobro — el responsable (ADR-0161)", () => {
  it("sin responsable frena ya al armar, con la frase del combo", () => {
    expect(motivoBloqueoCobro({ ...listo, momento: "armar", pagos: [], motivoResponsable: "Elige quién está atendiendo." })).toBe(
      "Elige quién está atendiendo.",
    );
  });

  it("se pide antes que el pago: primero quién hace la venta, después la plata", () => {
    expect(motivoBloqueoCobro({ ...listo, pagos: [], motivoResponsable: "Nadie de turno" })).toBe("Nadie de turno");
  });

  it("la caja cerrada y el ticket vacío mandan sobre él", () => {
    expect(motivoBloqueoCobro({ ...listo, cajaAbierta: false, motivoResponsable: "x" })).toBe("Abre la caja para vender.");
    expect(motivoBloqueoCobro({ ...listo, prendas: 0, motivoResponsable: "x" })).toBe("Agrega una prenda para cobrar.");
  });

  it("con responsable elegido (o sin la regla) no bloquea", () => {
    expect(motivoBloqueoCobro({ ...listo, motivoResponsable: null })).toBeNull();
    expect(motivoBloqueoCobro(listo)).toBeNull();
  });
});

describe("textoSinStock — «agotada» o «apartada para una clienta»", () => {
  it("sin nada apartado, agotada es agotada", () => {
    expect(textoSinStock({ stockAqui: 0, apartadoAqui: 0 })).toBe("agotada");
    // Quien no trae `apartadoAqui` (una pantalla sin esta lectura) dice lo de siempre.
    expect(textoSinStock({ stockAqui: 0 })).toBe("agotada");
    expect(sinStockPorApartado({ stockAqui: 0 })).toBe(false);
  });

  it("piso en 0 con 1 apartada para una clienta: no está agotada, está apartada", () => {
    expect(textoSinStock({ stockAqui: 0, apartadoAqui: 1 })).toBe("apartada para una clienta");
    expect(sinStockPorApartado({ stockAqui: 0, apartadoAqui: 1 })).toBe(true);
    // Varias apartadas dicen lo mismo: la frase habla de la prenda, no de cuántas.
    expect(textoSinStock({ stockAqui: 0, apartadoAqui: 3 })).toBe("apartada para una clienta");
  });

  it("cada pantalla conserva su texto de siempre para agotada, y la frase abre igual que él", () => {
    expect(textoSinStock({ stockAqui: 0 }, "sin stock aquí")).toBe("sin stock aquí");
    expect(textoSinStock({ stockAqui: 0 }, "Sin stock aquí")).toBe("Sin stock aquí");
    expect(textoSinStock({ stockAqui: 0, apartadoAqui: 2 }, "sin stock aquí")).toBe("apartada para una clienta");
    expect(textoSinStock({ stockAqui: 0, apartadoAqui: 2 }, "Sin stock aquí")).toBe("Apartada para una clienta");
  });

  it("con stock libre en el almacén gana «en el almacén» (motivoNoCobrable): esto NO es «apartada»", () => {
    // El contrato que dice el docstring y que solo se cumple si el llamador pasa el almacén (Vender lo pasa; Cambios no).
    expect(sinStockPorApartado({ stockAqui: 0, almacenAqui: 3, apartadoAqui: 1 })).toBe(false);
    expect(textoSinStock({ stockAqui: 0, almacenAqui: 3, apartadoAqui: 1 }, "sin stock aquí")).toBe("sin stock aquí");
    // Sin nada libre en el almacén sí es «apartada», y sin el dato del almacén (Cambios) también.
    expect(sinStockPorApartado({ stockAqui: 0, almacenAqui: 0, apartadoAqui: 1 })).toBe(true);
    expect(sinStockPorApartado({ stockAqui: 0, apartadoAqui: 1 })).toBe(true);
  });

  it("con piso libre no hay nada que explicar, aunque otra unidad esté apartada", () => {
    expect(sinStockPorApartado({ stockAqui: 2, apartadoAqui: 1 })).toBe(false);
    expect(textoSinStock({ stockAqui: 2, apartadoAqui: 1 }, "sin stock aquí")).toBe("sin stock aquí");
  });
});
