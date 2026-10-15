import { describe, expect, it } from "vitest";
import {
  argsRegistrarPapelInsumo,
  baseConPapelDeInsumos,
  calcularRenglonInsumo,
  camposDelPapelInsumo,
  costoNetoDiezmilesimas,
  costoParaCaja,
  deMasPorLineaInsumo,
  detalleDeRegistroInsumo,
  leerResultadoPapelInsumo,
  papelDeOrdenInsumo,
  pedidasDeLaOrden,
  pedidasSinRenglonInsumo,
  pendienteMilesimas,
  precargarPapelInsumo,
  primerProblemaPapelInsumo,
  recepcionDeOrdenInsumo,
  problemaDeRenglonInsumo,
  resumenDeAvisosInsumo,
  textoPapelDeLineaInsumo,
  textoRecibidoDeLineaInsumo,
  totalesPapelInsumo,
  type BorradorPapelInsumo,
  type ContextoPapelInsumo,
  type LineaPapelInsumo,
  type PedidaInsumo,
} from "./comprobante-orden-insumo-reglas";
import type { DetalleOrdenInsumo, LineaOrdenInsumo } from "./ordenes-insumo-reglas";

// Los casos espejan `scripts/pruebas/comprobante_orden_insumo.mjs`: lo que la base rechaza, la guía lo dice antes de pulsar (y lo que la
// base acepta, la guía no lo frena). La orden de siempre: 12.5 m de lino a S/ 10 y 4 conos de hilo a S/ 3.50 → S/ 139.00.

const linea = (o: Partial<LineaOrdenInsumo> & Pick<LineaOrdenInsumo, "posicion" | "insumoId" | "insumo" | "unidadMedida" | "cantidad" | "precioUnitario">): LineaOrdenInsumo => ({
  codigo: null,
  tipo: null,
  unidadActual: o.unidadMedida,
  descripcion: null,
  descuento: 0,
  descuentoPct: null,
  subtotal: Math.round(o.cantidad * o.precioUnitario * 100) / 100,
  ...o,
});

const LINO = linea({ posicion: 1, insumoId: "i-lino", insumo: "Lino crudo", unidadMedida: "metro", cantidad: 12.5, precioUnitario: 10 });
const HILO = linea({ posicion: 2, insumoId: "i-hilo", insumo: "Hilo", unidadMedida: "cono", cantidad: 4, precioUnitario: 3.5 });

const DETALLE: Pick<DetalleOrdenInsumo, "lineas" | "facturacion"> = {
  lineas: [LINO, HILO],
  facturacion: [
    { posicion: 1, itemId: "it-lino", facturado: 0, recibido: 0 },
    { posicion: 2, itemId: "it-hilo", facturado: 0, recibido: 0 },
  ],
};

const CTX: ContextoPapelInsumo = {
  hoy: "2026-10-14",
  lineasDeLaOrden: new Map([
    ["it-lino", "metro"],
    ["it-hilo", "cono"],
  ]),
  insumos: new Map([
    ["i-lino", "metro"],
    ["i-hilo", "cono"],
    ["i-boton", "unidad"],
  ]),
};

const renglon = (o: Partial<LineaPapelInsumo> = {}): LineaPapelInsumo => ({ clave: "r1", ordenItemId: "it-lino", insumoId: "i-lino", cantidad: "12.5", costo: "10", ...o });

const borrador = (o: Partial<BorradorPapelInsumo> = {}): BorradorPapelInsumo => ({
  tipo: "factura",
  serie: "F001",
  numero: "77",
  emision: "2026-10-14",
  condicion: "credito",
  vencimiento: "2026-11-13",
  sumaIgv: true,
  totalDelPapel: "",
  lineas: [renglon(), renglon({ clave: "r2", ordenItemId: "it-hilo", insumoId: "i-hilo", cantidad: "4", costo: "3.50" })],
  pagos: [],
  nota: "",
  ...o,
});

