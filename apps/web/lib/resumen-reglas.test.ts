import { describe, expect, it } from "vitest";
import {
  analizarSede,
  bandaDeCobertura,
  calcularCobertura,
  calcularSellThrough,
  calcularTendencia,
  calcularVelocidad,
  cedibleDe,
  detectarCurvasRotas,
  evaluarExactitud,
  planDeReposicion,
  reservaDeSeguridad,
  resumirAlcance,
  textoDondeHay,
  ventasNetasDe,
  velocidadDeFila,
  type FilaResumen,
  type Ubicacion,
} from "./resumen-reglas";

import { AHORA, TALLER, TRUJILLO, enDias, fila, taller, tienda } from "./resumen-fixtures";

const opciones = { ahora: AHORA, hayComparacion: false };
const una = (f: FilaResumen, ubicacion: Ubicacion = TRUJILLO, o = opciones) => analizarSede([f], ubicacion, o)[0];

// ---------------------------------------------------------------------------
describe("velocidad", () => {
  it("normal: ventas netas ÷ días en venta", () => {
    const v = calcularVelocidad({ ventas: 30, devoluciones: 0, diasConStock: 30, diasObservables: 30, ledgerConsistente: true });
    expect(v).toMatchObject({ estado: "ok", unidadesDia: 1, diasBase: 30, metodo: "dias_con_stock", estimada: false });
  });

  it("una prenda en venta 5 días que vendió 10 y luego estuvo 25 días agotada vende 2/día, no 0.33", () => {
    const v = calcularVelocidad({ ventas: 10, devoluciones: 0, diasConStock: 5, diasObservables: 30, ledgerConsistente: true });
    expect(v.estado).toBe("ok");
    expect(v.unidadesDia).toBeCloseTo(2, 5);
    expect(v.unidadesDia).not.toBeCloseTo(10 / 30, 2);
  });

  it("las devoluciones restan y nunca dejan la venta neta en negativo", () => {
    expect(ventasNetasDe(10, 3)).toBe(7);
    expect(ventasNetasDe(2, 5)).toBe(0);
    const v = calcularVelocidad({ ventas: 10, devoluciones: 3, diasConStock: 14, diasObservables: 30, ledgerConsistente: true });
    expect(v.ventasNetas).toBe(7);
    expect(v.unidadesDia).toBeCloseTo(0.5, 5);
  });

  it("sin ventas, solo se afirma «sin ventas» con 14 días o más en venta", () => {
    expect(calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: 20, diasObservables: 30, ledgerConsistente: true }).estado).toBe("sin_ventas");
    expect(calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: 10, diasObservables: 30, ledgerConsistente: true }).estado).toBe("poco_historial");
  });

  it("con menos de 3 días en venta no se calcula velocidad, aunque haya ventas", () => {
    const v = calcularVelocidad({ ventas: 5, devoluciones: 0, diasConStock: 2, diasObservables: 30, ledgerConsistente: true });
    expect(v).toMatchObject({ estado: "poco_historial", unidadesDia: null, ventasNetas: 5 });
  });

  it("nunca estuvo en venta: sin historial; con ventas pero sin base: poco historial", () => {
    expect(calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: 0, diasObservables: null, ledgerConsistente: true }).estado).toBe("sin_historial");
    expect(calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: null, diasObservables: null, ledgerConsistente: true }).estado).toBe("sin_historial");
    expect(calcularVelocidad({ ventas: 4, devoluciones: 0, diasConStock: null, diasObservables: null, ledgerConsistente: true }).estado).toBe("poco_historial");
  });

  it("si el ledger no cuadra usa los días desde que llegó y lo marca como estimada", () => {
    const v = calcularVelocidad({ ventas: 10, devoluciones: 0, diasConStock: 3, diasObservables: 20, ledgerConsistente: false });
    expect(v).toMatchObject({ estado: "ok", metodo: "ventana_observable", estimada: true, diasBase: 20 });
    expect(v.unidadesDia).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------------------
describe("cobertura", () => {
  const ritmo = (u: number) => calcularVelocidad({ ventas: u * 30, devoluciones: 0, diasConStock: 30, diasObservables: 30, ledgerConsistente: true });

  it("cobertura 0: agotado, aunque haya un ritmo medible", () => {
    const c = calcularCobertura(0, ritmo(4));
    expect(c).toEqual({ tipo: "agotado", dias: 0 });
    expect(bandaDeCobertura(c)).toBe("agotado");
  });

  it("cobertura crítica: 7 unidades a 4.1/día ≈ 1.7 días", () => {
    const v = calcularVelocidad({ ventas: 123, devoluciones: 0, diasConStock: 30, diasObservables: 30, ledgerConsistente: true });
    const c = calcularCobertura(7, v);
    expect(c.tipo).toBe("medida");
    expect(c.dias).toBeCloseTo(1.7, 1);
    expect(bandaDeCobertura(c)).toBe("critica");
  });

  it("los cortes de banda: ≤3, ≤7, ≤30 y más", () => {
    const banda = (u: number) => bandaDeCobertura(calcularCobertura(u, ritmo(1)));
    expect(banda(3)).toBe("critica");
    expect(banda(3.01)).toBe("atencion");
    expect(banda(7)).toBe("atencion");
    expect(banda(7.01)).toBe("saludable");
    expect(banda(30)).toBe("saludable");
    expect(banda(30.01)).toBe("alta");
  });

  it("cobertura saludable y muy alta", () => {
    expect(bandaDeCobertura(calcularCobertura(20, ritmo(1)))).toBe("saludable");
    expect(bandaDeCobertura(calcularCobertura(400, ritmo(1)))).toBe("alta");
  });

  it("sin historial suficiente no hay número, ni cero ni infinito", () => {
    const poco = calcularVelocidad({ ventas: 3, devoluciones: 0, diasConStock: 2, diasObservables: 2, ledgerConsistente: true });
    expect(calcularCobertura(12, poco)).toEqual({ tipo: "sin_historial", dias: null });
    expect(bandaDeCobertura(calcularCobertura(12, poco))).toBe("sin_historial");
  });

  it("sin ventas con evidencia: alta cobertura sin inventar un número", () => {
    const sinVentas = calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: 30, diasObservables: 30, ledgerConsistente: true });
    const c = calcularCobertura(12, sinVentas);
    expect(c).toEqual({ tipo: "sin_ventas", dias: null });
    expect(bandaDeCobertura(c)).toBe("alta");
  });
});

