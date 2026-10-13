import { describe, expect, it } from "vitest";
import { faltanDe, sePuedeConfirmar } from "./guia-campos";
import {
  CONCEPTOS_DE,
  camposGastoViaje,
  fraseRegistrarGasto,
  leerGastosDeOrden,
  leerOrdenesParaGasto,
  papelesPara,
  problemaDePapel,
  repartirGasto,
  traerlaCosto,
  type ValoresGastoViaje,
} from "./gastos-viaje-reglas";

// Gastos del viaje (ADR-0362, fase 6 · actividad 3). Lo que falta en la hoja tiene que ser lo MISMO que rechaza la base y el reparto el
// MISMO que hace (20261013222000, `scripts/pruebas/gastos_viaje.mjs`): estos casos son los suyos, del lado de la pantalla.

const HOY = "2026-10-13";
const PERSONA: { esPersona: boolean; listo: boolean; motivo: string | null } = { esPersona: true, listo: true, motivo: null };
const LLENO: ValoresGastoViaje = {
  tipo: "mercaderia",
  concepto: "flete",
  monto: "60",
  fecha: HOY,
  papel: "boleta",
  serieNumero: "",
  ruc: "",
  nota: "",
  medio: "efectivo",
  cuentaId: "fondo-ana",
};

describe("el reparto entre órdenes (el mismo que la base)", () => {
  const O1 = { id: "o1", numero: "OC-000001", total: 300 };
  const O2 = { id: "o2", numero: "OC-000002", total: 100 };
  const O4 = { id: "o4", numero: "OC-000004", total: 50 };

  it("una sola orden se lleva todo", () => {
    expect(repartirGasto(60, [O1])).toEqual([{ id: "o1", monto: 60 }]);
  });
  it("según el total de cada una: 100 entre 300 y 100 son 75 y 25", () => {
    expect(repartirGasto(100, [O1, O2])).toEqual([
      { id: "o2", monto: 25 },
      { id: "o1", monto: 75 },
    ]);
  });
  it("a céntimos hacia abajo, y lo que sobra va a la de mayor total (la suma es el gasto)", () => {
    const partes = repartirGasto(10, [O1, O2, O4]);
    expect(partes).toEqual([
      { id: "o4", monto: 1.11 },
      { id: "o2", monto: 2.22 },
      { id: "o1", monto: 6.67 },
    ]);
    expect(Math.round(partes.reduce((a, p) => a + p.monto, 0) * 100) / 100).toBe(10);
  });
  it("sin total en ninguna, en partes iguales; una parte en cero no se anota", () => {
    expect(repartirGasto(1, [{ ...O1, total: 0 }, { ...O2, total: 0 }, { ...O4, total: 0 }])).toEqual([
      { id: "o1", monto: 0.33 },
      { id: "o2", monto: 0.33 },
      { id: "o4", monto: 0.34 },
    ]);
    expect(repartirGasto(0.02, [O1, O2, O4])).toEqual([{ id: "o1", monto: 0.02 }]);
  });
  it("sin órdenes o sin monto, nada", () => {
    expect(repartirGasto(50, [])).toEqual([]);
    expect(repartirGasto(0, [O1])).toEqual([]);
  });
});

describe("el papel (decisión 55)", () => {
  it("sin comprobante solo con taxi o cargador", () => {
    expect(papelesPara("taxi")).toContain("planilla_movilidad");
    expect(papelesPara("cargador")).toContain("planilla_movilidad");
    for (const c of ["flete", "agencia", "embalaje", "pasaje", "hotel", "comida", "otro", ""] as const) expect(papelesPara(c)).not.toContain("planilla_movilidad");
    expect(problemaDePapel({ ...LLENO, concepto: "comida", tipo: "viaje", papel: "planilla_movilidad" })).toMatch(/Sin comprobante solo se acepta taxi o cargador/);
    expect(problemaDePapel({ ...LLENO, concepto: "taxi", tipo: "viaje", papel: "planilla_movilidad" })).toBeNull();
  });
  it("cada tipo tiene sus conceptos, y «Otro» en los dos", () => {
    expect(CONCEPTOS_DE.mercaderia.map((c) => c.valor)).toEqual(["flete", "agencia", "cargador", "embalaje", "otro"]);
    expect(CONCEPTOS_DE.viaje.map((c) => c.valor)).toEqual(["pasaje", "hotel", "comida", "taxi", "otro"]);
  });
});

