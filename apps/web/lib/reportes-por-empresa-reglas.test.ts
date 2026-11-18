import { describe, expect, it } from "vitest";
import {
  cifrasDeLaTienda,
  cobradoDelFiltro,
  cobradoEnCuentasDeLaCasa,
  filtrarVentas,
  hrefEnHistorial,
  SIN_FILTRO,
  sumaDeVentas,
  ladoALado,
  plataPorCuenta,
  fechasParaLaBase,
  hrefPorEmpresa,
  leerReportePorEmpresa,
  nombresDeEmpresas,
  periodoDeUrl,
  periodoEnPalabras,
  tramoDelMes,
} from "./reportes-por-empresa-reglas";

// La forma que devuelve `fn_reporte_ventas_por_empresa` (20261115042000), con tres ventas: una de CAYLA, una de CLAURE y una mixta pagada con dos medios.
const CAYLA = "ca71a000-0000-4000-8000-000000000001";
const CLAURE = "c1a07e00-0000-4000-8000-000000000002";
const item = (id: string, empresa: string, subtotal: number, cantidad = 1) => ({ id, empresa_id: empresa, producto: "Blusa", cantidad, subtotal });
const TIPO: Record<string, string> = { Caja: "cajon", BCP: "banco", Izipay: "por_abonar" };
const pago = (metodo: string, monto: number, partes: Record<string, number>, cuenta = "Caja") => ({
  metodo,
  monto,
  cuenta_id: `id-${cuenta}`,
  cuenta,
  cuenta_tipo: TIPO[cuenta],
  cuenta_de_la_casa: true,
  abona_a: cuenta === "Izipay" ? "Interbank Empresas" : null,
  varias_cuentas: false,
  partes,
});
const BASE = {
  desde: "2026-10-23",
  hasta: "2026-11-14",
  hoy: "2026-11-14",
  inicio: "2026-10-23",
  empresas: [
    { id: CAYLA, clave: "cayla", nombre: "CAYLA", casa: true },
    { id: CLAURE, clave: "claure", nombre: "CLAURE", casa: false },
  ],
  ventas: [
    { id: "v1", creada: "2026-11-14T18:00:00-05:00", fecha: "2026-11-14", comprobante: { tipo: "boleta", serie: "B004", numero: 1 }, items: [item("i1", CAYLA, 59.9)], pagos: [pago("yape", 59.9, { [CAYLA]: 59.9 }, "BCP")] },
    { id: "v2", creada: "2026-11-13T12:00:00-05:00", fecha: "2026-11-13", comprobante: { tipo: "nota_venta", serie: "NV06", numero: 4 }, items: [item("i2", CLAURE, 0.1), item("i3", CLAURE, 0.2, 2)], pagos: [pago("efectivo", 0.3, { [CLAURE]: 0.3 })] },
    {
      id: "v3",
      creada: "2026-10-30T12:00:00-05:00",
      fecha: "2026-10-30",
      comprobante: null,
      items: [item("i4", CAYLA, 38), item("i5", CLAURE, 60)],
      pagos: [pago("tarjeta", 58, { [CAYLA]: 22.49, [CLAURE]: 35.51 }, "Izipay"), pago("efectivo", 40, { [CAYLA]: 15.51, [CLAURE]: 24.49 })],
    },
  ],
  comisiones: [{ empresa_id: CLAURE, metodo: "tarjeta", cuenta_id: "id-Izipay", comision: 1.63 }],
};

