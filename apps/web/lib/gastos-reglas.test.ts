import { describe, expect, it } from "vitest";
import {
  borradorDesdeFijo,
  estadoGasto,
  igvDeFactura,
  leerPanel,
  leerVer,
  mediosPara,
  mesesRecientes,
  parsearMonto,
  partirSerieNumero,
  puedeAnular,
  puedeAnularActivo,
  rangoMes,
  resumenFijos,
  sugerenciaParaEgreso,
  textoMes,
  textoPago,
  solesRedondo,
  fechaCorta,
  textoVidaUtil,
  totalesActivos,
  validarActivo,
  validarFijo,
  validarGasto,
  type BorradorGasto,
} from "./gastos-reglas";

const HOY = "2026-09-24";
const base: BorradorGasto = {
  ubicacion: "tru",
  categoria: "servicios_basicos",
  descripcion: " Luz de septiembre ",
  fecha: "2026-09-20",
  monto: "648",
  comprobante: "sin_comprobante",
  proveedorId: "",
  serie: "",
  numero: "",
  condicion: "contado",
  vence: "",
  medio: "yape",
  cajaId: "",
  egresoId: "",
  referencia: "",
};

describe("montos, IGV y meses", () => {
  it("lee montos con coma de miles y S/, y rechaza lo que no es un monto", () => {
    expect(parsearMonto("S/ 1,500.50")).toEqual({ ok: true, valor: 1500.5 });
    expect(parsearMonto("0").ok).toBe(false);
    expect(parsearMonto("12.345").ok).toBe(false);
    expect(parsearMonto("").ok).toBe(false);
  });
  it("el IGV de una factura sale del total, como en la base (648 → 98.85)", () => {
    expect(igvDeFactura(648)).toBe(98.85);
    expect(igvDeFactura(118)).toBe(18);
  });
  it("el rango de un mes incluye su último día, también en febrero bisiesto", () => {
    expect(rangoMes("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoMes("2028-02")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });
  it("los meses recientes cruzan el año y se nombran en español", () => {
    expect(mesesRecientes("2026-02-10", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
    expect(textoMes("2026-09")).toBe("septiembre 2026");
  });
});

describe("«Ver»: qué mira la pantalla", () => {
  const ubics = [{ id: "tru", nombre: "Tienda Trujillo" }, { id: "lim", nombre: "Tienda Lima" }];
  it("el líder mira, por defecto, la sede donde trabaja; puede pedir todas o lo de la empresa", () => {
    expect(leerVer(undefined, ubics, true, "lim")).toEqual({ clave: "lim", ubicacionId: "lim", soloEmpresa: false });
    expect(leerVer("todas", ubics, true, "lim")).toEqual({ clave: "todas", ubicacionId: null, soloEmpresa: false });
    expect(leerVer("empresa", ubics, true, "lim")).toEqual({ clave: "empresa", ubicacionId: null, soloEmpresa: true });
    expect(leerVer("xx", ubics, true, null).clave).toBe("todas");
  });
  it("quien no es líder ve solo su tienda, aunque la URL pida otra cosa", () => {
    expect(leerVer("empresa", [ubics[0]!], false, "lim")).toEqual({ clave: "tru", ubicacionId: "tru", soloEmpresa: false });
  });
});

describe("el formulario", () => {
  it("sin comprobante, por Yape: sin comprobante ni caja, la descripción sin espacios de más", () => {
    const r = validarGasto(base, HOY);
    expect(r).toEqual({
      ok: true,
      valor: {
        p_ubicacion_id: "tru", p_categoria: "servicios_basicos", p_descripcion: "Luz de septiembre", p_fecha: "2026-09-20", p_monto_total: 648,
        p_comprobante: null, p_medio_pago: "yape", p_caja_id: null, p_caja_movimiento_id: null, p_referencia: null,
      },
    });
  });
  it("en efectivo, pide la caja abierta; con ella, la manda", () => {
    expect(validarGasto({ ...base, medio: "efectivo" }, HOY).ok).toBe(false);
    const r = validarGasto({ ...base, medio: "efectivo", cajaId: "caja1" }, HOY);
    expect(r.ok && r.valor.p_caja_id).toBe("caja1");
  });
  it("factura a crédito: sin medio ni caja, con vencimiento; la serie va en mayúsculas", () => {
    const r = validarGasto({ ...base, comprobante: "factura", proveedorId: "p1", serie: "s120", numero: "560233", condicion: "credito", vence: "2026-10-12", medio: "" }, HOY);
    expect(r.ok && r.valor.p_comprobante).toEqual({ tipo: "factura", proveedor_id: "p1", serie: "S120", numero: "560233", condicion: "credito", fecha_vencimiento: "2026-10-12" });
    expect(r.ok && r.valor.p_medio_pago).toBe(null);
  });
  it("a crédito sin vencimiento, o que vence antes de la fecha: se pide", () => {
    const b = { ...base, comprobante: "factura" as const, proveedorId: "p1", serie: "F1", numero: "1", condicion: "credito" as const, medio: "" as const };
    expect(validarGasto({ ...b, vence: "" }, HOY).ok).toBe(false);
    expect(validarGasto({ ...b, vence: "2026-09-01" }, HOY).ok).toBe(false);
  });
  it("con comprobante pide proveedor, serie y número", () => {
    expect(validarGasto({ ...base, comprobante: "boleta" }, HOY)).toEqual({ ok: false, error: "Elige el proveedor del comprobante." });
    expect(validarGasto({ ...base, comprobante: "boleta", proveedorId: "p1" }, HOY)).toEqual({ ok: false, error: "Escribe la serie y el número del comprobante." });
  });
  it("«de la empresa» va sin tienda; la fecha futura no pasa", () => {
    const r = validarGasto({ ...base, ubicacion: "empresa" }, HOY);
    expect(r.ok && r.valor.p_ubicacion_id).toBe(null);
    expect(validarGasto({ ...base, fecha: "2026-09-25" }, HOY).ok).toBe(false);
  });
  it("F3b · «Salió de»: en efectivo de la caja fuerte basta la cuenta (sin caja); la cuenta viaja a la base", () => {
    const r = validarGasto({ ...base, medio: "efectivo", cuentaId: "fuerte" }, HOY);
    expect(r.ok && [r.valor.p_caja_id, r.valor.p_cuenta_id]).toEqual([null, "fuerte"]);
    const banco = validarGasto({ ...base, medio: "transferencia", cuentaId: "bcp" }, HOY);
    expect(banco.ok && banco.valor.p_cuenta_id).toBe("bcp");
  });
  it("F3b · a crédito o clasificando un egreso, no viaja ninguna cuenta (la dice el pago o el egreso)", () => {
    const credito = validarGasto({ ...base, comprobante: "factura", proveedorId: "p1", serie: "F1", numero: "1", condicion: "credito", vence: "2026-10-12", medio: "", cuentaId: "bcp" }, HOY);
    expect(credito.ok && "p_cuenta_id" in credito.valor).toBe(false);
    const egreso = validarGasto({ ...base, medio: "", egresoId: "eg1", cuentaId: "bcp" }, HOY);
    expect(egreso.ok && "p_cuenta_id" in egreso.valor).toBe(false);
  });
  it("clasificar un egreso: efectivo, sin caja nueva, con el egreso", () => {
    const r = validarGasto({ ...base, medio: "", egresoId: "eg1" }, HOY);
    expect(r.ok && [r.valor.p_medio_pago, r.valor.p_caja_id, r.valor.p_caja_movimiento_id]).toEqual(["efectivo", null, "eg1"]);
  });
  it("el depósito solo existe con comprobante", () => {
    expect(mediosPara("sin_comprobante")).not.toContain("deposito");
    expect(mediosPara("factura")).toContain("deposito");
    expect(validarGasto({ ...base, medio: "deposito" }, HOY).ok).toBe(false);
  });
  it("parte «F001-00140» en serie y número (sin ceros a la izquierda)", () => {
    expect(partirSerieNumero("f001-00140")).toEqual({ serie: "F001", numero: "140" });
    expect(partirSerieNumero("E001 12")).toEqual({ serie: "E001", numero: "12" });
    expect(partirSerieNumero("nada")).toEqual({ serie: "", numero: "" });
  });
});

describe("estado, anular y cómo se pagó", () => {
  it("con factura: por pagar, pago parcial o pagado; sin factura, pagado; anulado es anulado", () => {
    expect(estadoGasto({ estado: "vigente", compraId: "c", saldo: 648, montoTotal: 648 })).toBe("por_pagar");
    expect(estadoGasto({ estado: "vigente", compraId: "c", saldo: 48, montoTotal: 648 })).toBe("parcial");
    expect(estadoGasto({ estado: "vigente", compraId: "c", saldo: 0, montoTotal: 648 })).toBe("pagado");
    expect(estadoGasto({ estado: "vigente", compraId: null, saldo: null, montoTotal: 10 })).toBe("pagado");
    expect(estadoGasto({ estado: "anulado", compraId: "c", saldo: 648, montoTotal: 648 })).toBe("anulado");
  });
  it("un gasto con factura ya pagada no se anula; uno sin factura, sí", () => {
    expect(puedeAnular({ estado: "vigente", compraId: "c", tienePagos: true })).toBe(false);
    expect(puedeAnular({ estado: "vigente", compraId: "c", tienePagos: false })).toBe(true);
    expect(puedeAnular({ estado: "vigente", compraId: null, tienePagos: false })).toBe(true);
    expect(puedeAnular({ estado: "anulado", compraId: null, tienePagos: false })).toBe(false);
  });
  it("cómo se pagó, en una línea", () => {
    const f = (iso: string) => iso.slice(5);
    expect(textoPago({ medioPago: null, cajaMovimientoId: null, compraId: "c", condicion: "credito", fechaVencimiento: "2026-10-12", tienePagos: false, saldo: 100, estado: "vigente", ubicacionNombre: "Tienda TRU" }, f)).toBe("vence 10-12");
    expect(textoPago({ medioPago: "transferencia", cajaMovimientoId: null, compraId: "c", condicion: "credito", fechaVencimiento: "2026-10-12", tienePagos: true, saldo: 0, estado: "vigente", ubicacionNombre: "Tienda TRU" }, f)).toBe("Transferencia");
    expect(textoPago({ medioPago: "efectivo", cajaMovimientoId: "m", compraId: null, condicion: null, fechaVencimiento: null, tienePagos: false, saldo: null, estado: "vigente", ubicacionNombre: "Tienda TRU" }, f)).toBe("Cajón · Tienda TRU");
    expect(textoPago({ medioPago: "yape", cajaMovimientoId: null, compraId: null, condicion: null, fechaVencimiento: null, tienePagos: false, saldo: null, estado: "vigente", ubicacionNombre: null }, f)).toBe("Yape");
  });

  it("formatos del spike: cifras redondas y «23 sep»", () => {
    expect(solesRedondo(5472.4)).toBe("S/ 5,472");
    expect(fechaCorta("2026-09-03")).toBe("3 sep");
    expect(fechaCorta("2026-09-23", true)).toBe("23 sep 2026");
  });
  it("lo que se propone al clasificar un egreso, según el motivo de la tienda", () => {
    expect(sugerenciaParaEgreso("Depósito bancario")).toBe("deposito");
    expect(sugerenciaParaEgreso("Retiro de efectivo")).toBe("retiro");
    expect(sugerenciaParaEgreso("Ajuste de caja (faltante)")).toBe("ajuste");
    expect(sugerenciaParaEgreso("Compra de insumos")).toBe("gasto");
    expect(sugerenciaParaEgreso("Otro")).toBe("gasto");
  });
  it("lee el panel de la base (numéricos como texto) sin perder nada", () => {
    const p = leerPanel({ total: "202.50", igv: "0", n: 3, por_pagar: "48.00", por_categoria: [{ categoria: "publicidad", nombre: "Publicidad", cuenta: "637", monto: "150", n: 1 }], por_ubicacion: [{ ubicacion_id: null, nombre: "De la empresa", monto: "800", n: 1 }] });
    expect(p.total).toBe(202.5);
    expect(p.porPagar).toBe(48);
    expect(p.porCategoria[0]!.monto).toBe(150);
    expect(p.porUbicacion[0]!.ubicacionId).toBe(null);
  });
});

describe("F2b: activos fijos", () => {
  const activo = { ...base, tipo: "muebles", nombre: " Estante en L ", serie: "", vidaUtilMeses: "120", ubicacion: "tru" };
  it("arma lo que pide registrar_activo: el mismo pago que un gasto, más qué es y su vida útil", () => {
    const r = validarActivo(activo, HOY);
    expect(r.ok && r.valor).toMatchObject({ p_ubicacion_id: "tru", p_tipo: "muebles", p_nombre: "Estante en L", p_serie: null, p_vida_util_meses: 120, p_medio_pago: "yape", p_monto_total: 648 });
    expect(r.ok && "p_categoria" in r.valor).toBe(false);
  });
  it("un activo siempre está en una ubicación, no llega con recibo por honorarios y vive de 1 a 50 años", () => {
    expect(validarActivo({ ...activo, ubicacion: "empresa" }, HOY).ok).toBe(false);
    expect(validarActivo({ ...activo, comprobante: "recibo_por_honorarios" }, HOY).ok).toBe(false);
    expect(validarActivo({ ...activo, vidaUtilMeses: "6" }, HOY).ok).toBe(false);
    expect(validarActivo({ ...activo, vidaUtilMeses: "601" }, HOY).ok).toBe(false);
  });
  it("vida útil en palabras", () => {
    expect(textoVidaUtil(120)).toBe("10 años");
    expect(textoVidaUtil(12)).toBe("1 año");
    expect(textoVidaUtil(18)).toBe("1 año y 6 meses");
  });
  it("los totales cuentan solo lo que está en uso, y lo que ya acabó su vida no suma al mes", () => {
    const a = { estado: "activo", costo: 2000, depreciacionAcumulada: 50, valorHoy: 1950, depreciacionMensual: 16.67, mesesDepreciados: 3, vidaUtilMeses: 120 };
    const acabado = { ...a, costo: 1200, depreciacionAcumulada: 1200, valorHoy: 0, depreciacionMensual: 100, mesesDepreciados: 12, vidaUtilMeses: 12 };
    const baja = { ...a, estado: "baja" };
    expect(totalesActivos([a, acabado, baja] as never)).toEqual({ costo: 3200, depreciado: 1250, valorHoy: 1950, alMes: 16.67, enUso: 2 });
  });
  it("con la factura pagada no se anula: se da de baja", () => {
    expect(puedeAnularActivo({ estado: "activo", compraId: "c", tienePagos: true })).toBe(false);
    expect(puedeAnularActivo({ estado: "activo", compraId: "c", tienePagos: false })).toBe(true);
    expect(puedeAnularActivo({ estado: "baja", compraId: null, tienePagos: false })).toBe(false);
  });
});

describe("F2b: gastos fijos", () => {
  const fijo = {
    id: "f1", ubicacionId: "tru", ubicacionNombre: "Tienda Trujillo", categoria: "servicios_basicos", categoriaNombre: "Servicios básicos",
    descripcion: "Luz", proveedorId: "p1", proveedorNombre: "Hidrandina", comprobanteTipo: "boleta" as const, monto: 180, montoVariable: true,
    diaDelMes: 10, fechaEsperada: "2026-09-10", estado: "falta" as const, gastoId: null, gastoMonto: null,
  };
  it("un gasto que nace de un fijo trae su tienda, categoría, proveedor y comprobante; si el monto varía, no lo inventa", () => {
    expect(borradorDesdeFijo(fijo, HOY)).toEqual({ gastoFijoId: "f1", ubicacion: "tru", categoria: "servicios_basicos", descripcion: "Luz", comprobante: "boleta", proveedorId: "p1", monto: "", fecha: "2026-09-10" });
    expect(borradorDesdeFijo({ ...fijo, montoVariable: false, fechaEsperada: "2026-09-28" }, HOY)).toMatchObject({ monto: "180", fecha: HOY });
  });
  it("el gasto que nace de un fijo manda su fijo a la base", () => {
    const r = validarGasto({ ...base, gastoFijoId: "f1" }, HOY);
    expect(r.ok && r.valor.p_gasto_fijo_id).toBe("f1");
    expect(validarGasto(base, HOY).ok && "p_gasto_fijo_id" in (validarGasto(base, HOY) as { valor: object }).valor).toBe(false);
  });
  it("el resumen del mes: cuántos faltan, cuántos vienen y cuánto queda por registrar", () => {
    const vienen = { ...fijo, id: "f2", estado: "por_llegar" as const, monto: 2500 };
    const listo = { ...fijo, id: "f3", estado: "registrado" as const };
    expect(resumenFijos([fijo, vienen, listo])).toEqual({ faltan: 1, vienen: 1, registrados: 1, montoPendiente: 2680 });
  });
  it("el día va del 1 al 28 y el monto es obligatorio", () => {
    const b = { ubicacion: "tru", categoria: "alquileres", descripcion: "Alquiler", proveedorId: "", comprobante: "factura" as const, monto: "2500", variable: false, dia: "1" };
    expect(validarFijo(b).ok && validarFijo(b)).toMatchObject({ valor: { p_ubicacion_id: "tru", p_proveedor_id: null, p_dia_del_mes: 1, p_monto: 2500 } });
    expect(validarFijo({ ...b, dia: "31" }).ok).toBe(false);
    expect(validarFijo({ ...b, monto: "" }).ok).toBe(false);
    expect(validarFijo({ ...b, ubicacion: "empresa" }).ok && validarFijo({ ...b, ubicacion: "empresa" })).toMatchObject({ valor: { p_ubicacion_id: null } });
  });
});
