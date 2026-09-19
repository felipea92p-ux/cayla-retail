import { describe, expect, it } from "vitest";
import { concentracionPorProveedor, cubrirCaja, detalleSeleccion, enCubetaCaja, etiquetaVence, parseMonto, partirCoincidencia, pasosDeComprobante, plazoConsumido, repartirPago, tramoDe, tramoVencimientoDe } from "./por-pagar-reglas";

// Hoy en Lima = 2026-09-18 (a las 19:30 de Lima ya es 09-19 en UTC: el caso que rompía todo).
const AHORA = new Date("2026-09-19T00:30:00Z");

describe("tramoDe", () => {
  it("lo que la base marca vencida es vencida", () => {
    expect(tramoDe({ vencida: true, fechaVencimiento: "2026-09-04" }, AHORA)).toBe("vencidas");
  });
  it("vence hoy (Lima) NO es vencida aunque el servidor ya esté en mañana", () => {
    expect(tramoDe({ vencida: false, fechaVencimiento: "2026-09-18" }, AHORA)).toBe("semana");
  });
  it("hasta 7 días es esta semana; 8 en adelante, más adelante", () => {
    expect(tramoDe({ vencida: false, fechaVencimiento: "2026-09-25" }, AHORA)).toBe("semana");
    expect(tramoDe({ vencida: false, fechaVencimiento: "2026-09-26" }, AHORA)).toBe("despues");
  });
  it("sin fecha de vencimiento va a más adelante", () => {
    expect(tramoDe({ vencida: false, fechaVencimiento: null }, AHORA)).toBe("despues");
  });
});

describe("etiquetaVence", () => {
  it("rotula en relativo", () => {
    expect(etiquetaVence("2026-09-04", AHORA)).toBe("Venció hace 14 días");
    expect(etiquetaVence("2026-09-17", AHORA)).toBe("Venció ayer");
    expect(etiquetaVence("2026-09-18", AHORA)).toBe("Vence hoy");
    expect(etiquetaVence("2026-09-19", AHORA)).toBe("Vence mañana");
    expect(etiquetaVence("2026-10-09", AHORA)).toBe("Vence en 21 días");
  });
  it("muy vencida se dice en meses", () => {
    expect(etiquetaVence("2026-07-18", AHORA)).toBe("Venció hace 2 meses");
  });
});

describe("parseMonto", () => {
  it("acepta coma decimal, vacío como 0, y rechaza basura o negativos", () => {
    expect(parseMonto("1200,5")).toBe(1200.5);
    expect(parseMonto("")).toBe(0);
    expect(Number.isNaN(parseMonto("abc"))).toBe(true);
    expect(Number.isNaN(parseMonto("-5"))).toBe(true);
  });
});

describe("repartirPago", () => {
  const deudas = [
    { id: "b", saldo: 3186, fechaVencimiento: "2026-09-19", fechaEmision: "2026-08-20" },
    { id: "a", saldo: 4720, fechaVencimiento: "2026-09-04", fechaEmision: "2026-08-05" },
  ];
  it("paga el total: cada uno queda en su saldo", () => {
    expect(repartirPago(7906, deudas)).toEqual({ a: 4720, b: 3186 });
  });
  it("paga menos: cubre primero la más vencida", () => {
    expect(repartirPago(5000, deudas)).toEqual({ a: 4720, b: 280 });
    expect(repartirPago(1000, deudas)).toEqual({ a: 1000, b: 0 });
  });
  it("si el total supera la deuda, no pasa del saldo", () => {
    expect(repartirPago(99999, deudas)).toEqual({ a: 4720, b: 3186 });
  });
  it("la suma cuadra al céntimo con decimales", () => {
    const r = repartirPago(100.1, [
      { id: "x", saldo: 33.33, fechaVencimiento: "2026-09-01", fechaEmision: "2026-08-01" },
      { id: "y", saldo: 33.33, fechaVencimiento: "2026-09-02", fechaEmision: "2026-08-01" },
      { id: "z", saldo: 99, fechaVencimiento: "2026-09-03", fechaEmision: "2026-08-01" },
    ]);
    expect(r).toEqual({ x: 33.33, y: 33.33, z: 33.44 });
    expect(Math.round((r.x + r.y + r.z) * 100)).toBe(10010);
  });
  it("empate de vencimiento: la de emisión más antigua primero", () => {
    const r = repartirPago(10, [
      { id: "nueva", saldo: 100, fechaVencimiento: "2026-09-10", fechaEmision: "2026-09-01" },
      { id: "vieja", saldo: 100, fechaVencimiento: "2026-09-10", fechaEmision: "2026-08-01" },
    ]);
    expect(r).toEqual({ vieja: 10, nueva: 0 });
  });
});

