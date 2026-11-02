import { describe, expect, it } from "vitest";
import { clasePapel, impuestoRenta, leerFilaSustento, proyectarRenta, resumirSustento, tasaMarginal, type FilaSustento, type TasasRenta } from "./renta-anual-reglas";

// Régimen MYPE Tributario con la UIT de 2026 (en la pantalla salen de los parámetros tributarios, no de aquí).
const RMT: TasasRenta = { uit: 5500, tramoUit: 15, tasaTramo: 0.1, tasaResto: 0.295, topeBoletasPct: 0.06, topeBoletasUit: 200 };

const fila = (origen: FilaSustento["origen"], papel: string, monto: number, proveedor: string | null = "Proveedor"): FilaSustento => ({
  origen,
  proveedorId: proveedor ? `id-${proveedor}` : null,
  proveedor,
  papel,
  documentos: 1,
  monto,
});

describe("el papel de cada costo", () => {
  it("factura, recibo y planilla de movilidad restan; boleta y ticket con tope; lo demás no", () => {
    expect(["factura", "recibo_por_honorarios", "planilla_movilidad"].map(clasePapel)).toEqual(["sustenta", "sustenta", "sustenta"]);
    expect(["boleta", "ticket"].map(clasePapel)).toEqual(["con_tope", "con_tope"]);
    expect(["nota_venta", "sin_comprobante"].map(clasePapel)).toEqual(["no_sustenta", "no_sustenta"]);
  });

  it("un papel que la regla no conoce no resta (lo prudente)", () => {
    expect(clasePapel("papel_nuevo")).toBe("no_sustenta");
  });

  it("lee la fila de la base", () => {
    expect(leerFilaSustento({ origen: "taller", proveedor_id: "p1", proveedor: "Hilos", papel: "factura", documentos: 2, monto: "50.00" })).toEqual(
      { origen: "taller", proveedorId: "p1", proveedor: "Hilos", papel: "factura", documentos: 2, monto: 50 }
    );
    expect(leerFilaSustento({ origen: "gasto", proveedor_id: null, proveedor: null, papel: "sin_comprobante", documentos: 1, monto: 50 }).proveedor).toBeNull();
  });
});

describe("la escala de la renta", () => {
  it("10 % hasta 15 UIT y 29,5 % sobre el resto", () => {
    expect(impuestoRenta(82_500, RMT)).toBe(8_250);
    expect(impuestoRenta(300_000, RMT)).toBe(72_412.5);
    expect(impuestoRenta(780_000, RMT)).toBe(214_012.5);
  });

  it("sin utilidad no hay renta", () => {
    expect(impuestoRenta(0, RMT)).toBe(0);
    expect(impuestoRenta(-40_000, RMT)).toBe(0);
  });

  it("la tasa del último sol depende del tramo", () => {
    expect(tasaMarginal(50_000, RMT)).toBe(0.1);
    expect(tasaMarginal(90_000, RMT)).toBe(0.295);
  });
});

describe("cuánto del costo tiene papel", () => {
  it("separa inventario (mercadería y Taller) de gastos", () => {
    const s = resumirSustento([fila("mercaderia", "factura", 600), fila("taller", "sin_comprobante", 400), fila("gasto", "nota_venta", 50)], RMT);
    expect(s.inventario).toEqual({ total: 1000, sustenta: 600, conTope: 0, noSustenta: 400 });
    expect(s.pctInventarioSinSustento).toBe(0.4);
    expect(s.gastoNoDeducible).toBe(50);
  });

  it("las boletas restan hasta el 6 % de lo sustentado y el exceso no resta", () => {
    const s = resumirSustento([fila("gasto", "factura", 10_000), fila("gasto", "boleta", 1_000)], RMT);
    expect(s.boletasQueRestan).toBe(600);
    expect(s.boletasQueNoRestan).toBe(400);
    expect(s.gastoNoDeducible).toBe(400);
  });

  it("el exceso de boletas se reparte entre inventario y gastos según cuánto aportó cada uno", () => {
    const s = resumirSustento([fila("gasto", "factura", 10_000), fila("mercaderia", "boleta", 750), fila("gasto", "boleta", 250)], RMT);
    expect(s.boletasQueNoRestan).toBe(400);
    expect(s.gastoNoDeducible).toBe(100);
    expect(s.pctInventarioSinSustento).toBeCloseTo(300 / 750, 10);
  });

  it("el tope de las boletas no pasa de 200 UIT", () => {
    const s = resumirSustento([fila("gasto", "factura", 100_000_000), fila("gasto", "boleta", 5_000_000)], RMT);
    expect(s.boletasQueRestan).toBe(200 * 5_500);
  });

  it("una nota de crédito (monto negativo) resta de su bolsa", () => {
    const s = resumirSustento([fila("mercaderia", "factura", 1000), fila("mercaderia", "factura", -100)], RMT);
    expect(s.inventario.sustenta).toBe(900);
  });

  it("sin compras, nada que proporcionar", () => {
    expect(resumirSustento([], RMT).pctInventarioSinSustento).toBe(0);
  });
});

