import { describe, expect, it } from "vitest";
import { analizarVarianteComparacion, calcularKpis, mejoroRotacion, ordenarComparacion, rankingRotacion, type DatosPeriodo, type FilaComparacion } from "./resumen-comparacion";
import { analizarDesempeno, dividirPeriodo, ordenarDesempeno } from "./resumen-desempeno";
import {
  AYUDA_ROTACION,
  baseRotacionDeVariante,
  calcularRotacion,
  cogsNeto,
  costoEsVerificable,
  inventarioPromedioACosto,
  rotacionAgregada,
  rotacionComparada,
  TEXTO_MOTIVO_ROTACION,
  valorInventario,
  variacionRotacionPct,
  type BaseRotacion,
} from "./rotacion";

// ROTACIÓN = COGS del período ÷ inventario promedio a costo. Estas pruebas fijan la definición oficial:
// una sola fórmula (`rotacion.ts`), en soles a costo, sobre el mismo universo, y N/D —nunca un número
// inventado— cuando falta costo o historial. Una VARIANTE es estricta (sin dato = N/D); un AGREGADO se
// calcula sobre el universo confiable (Σ COGS ÷ Σ inventario promedio de las variantes válidas) y dice
// cuántas dejó fuera; y A contra B se compara sobre las variantes válidas en los dos períodos.

type EntradaVariante = Parameters<typeof baseRotacionDeVariante>[0];
const variante = (o: Partial<EntradaVariante> = {}): EntradaVariante => ({
  costoVentas: 0,
  costoDevoluciones: 0,
  unidadesSinCosto: 0,
  stockInicio: 0,
  stockCierre: 0,
  costo: 40,
  estadoCosto: "oficial",
  ledgerConsistente: true,
  ...o,
});
const base = (o: Partial<EntradaVariante> = {}) => baseRotacionDeVariante(variante(o));
const rota = (o: Partial<EntradaVariante> = {}) => calcularRotacion(base(o));

/** Una variante a la que ninguna venta dio costo: rotación N/D por `ventas_sin_costo`. */
const sinCostoDeVenta = () => base({ costoVentas: 0, unidadesSinCosto: 3, stockInicio: 5, stockCierre: 5 });

describe("costo verificable y valor del inventario", () => {
  it("solo un costo positivo, oficial o declarado, sirve para valorar (la regla del «Capital en inventario»)", () => {
    expect(costoEsVerificable(40, "oficial")).toBe(true);
    expect(costoEsVerificable(40, "declarado")).toBe(true);
    expect(costoEsVerificable(40, "alterado")).toBe(false);
    expect(costoEsVerificable(40, "sin_costo")).toBe(false);
    expect(costoEsVerificable(40, null)).toBe(false);
    expect(costoEsVerificable(null, "oficial")).toBe(false);
    expect(costoEsVerificable(0, "oficial")).toBe(false);
  });

  it("valor = unidades × costo; sin unidades vale 0 y no hace falta costo; con unidades y sin costo verificable es null", () => {
    expect(valorInventario(10, 40, "oficial")).toBe(400);
    expect(valorInventario(0, null, "sin_costo")).toBe(0);
    expect(valorInventario(-3, 40, "oficial")).toBe(0); // un stock reconstruido negativo no resta valor
    expect(valorInventario(10, null, "sin_costo")).toBeNull();
    expect(valorInventario(10, 40, "alterado")).toBeNull();
  });
});

describe("COGS del período", () => {
  it("costo de lo vendido menos costo de lo devuelto, sin bajar de cero", () => {
    expect(cogsNeto({ costoVentas: 200, costoDevoluciones: 40, unidadesSinCosto: 0 })).toBe(160);
    expect(cogsNeto({ costoVentas: 40, costoDevoluciones: 200, unidadesSinCosto: 0 })).toBe(0);
    expect(cogsNeto({ costoVentas: 0, costoDevoluciones: 0, unidadesSinCosto: 0 })).toBe(0);
  });

  it("si alguna unidad vendida o devuelta no tiene costo, no hay COGS confiable: null", () => {
    expect(cogsNeto({ costoVentas: 200, costoDevoluciones: 0, unidadesSinCosto: 1 })).toBeNull();
  });
});