describe("detalleSeleccion", () => {
  it("dice de qué está hecho el total", () => {
    const f = (n: number) => `S/ ${n}`;
    const filas = [
      { vencida: true, fechaVencimiento: "2026-09-04", saldo: 4720 },
      { vencida: false, fechaVencimiento: "2026-09-19", saldo: 3186 },
    ];
    expect(detalleSeleccion(filas, f, AHORA)).toBe("Vencido S/ 4720 + vence esta semana S/ 3186");
  });
});

describe("tramoVencimientoDe (espejo de deuda_por_vencimiento)", () => {
  it("cuatro tramos: vencida, 0–7, 8–30, más de 30", () => {
    expect(tramoVencimientoDe({ fechaVencimiento: "2026-09-04" }, AHORA)).toBe("vencida");
    expect(tramoVencimientoDe({ fechaVencimiento: "2026-09-18" }, AHORA)).toBe("0_7");
    expect(tramoVencimientoDe({ fechaVencimiento: "2026-09-25" }, AHORA)).toBe("0_7");
    expect(tramoVencimientoDe({ fechaVencimiento: "2026-09-26" }, AHORA)).toBe("8_30");
    expect(tramoVencimientoDe({ fechaVencimiento: "2026-10-18" }, AHORA)).toBe("8_30");
    expect(tramoVencimientoDe({ fechaVencimiento: "2026-10-19" }, AHORA)).toBe("mas_30");
  });
  it("sin fecha cuenta como «vence hoy» (0–7), como en la base", () => {
    expect(tramoVencimientoDe({ fechaVencimiento: null }, AHORA)).toBe("0_7");
  });
});

describe("enCubetaCaja (espejo de salidas_caja_30d)", () => {
  const vencido = { desde: null, hasta: "2026-09-17" };
  const sem1 = { desde: "2026-09-18", hasta: "2026-09-24" };
  const despues = { desde: "2026-10-16", hasta: null };
  it("los bordes son inclusivos", () => {
    expect(enCubetaCaja({ fechaVencimiento: "2026-09-18" }, sem1, AHORA)).toBe(true);
    expect(enCubetaCaja({ fechaVencimiento: "2026-09-24" }, sem1, AHORA)).toBe(true);
    expect(enCubetaCaja({ fechaVencimiento: "2026-09-25" }, sem1, AHORA)).toBe(false);
  });
  it("lo vencido y lo de «Después» tienen un borde abierto", () => {
    expect(enCubetaCaja({ fechaVencimiento: "2026-01-01" }, vencido, AHORA)).toBe(true);
    expect(enCubetaCaja({ fechaVencimiento: "2027-01-01" }, despues, AHORA)).toBe(true);
  });
  it("sin fecha cae en la semana de hoy", () => {
    expect(enCubetaCaja({ fechaVencimiento: null }, sem1, AHORA)).toBe(true);
    expect(enCubetaCaja({ fechaVencimiento: null }, vencido, AHORA)).toBe(false);
  });
});

describe("plazoConsumido", () => {
  it("cuánto del plazo pasó: 5 ago → 4 sep son 30 días y hoy es 18 sep (ya pasó todo)", () => {
    expect(plazoConsumido({ fechaEmision: "2026-08-05", fechaVencimiento: "2026-09-04" }, AHORA)).toEqual({ usados: 44, total: 30, fraccion: 1 });
  });
  it("a medias", () => {
    const r = plazoConsumido({ fechaEmision: "2026-09-08", fechaVencimiento: "2026-09-28" }, AHORA);
    expect(r).toEqual({ usados: 10, total: 20, fraccion: 0.5 });
  });
  it("sin vencimiento no hay plazo", () => {
    expect(plazoConsumido({ fechaEmision: "2026-09-08", fechaVencimiento: null }, AHORA)).toBeNull();
  });
});

