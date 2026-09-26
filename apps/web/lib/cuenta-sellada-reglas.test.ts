import { describe, expect, it } from "vitest";
import {
  agruparCuentas,
  claseDePagoSinCuenta,
  leerPagoSinCuenta,
  medioDePagoSinCuenta,
  ayudaCuenta,
  cuentaDeSalida,
  cuentaEfectiva,
  cuentaPropuesta,
  cuentasDeLaClase,
  cuentasParaMedio,
  etiquetaCuenta,
  leerCuentaElegible,
  opcionesDeCuenta,
  medioDeCuenta,
  mediosDeBanco,
  sigueSirviendo,
  sirveParaMedio,
  type CuentaElegible,
} from "./cuenta-sellada-reglas";

const c = (id: string, tipo: CuentaElegible["tipo"], extra: Partial<CuentaElegible> = {}): CuentaElegible => ({
  id,
  nombre: id.toUpperCase(),
  tipo,
  ubicacionId: null,
  ubicacionNombre: null,
  cajaAbierta: false,
  propuestaPara: [],
  ...extra,
});

const CUENTAS = [
  c("bcp", "banco", { propuestaPara: ["yape", "transferencia", "deposito", "otro"] }),
  c("ibk", "banco", { propuestaPara: ["plin"] }),
  c("pos", "por_abonar"),
  c("visa", "tarjeta_credito", { propuestaPara: ["tarjeta"] }),
  c("cajon_tru", "cajon", { cajaAbierta: true, propuestaPara: ["efectivo"] }),
  c("cajon_lim", "cajon", { cajaAbierta: false }),
  c("fuerte_tru", "caja_fuerte"),
  c("rendir", "por_rendir"),
];

describe("sirveParaMedio (el mismo cuadro que retail.fn_cuenta_sirve)", () => {
  it("efectivo: cajón, caja fuerte o lo del líder; un cobro, solo el cajón", () => {
    expect(sirveParaMedio("pago", "efectivo", "caja_fuerte")).toBe(true);
    expect(sirveParaMedio("pago", "efectivo", "por_rendir")).toBe(true);
    expect(sirveParaMedio("pago", "efectivo", "banco")).toBe(false);
    expect(sirveParaMedio("cobro", "efectivo", "caja_fuerte")).toBe(false);
    expect(sirveParaMedio("cobro", "efectivo", "cajon")).toBe(true);
  });
  it("tarjeta: al pagar la tarjeta de crédito o un banco; al cobrar el POS o un banco", () => {
    expect(sirveParaMedio("pago", "tarjeta", "tarjeta_credito")).toBe(true);
    expect(sirveParaMedio("pago", "tarjeta", "por_abonar")).toBe(false);
    expect(sirveParaMedio("cobro", "tarjeta", "por_abonar")).toBe(true);
    expect(sirveParaMedio("cobro", "tarjeta", "tarjeta_credito")).toBe(false);
  });
  it("Yape, Plin, transferencias, depósitos: un banco o billetera", () => {
    for (const m of ["yape", "plin", "transferencia", "deposito", "otro"]) {
      expect(sirveParaMedio("pago", m, "banco")).toBe(true);
      expect(sirveParaMedio("pago", m, "caja_fuerte")).toBe(false);
    }
  });
  it("un medio desconocido no sirve para nada", () => {
    expect(sirveParaMedio("pago", "anticipo", "banco")).toBe(false);
  });
});