describe("rotación de una variante (estricta)", () => {
  it("COGS válido + inventario promedio válido: COGS ÷ ((valor al inicio + valor al cierre) ÷ 2)", () => {
    // COGS 600; inventario 10×40 = 400 al inicio y 5×40 = 200 al cierre → promedio 300 → 2 veces.
    const r = rota({ costoVentas: 600, stockInicio: 10, stockCierre: 5 });
    expect(r).toMatchObject({ calculable: true, veces: 2, motivo: null, cogs: 600, inventarioPromedio: 300, metodo: "extremos" });
  });

  it("es plata a costo contra plata a costo: no depende del precio ni de las unidades", () => {
    // Mismas unidades, distinto costo de la venta (30 ese día, 40 hoy): la rotación es COGS ÷ inventario a costo.
    const r = rota({ costoVentas: 9 * 30, stockInicio: 10, stockCierre: 5 });
    expect(r.veces).toBeCloseTo(270 / 300, 5);
    expect(r.veces).not.toBeCloseTo(9 / 7.5, 2); // unidades ÷ unidades promedio daría 1.2
  });

  it("inventario promedio = 0: N/D (nunca Infinity), aunque haya ventas", () => {
    const conVentas = rota({ costoVentas: 200, stockInicio: 0, stockCierre: 0 });
    expect(conVentas.veces).toBeNull();
    expect(conVentas.calculable).toBe(false);
    expect(conVentas.motivo).toBe("sin_inventario");
    expect(rota({}).veces).toBeNull(); // ni ventas ni inventario: nada que rotar
  });

  it("producto sin ventas pero con inventario: rota 0 veces (es un dato, no N/D)", () => {
    const r = rota({ stockInicio: 6, stockCierre: 6 });
    expect(r.veces).toBe(0);
    expect(r.calculable).toBe(true);
    expect(r.motivo).toBeNull();
  });

  it("ausencia de costo en lo vendido: N/D, aunque el inventario sí tenga costo", () => {
    const r = rota({ costoVentas: 0, unidadesSinCosto: 3, stockInicio: 10, stockCierre: 10 });
    expect(r.veces).toBeNull();
    expect(r.motivo).toBe("ventas_sin_costo");
  });

  it("ausencia de costo en el stock: N/D con stock sin costo verificable; con stock 0 no hace falta costo", () => {
    for (const estado of ["sin_costo", "alterado"] as const) {
      const r = rota({ costoVentas: 200, stockInicio: 10, stockCierre: 10, costo: estado === "sin_costo" ? null : 40, estadoCosto: estado });
      expect(r.veces).toBeNull();
      expect(r.motivo).toBe("inventario_sin_valor");
    }
    const sinStock = rota({ costoVentas: 200, stockInicio: 0, stockCierre: 0, costo: null, estadoCosto: "sin_costo" });
    expect(sinStock.motivo).toBe("sin_inventario"); // no es «falta costo»: simplemente no hubo inventario
  });

  it("ausencia de inventario inicial o final: N/D", () => {
    const sinInicio: BaseRotacion = { cogs: 200, inventarioInicio: null, inventarioCierre: 300 };
    const sinCierre: BaseRotacion = { cogs: 200, inventarioInicio: 300, inventarioCierre: null };
    expect(calcularRotacion(sinInicio)).toMatchObject({ veces: null, motivo: "inventario_sin_valor" });
    expect(calcularRotacion(sinCierre)).toMatchObject({ veces: null, motivo: "inventario_sin_valor" });
  });

  it("con el historial de movimientos inconsistente el stock al inicio no es fiable: N/D", () => {
    const r = rota({ costoVentas: 200, stockInicio: 10, stockCierre: 10, ledgerConsistente: false });
    expect(r.veces).toBeNull();
    expect(r.motivo).toBe("inventario_sin_valor");
  });

  it("devoluciones: reducen el COGS con el costo de lo que se devuelve", () => {
    // Vendió 10 (COGS 400), devolvieron 2 (costo 80): COGS neto 320.
    const r = rota({ costoVentas: 400, costoDevoluciones: 80, stockInicio: 20, stockCierre: 20 });
    expect(r.cogs).toBe(320);
    expect(r.veces).toBeCloseTo(320 / 800, 5);
    // Devolver más de lo vendido en el período no da una rotación negativa.
    expect(rota({ costoVentas: 40, costoDevoluciones: 200, stockInicio: 10, stockCierre: 10 }).veces).toBe(0);
  });

  it("los motivos de N/D tienen texto para mostrar", () => {
    for (const texto of Object.values(TEXTO_MOTIVO_ROTACION)) expect(texto.length).toBeGreaterThan(10);
  });
});

describe("variación de la rotación A → B", () => {
  const a = rota({ costoVentas: 300, stockInicio: 10, stockCierre: 5 }).veces; // 300 ÷ 300 = 1
  const b = rota({ costoVentas: 450, stockInicio: 10, stockCierre: 5 }).veces; // 450 ÷ 300 = 1.5

  it("A válido y B válido: (B − A) ÷ A", () => {
    expect(a).toBe(1);
    expect(b).toBe(1.5);
    expect(variacionRotacionPct(a, b)).toBeCloseTo(50, 5);
    expect(variacionRotacionPct(b, a)).toBeCloseTo(-33.333, 2);
  });

  it("A = 0: no hay base para un porcentaje → N/D", () => {
    expect(variacionRotacionPct(0, 1.5)).toBeNull();
  });

  it("A o B en N/D: N/D", () => {
    expect(variacionRotacionPct(null, 1.5)).toBeNull();
    expect(variacionRotacionPct(1, null)).toBeNull();
    expect(variacionRotacionPct(null, null)).toBeNull();
  });

  it("A y B se calculan cada uno con SU COGS y SU inventario, nunca mezclados", () => {
    // B tiene el doble de inventario y el mismo COGS: rota la mitad, sin contaminar a A.
    const rA = rota({ costoVentas: 300, stockInicio: 10, stockCierre: 5 }).veces!;
    const rB = rota({ costoVentas: 300, stockInicio: 20, stockCierre: 10 }).veces!;
    expect(rB).toBeCloseTo(rA / 2, 5);
    expect(variacionRotacionPct(rA, rB)).toBeCloseTo(-50, 5);
  });
});