describe("cubrirCaja", () => {
  const montos = [6670, 3186, 1888, 3923.6, 2360, 1180];
  it("8 000: cubre lo vencido y a la semana siguiente le falta", () => {
    const r = cubrirCaja(8000, montos);
    expect(r.ultimaCubierta).toBe(0);
    expect(r.primeraFaltante).toEqual({ indice: 1, falta: 1856 });
    expect(r.fracciones[0]).toBe(1);
    expect(r.fracciones[1]).toBeCloseTo(1330 / 3186, 6);
    expect(r.fracciones[2]).toBe(0);
  });
  it("5 000: no alcanza ni para lo vencido", () => {
    const r = cubrirCaja(5000, montos);
    expect(r.ultimaCubierta).toBeNull();
    expect(r.primeraFaltante).toEqual({ indice: 0, falta: 1670 });
  });
  it("de sobra: cubre todo y dice cuánto sobra", () => {
    const r = cubrirCaja(30000, montos);
    expect(r.primeraFaltante).toBeNull();
    expect(r.ultimaCubierta).toBe(5);
    expect(r.sobra).toBe(10792.4);
  });
  it("una semana en cero no cuenta ni como cubierta ni como faltante", () => {
    const r = cubrirCaja(100, [0, 100, 50]);
    expect(r.ultimaCubierta).toBe(1);
    expect(r.primeraFaltante).toEqual({ indice: 2, falta: 50 });
  });
});

describe("pasosDeComprobante", () => {
  const ctx = { proveedor: "Tejidos Rímac SAC", saldoFavor: 0, notaPendiente: null, formato: (n: number) => `S/ ${n.toFixed(2)}` };
  it("vencida: pagarla primero y, si hay más del proveedor, pagarlas juntas", () => {
    const [p] = pasosDeComprobante({ vencida: true, fechaVencimiento: "2026-09-04" }, [{ saldo: 3186 }, { saldo: 3923.6 }], ctx, AHORA);
    expect(p.tono).toBe("rojo");
    expect(p.resto).toContain("venció hace 14 días");
    expect(p.resto).toContain("2 comprobantes más (S/ 7109.60)");
  });
  it("esta semana: ámbar, con el día", () => {
    const [p] = pasosDeComprobante({ vencida: false, fechaVencimiento: "2026-09-19" }, [], ctx, AHORA);
    expect(p).toMatchObject({ tono: "ambar", fuerte: "Vence mañana." });
  });
  it("lejos: sin apuro; y suma avisos de nota pendiente y saldo a favor", () => {
    const pasos = pasosDeComprobante({ vencida: false, fechaVencimiento: "2026-10-27" }, [], { ...ctx, saldoFavor: 420, notaPendiente: 236 }, AHORA);
    expect(pasos.map((p) => p.tono)).toEqual(["neutro", "ambar", "verde"]);
    expect(pasos[1].fuerte).toContain("S/ 236.00");
  });
});

describe("concentracionPorProveedor", () => {
  const provs = [
    { id: "a", nombre: "A", saldo: 500 },
    { id: "b", nombre: "B", saldo: 300 },
    { id: "c", nombre: "C", saldo: 100 },
    { id: "d", nombre: "D", saldo: 60 },
    { id: "e", nombre: "E", saldo: 40 },
    { id: "z", nombre: "Z", saldo: 0 },
  ];
  it("los 3 mayores y «Otros»; suma 100 %; ignora los de saldo 0", () => {
    const s = concentracionPorProveedor(provs);
    expect(s.map((x) => x.nombre)).toEqual(["A", "B", "C", "Otros"]);
    expect(s[3]).toMatchObject({ id: null, monto: 100 });
    expect(s.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(100, 6);
  });
  it("sin deuda no hay segmentos", () => {
    expect(concentracionPorProveedor([{ id: "z", nombre: "Z", saldo: 0 }])).toEqual([]);
  });
});

describe("partirCoincidencia", () => {
  it("resalta sin distinguir mayúsculas ni tildes", () => {
    expect(partirCoincidencia("Tejidos Rímac SAC", "rimac")).toEqual(["Tejidos ", "Rímac", " SAC"]);
    expect(partirCoincidencia("F001-000412", "0004")).toEqual(["F001-", "0004", "12"]);
  });
  it("sin coincidencia o con búsqueda vacía no parte nada", () => {
    expect(partirCoincidencia("Hilados del Norte", "zzz")).toBeNull();
    expect(partirCoincidencia("Hilados del Norte", "  ")).toBeNull();
  });
});