describe("el papel de una orden de insumos: las líneas de la orden", () => {
  it("cada línea con su id y lo facturado, por posición; sin id (una base sin la fase), no se pone en el papel", () => {
    const pedidas = pedidasDeLaOrden({ ...DETALLE, facturacion: [{ posicion: 1, itemId: "it-lino", facturado: 10, recibido: 0 }] });
    expect(pedidas.map((p) => [p.posicion, p.itemId, p.facturado])).toEqual([
      [1, "it-lino", 10],
      [2, null, 0],
    ]);
    expect(baseConPapelDeInsumos(DETALLE)).toBe(true);
    expect(baseConPapelDeInsumos({ ...DETALLE, facturacion: [] })).toBe(false);
    expect(baseConPapelDeInsumos({ lineas: [], facturacion: [] })).toBe(false);
  });

  it("lo pendiente, en milésimas, nunca menos de cero", () => {
    expect(pendienteMilesimas({ cantidad: 12.5, facturado: 10 })).toBe(2500);
    expect(pendienteMilesimas({ cantidad: 12.5, facturado: 15 })).toBe(0);
    expect(pendienteMilesimas({ cantidad: 0.3, facturado: 0.1 })).toBe(200);
  });

  it("el costo neto: el precio exacto sin descuento; con descuento, el subtotal entre la cantidad, a cuatro decimales", () => {
    expect(costoNetoDiezmilesimas({ cantidad: 1000, precioUnitario: 0.035, descuento: 0, subtotal: 35 })).toBe(350);
    // 12.5 m a S/ 13.3333 = S/ 166.67, menos el 15 % (S/ 25.00) = S/ 141.67 → S/ 11.3336 por metro.
    expect(costoNetoDiezmilesimas({ cantidad: 12.5, precioUnitario: 13.3333, descuento: 25, subtotal: 141.67 })).toBe(113336);
    expect(costoParaCaja(255000)).toBe("25.50");
    expect(costoParaCaja(350)).toBe("0.035");
    expect(costoParaCaja(113336)).toBe("11.3336");
    expect(costoParaCaja(100000)).toBe("10.00");
  });

  it("el papel de la orden y lo que dice cada línea: nada, en parte, completa, de más", () => {
    const con = (lino: number, hilo: number) =>
      pedidasDeLaOrden({ ...DETALLE, facturacion: [{ posicion: 1, itemId: "it-lino", facturado: lino, recibido: 0 }, { posicion: 2, itemId: "it-hilo", facturado: hilo, recibido: 0 }] });
    expect(papelDeOrdenInsumo(con(0, 0))).toBeNull();
    expect(papelDeOrdenInsumo(con(10, 0))).toBe("en_parte");
    expect(papelDeOrdenInsumo(con(12.5, 4))).toBe("completa");
    expect(papelDeOrdenInsumo(con(15, 4))).toBe("completa");
    expect(textoPapelDeLineaInsumo({ cantidad: 12.5, facturado: 10, unidadMedida: "metro" })).toBe("10 de 12.5 metros");
    expect(textoPapelDeLineaInsumo({ cantidad: 12.5, facturado: 15, unidadMedida: "metro" })).toBe("15 de 12.5 metros · 2.5 de más");
    expect(textoPapelDeLineaInsumo({ cantidad: 1, facturado: 0, unidadMedida: "cono" })).toBe("0 de 1 cono");
  });

  it("lo que ya entró al Taller (actividad 3): nada, en parte, todo; contra lo pedido o lo facturado, lo mayor", () => {
    const l = (cantidad: number, facturado: number, recibido: number) => ({ cantidad, facturado, recibido, unidadMedida: "metro" });
    expect(recepcionDeOrdenInsumo([l(12.5, 0, 0)])).toBeNull();
    expect(recepcionDeOrdenInsumo([l(12.5, 0, 10)])).toBe("en_parte");
    expect(recepcionDeOrdenInsumo([l(12.5, 15, 12.5)])).toBe("en_parte");
    expect(recepcionDeOrdenInsumo([l(12.5, 15, 15), l(4, 0, 4)])).toBe("completa");
    expect(textoRecibidoDeLineaInsumo(l(12.5, 0, 10))).toBe("10 de 12.5 metros");
    expect(textoRecibidoDeLineaInsumo(l(12.5, 15, 15))).toBe("15 de 15 metros");
  });

  it("la precarga pone lo pendiente con su costo; lo que ya llegó del todo se ofrece aparte", () => {
    let n = 0;
    const pedidas = pedidasDeLaOrden({ ...DETALLE, facturacion: [{ posicion: 1, itemId: "it-lino", facturado: 10, recibido: 0 }, { posicion: 2, itemId: "it-hilo", facturado: 4, recibido: 0 }] });
    const lineas = precargarPapelInsumo(pedidas, () => `r${++n}`);
    expect(lineas).toEqual([{ clave: "r1", ordenItemId: "it-lino", insumoId: "i-lino", cantidad: "2.5", costo: "10.00" }]);
    expect(pedidasSinRenglonInsumo(pedidas, lineas).map((p) => p.itemId)).toEqual(["it-hilo"]);
  });
});

