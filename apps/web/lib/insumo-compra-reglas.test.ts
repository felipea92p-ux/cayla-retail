import { describe, expect, it } from "vitest";
import { argsDeCompra, lineaAlLibro, problemasDeCompra, problemasDeLineas, subtotalDelPapel, totalAPagar, totalesDeCompra, vencimientoPorDefecto, type CompraDeInsumo, type LineaEscrita } from "./insumo-compra-reglas";

// P03 del «Análisis del Taller» (Felipe, 2-nov-2026) y ADR-0614: «Llegó una compra» pide proveedor y deja su deuda. Estas reglas dicen qué falta antes de guardar y arman lo que se le manda
// a `registrar_compra_de_insumos`; la base vuelve a exigirlo todo (esto solo guía).

const base: CompraDeInsumo = {
  proveedorId: "prov-1",
  tipo: "factura",
  serie: "F001",
  numero: "123",
  sinPapel: false,
  pagada: false,
  emision: "2026-11-02",
  vence: "2026-12-02",
  lineas: [{ insumoId: "i-1", cantidad: 10, costoUnitario: 5, codigoLote: " L-9 " }],
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

const leer = {
  cantidad: (t: string) => { const n = Number(t); return t.trim() === "" || !Number.isFinite(n) ? null : n; },
  precio: (t: string) => { const n = Number(t); return t.trim() === "" || !Number.isFinite(n) ? null : n; },
};
const escrita = (o: Partial<LineaEscrita> = {}): LineaEscrita => ({ clave: "a", insumoId: "i-1", como: "libro", cantidad: "10", precio: "5", rinde: "", codigoLote: "", ...o });

describe("lineaAlLibro — pasa lo comprado a la unidad del libro", () => {
  it("en la unidad del libro no cambia nada", () => {
    expect(lineaAlLibro(escrita(), leer)).toMatchObject({ cantidad: 10, costoUnitario: 5 });
    expect(lineaAlLibro(escrita(), leer)?.nota).toBeUndefined();
  });
  it("por kilo: 100 kg a S/ 18 con rinde 3.47 son 347 m a S/ 5.1873, y lo deja escrito", () => {
    expect(lineaAlLibro(escrita({ como: "kilo", cantidad: "100", precio: "18", rinde: "3.47" }), leer)).toMatchObject({ cantidad: 347, costoUnitario: 5.1873, nota: "100 kg × 3.47 m/kg" });
  });
  it("por rollo: 2 rollos de 50 m a S/ 300 son 100 m a S/ 6", () => {
    expect(lineaAlLibro(escrita({ como: "rollo", cantidad: "2", precio: "300", rinde: "50" }), leer)).toMatchObject({ cantidad: 100, costoUnitario: 6, nota: "2 rollos × 50 m/rollo" });
  });
  it("sin rinde, sin cantidad o sin insumo no hay línea", () => {
    expect(lineaAlLibro(escrita({ como: "kilo", rinde: "" }), leer)).toBeNull();
    expect(lineaAlLibro(escrita({ cantidad: "0" }), leer)).toBeNull();
    expect(lineaAlLibro(escrita({ precio: "" }), leer)).toBeNull();
    expect(lineaAlLibro(escrita({ insumoId: "" }), leer)).toBeNull();
  });
  it("precio cero sí vale: una tela regalada es una línea", () => {
    expect(lineaAlLibro(escrita({ precio: "0" }), leer)).toMatchObject({ costoUnitario: 0 });
  });
});

describe("totalAPagar — en una factura manda el papel", () => {
  const kilos = [{ insumoId: "i-1", cantidad: 347, costoUnitario: 5.1873 }];
  it("factura: S/ 1,800 + IGV, aunque en metros la cuenta dé S/ 1,799.99", () => {
    expect(totalAPagar({ lineas: kilos, subtotalDelPapel: 1800, tipo: "factura", sinPapel: false })).toBe(2124);
  });
  it("boleta o sin papel: la suma de las líneas, porque la base lo exige", () => {
    expect(totalAPagar({ lineas: kilos, subtotalDelPapel: 1800, tipo: "boleta", sinPapel: false })).toBe(1799.99);
    expect(totalAPagar({ lineas: kilos, subtotalDelPapel: 1800, tipo: "factura", sinPapel: true })).toBe(1799.99);
  });
});

describe("problemasDeLineas y subtotalDelPapel", () => {
  it("una línea completa no tiene problemas", () => {
    expect(problemasDeLineas([escrita()], leer)).toEqual([]);
  });
  it("pide al menos una línea, el insumo, y no deja repetirlo", () => {
    expect(problemasDeLineas([], leer)).toHaveLength(1);
    expect(problemasDeLineas([escrita({ insumoId: "" })], leer)[0]).toContain("Elige qué llegó");
    expect(problemasDeLineas([escrita(), escrita({ clave: "b" })], leer)[0]).toContain("una sola vez");
  });
  it("suma lo escrito × su precio, sin pasar por metros", () => {
    expect(subtotalDelPapel([escrita({ como: "kilo", cantidad: "100", precio: "18", rinde: "3.47" }), escrita({ cantidad: "4", precio: "2.5" })], leer)).toBe(1810);
  });
});

describe("argsDeCompra — lo que se le manda a la base", () => {
  const ids = { tallerId: "t-1", nota: "  ", token: "tok" };
  it("a crédito: condición, vencimiento, sin pago, y las líneas limpias", () => {
    const a = argsDeCompra(base, ids);
    expect(a).toMatchObject({ p_ubicacion_id: "t-1", p_proveedor_id: "prov-1", p_tipo: "factura", p_serie: "F001", p_numero: "123", p_sin_papel: false, p_condicion: "credito", p_fecha_emision: "2026-11-02", p_fecha_vencimiento: "2026-12-02", p_igv_porcentaje: 18, p_token: "tok" });
    expect(a.p_lineas).toEqual([{ insumo_id: "i-1", cantidad: 10, costo_unitario: 5, codigo_lote: "L-9", nota: undefined }]);
    expect(a.p_pago).toBeUndefined();
    expect(a.p_nota).toBeUndefined();
  });
  it("factura manda su total; sin papel, ni total ni serie", () => {
    expect(argsDeCompra(base, ids).p_total).toBe(59);
    const sp = argsDeCompra({ ...base, sinPapel: true }, ids);
    expect([sp.p_total, sp.p_serie, sp.p_numero, sp.p_sin_papel]).toEqual([undefined, undefined, undefined, true]);
  });
  it("«ya la pagué» manda los medios y no el vencimiento", () => {
    const a = argsDeCompra({ ...base, pagada: true, medios: [{ metodo: "efectivo", monto: 59 }] }, ids);
    expect([a.p_condicion, a.p_fecha_vencimiento, a.p_pago]).toEqual(["contado", undefined, [{ metodo: "efectivo", monto: 59 }]]);
  });
});
