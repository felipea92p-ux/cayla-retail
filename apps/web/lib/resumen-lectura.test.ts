import { describe, expect, it } from "vitest";
import { analizarVarianteComparacion, type DatosPeriodo, type FilaComparacion } from "./resumen-comparacion";
import { analizarDesempeno, dividirPeriodo, type Mitades } from "./resumen-desempeno";
import { lecturaComparacion, lecturaDesempeno } from "./resumen-lectura";

// La lectura de cada variante: siete reglas en orden y gana la primera. Lo que se prueba es el ORDEN (una
// variante que se agotó y además aceleró dice «se agotó») y que cada regla pida la evidencia que promete.

const COSTO = 40;
const periodo = (o: Partial<DatosPeriodo> = {}): DatosPeriodo => ({ ventas: 0, devoluciones: 0, importe: 0, costoVentas: COSTO * (o.ventas ?? 0), costoDevoluciones: 0, unidadesSinCosto: 0, entradas: 0, stockInicio: 0, stockCierre: 0, diasConStock: 15, ...o });

function fila(o: { ledger?: boolean; a?: Partial<DatosPeriodo>; b?: Partial<DatosPeriodo> } = {}): FilaComparacion {
  return {
    varianteId: "v1",
    productoId: "p1",
    productoCodigo: null,
    productoEstado: "activo",
    referencia: "Blusa Emma",
    categoriaId: "c1",
    categoria: "Blusas",
    sku: "BE-NE-S",
    codigo: null,
    codigosBarras: [],
    talla: "S",
    colorCodigo: "NE",
    color: "Negro",
    colorHex: null,
    costo: COSTO,
    estadoCosto: "oficial",
    ledgerConsistente: o.ledger ?? true,
    a: periodo(o.a),
    b: periodo(o.b),
  };
}

const M30: Mitades = dividirPeriodo({ desde: "2026-09-01", hasta: "2026-09-30" });
const M7: Mitades = dividirPeriodo({ desde: "2026-09-24", hasta: "2026-09-30" });
const des = (o: Parameters<typeof fila>[0], m: Mitades = M30) => lecturaDesempeno(analizarDesempeno(fila(o), m), m.dias);
const cmp = (o: Parameters<typeof fila>[0], diasB = 30) => lecturaComparacion(analizarVarianteComparacion(fila(o), 30, diasB), diasB);

describe("lecturaDesempeno: siete reglas, gana la primera", () => {
  it("1 · un historial que no cuadra no afirma nada más: cifras estimadas", () => {
    expect(des({ ledger: false, a: { ventas: 5, stockInicio: 10 }, b: { ventas: 5, stockCierre: 0 } })).toMatchObject({ regla: "estimada", tono: "ambar" });
  });

  it("2 · vendió y cerró en 0: se agotó, en rojo, aunque además haya acelerado", () => {
    const l = des({ a: { ventas: 2, stockInicio: 10 }, b: { ventas: 8, stockCierre: 0 } });
    expect(l).toMatchObject({ regla: "agotada", tono: "rojo", texto: "Se agotó en el período: pendiente reponer" });
  });

  it("3 · sin ventas y con stock en un período largo: liquidar o trasladar; en una semana no se afirma", () => {
    expect(des({ a: { stockInicio: 30 }, b: { stockCierre: 30 } })).toMatchObject({ regla: "sin_ventas", texto: "Sin ventas con 30 u. en stock: liquidar o trasladar" });
    // 7 días: no vender no dice nada todavía; con 30 u. paradas y 0 % vendido, cae en «rota lento».
    expect(des({ a: { stockInicio: 30 }, b: { stockCierre: 30 } }, M7)?.regla).toBe("rota_lento");
  });

  it("4 · el ritmo de la 2.ª mitad contra la 1.ª (±25 %)", () => {
    expect(des({ a: { ventas: 3, stockInicio: 50 }, b: { ventas: 9, stockCierre: 38 } })).toMatchObject({ regla: "acelero", tono: "verde", texto: "Aceleró +200% en la 2.ª mitad" });
    expect(des({ a: { ventas: 9, stockInicio: 50 }, b: { ventas: 3, stockCierre: 38 } })).toMatchObject({ regla: "desacelero", tono: "ambar", texto: "Desaceleró −67% en la 2.ª mitad" });
  });

  it("5 · vendió el 80 % o más de lo disponible", () => {
    expect(des({ a: { ventas: 4, stockInicio: 10 }, b: { ventas: 4, stockCierre: 2 } })).toMatchObject({ regla: "vendio_casi_todo", tono: "verde", texto: "Vendió el 80% de lo disponible" });
  });

  it("6 · rota lento: menos del 15 % vendido con 20 u. o más al cierre; con pocas unidades, no", () => {
    expect(des({ a: { ventas: 1, stockInicio: 40 }, b: { ventas: 1, stockCierre: 38 } })).toMatchObject({ regla: "rota_lento", texto: "Rota lento: 38 u. al cierre" });
    expect(des({ a: { ventas: 1, stockInicio: 12 }, b: { ventas: 0, stockCierre: 11 } })?.regla).toBe("sin_cambio");
  });

  it("7 · con datos y sin ninguna regla: sin cambio relevante", () => {
    expect(des({ a: { ventas: 3, stockInicio: 20 }, b: { ventas: 3, stockCierre: 14 } })).toMatchObject({ regla: "sin_cambio", tono: "neutro" });
  });

  it("sin nada medible (ni stock ni ventas ni días con stock): null, la celda dice «—»", () => {
    expect(des({ a: { diasConStock: 0 }, b: { diasConStock: 0 } })).toBeNull();
  });
});