describe("el papel de una orden de insumos: la cuenta, como la base", () => {
  it("P2: la factura al crédito de lo pedido tal cual es S/ 139 + 18 % = S/ 164.02", () => {
    const t = totalesPapelInsumo(borrador());
    expect([t.subtotalCentimos, t.igvCentimos, t.totalCentimos]).toEqual([13900, 2502, 16402]);
  });

  it("T1: la boleta y la factura sin IGV son la suma de las líneas", () => {
    expect(totalesPapelInsumo(borrador({ tipo: "boleta" })).totalCentimos).toBe(13900);
    expect(totalesPapelInsumo(borrador({ sumaIgv: false })).totalCentimos).toBe(13900);
    expect(totalesPapelInsumo(borrador({ tipo: "sin_comprobante" })).igvCentimos).toBe(0);
  });

  it("TT: el total impreso manda dentro de un céntimo por renglón (más uno), y nunca bajo el subtotal", () => {
    const manda = totalesPapelInsumo(borrador({ totalDelPapel: "164.03" }));
    expect([manda.usaTotalDelPapel, manda.igvCentimos, manda.totalCentimos]).toEqual([true, 2503, 16403]);
    // Dos renglones: hasta 3 céntimos.
    expect(totalesPapelInsumo(borrador({ totalDelPapel: "164.05" })).problemaTotalDelPapel).toBeNull();
    expect(totalesPapelInsumo(borrador({ totalDelPapel: "164.06" })).problemaTotalDelPapel).toMatch(/no cuadra/);
    expect(totalesPapelInsumo(borrador({ totalDelPapel: "165" })).problemaTotalDelPapel).toMatch(/no cuadra/);
    expect(totalesPapelInsumo(borrador({ totalDelPapel: "abc" })).problemaTotalDelPapel).toMatch(/dos decimales/);
    // En una boleta el total del papel no se ofrece: no cuenta aunque haya quedado escrito.
    expect(totalesPapelInsumo(borrador({ tipo: "boleta", totalDelPapel: "200" })).problemaTotalDelPapel).toBeNull();
  });

  it("cantidades con tres decimales y costos con cuatro, redondeados por renglón como la base", () => {
    expect(calcularRenglonInsumo({ cantidad: "1000", costo: "0.035" }).subtotalCentimos).toBe(3500);
    expect(calcularRenglonInsumo({ cantidad: "0.333", costo: "10.0001" }).subtotalCentimos).toBe(333);
    expect(calcularRenglonInsumo({ cantidad: "12,5", costo: "10" }).subtotalCentimos).toBe(12500);
  });
});