describe("agregado: se calcula sobre el universo confiable", () => {
  // Producto P1 (categoría C1) con dos variantes, P2 (categoría C2) con una, y una variante enorme.
  const x1 = variante({ costoVentas: 800, stockInicio: 10, stockCierre: 10, costo: 100 }); // COGS 800 · inventario 1.000 → 0.8
  const x2 = variante({ costoVentas: 100, stockInicio: 50, stockCierre: 50, costo: 20 }); // COGS 100 · inventario 1.000 → 0.1
  const y1 = variante({ costoVentas: 300, stockInicio: 30, stockCierre: 10, costo: 30 }); // COGS 300 · inventario (900 → 300) promedio 600 → 0.5
  const grande = variante({ costoVentas: 100, stockInicio: 450, stockCierre: 450, costo: 20 }); // COGS 100 · inventario 9.000 → 0.011

  it("A) 3 variantes, 2 válidas y 1 inválida: Σ COGS de las 2 ÷ Σ inventario promedio de las MISMAS 2, y dice cuántas quedaron fuera", () => {
    const r = rotacionAgregada([base(x1), base(x2), sinCostoDeVenta()]);
    expect(r.veces).toBeCloseTo(900 / 2000, 5);
    // Ni el COGS ni el inventario de la inválida entran (su stock valía 5 × 40 = 200 y no está en el denominador).
    expect(r).toMatchObject({ cogs: 900, inventarioPromedio: 2000, totalVariantes: 3, variantesValidas: 2, variantesExcluidas: 1 });
    expect(r.porcentajeVariantesValidas).toBeCloseTo(66.667, 2);
    expect(r.excluidasPorMotivo).toEqual({ ventas_sin_costo: 1, inventario_sin_valor: 0, sin_inventario: 0 });
    // Es exactamente lo que da el conjunto sin la inválida.
    expect(r.veces).toBe(rotacionAgregada([base(x1), base(x2)]).veces);
  });

  it("una variante con COGS pero sin inventario válido tampoco aporta su COGS: si entrara solo el numerador, el cociente mezclaría universos", () => {
    const vendioSinInventario = base({ costoVentas: 500, stockInicio: 0, stockCierre: 0 }); // COGS 500 válido · sin inventario promedio
    const vendioStockSinCosto = base({ costoVentas: 700, stockInicio: 10, stockCierre: 10, costo: null, estadoCosto: "sin_costo" }); // COGS 700 válido · stock sin costo
    const r = rotacionAgregada([base(x1), base(x2), vendioSinInventario, vendioStockSinCosto]);
    expect(r).toMatchObject({ cogs: 900, inventarioPromedio: 2000, variantesValidas: 2, variantesExcluidas: 2 });
    expect(r.veces).toBeCloseTo(0.45, 5); // 900 ÷ 2.000; con los 500 y los 700 en el numerador daría 1.05
  });

  it("B) es razón de sumas, NO el promedio de las razones: una variante de inventario enorme pesa lo que pesa su inventario", () => {
    const rx1 = rota(x1).veces!; // 0.8
    const rGrande = rota(grande).veces!; // 0.011
    const promedioDeRazones = (rx1 + rGrande) / 2; // 0.406 — lo que daría promediar filas
    const r = rotacionAgregada([base(x1), base(grande)]);
    expect(r.veces).toBeCloseTo(900 / 10_000, 5); // Σ COGS ÷ Σ inventario promedio = 0.09
    expect(r.veces).not.toBeCloseTo(promedioDeRazones, 2);
    // Y con los dos inventarios parejos las dos formas coinciden: la diferencia es el peso, no la cuenta.
    expect(rotacionAgregada([base(x1), base(x2)]).veces).toBeCloseTo((0.8 + 0.1) / 2, 5);
  });

  it("razón de sumas también con inventarios que cambian entre el inicio y el cierre", () => {
    // x1 + y1: COGS 800 + 300 = 1.100; inventario al inicio 1.000 + 900 y al cierre 1.000 + 300 → promedio (1.900 + 1.300) ÷ 2 = 1.600.
    const r = rotacionAgregada([base(x1), base(y1)]);
    expect(r.veces).toBeCloseTo(1100 / 1600, 5);
    expect(r.veces).not.toBeCloseTo((0.8 + 0.5) / 2, 2); // el promedio de las razones daría 0.65
  });

  it("C) todas inválidas: el agregado es N/D (nunca 0, NaN ni Infinity) y el universo lo cuenta", () => {
    const sinInventario = base({ costoVentas: 200 }); // vendió y no hubo inventario promedio
    const r = rotacionAgregada([sinCostoDeVenta(), sinInventario]);
    expect(r.veces).toBeNull();
    expect(r).toMatchObject({ cogs: 0, inventarioPromedio: 0, totalVariantes: 2, variantesValidas: 0, variantesExcluidas: 2, porcentajeVariantesValidas: 0 });
    expect(r.excluidasPorMotivo).toEqual({ ventas_sin_costo: 1, inventario_sin_valor: 0, sin_inventario: 1 });
  });

  it("un conjunto vacío es N/D, sin porcentaje (no se divide por cero)", () => {
    const r = rotacionAgregada([]);
    expect(r.veces).toBeNull();
    expect(r).toMatchObject({ totalVariantes: 0, variantesValidas: 0, variantesExcluidas: 0, porcentajeVariantesValidas: null });
  });

  it("si TODAS son válidas no hay nada excluido", () => {
    const r = rotacionAgregada([base(x1), base(x2)]);
    expect(r).toMatchObject({ variantesExcluidas: 0, porcentajeVariantesValidas: 100 });
    expect(r.excluidasPorMotivo).toEqual({ ventas_sin_costo: 0, inventario_sin_valor: 0, sin_inventario: 0 });
  });

  it("una variante sin ventas pero con inventario SÍ cuenta: su inventario baja la rotación del total (stock parado)", () => {
    const parada = base({ stockInicio: 10, stockCierre: 10 }); // COGS 0 · inventario 400
    const r = rotacionAgregada([base(x1), parada]);
    expect(r.variantesValidas).toBe(2);
    expect(r.veces).toBeCloseTo(800 / 1400, 5);
  });

  it("cada variante excluida cuenta UNA vez, con su motivo (stock sin costo, historial inconsistente y falta de inventario)", () => {
    const sinCostoStock = base({ costoVentas: 100, stockInicio: 10, stockCierre: 10, costo: null, estadoCosto: "sin_costo" });
    const ledgerRoto = base({ costoVentas: 100, stockInicio: 10, stockCierre: 10, ledgerConsistente: false });
    const sinInventario = base({ costoVentas: 100 });
    const r = rotacionAgregada([base(x1), sinCostoDeVenta(), sinCostoStock, ledgerRoto, sinInventario]);
    expect(r.excluidasPorMotivo).toEqual({ ventas_sin_costo: 1, inventario_sin_valor: 2, sin_inventario: 1 });
    expect(r.variantesExcluidas).toBe(4);
    expect(r.variantesValidas + r.variantesExcluidas).toBe(r.totalVariantes);
  });

  it("filtrar cambia numerador Y denominador a la vez: cada categoría solo cuenta su COGS y su inventario", () => {
    const todo = rotacionAgregada([base(x1), base(x2), base(y1)]);
    const soloC1 = rotacionAgregada([base(x1), base(x2)]);
    const soloC2 = rotacionAgregada([base(y1)]);
    expect(soloC1.cogs).toBe(900);
    expect(soloC2.cogs).toBe(300);
    expect(todo.cogs).toBe(1200);
    expect(todo.inventarioPromedio).toBeCloseTo(soloC1.inventarioPromedio + soloC2.inventarioPromedio, 5);
    expect(rotacionAgregada([base(x1)]).veces).toBeCloseTo(0.8, 5); // una variante: su COGS y su inventario
  });

  it("cada variante aporta su propio promedio (temporal si lo tiene, si no el de dos puntos): el agregado no duplica el método", () => {
    const con: BaseRotacion = { cogs: 100, inventarioInicio: 200, inventarioCierre: 200, inventarioPromedioTemporal: 300 };
    const sin: BaseRotacion = { cogs: 100, inventarioInicio: 200, inventarioCierre: 200 };
    expect(rotacionAgregada([con, con]).inventarioPromedio).toBe(600);
    expect(rotacionAgregada([con, sin]).inventarioPromedio).toBe(300 + 200);
    expect(rotacionAgregada([con, sin]).veces).toBeCloseTo(200 / 500, 5);
  });
});