// ---------------------------------------------------------------------------
describe("reserva de seguridad", () => {
  it("son 3 días de venta, con un mínimo de 1 unidad", () => {
    const v = (u: number) => calcularVelocidad({ ventas: u * 30, devoluciones: 0, diasConStock: 30, diasObservables: 30, ledgerConsistente: true });
    expect(reservaDeSeguridad(v(4.1))).toBe(13);
    expect(reservaDeSeguridad(v(0.1))).toBe(1);
  });

  it("sin velocidad medible no hay reserva", () => {
    expect(reservaDeSeguridad(calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: 5, diasObservables: 5, ledgerConsistente: true }))).toBeNull();
  });

  it("marca «bajo reserva» cuando lo utilizable no alcanza para 3 días de venta", () => {
    const a = una(fila({ ventas: 123, piso: 2, almacen: 5 })); // 4.1/día, reserva 13, utilizable 7
    expect(a.reserva).toBe(13);
    expect(a.bajoReserva).toBe(true);
    expect(una(fila({ ventas: 30, piso: 20, almacen: 10 })).bajoReserva).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("sell-through", () => {
  it("ventas netas ÷ (stock al inicio del período + lo recibido)", () => {
    expect(calcularSellThrough({ ventasNetas: 30, stockInicial: 40, entradas: 10, ledgerConsistente: true })).toBe(60);
    expect(calcularSellThrough({ ventasNetas: 1, stockInicial: 3, entradas: 0, ledgerConsistente: true })).toBe(33.3);
  });

  it("no pasa de 100 % ni inventa un número sin base o sin ledger", () => {
    expect(calcularSellThrough({ ventasNetas: 60, stockInicial: 40, entradas: 10, ledgerConsistente: true })).toBe(100);
    expect(calcularSellThrough({ ventasNetas: 5, stockInicial: 0, entradas: 0, ledgerConsistente: true })).toBeNull();
    expect(calcularSellThrough({ ventasNetas: 5, stockInicial: 40, entradas: 0, ledgerConsistente: false })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("tendencia contra el período de comparación", () => {
  const ritmo = (u: number, dias = 30) => calcularVelocidad({ ventas: u * dias, devoluciones: 0, diasConStock: dias, diasObservables: dias, ledgerConsistente: true });

  it("alza, baja y estable con un umbral de ±25 %", () => {
    expect(calcularTendencia(ritmo(4), ritmo(2))).toMatchObject({ direccion: "alza", variacionPct: 100 });
    expect(calcularTendencia(ritmo(2), ritmo(4))).toMatchObject({ direccion: "baja", variacionPct: -50 });
    expect(calcularTendencia(ritmo(2.1), ritmo(2))!.direccion).toBe("estable");
  });

  it("sin comparación no hay tendencia; con base insuficiente, «sin dato»", () => {
    expect(calcularTendencia(ritmo(2), null)).toBeNull();
    const poca = calcularVelocidad({ ventas: 1, devoluciones: 0, diasConStock: 1, diasObservables: 1, ledgerConsistente: true });
    expect(calcularTendencia(ritmo(2), poca)!.direccion).toBe("sin_dato");
  });

  it("de vender a no vender nada en un período con evidencia es −100 %", () => {
    const sinVentas = calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: 30, diasObservables: 30, ledgerConsistente: true });
    expect(calcularTendencia(sinVentas, ritmo(2))).toMatchObject({ direccion: "baja", variacionPct: -100 });
  });
});

// ---------------------------------------------------------------------------
describe("curvas rotas", () => {
  const talla = (t: string, utilizable: number, o: Partial<FilaResumen> = {}) => fila({ talla: t, piso: utilizable, almacen: 0, ...o });
  const netas = (filas: FilaResumen[], ventas: Record<string, number> = {}) => new Map(filas.map((f) => [f.varianteId, ventas[f.talla ?? ""] ?? 0]));

  it("S 8 · M 0 · L 7: falta la M (hueco en medio de la curva)", () => {
    const filas = [talla("S", 8), talla("M", 0), talla("L", 7)];
    const [curva] = detectarCurvasRotas(filas, netas(filas));
    expect(curva.faltantes).toEqual([{ varianteId: filas[1].varianteId, talla: "M", motivo: "hueco" }]);
    expect(curva.tallas.map((t) => t.talla)).toEqual(["S", "M", "L"]);
  });

  it("curva completa: no hay nada roto", () => {
    const filas = [talla("S", 8), talla("M", 3), talla("L", 7)];
    expect(detectarCurvasRotas(filas, netas(filas))).toEqual([]);
  });

  it("una punta en cero sin que nadie la haya pedido NO es curva rota", () => {
    const filas = [talla("S", 8), talla("M", 5), talla("L", 0)];
    expect(detectarCurvasRotas(filas, netas(filas))).toEqual([]);
  });

  it("una punta en cero que sí se vendió, con otras tallas con stock, sí lo es", () => {
    const filas = [talla("S", 8), talla("M", 5), talla("L", 0)];
    const [curva] = detectarCurvasRotas(filas, netas(filas, { L: 6 }));
    expect(curva.faltantes).toEqual([{ varianteId: filas[2].varianteId, talla: "L", motivo: "demanda" }]);
  });

  it("si no queda stock en ninguna talla no es curva rota: es agotado", () => {
    const filas = [talla("S", 0), talla("M", 0), talla("L", 0)];
    expect(detectarCurvasRotas(filas, netas(filas, { M: 4 }))).toEqual([]);
  });

  it("no inventa tallas: solo cuentan las variantes que existen", () => {
    // S y L existen; M nunca se dio de alta para este producto+color.
    const filas = [talla("S", 8), talla("L", 7)];
    expect(detectarCurvasRotas(filas, netas(filas))).toEqual([]);
  });

  it("cada color es su propia curva", () => {
    const blanco = [talla("S", 8), talla("M", 0), talla("L", 7)];
    const negro = [talla("S", 8, { colorCodigo: "NEG", color: "Negro" }), talla("M", 4, { colorCodigo: "NEG", color: "Negro" }), talla("L", 7, { colorCodigo: "NEG", color: "Negro" })];
    const curvas = detectarCurvasRotas([...blanco, ...negro], new Map());
    expect(curvas).toHaveLength(1);
    expect(curvas[0].color).toBe("Blanco");
  });

  it("un producto descontinuado no tiene curva que completar", () => {
    const filas = [talla("S", 8, { productoEstado: "descontinuado" }), talla("M", 0, { productoEstado: "descontinuado" }), talla("L", 7, { productoEstado: "descontinuado" })];
    expect(detectarCurvasRotas(filas, netas(filas))).toEqual([]);
  });

  it("usa el orden canónico de tallas, también con números", () => {
    const filas = ["36", "38", "40", "42"].map((t, i) => talla(t, i === 1 ? 0 : 5));
    const [curva] = detectarCurvasRotas(filas, netas(filas));
    expect(curva.faltantes[0].talla).toBe("38");
  });
});

// ---------------------------------------------------------------------------
describe("cuánto puede ceder otra sede", () => {
  it("el Taller no vende a clientas: cede todo", () => {
    expect(cedibleDe(taller({ disponible: 15 })).unidades).toBe(15);
  });

  it("una tienda cede el menor entre lo que le sobra en el almacén y lo que le sobra de cobertura", () => {
    // 1/día: conserva ≥ 10 días (10 uds); almacén 40 − (10+1) = 29 sobran; cobertura 50 − 10 = 40 → cede 29 y conserva 21.
    const c = cedibleDe(tienda());
    expect(c.unidades).toBe(29);
    expect(c.conserva).toBe(21);
    expect(c.motivo).toContain("vende 1/día");
  });

  it("una tienda que vende mucho no cede aunque tenga stock: quedaría corta", () => {
    // 5/día → 50 unidades para 10 días; tiene 50 utilizables → sobra 0.
    expect(cedibleDe(tienda({ ventasVentana: 150 })).unidades).toBe(0);
  });

  it("una tienda con el almacén en el umbral de reserva de Existencias no cede", () => {
    expect(cedibleDe(tienda({ piso: 5, almacen: 8, utilizable: 13, disponible: 13, ventasVentana: 0 })).unidades).toBe(0);
  });

  it("una tienda sin historial suficiente no se toca", () => {
    const c = cedibleDe(tienda({ diasConStock: 2, diasObservables: 2 }));
    expect(c.unidades).toBe(0);
    expect(c.motivo).toContain("sin historial");
  });

  it("una tienda que no vendió nada cede lo que le sobra en el almacén", () => {
    expect(cedibleDe(tienda({ ventasVentana: 0 })).unidades).toBe(29);
  });
});

// ---------------------------------------------------------------------------
describe("motor de reposición", () => {
  // «Casaca Emilia»: 4.1 uds/día, piso 2 + almacén 5 = 7 → 1.7 días.
  const casaca = (o: Partial<FilaResumen> = {}) => fila({ ventas: 123, piso: 2, almacen: 5, ...o });
  const planDe = (f: FilaResumen, destino = TRUJILLO) => {
    const velocidad = velocidadDeFila(f);
    return planDeReposicion({ f, velocidad, cobertura: calcularCobertura(f.utilizable, velocidad), destino, ahora: AHORA, motivo: "demanda" });
  };

  it("1. lo primero es el almacén de la misma tienda: «Bajar 5 al piso»", () => {
    const plan = planDe(casaca({ enRed: [taller()] }));
    expect(plan.principal).toMatchObject({ tipo: "bajar_al_piso", cantidad: 5, texto: "Bajar 5 al piso", accionable: true });
    expect(plan.pasos[0].tipo).toBe("bajar_al_piso");
    expect(plan.urgencia).toBe("alta");
  });

  it("bajar al piso pasa por delante de un traslado externo, pero el plan sigue con lo que falta", () => {
    const plan = planDe(casaca({ enRed: [taller()] }));
    expect(plan.pasos.map((p) => p.tipo)).toEqual(["bajar_al_piso", "pedir_al_taller", "revisar_abastecimiento"]);
  });

  it("no baja al piso si el piso ya alcanza para varios días", () => {
    const plan = planDe(fila({ ventas: 30, piso: 20, almacen: 10 }));
    expect(plan.pasos).toEqual([]);
  });

  it("con el piso vacío y sin ritmo medible, baja lo de la política de Existencias (7 + 1)", () => {
    const plan = planDe(fila({ ventas: 0, diasConStock: 2, diasObservables: 2, piso: 0, almacen: 12 }));
    expect(plan.principal).toMatchObject({ tipo: "bajar_al_piso", cantidad: 8 });
  });

  it("2. mercadería ya en camino que alcanza: solo «Esperar llegada», sin sugerir otro traslado", () => {
    const f = fila({ ventas: 30, piso: 3, almacen: 0, enCamino: 20, enCaminoATiempo: 20, proximaLlegada: enDias(1), proximoTrasladoId: "t-1", enRed: [taller()] });
    const plan = planDe(f);
    expect(plan.pasos.map((p) => p.tipo)).toEqual(["esperar_llegada"]);
    expect(plan.principal).toMatchObject({ tipo: "esperar_llegada", cantidad: 20, accionable: false, trasladoId: "t-1" });
    expect(plan.principal!.motivo).toContain("Llegan +20 mañana");
    expect(plan.faltante).toBeLessThanOrEqual(0);
  });

  it("lo que viene no alcanza: espera y además pide solo lo que falta", () => {
    // 1/día: objetivo 14 + 3 = 17; hay 3 y llegan 5 → faltan 9.
    const f = fila({ ventas: 30, piso: 3, almacen: 0, enCamino: 5, enCaminoATiempo: 5, proximaLlegada: enDias(1), enRed: [taller()] });
    const plan = planDe(f);
    expect(plan.pasos.map((p) => p.tipo)).toEqual(["esperar_llegada", "pedir_al_taller"]);
    expect(plan.principal).toMatchObject({ tipo: "pedir_al_taller", cantidad: 9, texto: "Pedir 9 al Taller" });
  });

  it("lo que llega DESPUÉS de agotarse lo que hay no se cuenta", () => {
    const f = fila({ ventas: 30, piso: 3, almacen: 0, enCamino: 20, enCaminoATiempo: 20, proximaLlegada: enDias(10), enRed: [taller()] });
    const plan = planDe(f);
    expect(plan.pasos.map((p) => p.tipo)).toEqual(["pedir_al_taller"]);
    expect(plan.explicacion.join(" ")).toContain("después de agotarse");
  });

  it("lo atrasado no se cuenta ni se descuenta de lo que hace falta", () => {
    const f = fila({ ventas: 30, piso: 3, almacen: 0, enCamino: 10, enCaminoATiempo: 0, enCaminoAtrasado: true, enRed: [taller()] });
    const plan = planDe(f);
    expect(plan.principal).toMatchObject({ tipo: "pedir_al_taller", cantidad: 14 });
    expect(plan.explicacion.join(" ")).toContain("atrasado");
  });

  it("3. otra sede con stock pero sin excedente cedible: no se le pide nada", () => {
    const f = fila({ ventas: 30, piso: 3, almacen: 0, enRed: [tienda({ piso: 5, almacen: 8, utilizable: 13, disponible: 13 })] });
    const plan = planDe(f);
    expect(plan.pasos.map((p) => p.tipo)).toEqual(["revisar_abastecimiento"]);
    expect(plan.pasos[0].motivo).toContain("no pueden ceder");
  });

  it("3. otra sede que sí puede ceder: «Trasladar 14 desde Lima», con lo que conserva", () => {
    const f = fila({ ventas: 30, piso: 3, almacen: 0, enRed: [tienda()] });
    const plan = planDe(f);
    expect(plan.principal).toMatchObject({ tipo: "trasladar", cantidad: 14, texto: "Trasladar 14 desde Lima" });
    expect(plan.principal!.origen).toMatchObject({ id: "u-lim", cedible: 29, conserva: 21 });
    expect(plan.principal!.motivo).toContain("puede ceder 29");
  });

  it("no se vacía la sede origen: pide como máximo lo que puede ceder", () => {
    const f = fila({ ventas: 300, piso: 0, almacen: 0, enRed: [tienda({ piso: 5, almacen: 20, utilizable: 25, disponible: 25, ventasVentana: 0 })] });
    const plan = planDe(f);
    const paso = plan.pasos.find((p) => p.tipo === "trasladar")!;
    expect(paso.cantidad).toBe(9); // almacén 20 − (10 + 1)
    expect(plan.pasos.at(-1)!.tipo).toBe("revisar_abastecimiento");
  });

  it("4. las tiendas van antes que el Taller, y el plan completa con el Taller lo que falta", () => {
    const f = fila({ ventas: 30, piso: 3, almacen: 0, enRed: [taller(), tienda({ piso: 5, almacen: 16, utilizable: 21, disponible: 21, ventasVentana: 0 })] });
    const plan = planDe(f); // faltan 14: Lima cede 16 − 11 = 5 → Taller 9
    expect(plan.pasos.map((p) => `${p.tipo}:${p.cantidad}`)).toEqual(["trasladar:5", "pedir_al_taller:9"]);
  });

  it("4. Taller con stock: «Pedir 8 al Taller»", () => {
    const f = fila({ ventas: 60, piso: 0, almacen: 0, enRed: [taller({ disponible: 8, utilizable: 8, almacen: 8 })] });
    expect(planDe(f).principal).toMatchObject({ texto: "Pedir 8 al Taller" });
  });

  it("5. sin stock en la red: revisar compra o producción según cómo se repone la prenda", () => {
    const sinRed = (origen: FilaResumen["origenAbastecimiento"]) => planDe(fila({ ventas: 60, piso: 0, almacen: 0, origenAbastecimiento: origen, enRed: [] })).principal;
    expect(sinRed("compra")).toMatchObject({ tipo: "revisar_abastecimiento", texto: "Revisar compra" });
    expect(sinRed("produccion")).toMatchObject({ texto: "Revisar producción" });
    expect(sinRed("ambos")).toMatchObject({ texto: "Revisar compra o producción" });
    expect(sinRed(null)).toMatchObject({ texto: "Revisar compra o producción" });
  });

  it("cantidad = demanda de 14 días + reserva − lo que hay − lo que llega a tiempo", () => {
    // 2/día → objetivo 28 + 6 = 34; hay 4 → faltan 30.
    const f = fila({ ventas: 60, piso: 4, almacen: 0, enRed: [taller({ disponible: 100, utilizable: 100, almacen: 100 })] });
    const plan = planDe(f);
    expect(plan.objetivo).toBe(34);
    expect(plan.reserva).toBe(6);
    expect(plan.faltante).toBe(30);
    expect(plan.principal).toMatchObject({ tipo: "pedir_al_taller", cantidad: 30 });
  });

  it("agotada con ventas pero sin días suficientes para medir el ritmo: NO finge una cantidad", () => {
    const f = fila({ ventas: 5, diasConStock: 2, diasObservables: 2, piso: 0, almacen: 0, enRed: [taller()] });
    const plan = planDe(f);
    expect(plan.principal).toMatchObject({ tipo: "revisar_reposicion", cantidad: null, texto: "Revisar reposición" });
    expect(plan.principal!.motivo).toContain("2 días");
  });

  it("un producto descontinuado no se repone", () => {
    const f = fila({ ventas: 60, piso: 0, almacen: 0, productoEstado: "descontinuado", enRed: [taller()] });
    expect(planDe(f).pasos).toEqual([]);
  });

  it("unidades sin ubicar (reingreso de una anulación): primero se ubican", () => {
    const f = fila({ ventas: 30, piso: 0, almacen: 0, sinUbicar: 3, enRed: [taller()] });
    expect(planDe(f).principal).toMatchObject({ tipo: "ubicar_stock", cantidad: 3 });
  });

  it("el Taller no vende a clientas: no hay recomendaciones de reposición", () => {
    const f = fila({ separaPisoAlmacen: false, piso: 0, almacen: 0, disponible: 12, ventas: 0 });
    expect(planDe(f, TALLER).pasos).toEqual([]);
  });

  it("una talla que falta sin ritmo medible se pide de a 1 unidad, no se inventa una cifra", () => {
    const filas = [
      fila({ talla: "S", piso: 8, almacen: 0, enRed: [] }),
      fila({ talla: "M", piso: 0, almacen: 0, ventas: 0, diasConStock: 0, enRed: [taller({ disponible: 9, utilizable: 9, almacen: 9 })] }),
      fila({ talla: "L", piso: 7, almacen: 0, enRed: [] }),
    ];
    const m = analizarSede(filas, TRUJILLO, opciones).find((a) => a.fila.talla === "M")!;
    expect(m.estados).toContain("curva_rota");
    expect(m.plan.principal).toMatchObject({ tipo: "pedir_al_taller", cantidad: 1 });
  });
});

// ---------------------------------------------------------------------------
describe("estados, chips y prioridad", () => {
  it("cobertura crítica + alta demanda: dos chips como máximo y el urgente primero", () => {
    const a = una(fila({ ventas: 123, piso: 2, almacen: 5, enRed: [taller()] }));
    expect(a.estados).toEqual(expect.arrayContaining(["cobertura_critica", "alta_demanda"]));
    expect(a.chips.map((c) => c.clave)).toEqual(["cobertura_critica", "alta_demanda"]);
    expect(a.chips[0].tono).toBe("rojo");
  });

  it("agotada con demanda es rojo y va primero; agotada sin demanda no es urgente", () => {
    expect(una(fila({ ventas: 30, piso: 0, almacen: 0 })).chips[0]).toMatchObject({ clave: "agotada_demanda", tono: "rojo" });
    const sinDemanda = una(fila({ ventas: 0, diasConStock: 0, piso: 0, almacen: 0 }));
    expect(sinDemanda.estados).toContain("agotada");
    expect(sinDemanda.estados).not.toContain("agotada_demanda");
    expect(sinDemanda.chips[0].tono).toBe("neutro");
  });

  it("venta estable: rota con regularidad y con cobertura sana, sin alertas", () => {
    // Junto a una variante que vende 4 veces más (que es la «alta demanda» de la sede).
    const filas = [fila({ referencia: "Estable", ventas: 30, piso: 15, almacen: 5 }), fila({ referencia: "Estrella", ventas: 120, piso: 60, almacen: 40 })];
    const a = analizarSede(filas, TRUJILLO, opciones).find((x) => x.fila.referencia === "Estable")!;
    expect(a.estados).toContain("venta_estable");
    expect(a.altaDemanda).toBe(false);
    expect(a.chips[0]).toMatchObject({ texto: "Venta estable", tono: "verde" });
  });

  it("posible sobrestock SIN historial suficiente: no se afirma, se dice «sin historial»", () => {
    const a = una(fila({ ventas: 0, diasConStock: 10, diasObservables: 10, piso: 8, almacen: 4 }));
    expect(a.estados).not.toContain("posible_sobrestock");
    expect(a.estados).toContain("sin_historial");
  });

  it("posible sobrestock con evidencia: sin ventas en 30 días con stock", () => {
    const a = una(fila({ ventas: 0, piso: 8, almacen: 4 }));
    expect(a.estados).toContain("posible_sobrestock");
    expect(a.chips[0].texto).toBe("Sin ventas");
    expect(a.plan.principal).toMatchObject({ tipo: "revisar_liquidacion" });
  });

  it("baja rotación: cobertura muy alta Y sell-through bajo", () => {
    const a = una(fila({ ventas: 3, piso: 20, almacen: 20, stockInicial: 40 })); // 0.1/día → 400 días; 3/40 = 7.5 %
    expect(a.cobertura.dias).toBeGreaterThan(60);
    expect(a.sellThrough).toBeLessThan(20);
    expect(a.estados).toContain("posible_sobrestock");
    expect(a.chips[0].texto).toBe("Baja rotación");
  });

  it("alta cobertura con buena rotación NO es sobrestock (hacen falta las dos cosas)", () => {
    const a = una(fila({ ventas: 30, piso: 60, almacen: 40, stockInicial: 130 })); // 100 días, pero 23 % de sell-through
    expect(a.banda).toBe("alta");
    expect(a.estados).not.toContain("posible_sobrestock");
  });

  it("sobrestock: no se sugiere reponer", () => {
    const a = una(fila({ ventas: 0, piso: 8, almacen: 4, enRed: [taller()] }));
    expect(a.plan.pasos.map((p) => p.tipo)).toEqual(["revisar_liquidacion"]);
  });

  it("un producto descontinuado con stock se marca y no se repone", () => {
    const a = una(fila({ productoEstado: "descontinuado", ventas: 60, piso: 1, almacen: 0, enRed: [taller()] }));
    expect(a.descontinuada).toBe(true);
    expect(a.estados).toContain("descontinuada");
    expect(a.plan.pasos.map((p) => p.tipo)).not.toContain("pedir_al_taller");
  });

  it("«sin piso»: nada en el piso y sí en el almacén", () => {
    const a = una(fila({ ventas: 30, piso: 0, almacen: 12 }));
    expect(a.estados).toContain("sin_piso");
    expect(a.plan.principal).toMatchObject({ tipo: "bajar_al_piso" });
  });

  it("«alta demanda» es relativa al resto de la sede y exige un mínimo por día", () => {
    const filas = Array.from({ length: 10 }, (_, i) => fila({ ventas: (i + 1) * 12, piso: 30, almacen: 30 })); // 0.4 … 4/día
    const altas = analizarSede(filas, TRUJILLO, opciones).filter((a) => a.altaDemanda);
    expect(altas.map((a) => a.fila.ventas).sort((x, y) => x - y)).toEqual([108, 120]); // el 20 % más rápido
    const lentas = Array.from({ length: 10 }, (_, i) => fila({ ventas: i + 1, piso: 30, almacen: 30 })); // ≤ 0.33/día
    expect(analizarSede(lentas, TRUJILLO, opciones).some((a) => a.altaDemanda)).toBe(false);
  });

  it("en el Taller no hay alertas de tienda: no vende a clientas", () => {
    const a = una(fila({ separaPisoAlmacen: false, piso: 0, almacen: 0, disponible: 0, ventas: 20 }), TALLER);
    expect(a.estados).toEqual([]);
  });

  it("«Prioridades» ordena: agotada con demanda, crítica, resto, y dentro de un mismo grupo por impacto", () => {
    const estable = fila({ referencia: "Estable", ventas: 30, piso: 15, almacen: 5 });
    const critica = fila({ referencia: "Crítica", ventas: 60, piso: 3, almacen: 0 });
    const agotada = fila({ referencia: "Agotada", ventas: 30, piso: 0, almacen: 0 });
    const masCara = fila({ referencia: "Agotada cara", ventas: 30, piso: 0, almacen: 0, precio: 300 });
    const orden = analizarSede([estable, critica, agotada, masCara], TRUJILLO, opciones).map((a) => a.fila.referencia);
    expect(orden).toEqual(["Agotada cara", "Agotada", "Crítica", "Estable"]);
  });
});

// ---------------------------------------------------------------------------
describe("período de comparación", () => {
  it("sin comparación no hay velocidad previa ni tendencia", () => {
    const a = una(fila({ ventasCmp: 10, diasConStockCmp: 30 }));
    expect(a.velocidadPrevia).toBeNull();
    expect(a.tendencia).toBeNull();
  });

  it("con comparación, la tendencia sale de la velocidad del período anterior", () => {
    const a = una(fila({ ventas: 60, ventasCmp: 30, diasConStockCmp: 30 }), TRUJILLO, { ahora: AHORA, hayComparacion: true });
    expect(a.tendencia).toMatchObject({ direccion: "alza", variacionPct: 100 });
    expect(a.estados).toContain("en_alza");
  });

  it("el período anterior con ledger inconsistente no inventa una velocidad", () => {
    const a = una(fila({ ventas: 60, ventasCmp: 30, diasConStockCmp: 30, ledgerConsistente: false }), TRUJILLO, { ahora: AHORA, hayComparacion: true });
    expect(a.tendencia!.direccion).toBe("sin_dato");
  });

  it("las ventas totales del período y del anterior se resumen para el encabezado", () => {
    const filas = [fila({ ventas: 60, ventasCmp: 30, diasConStockCmp: 30 }), fila({ ventas: 20, ventasCmp: 40, diasConStockCmp: 30 })];
    const r = resumirAlcance(analizarSede(filas, TRUJILLO, { ahora: AHORA, hayComparacion: true }));
    expect(r.ventas).toEqual({ periodo: 80, previo: 70 });
    expect(resumirAlcance(analizarSede(filas, TRUJILLO, opciones)).ventas.previo).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("resumen de la sede", () => {
  const sede = () => [
    fila({ productoId: "p-casaca", referencia: "Casaca Emilia", ventas: 123, piso: 2, almacen: 5, enRed: [taller()] }),
    fila({ productoId: "p-blazer", referencia: "Blazer Catalina", ventas: 60, piso: 0, almacen: 0 }),
    fila({ productoId: "p-falda", referencia: "Falda Isabella", ventas: 3, piso: 18, almacen: 22, stockInicial: 43, categoriaId: "c-faldas", categoria: "Faldas" }),
    fila({ productoId: "p-vestido", referencia: "Vestido Renata", ventas: 0, diasConStock: 4, diasObservables: 4, piso: 4, almacen: 8, categoriaId: "c-vestidos", categoria: "Vestidos" }),
  ];

  it("cuenta las tarjetas de arriba con los mismos estados que la tabla", () => {
    const r = resumirAlcance(analizarSede(sede(), TRUJILLO, opciones));
    expect(r.totalVariantes).toBe(4);
    expect(r.agotadasConDemanda).toBe(1);
    expect(r.coberturaCritica).toBe(1);
    expect(r.sobrestock.total).toBe(1);
  });

  it("sobrestock sin evidencia en toda la sede: lo dice en vez de afirmar «sin sobrestock»", () => {
    const filas = [fila({ ventas: 0, diasConStock: 5, diasObservables: 5, piso: 8, almacen: 4 })];
    const r = resumirAlcance(analizarSede(filas, TRUJILLO, opciones));
    expect(r.sobrestock).toEqual({ total: 0, conEvidencia: 0 });
  });

  it("la distribución de cobertura suma todas las variantes de la sede", () => {
    const r = resumirAlcance(analizarSede(sede(), TRUJILLO, opciones));
    expect(r.distribucion.reduce((n, d) => n + d.variantes, 0)).toBe(4);
    expect(r.distribucion.find((d) => d.banda === "agotado")!.variantes).toBe(1);
    expect(r.distribucion.find((d) => d.banda === "critica")!.variantes).toBe(1);
    expect(r.distribucion.find((d) => d.banda === "sin_historial")!.variantes).toBe(1);
  });

  it("los más rápidos: por producto (suma las variantes) y por variante", () => {
    const filas = [
      fila({ productoId: "p1", referencia: "Blusa", talla: "S", ventas: 30 }),
      fila({ productoId: "p1", referencia: "Blusa", talla: "M", ventas: 60 }),
      fila({ productoId: "p2", referencia: "Falda", talla: "S", ventas: 75 }),
    ];
    const r = resumirAlcance(analizarSede(filas, TRUJILLO, opciones));
    expect(r.topProductos.map((b) => [b.etiqueta, b.unidadesDia])).toEqual([["Blusa", 3], ["Falda", 2.5]]);
    expect(r.topVariantes.map((b) => `${b.etiqueta} ${b.detalle}`)).toEqual(["Falda Blanco · S", "Blusa Blanco · M", "Blusa Blanco · S"]);
  });

  it("las curvas rotas del resumen traen su acción y dónde hay la talla", () => {
    const filas = [
      fila({ talla: "S", piso: 8, almacen: 0 }),
      fila({ talla: "M", piso: 0, almacen: 0, ventas: 0, diasConStock: 0, enRed: [taller({ disponible: 8, utilizable: 8, almacen: 8 }), tienda({ piso: 1, almacen: 2, utilizable: 3, disponible: 3 })] }),
      fila({ talla: "L", piso: 7, almacen: 0 }),
    ];
    const r = resumirAlcance(analizarSede(filas, TRUJILLO, opciones));
    expect(r.curvasRotas).toEqual({ curvas: 1, tallas: 1 });
    expect(r.curvas[0].acciones[0]).toMatchObject({ talla: "M", motivo: "hueco" });
    expect(r.curvas[0].dondeHay).toBe("Taller: 8 · Lima: 3");
  });

  it("dónde hay stock: primero el Taller, sin mezclar lo que no tiene nada", () => {
    expect(textoDondeHay([tienda({ utilizable: 4, disponible: 4 }), taller({ disponible: 15 }), tienda({ ubicacionId: "x", nombre: "Tienda AQP", utilizable: 0, disponible: 0 })])).toBe("Taller: 15 · Lima: 4");
  });
});

// ---------------------------------------------------------------------------
describe("capital en inventario", () => {
  const conCosto = (o: Partial<FilaResumen>) => fila({ estadoCosto: "declarado", costo: 50, ...o });

  it("verificado: stock físico no dañado × costo, con la cuarentena aparte", () => {
    const filas = [
      conCosto({ categoriaId: "c-blusas", categoria: "Blusas", piso: 10, almacen: 10, costo: 50, cuarentena: 2 }), // 20 uds × 50
      conCosto({ categoriaId: "c-faldas", categoria: "Faldas", piso: 5, almacen: 0, costo: 80, ventas: 0 }), // 5 uds × 80, sin ventas → cobertura alta
    ];
    const capital = resumirAlcance(analizarSede(filas, TRUJILLO, opciones)).capital;
    if (!capital.verificado) throw new Error("debía estar verificado");
    expect(capital.total).toBe(1000 + 400);
    expect(capital.unidades).toBe(25);
    expect(capital.cuarentena).toEqual({ unidades: 2, valor: 100 });
    expect(capital.conCoberturaAlta).toBe(400);
    expect(capital.porCategoria.map((c) => [c.categoria, c.valor])).toEqual([["Blusas", 1000], ["Faldas", 400]]);
  });

  it("no se muestra si una prenda con stock no tiene costo", () => {
    const capital = resumirAlcance(analizarSede([conCosto({}), conCosto({ estadoCosto: "sin_costo", costo: 0 })], TRUJILLO, opciones)).capital;
    expect(capital).toMatchObject({ verificado: false, sinCosto: 1, alterado: 0 });
  });

  it("no se muestra si el costo se movió por fuera del promedio ponderado", () => {
    const capital = resumirAlcance(analizarSede([conCosto({ estadoCosto: "alterado" })], TRUJILLO, opciones)).capital;
    if (capital.verificado) throw new Error("no debía estar verificado");
    expect(capital.alterado).toBe(1);
    expect(capital.motivo).toContain("modificados");
    expect(capital.variantes[0].estado).toBe("alterado");
  });

  it("quien no ve costos (no líder) no tiene capital", () => {
    const capital = resumirAlcance(analizarSede([conCosto({ estadoCosto: null, costo: null })], TRUJILLO, opciones)).capital;
    expect(capital.verificado).toBe(false);
  });

  it("una variante sin stock no bloquea el capital aunque no tenga costo", () => {
    const filas = [conCosto({}), conCosto({ estadoCosto: "sin_costo", costo: 0, piso: 0, almacen: 0, ventas: 0 })];
    expect(resumirAlcance(analizarSede(filas, TRUJILLO, opciones)).capital.verificado).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("exactitud del inventario", () => {
  const dias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000).toISOString();

  it("sin conteos cerrados: pendiente", () => {
    expect(evaluarExactitud({ exactitud: null, ultimoCerradoEn: null }, AHORA).estado).toBe("pendiente");
  });

  it("un conteo reciente y exacto valida el inventario: no hay alerta", () => {
    const e = evaluarExactitud({ exactitud: { porcentaje: 98.4, lineas: 120, conteos: 2 }, ultimoCerradoEn: dias(6) }, AHORA);
    expect(e).toMatchObject({ estado: "vigente", diasDesde: 6, porcentaje: 98.4 });
  });

  it("uno viejo o poco exacto sigue dando aviso", () => {
    expect(evaluarExactitud({ exactitud: { porcentaje: 99, lineas: 50, conteos: 1 }, ultimoCerradoEn: dias(45) }, AHORA).estado).toBe("antiguo");
    expect(evaluarExactitud({ exactitud: { porcentaje: 90, lineas: 50, conteos: 1 }, ultimoCerradoEn: dias(3) }, AHORA).estado).toBe("baja");
  });
});