describe("el papel de una orden de insumos: lo que falta (las reglas de la base)", () => {
  it("L1: renglones malos — de otra orden, insumo archivado, 4 decimales, 5 de costo, no es número, cero", () => {
    expect(problemaDeRenglonInsumo(renglon({ ordenItemId: "it-ajena" }), CTX)).toMatch(/no es de esta orden/);
    expect(problemaDeRenglonInsumo(renglon({ ordenItemId: null, insumoId: "i-archivado" }), CTX)).toBe("Elige el insumo.");
    expect(problemaDeRenglonInsumo(renglon({ cantidad: "1.2345" }), CTX)).toMatch(/hasta tres decimales/);
    expect(problemaDeRenglonInsumo(renglon({ costo: "1.23456" }), CTX)).toMatch(/hasta cuatro decimales/);
    expect(problemaDeRenglonInsumo(renglon({ cantidad: "abc" }), CTX)).toMatch(/0\.001 a 99 999\.999 metros/);
    expect(problemaDeRenglonInsumo(renglon({ cantidad: "0" }), CTX)).toMatch(/0\.001 a 99 999\.999 metros/);
    expect(problemaDeRenglonInsumo(renglon({ cantidad: "" }), CTX)).toBe("Escribe la cantidad en metros.");
    expect(problemaDeRenglonInsumo(renglon({ costo: "" }), CTX)).toBe("Escribe el costo por metro (0 si no tuvo costo).");
    // «1.500» no se adivina (¿mil quinientos o uno y medio?).
    expect(problemaDeRenglonInsumo(renglon({ cantidad: "1.500" }), CTX)).toMatch(/¿«1\.500» son 1500 metros o 1\.5 metros\?/);
    // Lo que la base acepta: 0.001, costo 0 y un insumo que no estaba en la orden (decisión 43).
    expect(problemaDeRenglonInsumo(renglon({ cantidad: "0.001", costo: "0" }), CTX)).toBeNull();
    expect(problemaDeRenglonInsumo(renglon({ ordenItemId: null, insumoId: "i-boton", cantidad: "10", costo: "0.20" }), CTX)).toBeNull();
  });

  it("C1: sin vencimiento, vencimiento antes de la emisión, emisión futura, sin tipo, sin serie", () => {
    const faltan = (b: BorradorPapelInsumo) => camposDelPapelInsumo(b, CTX, { tipo: true, condicion: true }, { pide: false, listo: true, motivo: null }).filter((c) => c.requerido && !c.hecho).map((c) => c.id);
    expect(faltan(borrador())).toEqual([]);
    expect(faltan(borrador({ vencimiento: "" }))).toEqual(["vencimiento"]);
    expect(faltan(borrador({ vencimiento: "2026-10-13" }))).toEqual(["vencimiento"]);
    expect(faltan(borrador({ emision: "2026-10-15", vencimiento: "2026-11-15" }))).toEqual(["emision"]);
    expect(faltan(borrador({ tipo: "" }))).toEqual(["tipo"]);
    expect(faltan(borrador({ serie: " " }))).toEqual(["serie"]);
    expect(faltan(borrador({ lineas: [] }))).toEqual(["lineas"]);
  });

  it("CC: al contado no pide vencimiento y pide el pago por el total exacto; cómo se paga es «sugerido» hasta que se elige", () => {
    const campos = (b: BorradorPapelInsumo, condicion = true) => camposDelPapelInsumo(b, CTX, { tipo: true, condicion }, { pide: false, listo: true, motivo: null });
    const faltan = (b: BorradorPapelInsumo) => campos(b).filter((c) => c.requerido && !c.hecho).map((c) => [c.id, c.pendiente]);
    const contado = (pagos: { monto: string; metodo: string; referencia: string }[]) => borrador({ tipo: "boleta", condicion: "contado", vencimiento: "", pagos });
    expect(campos(contado([])).map((c) => c.id)).not.toContain("vencimiento");
    expect(faltan(contado([]))).toEqual([["pago", "Agrega el medio de pago."]]);
    expect(faltan(contado([{ monto: "100", metodo: "efectivo", referencia: "" }]))).toEqual([["pago", "Al contado el pago es el total (S/\u00a0139.00); vas en S/\u00a0100.00."]]);
    expect(faltan(contado([{ monto: "0", metodo: "efectivo", referencia: "" }]))[0]?.[1]).toBe("Cada medio de pago necesita un monto mayor a cero.");
    expect(faltan(contado([{ monto: "139.001", metodo: "efectivo", referencia: "" }]))[0]?.[1]).toBe("El monto del pago va en soles, con hasta dos decimales.");
    expect(faltan(contado([{ monto: "100", metodo: "efectivo", referencia: "" }, { monto: "39", metodo: "yape", referencia: "" }]))).toEqual([]);
    const condicion = campos(borrador(), false).find((c) => c.id === "condicion");
    expect([condicion?.requerido, condicion?.sugerido, condicion?.hecho]).toEqual([false, true, false]);
    expect(faltan(borrador({ condicion: "" })).map(([id]) => id)).toEqual(["condicion"]);
  });

  it("T2: sin comprobante no pide serie ni número", () => {
    const ids = camposDelPapelInsumo(borrador({ tipo: "sin_comprobante", serie: "", numero: "" }), CTX, { tipo: true, condicion: true }, { pide: false, listo: true, motivo: null }).map((c) => c.id);
    expect(ids).not.toContain("serie");
    expect(ids).not.toContain("numero");
    expect(primerProblemaPapelInsumo(borrador({ tipo: "sin_comprobante", serie: "", numero: "" }), CTX)).toBeNull();
  });

  it("el tipo de papel es «sugerido» hasta que se elige; la nota solo bloquea si se pasa; el responsable, solo en una terminal", () => {
    const tipo = camposDelPapelInsumo(borrador(), CTX, { tipo: false, condicion: true }, { pide: false, listo: true, motivo: null }).find((c) => c.id === "tipo");
    expect([tipo?.requerido, tipo?.sugerido, tipo?.hecho]).toEqual([false, true, false]);
    expect(primerProblemaPapelInsumo(borrador({ nota: "x".repeat(501) }), CTX)).toMatch(/hasta 500 letras/);
    const conTerminal = camposDelPapelInsumo(borrador(), CTX, { tipo: true, condicion: true }, { pide: true, listo: false, motivo: null });
    expect(conTerminal.find((c) => c.id === "responsable")).toMatchObject({ requerido: true, hecho: false });
  });
});