describe("comparar A vs B: universo común", () => {
  const ok = (cogs: number, unidades: number, costo = 40): BaseRotacion => base({ costoVentas: cogs, stockInicio: unidades, stockCierre: unidades, costo });
  const v1 = { a: ok(300, 10), b: ok(600, 10) }; // A: 300 ÷ 400 · B: 600 ÷ 400
  const v2 = { a: ok(100, 25), b: ok(200, 25) }; // A: 100 ÷ 1.000 · B: 200 ÷ 1.000
  const v3 = { a: ok(500, 5), b: sinCostoDeVenta() }; // válida en A, inválida en B
  const v4 = { a: sinCostoDeVenta(), b: ok(700, 5) }; // inválida en A, válida en B

  it("D) A tiene 1, 2 y 3; B tiene 1, 2 y 4; solo la 1 y la 2 son válidas en los dos: A y B se calculan SOLO con esas", () => {
    const r = rotacionComparada([v1, v2, v3, v4]);
    expect(r.a).toBeCloseTo(400 / 1400, 5); // (300 + 100) ÷ (400 + 1.000)
    expect(r.b).toBeCloseTo(800 / 1400, 5); // (600 + 200) ÷ (400 + 1.000): las MISMAS dos
    expect(r.deltaPct).toBeCloseTo(100, 5);
    expect(r).toMatchObject({ cogsA: 400, inventarioPromedioA: 1400, cogsB: 800, inventarioPromedioB: 1400 });
    expect(r).toMatchObject({ totalVariantes: 4, variantesValidas: 2, variantesExcluidas: 2, validasEnA: 3, validasEnB: 3 });
    // Si A usara todas sus válidas (con la 3) y B las suyas (con la 4), compararía universos distintos.
    expect(r.a).not.toBeCloseTo(rotacionAgregada([v1.a, v2.a, v3.a]).veces!, 2);
    expect(r.b).not.toBeCloseTo(rotacionAgregada([v1.b, v2.b, v4.b]).veces!, 2);
  });

  it("cada excluida cuenta una vez, con el motivo de A si A falló y si no el de B", () => {
    const sinInventarioEnB = base({ costoVentas: 100 }); // A válida, B sin inventario promedio
    const dosMotivos = { a: sinCostoDeVenta(), b: base({ costoVentas: 100 }) }; // A ventas_sin_costo Y B sin_inventario → cuenta por A
    const r = rotacionComparada([v1, v3, { a: ok(100, 5), b: sinInventarioEnB }, dosMotivos]);
    expect(r.excluidasPorMotivo).toEqual({ ventas_sin_costo: 2, inventario_sin_valor: 0, sin_inventario: 1 });
    expect(r.variantesExcluidas).toBe(3);
    expect(r.variantesValidas).toBe(1);
  });

  it("sin ninguna variante válida en los dos períodos: N/D en A, en B y en la variación", () => {
    const r = rotacionComparada([v3, v4]);
    expect(r).toMatchObject({ a: null, b: null, deltaPct: null, variantesValidas: 0, validasEnA: 1, validasEnB: 1, totalVariantes: 2 });
    expect(rotacionComparada([])).toMatchObject({ a: null, b: null, deltaPct: null, totalVariantes: 0, porcentajeVariantesValidas: null });
  });

  it("todas comparables: nada excluido, y A y B coinciden con el agregado de cada período", () => {
    const r = rotacionComparada([v1, v2]);
    expect(r.variantesExcluidas).toBe(0);
    expect(r.a).toBe(rotacionAgregada([v1.a, v2.a]).veces);
    expect(r.b).toBe(rotacionAgregada([v1.b, v2.b]).veces);
  });

  it("E) A = 0: la variación porcentual es N/D (no Infinity) y B se sigue mostrando", () => {
    const sinVentasEnA = { a: base({ stockInicio: 10, stockCierre: 10 }), b: ok(400, 10) }; // A: inventario y nada vendido → 0 · B: 400 ÷ 400
    const r = rotacionComparada([sinVentasEnA]);
    expect(r.a).toBe(0);
    expect(r.b).toBeCloseTo(1, 5);
    expect(r.deltaPct).toBeNull();
  });
});