describe("leerReportePorEmpresa", () => {
  it("lee la forma de la base", () => {
    const r = leerReportePorEmpresa(BASE)!;
    expect(r.ventas).toHaveLength(3);
    expect(r.inicio).toBe("2026-10-23");
    expect(r.ventas[2].pagos[0].partes[CLAURE]).toBe(35.51);
    expect(r.comisiones[0].comision).toBe(1.63);
  });
  it("sin fechas o sin empresas no se entiende", () => {
    expect(leerReportePorEmpresa(null)).toBeNull();
    expect(leerReportePorEmpresa({ ...BASE, desde: "ayer" })).toBeNull();
    expect(leerReportePorEmpresa({ ...BASE, empresas: [] })).toBeNull();
  });
  it("un dato roto no entra: venta sin id, pago sin medio, parte de una empresa que no está", () => {
    const r = leerReportePorEmpresa({
      ...BASE,
      ventas: [{ creada: "x", fecha: "2026-11-01" }, { ...BASE.ventas[0], pagos: [{ monto: 5 }, pago("yape", 59.9, { [CAYLA]: 59.9, otra: 3 })] }],
    })!;
    expect(r.ventas).toHaveLength(1);
    expect(r.ventas[0].pagos).toHaveLength(1);
    expect(Object.keys(r.ventas[0].pagos[0].partes)).toEqual([CAYLA]);
  });
  it("una prenda sin empresa conocida es de la casa, como en la base", () => {
    const r = leerReportePorEmpresa({ ...BASE, ventas: [{ ...BASE.ventas[0], items: [{ id: "x", empresa_id: null, cantidad: 1, subtotal: 10 }] }] })!;
    expect(r.ventas[0].prendas[0].empresaId).toBe(CAYLA);
  });
});

describe("cifrasDeLaTienda", () => {
  const c = cifrasDeLaTienda(leerReportePorEmpresa(BASE)!);
  it("suma la tienda y cada empresa, en céntimos exactos", () => {
    expect(c.vendido).toBe(158.2);
    expect(c.empresas.map((e) => [e.empresa.clave, e.vendido])).toEqual([["cayla", 97.9], ["claure", 60.3]]);
    expect(c.empresas[1].vendido).toBe(60.3); // 0.1 + 0.2 + 60 sin el 0.30000000000000004
  });
  it("una venta mixta cuenta en las dos empresas, pero una sola vez en la tienda", () => {
    expect(c.ventas).toBe(3);
    expect(c.mixtas).toBe(1);
    expect(c.empresas.map((e) => e.ventas)).toEqual([2, 2]);
  });
  it("cuenta las prendas por su cantidad", () => {
    expect(c.prendas).toBe(6);
    expect(c.empresas.map((e) => e.prendas)).toEqual([2, 4]);
  });
});

describe("el período", () => {
  const hoy = "2026-11-14";
  it("sin nada, el mes en curso hasta hoy", () => {
    expect(periodoDeUrl({}, hoy)).toEqual({ modo: "mes", mes: { anio: 2026, mes: 11 }, desde: "2026-11-01", hasta: "2026-11-14" });
  });
  it("un mes pasado va entero; uno futuro cae al de hoy", () => {
    expect(periodoDeUrl({ m: "2026-10" }, hoy)).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(periodoDeUrl({ m: "2027-01" }, hoy)).toMatchObject({ desde: "2026-11-01" });
  });
  it("desde que llegó va sin fechas: las pone la base", () => {
    const p = periodoDeUrl({ "desde-inicio": "1" }, hoy);
    expect(p).toEqual({ modo: "inicio" });
    expect(fechasParaLaBase(p)).toEqual({ desde: null, hasta: null });
  });
  it("las fechas al revés se dan vuelta, lo futuro se queda en hoy y más de seis meses se acorta desde el principio", () => {
    expect(periodoDeUrl({ desde: "2026-11-10", hasta: "2026-11-01" }, hoy)).toEqual({ modo: "fechas", desde: "2026-11-01", hasta: "2026-11-10" });
    expect(periodoDeUrl({ desde: "2026-11-01", hasta: "2026-12-31" }, hoy)).toMatchObject({ hasta: "2026-11-14" });
    expect(periodoDeUrl({ desde: "2026-01-01", hasta: "2026-11-14" }, hoy)).toMatchObject({ desde: "2026-05-13", hasta: "2026-11-14" });
  });
  it("una fecha que no existe no es una fecha", () => {
    expect(periodoDeUrl({ desde: "2026-02-30", hasta: "2026-03-01" }, hoy).modo).toBe("mes");
  });
  it("el enlace solo escribe lo que no es de siempre", () => {
    expect(hrefPorEmpresa({})).toBe("/vender/reportes/empresas");
    expect(hrefPorEmpresa({ periodo: periodoDeUrl({ m: "2026-10" }, hoy), tienda: "t1" })).toBe("/vender/reportes/empresas?m=2026-10&tienda=t1");
    expect(hrefPorEmpresa({ periodo: { modo: "inicio" } })).toBe("/vender/reportes/empresas?desde-inicio=1");
    expect(hrefPorEmpresa({ periodo: { modo: "fechas", desde: "2026-10-23", hasta: "2026-11-14" } })).toBe("/vender/reportes/empresas?desde=2026-10-23&hasta=2026-11-14");
  });
  it("en palabras", () => {
    expect(periodoEnPalabras(periodoDeUrl({}, hoy), tramoDelMes({ anio: 2026, mes: 11 }, hoy), hoy)).toBe("Noviembre 2026 (al día 14)");
    expect(periodoEnPalabras(periodoDeUrl({ m: "2026-10" }, hoy), tramoDelMes({ anio: 2026, mes: 10 }, hoy), hoy)).toBe("Octubre 2026");
    expect(periodoEnPalabras({ modo: "inicio" }, { desde: "2026-10-23", hasta: "2026-11-14" }, hoy)).toBe("Del 23 oct al 14 nov");
    expect(periodoEnPalabras({ modo: "fechas", desde: "2025-12-20", hasta: "2026-01-05" }, { desde: "2025-12-20", hasta: "2026-01-05" }, hoy)).toBe("Del 20 dic de 2025 al 5 ene de 2026");
  });
});