describe("lo que falta (las mismas reglas que la base)", () => {
  const faltan = (v: Partial<ValoresGastoViaje>, r = PERSONA) => faltanDe(camposGastoViaje({ ...LLENO, ...v }, HOY, r)).map((c) => c.id);

  it("llena, se puede confirmar; las órdenes, la serie, el RUC y la nota no cuentan", () => {
    expect(sePuedeConfirmar(camposGastoViaje(LLENO, HOY, PERSONA))).toBe(true);
    expect(faltan({})).toEqual([]);
  });
  it("vacía, falta lo que la base pide, en el orden de la hoja", () => {
    expect(faltan({ tipo: "", concepto: "", monto: "", papel: "", cuentaId: null })).toEqual(["tipo", "concepto", "monto", "papel", "cuenta"]);
  });
  it("lo que la base rechaza: monto en cero, fecha futura, «Otro» sin nota, RUC mal escrito, planilla con comida", () => {
    expect(faltan({ monto: "0" })).toEqual(["monto"]);
    expect(faltan({ fecha: "2026-10-14" })).toEqual(["fecha"]);
    expect(faltan({ concepto: "otro" })).toEqual(["nota"]);
    expect(faltan({ ruc: "2012345" })).toEqual(["ruc"]);
    expect(faltan({ tipo: "viaje", concepto: "comida", papel: "planilla_movilidad" })).toEqual(["papel"]);
  });
  it("un concepto de otro tipo no vale (cambiar el tipo lo borra en la hoja)", () => {
    expect(faltan({ tipo: "viaje", concepto: "flete" })).toEqual(["concepto"]);
  });
  it("desde una terminal pide quién lo registra; con su cuenta, no", () => {
    expect(faltan({}, { esPersona: false, listo: false, motivo: "Elige quién registra." })).toEqual(["responsable"]);
    expect(faltan({}, PERSONA)).toEqual([]);
  });
  it("con planilla no se piden serie ni RUC (no son campos)", () => {
    const ids = camposGastoViaje({ ...LLENO, tipo: "viaje", concepto: "taxi", papel: "planilla_movilidad" }, HOY, PERSONA).map((c) => c.id);
    expect(ids).not.toContain("serie");
    expect(ids).not.toContain("ruc");
  });
});

describe("leer lo que manda la base", () => {
  it("las órdenes para elegir; una fila sin id se descarta", () => {
    expect(
      leerOrdenesParaGasto([
        { id: "o1", numero: "OC-002788", proveedor: "Textiles Andina SAC", destino: "Tienda Trujillo", total: "300.00", fecha_emision: "2026-10-13" },
        { numero: "sin id" },
      ]),
    ).toEqual([{ id: "o1", numero: "OC-002788", proveedor: "Textiles Andina SAC", destino: "Tienda Trujillo", total: 300, fechaEmision: "2026-10-13" }]);
    expect(leerOrdenesParaGasto(null)).toEqual([]);
  });
  it("los gastos de una orden: lo que le tocó a ella y lo que costó traerla; un tipo o un papel desconocido no se adivina", () => {
    const g = leerGastosDeOrden([
      { gasto_id: "g1", fecha: "2026-10-13", tipo: "mercaderia", concepto: "flete", papel: "boleta", descripcion: "Flete · a Trujillo", monto: "25.00",
        monto_total: "100.00", ordenes: 2, cuenta_nombre: "Fondo · Ana", de_fondo: true, registrado_por_nombre: "Ana" },
      { gasto_id: "g2", fecha: "2026-10-12", tipo: "viaje", concepto: "hotel", papel: "factura", monto: 120, ordenes: 1, de_fondo: false },
      { gasto_id: "g3", fecha: "2026-10-12", tipo: "raro", concepto: "hotel", papel: "boleta", monto: 5 },
    ]);
    expect(g.map((x) => [x.gastoId, x.monto, x.montoTotal, x.ordenes, x.deFondo])).toEqual([
      ["g1", 25, 100, 2, true],
      ["g2", 120, 120, 1, false],
    ]);
    expect(g[1].descripcion).toBe("Hotel");
    expect(traerlaCosto(g)).toBe(145);
  });
});

describe("lo que dice el botón", () => {
  it("con monto, lo dice", () => {
    expect(fraseRegistrarGasto(60)).toBe("Registrar gasto de S/ 60.00");
    expect(fraseRegistrarGasto(null)).toBe("Registrar gasto");
  });
});