describe("una sola fórmula: el helper y sus consumidores dicen lo mismo", () => {
  const COSTO = 40;
  const datos = (o: Partial<DatosPeriodo>): DatosPeriodo => ({ ventas: 0, devoluciones: 0, importe: 0, costoVentas: 0, costoDevoluciones: 0, unidadesSinCosto: 0, entradas: 0, stockInicio: 0, stockCierre: 0, diasConStock: 15, ...o });
  const fila = (id: string, a: Partial<DatosPeriodo>, b: Partial<DatosPeriodo>, extra: Partial<FilaComparacion> = {}): FilaComparacion => ({
    varianteId: id,
    productoId: "p1",
    productoCodigo: null,
    productoEstado: "activo",
    referencia: `Prenda ${id}`,
    categoriaId: "c1",
    categoria: "Casacas",
    sku: id,
    codigo: null,
    codigosBarras: [],
    talla: "M",
    colorCodigo: "BE",
    color: "Beige",
    colorHex: null,
    costo: COSTO,
    estadoCosto: "oficial",
    ledgerConsistente: true,
    a: datos(a),
    b: datos(b),
    ...extra,
  });
  const f1 = fila("v1", { ventas: 6, costoVentas: 6 * 30, stockInicio: 10, stockCierre: 12 }, { ventas: 9, costoVentas: 9 * 30, stockInicio: 12, stockCierre: 8 });
  const f2 = fila("v2", { ventas: 2, costoVentas: 2 * 30, stockInicio: 30, stockCierre: 30 }, { ventas: 1, costoVentas: 1 * 30, stockInicio: 30, stockCierre: 29 });
  const comparar = (filas: FilaComparacion[]) => filas.map((f) => analizarVarianteComparacion(f, 30, 30));

  const helper = (d: DatosPeriodo, f: FilaComparacion) => calcularRotacion(baseRotacionDeVariante({ ...d, costo: f.costo, estadoCosto: f.estadoCosto, ledgerConsistente: f.ledgerConsistente })).veces;

  it("Comparar períodos: la rotación de A y de B de cada fila es la del helper", () => {
    const x = analizarVarianteComparacion(f1, 30, 30);
    expect(x.a.rotacion).toBe(helper(f1.a, f1));
    expect(x.b.rotacion).toBe(helper(f1.b, f1));
    expect(x.deltaRotacionPct).toBe(variacionRotacionPct(helper(f1.a, f1), helper(f1.b, f1)));
  });

  it("Desempeño: la rotación del período entero es la del helper sobre las dos mitades juntas", () => {
    const m = dividirPeriodo({ desde: "2026-09-01", hasta: "2026-09-30" });
    const entero: DatosPeriodo = datos({ ventas: 15, costoVentas: 15 * 30, stockInicio: 10, stockCierre: 8, diasConStock: 30 });
    expect(analizarDesempeno(f1, m).periodo.rotacion).toBe(helper(entero, f1));
  });

  it("Comparar períodos, KPI: es la del agregado sobre el universo filtrado (y con una sola fila, la de la fila)", () => {
    const universo = comparar([f1, f2]);
    const kpi = calcularKpis(universo).rotacion;
    expect(kpi.b).toBe(rotacionAgregada(universo.map((x) => x.b.baseRotacion)).veces);
    expect(kpi.a).toBe(rotacionAgregada(universo.map((x) => x.a.baseRotacion)).veces);
    const solo = calcularKpis([universo[0]]).rotacion;
    expect(solo.a).toBe(universo[0].a.rotacion);
    expect(solo.b).toBe(universo[0].b.rotacion);
  });

  it("D) KPI de Comparar: A con las variantes 1, 2 y 3, B con la 1, 2 y 4 → el KPI usa solo la 1 y la 2, en los dos períodos", () => {
    const g1 = fila("g1", { ventas: 6, costoVentas: 180, stockInicio: 10, stockCierre: 10 }, { ventas: 12, costoVentas: 360, stockInicio: 10, stockCierre: 10 });
    const g2 = fila("g2", { ventas: 2, costoVentas: 60, stockInicio: 25, stockCierre: 25 }, { ventas: 4, costoVentas: 120, stockInicio: 25, stockCierre: 25 });
    const g3 = fila("g3", { ventas: 9, costoVentas: 270, stockInicio: 20, stockCierre: 20 }, {}); // en B no tuvo stock ni ventas
    const g4 = fila("g4", {}, { ventas: 9, costoVentas: 270, stockInicio: 20, stockCierre: 20 }); // en A no tuvo stock ni ventas
    const kpi = calcularKpis(comparar([g1, g2, g3, g4])).rotacion;
    const soloComunes = calcularKpis(comparar([g1, g2])).rotacion;
    expect(kpi.a).toBe(soloComunes.a);
    expect(kpi.b).toBe(soloComunes.b);
    expect(kpi.deltaPct).toBe(soloComunes.deltaPct);
    expect(kpi).toMatchObject({ totalVariantes: 4, variantesValidas: 2, variantesExcluidas: 2, validasEnA: 3, validasEnB: 3 });
    expect(kpi.a).toBeCloseTo(240 / 1400, 5); // (180 + 60) ÷ (10·40 + 25·40)
    expect(kpi.b).toBeCloseTo(480 / 1400, 5); // (360 + 120) ÷ las mismas dos
  });

  it("Ranking y orden «Mayor rotación» salen de la rotación a costo (con el mismo costo de hoy, el que vendió más barato rota menos)", () => {
    // Mismas unidades vendidas y mismo stock; una se vendió a costo 20 y la otra a 40: distinta rotación a costo.
    const barata = fila("barata", {}, { ventas: 10, costoVentas: 10 * 20, stockInicio: 20, stockCierre: 20 });
    const cara = fila("cara", {}, { ventas: 10, costoVentas: 10 * 40, stockInicio: 20, stockCierre: 20 });
    const filas = comparar([barata, cara]);
    expect(rankingRotacion(filas)[0].fila.varianteId).toBe("cara");
    expect(ordenarComparacion(filas, "rotacion_b").map((x) => x.fila.varianteId)).toEqual(["cara", "barata"]);
  });

  it("«Mayor mejora de rotación» ordena por B − A de la rotación a costo, y lo que no se puede medir va al final", () => {
    const sube = fila("sube", { ventas: 2, costoVentas: 80, stockInicio: 20, stockCierre: 20 }, { ventas: 10, costoVentas: 400, stockInicio: 20, stockCierre: 20 });
    const igual = fila("igual", { ventas: 5, costoVentas: 200, stockInicio: 20, stockCierre: 20 }, { ventas: 5, costoVentas: 200, stockInicio: 20, stockCierre: 20 });
    const sinCosto = fila("sin-costo", { ventas: 5, costoVentas: 0, unidadesSinCosto: 5, stockInicio: 20, stockCierre: 20 }, { ventas: 9, costoVentas: 360, stockInicio: 20, stockCierre: 20 });
    const filas = comparar([igual, sinCosto, sube]);
    expect(ordenarComparacion(filas, "mejora_rotacion").map((x) => x.fila.varianteId)).toEqual(["sube", "igual", "sin-costo"]);
    expect(filas.find((x) => x.fila.varianteId === "sin-costo")?.deltaRotacionPct).toBeNull(); // A en N/D → variación N/D
  });

  describe("F) variantes N/D: fuera de rankings, órdenes y señales", () => {
    // `nd-b` vendió MUCHO en B pero sin costo (N/D en B); `nd-a` no tiene dato en A pero sí en B; `buena` mejora; `lenta` rota poco.
    const buena = fila("buena", { ventas: 2, costoVentas: 80, stockInicio: 20, stockCierre: 20 }, { ventas: 10, costoVentas: 400, stockInicio: 20, stockCierre: 20 });
    const lenta = fila("lenta", { ventas: 1, costoVentas: 40, stockInicio: 30, stockCierre: 30 }, { ventas: 1, costoVentas: 40, stockInicio: 30, stockCierre: 30 });
    const ndB = fila("nd-b", { ventas: 3, costoVentas: 120, stockInicio: 10, stockCierre: 10 }, { ventas: 40, costoVentas: 0, unidadesSinCosto: 40, stockInicio: 10, stockCierre: 10 });
    const ndA = fila("nd-a", { ventas: 3, costoVentas: 0, unidadesSinCosto: 3, stockInicio: 10, stockCierre: 10 }, { ventas: 20, costoVentas: 800, stockInicio: 10, stockCierre: 10 });
    const filas = comparar([ndB, lenta, ndA, buena]);
    const ids = (xs: { fila: FilaComparacion }[]) => xs.map((x) => x.fila.varianteId);

    it("«Mayor rotación» (ranking y orden en B): una variante sin rotación calculable en B no entra ni ocupa un lugar", () => {
      expect(ids(rankingRotacion(filas))).not.toContain("nd-b");
      expect(ids(rankingRotacion(filas))).toEqual(["nd-a", "buena", "lenta"]); // es un ranking de B: nd-a tiene B válido (2x)
      expect(ids(ordenarComparacion(filas, "rotacion_b")).at(-1)).toBe("nd-b");
      expect(ids(ordenarComparacion(filas, "rotacion_b"))).toEqual(["nd-a", "buena", "lenta", "nd-b"]);
    });

    it("«Mayor mejora de rotación»: sin A y B válidos no hay mejora que ordenar, y esas variantes van al final", () => {
      expect(ids(ordenarComparacion(filas, "mejora_rotacion"))).toEqual(["buena", "lenta", "nd-b", "nd-a"]);
      expect(filas.find((x) => x.fila.varianteId === "nd-a")?.deltaRotacion).toBeNull();
      expect(filas.find((x) => x.fila.varianteId === "nd-b")?.deltaRotacion).toBeNull();
    });

    it("«Mejoró rotación»: nunca se afirma sin los dos valores", () => {
      const senal = (id: string) => filas.find((x) => x.fila.varianteId === id)?.mejoroRotacion;
      expect(senal("buena")).toBe(true);
      expect(senal("nd-a")).toBe(false); // B rota 2x pero A no tiene dato
      expect(senal("nd-b")).toBe(false);
      const con = (rot: number | null) => ({ ...filas[0].b, rotacion: rot });
      expect(mejoroRotacion(con(null), con(3))).toBe(false);
      expect(mejoroRotacion(con(1), con(null))).toBe(false);
    });

    it("Desempeño «Menor rotación» y «Mayor rotación»: N/D nunca cuenta como 0 y va siempre al final", () => {
      const m = dividirPeriodo({ desde: "2026-09-01", hasta: "2026-09-30" });
      const alta = fila("alta", { ventas: 5, costoVentas: 150, stockInicio: 10, stockCierre: 10 }, { ventas: 10, costoVentas: 300, stockInicio: 10, stockCierre: 10 }); // 450 ÷ 400
      const baja = fila("baja", { ventas: 1, costoVentas: 30, stockInicio: 30, stockCierre: 30 }, { ventas: 1, costoVentas: 30, stockInicio: 30, stockCierre: 30 }); // 60 ÷ 1.200
      const nd = fila("nd", { ventas: 20, costoVentas: 0, unidadesSinCosto: 20, stockInicio: 10, stockCierre: 10 }, { ventas: 20, costoVentas: 600, stockInicio: 10, stockCierre: 10 }); // el que más vendió, sin costo
      const analisis = [nd, baja, alta].map((f) => analizarDesempeno(f, m));
      expect(analisis.find((x) => x.fila.varianteId === "nd")?.periodo.rotacion).toBeNull();
      expect(ordenarDesempeno(analisis, "rotacion_menor").map((x) => x.fila.varianteId)).toEqual(["baja", "alta", "nd"]);
      expect(ordenarDesempeno(analisis, "rotacion_mayor").map((x) => x.fila.varianteId)).toEqual(["alta", "baja", "nd"]);
    });
  });
});