it("nombra las empresas juntas", () => {
  expect(nombresDeEmpresas(["CAYLA", "CLAURE"])).toBe("CAYLA y CLAURE");
  expect(nombresDeEmpresas(["A", "B", "C"])).toBe("A, B y C");
});

describe("¿Dónde está la plata?", () => {
  const r = leerReportePorEmpresa(BASE)!;
  const p = plataPorCuenta(r);
  it("una fila por cuenta y medio, en el orden en que se mueve la plata: cajón, banco, por depositar", () => {
    expect(p.filas.map((f) => [f.cuenta, f.metodo])).toEqual([["Caja", "efectivo"], ["BCP", "yape"], ["Izipay", "tarjeta"]]);
    expect(p.filas[2].abonaA).toBe("Interbank Empresas");
  });
  it("cada fila parte por empresa y suma lo cobrado con ese medio", () => {
    const caja = p.filas[0];
    expect(caja.porEmpresa).toEqual({ [CAYLA]: 15.51, [CLAURE]: 24.79 });
    expect(caja.total).toBe(40.3);
    expect(caja.ventas).toBe(2);
  });
  it("los totales de las filas son los de cada empresa y cuadran con lo vendido", () => {
    expect(p.totales).toEqual({ [CAYLA]: 97.9, [CLAURE]: 60.3 });
    expect(p.total).toBe(158.2);
    const c = cifrasDeLaTienda(r);
    expect(c.empresas.map((e) => e.vendido)).toEqual([p.totales[CAYLA], p.totales[CLAURE]]);
  });
  it("la comisión es solo de la empresa que no es la casa; sin tarifa en una máquina, no se inventa", () => {
    expect(p.comisiones).toEqual({ [CLAURE]: 1.63 });
    const sinTarifa = plataPorCuenta({ ...r, comisiones: [...r.comisiones, { empresaId: CLAURE, metodo: "qr", cuentaId: "x", comision: null }] });
    expect(sinTarifa.comisiones[CLAURE]).toBeNull();
  });
  it("lo de otra empresa en cuentas de la casa no cuenta el efectivo (lo administra Claudia)", () => {
    expect(cobradoEnCuentasDeLaCasa(r, CLAURE)).toBe(35.51);
  });
  it("un pago repartido en varias cuentas va aparte y no se adivina su cuenta", () => {
    const varias = leerReportePorEmpresa({ ...BASE, ventas: [{ ...BASE.ventas[0], pagos: [{ ...pago("tarjeta", 59.9, { [CAYLA]: 59.9 }), cuenta_id: null, cuenta: null, varias_cuentas: true }] }] })!;
    expect(plataPorCuenta(varias).filas[0]).toMatchObject({ cuenta: "Varias cuentas", cuentaId: null });
  });
});

