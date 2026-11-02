import { describe, expect, it } from "vitest";
import { argsDeCompra, problemasDeCompra, totalesDeCompra, vencimientoPorDefecto, type CompraDeInsumo } from "./insumo-compra-reglas";

// P03 del «Análisis del Taller» (Felipe, 2-nov-2026): «Ingresar insumo ▸ Compra» pide proveedor y deja su deuda. Estas reglas dicen qué falta antes de guardar y arman lo que se le manda
// a `recibir_insumo_comprado`; la base vuelve a exigirlo todo (esto solo guía).

const base: CompraDeInsumo = {
  proveedorId: "prov-1",
  tipo: "factura",
  serie: "F001",
  numero: "123",
  sinPapel: false,
  pagada: false,
  emision: "2026-11-02",
  vence: "2026-12-02",
  cantidad: 10,
  costoUnitario: 5,
  medios: [],
};

describe("totalesDeCompra — lo mismo que redondea la base (por línea, y el IGV solo en una factura)", () => {
  it("una factura al 18 %: subtotal 50.00, IGV 9.00, total 59.00", () => {
    expect(totalesDeCompra(10, 5, "factura")).toEqual({ subtotal: 50, igv: 9, total: 59 });
  });
  it("una boleta o una nota de venta no llevan IGV aparte", () => {
    expect(totalesDeCompra(10, 5, "boleta")).toEqual({ subtotal: 50, igv: 0, total: 50 });
    expect(totalesDeCompra(10, 5, "nota_venta")).toEqual({ subtotal: 50, igv: 0, total: 50 });
  });
  it("redondea por línea a centavos: 3 × 0.045 = 0.135 → 0.14 (mitad hacia arriba), no 0.13", () => {
    expect(totalesDeCompra(3, 0.045, "boleta").subtotal).toBe(0.14);
  });
});

describe("vencimientoPorDefecto", () => {
  it("emisión + el plazo del proveedor; sin plazo, 30 días", () => {
    expect(vencimientoPorDefecto("2026-11-02", 15)).toBe("2026-11-17");
    expect(vencimientoPorDefecto("2026-11-02", null)).toBe("2026-12-02");
    expect(vencimientoPorDefecto("2026-11-30", 7)).toBe("2026-12-07");
  });
});

describe("problemasDeCompra — lo que falta antes de guardar", () => {
  it("una compra completa a crédito no tiene problemas", () => {
    expect(problemasDeCompra(base)).toEqual([]);
  });
  it("sin proveedor, o sin serie y número, dice qué falta (y no lista lo que sí está)", () => {
    expect(problemasDeCompra({ ...base, proveedorId: "" }).map((p) => p.campo)).toEqual(["proveedor"]);
    expect(problemasDeCompra({ ...base, serie: "", numero: "" }).map((p) => p.campo)).toEqual(["documento"]);
    expect(problemasDeCompra({ ...base, serie: "F001", numero: "  " }).map((p) => p.campo)).toEqual(["documento"]);
  });
  it("«todavía no tengo el papel» no pide serie ni número", () => {
    expect(problemasDeCompra({ ...base, sinPapel: true, serie: "", numero: "" })).toEqual([]);
  });
  it("a crédito pide el vencimiento, y no anterior a la emisión", () => {
    expect(problemasDeCompra({ ...base, vence: "" }).map((p) => p.campo)).toEqual(["vencimiento"]);
    expect(problemasDeCompra({ ...base, vence: "2026-10-01" }).map((p) => p.campo)).toEqual(["vencimiento"]);
  });
  it("«ya la pagué» exige que los medios sumen EXACTAMENTE el total (con IGV)", () => {
    const pagada = { ...base, pagada: true };
    expect(problemasDeCompra(pagada).map((p) => p.campo)).toEqual(["pago"]);
    expect(problemasDeCompra({ ...pagada, medios: [{ metodo: "efectivo", monto: 59 }] })).toEqual([]);
    expect(problemasDeCompra({ ...pagada, medios: [{ metodo: "efectivo", monto: 40 }, { metodo: "yape", monto: 19 }] })).toEqual([]);
    expect(problemasDeCompra({ ...pagada, medios: [{ metodo: "efectivo", monto: 58 }] }).map((p) => p.campo)).toEqual(["pago"]);
    expect(problemasDeCompra({ ...pagada, medios: [{ metodo: "efectivo", monto: 60 }] }).map((p) => p.campo)).toEqual(["pago"]);
  });
  it("«ya la pagué» no pide vencimiento", () => {
    expect(problemasDeCompra({ ...base, pagada: true, vence: "", medios: [{ metodo: "efectivo", monto: 59 }] })).toEqual([]);
  });
});

describe("argsDeCompra — lo que se le manda a la base", () => {
  const ids = { insumoId: "i-1", tallerId: "t-1", codigoLote: " L-9 ", nota: "  ", token: "tok" };
  it("a crédito: condición, vencimiento y sin pago", () => {
    expect(argsDeCompra(base, ids)).toMatchObject({
      p_insumo_id: "i-1", p_ubicacion_id: "t-1", p_proveedor_id: "prov-1", p_cantidad: 10, p_costo_unitario: 5,
      p_tipo: "factura", p_serie: "F001", p_numero: "123", p_sin_papel: false, p_condicion: "credito",
      p_fecha_emision: "2026-11-02", p_fecha_vencimiento: "2026-12-02", p_igv_porcentaje: 18, p_codigo_lote: "L-9", p_token: "tok",
    });
    expect(argsDeCompra(base, ids).p_pago).toBeUndefined();
    expect(argsDeCompra(base, ids).p_nota).toBeUndefined();
  });
  it("al contado: condición contado, sin vencimiento y con sus medios de pago", () => {
    const a = argsDeCompra({ ...base, pagada: true, medios: [{ metodo: "efectivo", monto: 59 }] }, ids);
    expect(a.p_condicion).toBe("contado");
    expect(a.p_fecha_vencimiento).toBeUndefined();
    expect(a.p_pago).toEqual([{ metodo: "efectivo", monto: 59 }]);
  });
  it("sin papel: no manda serie ni número y la base pone la nota de venta provisional", () => {
    const a = argsDeCompra({ ...base, sinPapel: true, serie: "F001", numero: "123" }, ids);
    expect(a.p_sin_papel).toBe(true);
    expect(a.p_serie).toBeUndefined();
    expect(a.p_numero).toBeUndefined();
  });
});