describe("qué se muestra y qué se propone", () => {
  it("para efectivo muestra solo cajones, cajas fuertes y lo del líder", () => {
    expect(cuentasParaMedio(CUENTAS, "pago", "efectivo").map((x) => x.id)).toEqual(["cajon_tru", "cajon_lim", "fuerte_tru", "rendir"]);
  });
  it("propone lo que dice la base para ese medio", () => {
    expect(cuentaPropuesta(CUENTAS, "pago", "yape")).toBe("bcp");
    expect(cuentaPropuesta(CUENTAS, "pago", "plin")).toBe("ibk");
    expect(cuentaPropuesta(CUENTAS, "pago", "efectivo")).toBe("cajon_tru");
    expect(cuentaPropuesta(CUENTAS, "pago", "tarjeta")).toBe("visa");
  });
  it("sin propuesta de la base, la primera que sirve (en efectivo, antes una caja fuerte que un cajón); un cajón cerrado nunca", () => {
    const sinPropuesta = CUENTAS.map((x) => ({ ...x, propuestaPara: [] }));
    expect(cuentaPropuesta(sinPropuesta, "pago", "efectivo")).toBe("fuerte_tru");
    expect(cuentaPropuesta(sinPropuesta, "pago", "transferencia")).toBe("bcp");
    expect(cuentaPropuesta([c("cajon_tru", "cajon", { cajaAbierta: true })], "pago", "efectivo")).toBe("cajon_tru");
    const soloCerrado = [c("cajon_lim", "cajon"), c("fuerte", "caja_fuerte")];
    expect(cuentaPropuesta(soloCerrado, "pago", "efectivo")).toBe("fuerte");
    expect(cuentaPropuesta([c("cajon_lim", "cajon")], "pago", "efectivo")).toBeNull();
  });
  it("sin bancos cargados, no hay propuesta para una transferencia", () => {
    expect(cuentaPropuesta([c("fuerte", "caja_fuerte")], "pago", "transferencia")).toBeNull();
  });
  it("si cambió el medio y la cuenta ya no sirve, hay que volver a proponer", () => {
    expect(sigueSirviendo(CUENTAS, "pago", "efectivo", "bcp")).toBe(false);
    expect(sigueSirviendo(CUENTAS, "pago", "transferencia", "bcp")).toBe(true);
    expect(sigueSirviendo(CUENTAS, "pago", "efectivo", "cajon_lim")).toBe(false);
    expect(sigueSirviendo(CUENTAS, "pago", "efectivo", null)).toBe(false);
  });
});

describe("la cuenta que va", () => {
  it("la elegida mientras sirva; si cambió el medio, la propuesta", () => {
    expect(cuentaEfectiva(CUENTAS, "pago", "transferencia", "ibk")).toBe("ibk");
    expect(cuentaEfectiva(CUENTAS, "pago", "efectivo", "ibk")).toBe("cajon_tru");
    expect(cuentaEfectiva(CUENTAS, "pago", "yape", null)).toBe("bcp");
  });
  it("«Salió de» muestra las que sirven para algún medio: al pagar, nunca el POS", () => {
    expect(cuentasDeLaClase(CUENTAS, "pago").map((x) => x.id)).not.toContain("pos");
    expect(cuentasDeLaClase(CUENTAS, "cobro").map((x) => x.id)).toContain("pos");
    expect(cuentasDeLaClase(CUENTAS, "reembolso").map((x) => x.id)).not.toContain("visa");
  });
});

describe("«Salió de» con la cuenta primero (Gastos)", () => {
  it("la elegida mientras se pueda usar; si no, la del medio de siempre, una transferencia o el efectivo", () => {
    expect(cuentaDeSalida(CUENTAS, "pago", "fuerte_tru")).toBe("fuerte_tru");
    expect(cuentaDeSalida(CUENTAS, "pago", "cajon_lim")).toBe("bcp");
    expect(cuentaDeSalida(CUENTAS, "pago", null, "plin")).toBe("ibk");
    expect(cuentaDeSalida([c("fuerte", "caja_fuerte")], "pago", null)).toBe("fuerte");
    expect(cuentaDeSalida(CUENTAS, "pago", "pos")).toBe("bcp");
  });
  it("con un banco: transferencia, Yape o Plin; el depósito, solo con comprobante", () => {
    expect(mediosDeBanco(false)).toEqual(["transferencia", "yape", "plin"]);
    expect(mediosDeBanco(true)).toContain("deposito");
  });
});

