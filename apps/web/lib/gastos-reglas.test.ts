import { describe, expect, it } from "vitest";
import {
  estadoGasto,
  igvDeFactura,
  leerPanel,
  leerVer,
  mediosPara,
  mesesRecientes,
  parsearMonto,
  partirSerieNumero,
  puedeAnular,
  rangoMes,
  sugerenciaParaEgreso,
  textoMes,
  textoPago,
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
    expect(textoPago({ medioPago: null, cajaMovimientoId: null, compraId: "c", condicion: "credito", fechaVencimiento: "2026-10-12", tienePagos: false }, f)).toBe("A crédito · vence 10-12");
    expect(textoPago({ medioPago: "efectivo", cajaMovimientoId: "m", compraId: null, condicion: null, fechaVencimiento: null, tienePagos: false }, f)).toBe("Efectivo del cajón");
    expect(textoPago({ medioPago: "yape", cajaMovimientoId: null, compraId: null, condicion: null, fechaVencimiento: null, tienePagos: false }, f)).toBe("Yape");
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