describe("lado a lado", () => {
  const [cayla, claure] = ladoALado(leerReportePorEmpresa(BASE)!);
  it("cómo le pagaron a cada empresa: lo suyo de cada medio, del que más al que menos", () => {
    expect(claure.medios).toEqual([{ metodo: "tarjeta", monto: 35.51 }, { metodo: "efectivo", monto: 24.79 }]);
    expect(cayla.medios.map((m) => m.metodo)).toEqual(["yape", "tarjeta", "efectivo"]);
  });
  it("mes a mes, con el comprobante de cada venta (la mixta cuenta en las dos) y lo vendido solo de sus prendas", () => {
    expect(claure.meses.map((m) => [m.nombre, m.ventas, m.prendas, m.boletas, m.notas, m.sinComprobante, m.vendido])).toEqual([
      ["Octubre", 1, 1, 0, 0, 1, 60],
      ["Noviembre", 1, 3, 0, 1, 0, 0.3],
    ]);
    expect(cayla.total).toMatchObject({ ventas: 2, boletas: 1, sinComprobante: 1, vendido: 97.9 });
  });
  it("si el período cruza de año, el mes lleva su año", () => {
    const r = leerReportePorEmpresa({ ...BASE, desde: "2025-12-20" })!;
    expect(ladoALado(r)[1].meses[0].nombre).toBe("Oct 2026");
  });
});

describe("venta por venta", () => {
  const r = leerReportePorEmpresa(BASE)!;
  const ids = (f: Partial<typeof SIN_FILTRO>) => filtrarVentas(r, { ...SIN_FILTRO, ...f }).map((v) => v.id);
  it("sin filtro, todas; por empresa, las que tienen una prenda suya (la mixta en las dos)", () => {
    expect(ids({})).toEqual(["v1", "v2", "v3"]);
    expect(ids({ empresa: CLAURE })).toEqual(["v2", "v3"]);
    expect(ids({ empresa: CAYLA })).toEqual(["v1", "v3"]);
  });
  it("por comprobante, mixtas y medio", () => {
    expect(ids({ comprobante: "nota_venta" })).toEqual(["v2"]);
    expect(ids({ comprobante: "sin" })).toEqual(["v3"]);
    expect(ids({ soloMixtas: true })).toEqual(["v3"]);
    expect(ids({ metodo: "efectivo" })).toEqual(["v2", "v3"]);
  });
  it("la fila tocada de la plata lleva justo a las ventas que la suman, también con una empresa elegida", () => {
    const caja = plataPorCuenta(r).filas[0];
    expect(ids({ cuenta: caja.clave })).toEqual(["v2", "v3"]);
    expect(cobradoDelFiltro(filtrarVentas(r, { ...SIN_FILTRO, cuenta: caja.clave }), { ...SIN_FILTRO, cuenta: caja.clave })).toBe(caja.total);
    const f = { ...SIN_FILTRO, cuenta: caja.clave, empresa: CLAURE };
    expect(cobradoDelFiltro(filtrarVentas(r, f), f)).toBe(caja.porEmpresa[CLAURE]);
  });
  it("sin medio ni cuenta no hay «cobrado así»; la suma de la lista va por empresa", () => {
    expect(cobradoDelFiltro(r.ventas, SIN_FILTRO)).toBeNull();
    expect(sumaDeVentas(r.ventas, r.empresas)).toEqual({ porEmpresa: { [CAYLA]: 97.9, [CLAURE]: 60.3 }, total: 158.2, prendas: 6 });
  });
  it("a Historial por el número del comprobante; sin comprobante no hay enlace", () => {
    expect(hrefEnHistorial(r.ventas[1])).toBe("/vender/historial?q=NV06-4");
    expect(hrefEnHistorial(r.ventas[2])).toBeNull();
  });
});