describe("lecturaComparacion: las mismas reglas, sobre B y frente a A", () => {
  it("1 · cifras estimadas antes que cualquier cambio", () => {
    expect(cmp({ ledger: false, a: { ventas: 5, stockInicio: 50, stockCierre: 45 }, b: { ventas: 15, stockInicio: 45, stockCierre: 30 } })?.regla).toBe("estimada");
  });

  it("2 · se agotó en B gana a «aceleró»", () => {
    expect(cmp({ a: { ventas: 2, stockInicio: 10, stockCierre: 8 }, b: { ventas: 8, stockInicio: 8, stockCierre: 0 } })).toMatchObject({ regla: "agotada", texto: "Se agotó en B: pendiente reponer" });
  });

  it("3 · sin ventas en B con stock parado", () => {
    expect(cmp({ a: { ventas: 6, stockInicio: 45, stockCierre: 39 }, b: { stockInicio: 39, stockCierre: 39 } })).toMatchObject({ regla: "sin_ventas", texto: "Sin ventas con 39 u. en stock: liquidar o trasladar" });
  });

  it("4 · el cambio más importante de A a B, con su número; un filtro activo manda sobre la prioridad", () => {
    const o = { a: { ventas: 5, stockInicio: 50, stockCierre: 45 }, b: { ventas: 15, stockInicio: 45, stockCierre: 30 } };
    expect(cmp(o)).toMatchObject({ regla: "acelero", tono: "verde", texto: "Aceleró +200% frente a A" });
    const x = analizarVarianteComparacion(fila(o), 30, 30);
    expect(x.mejoroRotacion).toBe(true);
    expect(lecturaComparacion(x, 30, "mejoro_rotacion")?.regla).toBe("mejoro_rotacion");
  });

  it("4 · un cambio de sell-through se dice en puntos, con su signo", () => {
    // Mismo ritmo y misma rotación; en B entró stock, así que vendió una parte menor de lo disponible.
    const l = cmp({ a: { ventas: 6, stockInicio: 20, stockCierre: 14 }, b: { ventas: 6, stockInicio: 20, entradas: 20, stockCierre: 14 } });
    expect(l).toMatchObject({ regla: "sell_through_baja", tono: "ambar", texto: "Sell-through bajó −15 pp" });
  });

  it("5 · vendió el 80 % o más en B, sin otro cambio", () => {
    const igual = { ventas: 8, stockInicio: 10, stockCierre: 2 };
    expect(cmp({ a: igual, b: igual })).toMatchObject({ regla: "vendio_casi_todo", texto: "Vendió el 80% de lo disponible" });
  });

  it("7 · sin cambio relevante cuando nada se movió", () => {
    const igual = { ventas: 4, stockInicio: 20, stockCierre: 16 };
    expect(cmp({ a: igual, b: igual })).toMatchObject({ regla: "sin_cambio", tono: "neutro" });
  });
});