describe("el papel de una orden de insumos: de más, lo que viaja y lo que vuelve", () => {
  const pedidas: PedidaInsumo[] = pedidasDeLaOrden(DETALLE);

  it("A1/A2: lo que pasa lo pedido se ve antes de guardar, contando lo ya facturado", () => {
    expect(deMasPorLineaInsumo([renglon({ cantidad: "15" })], pedidas)).toEqual([
      { itemId: "it-lino", posicion: 1, insumo: "Lino crudo", unidad: "metro", pedido: 12.5, facturadoAntes: 0, estaVez: 15, deMas: 2.5 },
    ]);
    const conAntes = pedidasDeLaOrden({ ...DETALLE, facturacion: [{ posicion: 1, itemId: "it-lino", facturado: 10, recibido: 0 }, DETALLE.facturacion[1]!] });
    expect(deMasPorLineaInsumo([renglon({ cantidad: "5" })], conAntes).map((d) => d.deMas)).toEqual([2.5]);
    expect(deMasPorLineaInsumo([renglon({ cantidad: "2.5" })], conAntes)).toEqual([]);
  });

  it("lo que viaja: la línea pedida por su id, la de fuera por su insumo, los números como texto canónico", () => {
    // 12.5 m a S/ 10 + 10 botones a S/ 0.20 = S/ 127.00; con 18 %, S/ 149.86. El papel dice S/ 149.87: manda (dos renglones, hasta 3 céntimos).
    const a = argsRegistrarPapelInsumo(
      borrador({ serie: "f001", totalDelPapel: "149.87", nota: "  llegó en dos bultos ", lineas: [renglon({ cantidad: "12,5" }), renglon({ clave: "r9", ordenItemId: null, insumoId: "i-boton", cantidad: "10", costo: "0.2000" })] }),
      { ordenId: "o1", token: "t1" },
    );
    expect(a).toEqual({
      p_orden_id: "o1",
      p_tipo: "factura",
      p_serie: "F001",
      p_numero: "77",
      p_lineas: [
        { orden_insumo_item_id: "it-lino", cantidad: "12.5", costo_unitario: "10" },
        { insumo_id: "i-boton", cantidad: "10", costo_unitario: "0.2" },
      ],
      p_fecha_emision: "2026-10-14",
      p_condicion: "credito",
      p_fecha_vencimiento: "2026-11-13",
      p_igv_porcentaje: 18,
      p_total: "149.87",
      p_nota: "llegó en dos bultos",
      p_token: "t1",
    });
    const sc = argsRegistrarPapelInsumo(borrador({ tipo: "sin_comprobante" }), { ordenId: "o1", token: "t2" });
    expect([sc.p_serie, sc.p_numero, sc.p_igv_porcentaje, "p_total" in sc, "p_nota" in sc]).toEqual(["", "", 0, false, false]);
    expect(argsRegistrarPapelInsumo(borrador({ sumaIgv: false }), { ordenId: "o1", token: "t3" }).p_igv_porcentaje).toBe(0);
    // Al contado viaja el pago (con su cuenta) y no el vencimiento; al crédito, al revés (un pago al crédito no viaja aunque llegue).
    const pago = [{ monto: 164.02, metodo: "efectivo", cuenta_id: "fondo-de-micaela" }];
    const contado = argsRegistrarPapelInsumo(borrador({ condicion: "contado", vencimiento: "2026-11-13" }), { ordenId: "o1", token: "t4", pago });
    expect([contado.p_condicion, "p_fecha_vencimiento" in contado, contado.p_pago]).toEqual(["contado", false, pago]);
    expect("p_pago" in argsRegistrarPapelInsumo(borrador(), { ordenId: "o1", token: "t5", pago })).toBe(false);
  });

  it("lo que vuelve: el documento y los avisos; un aviso raro se descarta; sin papel, null", () => {
    const r = leerResultadoPapelInsumo({
      comprobante_id: "c1",
      documento: "F001-77",
      tipo: "factura",
      condicion: "credito",
      total: 164.02,
      repetido: false,
      avisos: [
        { tipo: "de_mas", orden_insumo_item_id: "it-lino", posicion: 1, insumo: "Lino crudo", unidad: "metro", pedido: 12.5, facturado: 15 },
        { tipo: "fuera_de_orden", insumo: "Botón", unidad: "unidad", cantidad: 10 },
        { tipo: "otro" },
      ],
    });
    expect(r).toMatchObject({ comprobanteId: "c1", documento: "F001-77", total: 164.02, condicion: "credito", repetido: false });
    expect(r?.avisos).toHaveLength(2);
    expect(resumenDeAvisosInsumo(r!.avisos)).toEqual({
      titulo: "El papel no calza del todo con la orden",
      detalle: "Lino crudo: pediste 12.5 metros y el papel ya suma 15 metros (2.5 de más) · Botón: 10 unidades que no estaban en la orden. Quedó registrado igual.",
    });
    expect(resumenDeAvisosInsumo([])).toBeNull();
    expect(leerResultadoPapelInsumo({ documento: "F001-77" })).toBeNull();
    expect(leerResultadoPapelInsumo([{ comprobante_id: "c1", documento: "SC-000004", repetido: true }])).toMatchObject({ repetido: true, avisos: [] });
    expect(detalleDeRegistroInsumo("OI-000012", { total: 164.02, condicion: "credito" })).toBe("OI-000012 · Queda por pagar S/ 164.02");
    expect(detalleDeRegistroInsumo("OI-000012", { total: 164.02, condicion: "contado" })).toBe("OI-000012 · Pagado al contado S/ 164.02");
  });
});
