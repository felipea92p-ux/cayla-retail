import { describe, expect, it } from "vitest";
import { leerParametro } from "./impuestos-reglas";
import {
  armarRentaDelAno,
  clasePapel,
  desdeDelSistema,
  impuestoRenta,
  leerFilaSustento,
  mesesEntre,
  proyectarRenta,
  resumirSustento,
  tasaMarginal,
  type FilaSustento,
  type TasasRenta,
} from "./renta-anual-reglas";

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

  it("con lo de antes del sistema: 9 meses del contador y 1,5 del sistema proyectado a los 3 que faltan (× 2)", () => {
    const r = proyectarRenta(
      {
        utilidad: 20_000,
        costoVentas: 30_000,
        filas: [fila("mercaderia", "sin_comprobante", 15_000), fila("mercaderia", "factura", 15_000)],
        meses: 1.5,
        pagosACuenta: 900,
        previo: { meses: 9, utilidad: 150_000, sinPapel: 40_000, pagado: 4_000 },
      },
      RMT
    );
    expect(r.factor).toBe(2);
    expect(r.mesesPrevio).toBe(9);
    expect(r.utilidad).toBe(190_000); // 150 000 del contador + 20 000 × 2
    expect(r.costoNoDeducible).toBe(30_000); // la mitad del costo del sistema (× 2): la del contador ya no lo restó
    expect(r.baseRenta).toBe(220_000);
    expect(r.renta).toBe(impuestoRenta(220_000, RMT));
    expect(r.rentaConFactura).toBe(impuestoRenta(150_000, RMT)); // 190 000 − 40 000 que el contador habría restado
    expect(r.pagosACuenta).toBe(5_800);
  });

  it("si el contador ya cubre casi todo el año, el sistema no se proyecta más allá de lo que falta", () => {
    const r = proyectarRenta({ ...ano, meses: 2, previo: { meses: 11, utilidad: 0, sinPapel: 0, pagado: 0 } }, RMT);
    expect(r.factor).toBe(1);
  });

  it("los meses fuera de rango se acotan a 1–12", () => {
    expect(proyectarRenta({ ...ano, meses: 0 }, RMT).factor).toBe(12);
    expect(proyectarRenta({ ...ano, meses: 15 }, RMT).factor).toBe(1);
  });
});

describe("la tarjeta de Impuestos", () => {
  const p = (nombre: string, vigente_desde: string, valor: number) => leerParametro({ nombre, vigente_desde, valor, texto: null, provisional: false, correcciones: 0 });
  const ESCALA = [
    p("uit", "2026-01-01", 5500),
    p("renta_tramo_uit", "2017-01-01", 15),
    p("renta_tasa_tramo", "2017-01-01", 0.1),
    p("renta_tasa_resto", "2017-01-01", 0.295),
    p("boletas_tope_pct", "2017-01-01", 0.06),
    p("boletas_tope_uit", "2017-01-01", 200),
    p("renta_pago_cuenta", "2026-01-01", 0.01),
  ];
  const base = { hoy: "2026-11-02", inicioFinanzas: "2026-10-01", filas: [fila("mercaderia", "factura", 10_000)], utilidad: 5_000, costoVentas: 8_000, ventasSinIgv: 100_000 };

  it("el sistema cuenta desde el inicio de Finanzas si fue este año; si no, desde enero", () => {
    expect(desdeDelSistema(2026, "2026-10-01")).toBe("2026-10-01");
    expect(desdeDelSistema(2027, "2026-10-01")).toBe("2027-01-01");
    expect(desdeDelSistema(2026, null)).toBe("2026-01-01");
  });

  it("los meses llevan fracción: del 1 de octubre al 2 de noviembre son 1,07", () => {
    expect(mesesEntre("2026-10-01", "2026-11-02")).toBeCloseTo(33 / (365.25 / 12), 6);
    expect(mesesEntre("2026-10-01", "2026-10-01")).toBeCloseTo(1 / (365.25 / 12), 6);
  });

  it("sin la escala de la renta no hay tarjeta", () => {
    expect(armarRentaDelAno({ ...base, parametros: ESCALA.filter((x) => x.nombre !== "renta_tasa_resto") })).toBeNull();
  });

  it("sin lo del contador, el año entero sale del ritmo del sistema y lo dice", () => {
    const r = armarRentaDelAno({ ...base, parametros: ESCALA })!;
    expect(r.mesesAntes).toBe(9);
    expect(r.previoCargado).toBe(false);
    expect(r.proyeccion.mesesPrevio).toBe(0);
    expect(r.proyeccion.pagosACuenta).toBeCloseTo(1_000 * r.proyeccion.factor, 2); // 1 % de lo vendido, al mismo ritmo
  });

  it("con la utilidad del contador, cubre enero a septiembre y el sistema los tres meses que faltan", () => {
    const r = armarRentaDelAno({ ...base, parametros: [...ESCALA, p("renta_utilidad_previa", "2026-01-01", 60_000), p("renta_pagada_previa", "2026-01-01", 2_500)] })!;
    expect(r.previoCargado).toBe(true);
    expect(r.proyeccion.mesesPrevio).toBe(9);
    expect(r.proyeccion.factor).toBeCloseTo(3 / mesesEntre("2026-10-01", "2026-11-02"), 6);
    expect(r.proyeccion.utilidad).toBeCloseTo(60_000 + 5_000 * r.proyeccion.factor, 1);
  });

  it("lo del contador de OTRO año no cuenta", () => {
    const r = armarRentaDelAno({ ...base, parametros: [...ESCALA, p("renta_utilidad_previa", "2025-01-01", 60_000)] })!;
    expect(r.previoCargado).toBe(false);
  });
});