describe("cómo se dibuja", () => {
  it("agrupa en el orden del spike y deja fuera los grupos vacíos", () => {
    expect(agruparCuentas(CUENTAS).map((g) => g.titulo)).toEqual([
      "Bancos y billeteras",
      "Cajas fuertes",
      "Efectivo por rendir",
      "Cajones (resta del cierre de esa caja)",
      "Tarjeta de crédito",
      "Por abonar (POS)",
    ]);
    expect(agruparCuentas([c("bcp", "banco")]).length).toBe(1);
  });
  it("un cajón con la caja cerrada lo dice", () => {
    expect(etiquetaCuenta(c("cajon", "cajon"))).toBe("CAJON (caja cerrada)");
    expect(etiquetaCuenta(c("cajon", "cajon", { cajaAbierta: true }))).toBe("CAJON");
  });
  it("las opciones del combo: agrupadas y con el cajón cerrado a la vista pero bloqueado", () => {
    // Efectivo al pagar: cajas fuertes, lo del líder y los cajones (el de Lima, con la caja cerrada).
    expect(opcionesDeCuenta(CUENTAS, "pago", "efectivo")).toEqual([
      { valor: "fuerte_tru", texto: "FUERTE_TRU", grupo: "Cajas fuertes", deshabilitada: false },
      { valor: "rendir", texto: "RENDIR", grupo: "Efectivo por rendir", deshabilitada: false },
      { valor: "cajon_tru", texto: "CAJON_TRU", grupo: "Cajones (resta del cierre de esa caja)", deshabilitada: false },
      { valor: "cajon_lim", texto: "CAJON_LIM (caja cerrada)", grupo: "Cajones (resta del cierre de esa caja)", deshabilitada: true },
    ]);
  });
  it("sin medio, todas las de la clase; sin cuentas, ninguna (el combo lo dice con su marcador)", () => {
    expect(new Set(opcionesDeCuenta(CUENTAS, "cobro").map((o) => o.valor))).toEqual(new Set(cuentasDeLaClase(CUENTAS, "cobro").map((x) => x.id)));
    expect(opcionesDeCuenta([], "pago", "yape")).toEqual([]);
  });
  it("el medio que dice la cuenta sola", () => {
    expect(medioDeCuenta("caja_fuerte")).toBe("efectivo");
    expect(medioDeCuenta("tarjeta_credito")).toBe("tarjeta");
    expect(medioDeCuenta("banco")).toBeNull();
  });
  it("la ayuda dice qué pasa con el cierre", () => {
    expect(ayudaCuenta(c("x", "cajon"), "sale")).toContain("resta del cierre");
    expect(ayudaCuenta(c("x", "cajon"), "entra")).toContain("suma al cierre");
    expect(ayudaCuenta(c("x", "caja_fuerte"), "sale")).toContain("no toca el cierre");
    expect(ayudaCuenta(null, "sale")).toContain("sellada");
    expect(ayudaCuenta(c("x", "banco"), "sale")).toContain("Si sale de un cajón");
    expect(ayudaCuenta(c("x", "banco"), "sale", "cobro")).toContain("Sale de esa cuenta");
  });
  it("lee la fila de la base", () => {
    expect(
      leerCuentaElegible({ id: "a", nombre: "BCP", tipo: "banco", ubicacion_id: null, ubicacion_nombre: "", caja_abierta: false, propuesta_para: ["yape"] }),
    ).toEqual({ id: "a", nombre: "BCP", tipo: "banco", ubicacionId: null, ubicacionNombre: null, cajaAbierta: false, propuestaPara: ["yape"] });
  });
});

describe("lo pasado: decir de qué cuenta fue", () => {
  it("lee la fila y sabe si entra o sale y con qué medio se valida", () => {
    const p = leerPagoSinCuenta({ clave: "pago:1", origen: "pago", fecha: "2026-09-10", detalle: "Pago a X · F1-1", medio: "efectivo", monto: "-90", ubicacion_nombre: null });
    expect(p).toMatchObject({ clave: "pago:1", origen: "pago", monto: -90, medio: "efectivo", ubicacionNombre: null });
    expect(claseDePagoSinCuenta("reembolso")).toBe("reembolso");
    expect(claseDePagoSinCuenta("gasto")).toBe("pago");
    expect(medioDePagoSinCuenta({ origen: "traslado", medio: null })).toBe("transferencia");
    expect(medioDePagoSinCuenta({ origen: "pago", medio: null })).toBe("efectivo");
  });
});