describe("limitación conocida: promedio de dos puntos", () => {
  // Dos prendas con el mismo COGS y el mismo stock al cierre (90 uds a 40 = 3.600), sin nada al inicio. Una recibió
  // el stock el día 1 del período y la otra el día 29. Con solo inicio y cierre NO hay forma de distinguirlas.
  const llegoTemprano = baseRotacionDeVariante(variante({ costoVentas: 900, stockInicio: 0, stockCierre: 90 }));
  const llegoTarde = baseRotacionDeVariante(variante({ costoVentas: 900, stockInicio: 0, stockCierre: 90 }));

  it("G) las dos salen igual: 900 ÷ ((0 + 3.600) ÷ 2) = 0.5, sin importar cuándo llegó el stock", () => {
    expect(calcularRotacion(llegoTemprano).veces).toBeCloseTo(0.5, 5);
    expect(calcularRotacion(llegoTarde).veces).toBe(calcularRotacion(llegoTemprano).veces);
    // Lo que de verdad pasó fue distinto (≈ 3.500 de inventario promedio la que llegó el día 1, ≈ 120 la del día 29):
    // con el fallback la rotación de la que llegó tarde se subestima de inventario y sale MUCHO más alta de lo real.
    expect(calcularRotacion(llegoTemprano).metodo).toBe("extremos");
  });
});