describe("la renta de marzo", () => {
  // El ejemplo que se le dio a Felipe (2026-11-02): S/ 1,2 millones de venta, 40 % de costo sin factura, 35 % de gastos con factura.
  const ano = {
    utilidad: 300_000,
    costoVentas: 480_000,
    filas: [fila("mercaderia", "sin_comprobante", 480_000), fila("gasto", "factura", 420_000)],
    meses: 12,
    pagosACuenta: 12_000,
  };

  it("el costo sin factura se suma a la utilidad: de S/ 72 mil a S/ 214 mil", () => {
    const r = proyectarRenta(ano, RMT);
    expect(r.costoNoDeducible).toBe(480_000);
    expect(r.baseRenta).toBe(780_000);
    expect(r.rentaConFactura).toBe(72_412.5);
    expect(r.renta).toBe(214_012.5);
    expect(r.cuestaSinFactura).toBe(141_600);
    expect(r.faltaEnMarzo).toBe(202_012.5);
    expect(r.tasaMarginal).toBe(0.295);
  });

  it("con todo el costo con factura, la renta es la de la utilidad contable", () => {
    const r = proyectarRenta({ ...ano, filas: [fila("mercaderia", "factura", 480_000), fila("gasto", "factura", 420_000)] }, RMT);
    expect(r.cuestaSinFactura).toBe(0);
    expect(r.renta).toBe(72_412.5);
  });

  it("con tres meses de datos, proyecta el año a ese ritmo (× 4)", () => {
    const r = proyectarRenta({ ...ano, utilidad: 75_000, costoVentas: 120_000, filas: [fila("mercaderia", "sin_comprobante", 120_000), fila("gasto", "factura", 105_000)], meses: 3, pagosACuenta: 3_000 }, RMT);
    expect(r.factor).toBe(4);
    expect(r.renta).toBe(214_012.5);
    expect(r.pagosACuenta).toBe(12_000);
  });

  it("lo pagado a cuenta que pasa la renta no deja saldo negativo", () => {
    const r = proyectarRenta({ ...ano, utilidad: 10_000, filas: [fila("mercaderia", "factura", 480_000)], pagosACuenta: 12_000 }, RMT);
    expect(r.renta).toBe(1_000);
    expect(r.faltaEnMarzo).toBe(0);
  });

  it("en pérdida contable, el costo sin factura igual puede dejar renta", () => {
    const r = proyectarRenta({ ...ano, utilidad: -50_000, costoVentas: 100_000, filas: [fila("mercaderia", "sin_comprobante", 100_000)] }, RMT);
    expect(r.rentaConFactura).toBe(0);
    expect(r.baseRenta).toBe(50_000);
    expect(r.renta).toBe(5_000);
  });

  it("los meses fuera de rango se acotan a 1–12", () => {
    expect(proyectarRenta({ ...ano, meses: 0 }, RMT).factor).toBe(12);
    expect(proyectarRenta({ ...ano, meses: 15 }, RMT).factor).toBe(1);
  });
});
