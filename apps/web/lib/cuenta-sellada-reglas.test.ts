import { describe, expect, it } from "vitest";
import {
  agruparCuentas,
  ayudaDelFondo,
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
  usadoDelFondo,
  MEDIOS_DEL_FONDO,
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
      "Por depositar (máquina de cobro)",
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

// ADR-0362 fase 6 · actividad 2: «Mi fondo» en los pagos de Compras. No viene de `fn_cuentas_para_elegir`: lo suma la pantalla
// (`conMiFondo`) y su regla es la de `retail.fn_fondo_para_pagar`.
describe("el fondo por rendir en «Sale de»", () => {
  const FONDO = c("fondo_ana", "fondo", { nombre: "Mi fondo", saldo: 380, propuestaPara: ["efectivo"] });
  const CON_FONDO = [FONDO, ...CUENTAS];

  it("sirve solo para pagar, y con tarjeta no (la plata de una tarjeta es de CAYLA)", () => {
    for (const m of ["efectivo", "yape", "plin", "transferencia", "deposito", "otro"]) expect(sirveParaMedio("pago", m, "fondo")).toBe(true);
    expect(MEDIOS_DEL_FONDO).toEqual(["efectivo", "yape", "plin", "transferencia", "deposito", "otro"]);
    expect(sirveParaMedio("pago", "tarjeta", "fondo")).toBe(false);
    expect(sirveParaMedio("cobro", "efectivo", "fondo")).toBe(false);
    expect(sirveParaMedio("reembolso", "transferencia", "fondo")).toBe(false);
  });

  it("va primero en el combo, con lo que tiene en la mano o lo que CAYLA le debe", () => {
    const opciones = opcionesDeCuenta(CON_FONDO, "pago", "efectivo");
    expect(opciones[0]).toEqual({ valor: "fondo_ana", texto: "Mi fondo · tienes S/\u00a0380.00", grupo: "Tu fondo por rendir", deshabilitada: false });
    expect(etiquetaCuenta({ ...FONDO, saldo: -120 })).toBe("Mi fondo · CAYLA te debe S/\u00a0120.00");
    expect(etiquetaCuenta({ ...FONDO, saldo: 0 })).toBe("Mi fondo · sin plata");
    // Con tarjeta no aparece.
    expect(opcionesDeCuenta(CON_FONDO, "pago", "tarjeta").some((o) => o.valor === "fondo_ana")).toBe(false);
  });

  it("con plata, se propone para el efectivo antes que la caja; sin propuesta, el efectivo sigue en la caja y el Yape en el banco", () => {
    expect(cuentaPropuesta(CON_FONDO, "pago", "efectivo")).toBe("fondo_ana");
    expect(cuentaPropuesta(CON_FONDO, "pago", "yape")).toBe("bcp");
    const sinPlata = [{ ...FONDO, saldo: 0, propuestaPara: [] }, ...CUENTAS];
    expect(cuentaPropuesta(sinPlata, "pago", "efectivo")).toBe("cajon_tru");
    // Elegido para Yape, sigue sirviendo; con tarjeta, vuelve a la propuesta.
    expect(cuentaEfectiva(CON_FONDO, "pago", "yape", "fondo_ana")).toBe("fondo_ana");
    expect(cuentaEfectiva(CON_FONDO, "pago", "tarjeta", "fondo_ana")).toBe("visa");
  });

  it("nunca se propone por descarte: sin banco, una transferencia queda por elegir (el fondo sigue a un toque)", () => {
    const sinBanco = [FONDO, c("fuerte_tru", "caja_fuerte")];
    expect(cuentaPropuesta(sinBanco, "pago", "transferencia")).toBeNull();
    expect(opcionesDeCuenta(sinBanco, "pago", "transferencia").map((o) => o.valor)).toEqual(["fondo_ana"]);
    // Sin plata y sin otra caja, el efectivo tampoco sale solo del fondo.
    expect(cuentaPropuesta([{ ...FONDO, saldo: 0, propuestaPara: [] }], "pago", "efectivo")).toBeNull();
  });

  it("la frase de abajo dice cuánto le queda y, si no alcanza, que CAYLA se lo devuelve al rendir (nunca frena)", () => {
    expect(ayudaDelFondo(380, 0)).toBe("Sale de tu fondo por rendir (tienes S/\u00a0380.00): no toca ninguna caja.");
    expect(ayudaDelFondo(380, 300)).toBe("Sale de tu fondo: te quedan S/\u00a080.00 en la mano.");
    expect(ayudaDelFondo(380, 380)).toBe("Sale de tu fondo: te quedan S/\u00a00.00 en la mano.");
    expect(ayudaDelFondo(380, 500)).toBe("Tu fondo tiene S/\u00a0380.00: los S/\u00a0120.00 que faltan los pones tú y CAYLA te los devuelve al rendir.");
    expect(ayudaDelFondo(0, 0)).toBe("Tu fondo no tiene plata: lo que pagues lo pones tú y CAYLA te lo devuelve al rendir.");
    expect(ayudaDelFondo(0, 250)).toBe("Lo pones tú: CAYLA te deberá S/\u00a0250.00 y te lo devuelve al rendir.");
    expect(ayudaDelFondo(-100, 0)).toBe("CAYLA ya te debe S/\u00a0100.00: lo que pagues lo pones tú y se suma a lo que te debe.");
    expect(ayudaDelFondo(-100, 250)).toBe("Lo pones tú: CAYLA te deberá S/\u00a0350.00 y te lo devuelve al rendir.");
    expect(ayudaCuenta(FONDO, "sale")).toBe(ayudaDelFondo(380, 0));
  });

  it("lo que sale del fondo suma solo las líneas que van al fondo, hasta la pedida", () => {
    const lineas = [
      { monto: "200", metodo: "efectivo" }, // propuesta: el fondo
      { monto: "50", metodo: "transferencia" }, // el banco
      { monto: "30.5", metodo: "yape", cuentaId: "fondo_ana" }, // elegido a mano
    ];
    expect(usadoDelFondo(lineas, CON_FONDO, 0)).toBe(200);
    expect(usadoDelFondo(lineas, CON_FONDO, 1)).toBe(200);
    expect(usadoDelFondo(lineas, CON_FONDO, 2)).toBe(230.5);
    expect(usadoDelFondo(lineas, CUENTAS, 2)).toBe(0);
  });
});