describe("limitación conocida: el inventario se valora al costo VIGENTE, el COGS al de la venta", () => {
  it("si el costo cambió, numerador y denominador no están al mismo precio: el mismo movimiento físico rota distinto", () => {
    // Se vendieron 9 unidades cuando costaban 30 (COGS 270) y el inventario fue de 10 → 5 unidades. Hoy la prenda cuesta 40… o 60.
    const hoy40 = rota({ costoVentas: 270, stockInicio: 10, stockCierre: 5, costo: 40 });
    const hoy60 = rota({ costoVentas: 270, stockInicio: 10, stockCierre: 5, costo: 60 });
    expect(hoy40.veces).toBeCloseTo(270 / 300, 5); // 0.90
    expect(hoy60.veces).toBeCloseTo(270 / 450, 5); // 0.60: solo por el costo de HOY; nada físico cambió
    expect(hoy60.cogs).toBe(270); // el numerador no se reexpresa: sigue siendo el costo histórico de cada venta
    expect(hoy60.inventarioPromedio).toBe(450); // el denominador sí sigue al costo vigente
  });
});

describe("punto de sustitución: promedio temporal (diario)", () => {
  it("si existe un promedio temporal del valor a costo, reemplaza al de dos puntos con la MISMA fórmula", () => {
    const dosPuntos: BaseRotacion = { cogs: 900, inventarioInicio: 0, inventarioCierre: 3600 };
    const conSerie: BaseRotacion = { ...dosPuntos, inventarioPromedioTemporal: 3500 }; // llegó el día 1
    const tarde: BaseRotacion = { ...dosPuntos, inventarioPromedioTemporal: 120 }; // llegó el día 29
    expect(inventarioPromedioACosto(dosPuntos)).toEqual({ valor: 1800, metodo: "extremos" });
    expect(calcularRotacion(conSerie)).toMatchObject({ metodo: "temporal", veces: 900 / 3500 });
    expect(calcularRotacion(tarde).veces).toBeCloseTo(7.5, 5);
  });

  it("los consumidores no conocen el método: el agregado y la comparación usan lo que cada variante trae", () => {
    const conSerie: BaseRotacion = { cogs: 900, inventarioInicio: 0, inventarioCierre: 3600, inventarioPromedioTemporal: 3500 };
    expect(rotacionAgregada([conSerie]).veces).toBeCloseTo(900 / 3500, 5);
    expect(rotacionComparada([{ a: conSerie, b: conSerie }]).a).toBeCloseTo(900 / 3500, 5);
  });

  it("el texto de ayuda del método vive en `rotacion.ts` (la fórmula y cómo se estima el promedio)", () => {
    expect(AYUDA_ROTACION).toBe("COGS del período ÷ inventario promedio a costo. El inventario promedio se estima con los valores de inicio y cierre del período.");
  });
});

describe("nunca NaN ni Infinity", () => {
  it("cualquier combinación de datos da un número finito o null", () => {
    const valores = [0, 1, 40, 900];
    for (const costoVentas of valores)
      for (const stockInicio of [0, 3, 10])
        for (const stockCierre of [0, 3, 10])
          for (const unidadesSinCosto of [0, 2])
            for (const ledgerConsistente of [true, false]) {
              const b = base({ costoVentas, stockInicio, stockCierre, unidadesSinCosto, ledgerConsistente });
              const v = calcularRotacion(b).veces;
              if (v !== null) expect(Number.isFinite(v)).toBe(true);
              const agregada = rotacionAgregada([b, b]).veces;
              if (agregada !== null) expect(Number.isFinite(agregada)).toBe(true);
              const c = rotacionComparada([{ a: b, b }]);
              for (const x of [c.a, c.b, c.deltaPct]) if (x !== null) expect(Number.isFinite(x)).toBe(true);
            }
    expect(calcularRotacion({ cogs: 5, inventarioInicio: 0, inventarioCierre: 0 }).veces).toBeNull();
  });
});
