import { describe, it, expect } from "vitest";
import {
  agrupar,
  cobertura,
  descuentoSobreLista,
  diasDeInventario,
  margen,
  margenPct,
  mediana,
  MIN_FILAS_REFERENCIA,
  MUESTRA_MINIMA_VENTAS,
  ordenarPorLectura,
  pideAtencion,
  referenciaDe,
  sellThrough,
  textoLectura,
  velocidadDiaria,
  type FilaRentabilidad,
  type Lectura,
} from "./rentabilidad-reglas";

/**
 * Una fila de producto. `margenPct` es el margen objetivo; la venta sale a S/100 por unidad (sin IGV) y el costo se ajusta.
 * Por defecto todo tiene costo cargado y stock 0.
 */
function fila(p: { etiqueta: string; unidades: number; margenPct?: number; stock?: number | null; nivel?: FilaRentabilidad["nivel"]; conCosto?: number; diasVentana?: number }): FilaRentabilidad {
  const ventaNeta = p.unidades * 100;
  const ventaNetaConCosto = p.conCosto ?? ventaNeta;
  const costo = ventaNetaConCosto * (1 - (p.margenPct ?? 0.4));
  return {
    nivel: p.nivel ?? "producto", clave: p.etiqueta, etiqueta: p.etiqueta, unidades: p.unidades,
    ventaNeta, ventaNetaConCosto, costo, unidadesSinCosto: 0, descuento: 0, devueltas: 0,
    stock: p.stock === undefined ? 0 : p.stock, diasVentana: p.diasVentana ?? 90,
  };
}

describe("margen — un costo en cero no es un costo", () => {
  it("venta con costo − costo, y el porcentaje sobre esa venta", () => {
    const f = fila({ etiqueta: "a", unidades: 2, margenPct: 0.6 });
    expect(margen(f)).toBe(120);
    expect(margenPct(f)).toBeCloseTo(0.6, 6);
  });

  it("EL CASO QUE ESTA PANTALLA NO PUEDE HACER MAL: sin ningún costo cargado no hay margen, NO '100%'", () => {
    const sinCosto = { ...fila({ etiqueta: "b", unidades: 4 }), ventaNetaConCosto: 0, costo: 0 };
    expect(margen(sinCosto)).toBeNull();
    expect(margenPct(sinCosto)).toBeNull();
  });

  it("la cobertura dice qué fracción de lo vendido tiene costo", () => {
    expect(cobertura({ ventaNeta: 400, ventaNetaConCosto: 100 })).toBe(0.25);
    expect(cobertura({ ventaNeta: 0, ventaNetaConCosto: 0 })).toBeNull();
  });

  it("el margen no acumula errores de coma flotante", () => {
    expect(margen({ ventaNetaConCosto: 0.3, costo: 0.1 })).toBe(0.2);
  });
});

describe("descuento sobre precio de lista", () => {
  it("venta neta 200 (pagó 236 con IGV) y 18 de descuento → 18 sobre lista de 254", () => {
    expect(descuentoSobreLista({ ventaNeta: 200, descuento: 18 }, 0.18)).toBeCloseTo(18 / 254, 6);
  });
  it("sin nada vendido no divide por cero", () => {
    expect(descuentoSobreLista({ ventaNeta: 0, descuento: 0 }, 0.18)).toBeNull();
  });
});

describe("rotación", () => {
  it("velocidad diaria sobre la ventana, y 0 sin ventana", () => {
    expect(velocidadDiaria(90, 90)).toBe(1);
    expect(velocidadDiaria(10, 0)).toBe(0);
  });
  it("días de inventario = stock ÷ velocidad; null si no hay stock o no se vendió nada", () => {
    expect(diasDeInventario(30, 0.5)).toBe(60);
    expect(diasDeInventario(0, 0.5)).toBeNull();
    expect(diasDeInventario(30, 0)).toBeNull();
    expect(diasDeInventario(null, 0.5)).toBeNull();
  });
  it("sell-through = vendidas ÷ (vendidas + stock)", () => {
    expect(sellThrough(30, 70)).toBe(0.3);
    expect(sellThrough(0, 0)).toBeNull();
    expect(sellThrough(10, null)).toBeNull();
  });
});

describe("mediana", () => {
  it("impar, par y vacía", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });
  it("no se deja arrastrar por un caso extremo (a diferencia del promedio)", () => {
    expect(mediana([10, 11, 12, 13, 100000])).toBe(12);
  });
});

describe("lecturas — qué vende mucho pero deja poco, y qué deja bien pero rota lento", () => {
  // Seis productos comparables: unidades 20..70 y margen 30%..55%. Mediana: 45 unidades y 42,5% de margen.
  const base = [
    fila({ etiqueta: "u20-m35", unidades: 20, margenPct: 0.35, stock: 20 }),
    fila({ etiqueta: "u30-m40", unidades: 30, margenPct: 0.40, stock: 20 }),
    fila({ etiqueta: "u40-m45", unidades: 40, margenPct: 0.45, stock: 20 }),
    fila({ etiqueta: "u50-m50", unidades: 50, margenPct: 0.50, stock: 20 }),
    fila({ etiqueta: "u60-m55", unidades: 60, margenPct: 0.55, stock: 20 }),
    fila({ etiqueta: "u70-m30", unidades: 70, margenPct: 0.30, stock: 20 }),
  ];
  const lecturaDe = (extra: FilaRentabilidad[], etiqueta: string): Lectura =>
    agrupar([...base, ...extra]).producto.find((f) => f.etiqueta === etiqueta)!.lectura;

  it("mucho volumen y margen bajo: 'vende mucho y deja poco'", () => {
    expect(lecturaDe([], "u70-m30")).toBe("vende_mucho_deja_poco");
  });

  it("margen alto pero rota lento (mucho stock parado): 'deja bien y rota lento'", () => {
    const lento = fila({ etiqueta: "lento", unidades: 12, margenPct: 0.6, stock: 300 });
    expect(lecturaDe([lento], "lento")).toBe("deja_bien_rota_lento");
  });

  it("mucho volumen y buen margen: estrella", () => {
    expect(lecturaDe([], "u60-m55")).toBe("estrella");
  });

  it("stock y CERO ventas: inventario parado (aunque no tenga margen que comparar)", () => {
    const parado = fila({ etiqueta: "parado", unidades: 0, stock: 40, conCosto: 0 });
    expect(lecturaDe([parado], "parado")).toBe("inventario_parado");
  });

  it("vendió pero ningún costo cargado: sin_costo, NO una ganancia inventada", () => {
    const sinCosto = { ...fila({ etiqueta: "sin-costo", unidades: 20 }), ventaNetaConCosto: 0, costo: 0, unidadesSinCosto: 20 };
    const e = agrupar([...base, sinCosto]).producto.find((f) => f.etiqueta === "sin-costo")!;
    expect(e.lectura).toBe("sin_costo");
    expect(e.margen).toBeNull();
    expect(e.margenPct).toBeNull();
  });

  it("costo cargado solo en una parte de lo vendido: margen parcial", () => {
    const parcial = fila({ etiqueta: "parcial", unidades: 20, conCosto: 800 }); // 800 de 2.000 = 40% de cobertura
    expect(lecturaDe([parcial], "parcial")).toBe("costo_parcial");
  });

  it("con menos de MUESTRA_MINIMA_VENTAS unidades: muestra chica, aunque su margen sea altísimo", () => {
    const chica = fila({ etiqueta: "chica", unidades: MUESTRA_MINIMA_VENTAS - 1, margenPct: 0.9, stock: 5 });
    expect(lecturaDe([chica], "chica")).toBe("muestra_chica");
  });

  it("dentro de lo normal: poco volumen y poco margen sin ser un problema de rotación", () => {
    expect(lecturaDe([], "u20-m35")).toBe("normal");
  });

  it("con menos de MIN_FILAS_REFERENCIA filas comparables no se compara: sin_referencia", () => {
    const pocas = base.slice(0, MIN_FILAS_REFERENCIA - 1);
    const a = agrupar(pocas);
    expect(a.producto.every((f) => f.lectura === "sin_referencia")).toBe(true);
    expect(referenciaDe(pocas)).toBeNull();
  });

  it("una fila muestra chica o sin costo NO entra a la mediana (no la contamina)", () => {
    const ruido = [
      fila({ etiqueta: "r1", unidades: 2, margenPct: 0.99 }),
      { ...fila({ etiqueta: "r2", unidades: 50 }), ventaNetaConCosto: 0, costo: 0 },
    ];
    const conRuido = referenciaDe([...base, ...ruido]);
    const sinRuido = referenciaDe(base);
    expect(conRuido).toEqual(sinRuido);
  });
});

describe("ordenarPorLectura — excepciones primero", () => {
  it("parado, mucho-poco, bien-lento, luego lo sano por margen; al final lo que no se puede juzgar", () => {
    const base = [
      fila({ etiqueta: "u20-m35", unidades: 20, margenPct: 0.35, stock: 20 }),
      fila({ etiqueta: "u30-m40", unidades: 30, margenPct: 0.40, stock: 20 }),
      fila({ etiqueta: "u40-m45", unidades: 40, margenPct: 0.45, stock: 20 }),
      fila({ etiqueta: "u50-m50", unidades: 50, margenPct: 0.50, stock: 20 }),
      fila({ etiqueta: "u60-m55", unidades: 60, margenPct: 0.55, stock: 20 }),
      fila({ etiqueta: "u70-m30", unidades: 70, margenPct: 0.30, stock: 20 }),
      fila({ etiqueta: "parado", unidades: 0, stock: 40, conCosto: 0 }),
      fila({ etiqueta: "chica", unidades: 3, margenPct: 0.9 }),
      { ...fila({ etiqueta: "sin-costo", unidades: 20 }), ventaNetaConCosto: 0, costo: 0 },
    ];
    const orden = agrupar(base).producto.map((f) => f.etiqueta);
    expect(orden[0]).toBe("parado");
    expect(orden[1]).toBe("u70-m30");
    expect(orden.slice(-2)).toEqual(["sin-costo", "chica"]);
  });

  it("entre inventarios parados, el que tiene más stock primero", () => {
    const orden = ordenarPorLectura(
      agrupar([fila({ etiqueta: "p10", unidades: 0, stock: 10 }), fila({ etiqueta: "p50", unidades: 0, stock: 50 })]).producto
    ).map((f) => f.etiqueta);
    expect(orden).toEqual(["p50", "p10"]);
  });

  it("no muta el arreglo original", () => {
    const evaluadas = agrupar([fila({ etiqueta: "a", unidades: 1 }), fila({ etiqueta: "b", unidades: 50 })]).producto;
    const copia = [...evaluadas];
    ordenarPorLectura(evaluadas);
    expect(evaluadas).toEqual(copia);
  });
});

describe("agrupar", () => {
  it("separa por vista y evalúa la fila total sin compararla contra nada", () => {
    const a = agrupar([
      fila({ nivel: "total", etiqueta: "Total", unidades: 100, margenPct: 0.4 }),
      fila({ nivel: "categoria", etiqueta: "Blusas", unidades: 60 }),
      fila({ nivel: "origen", etiqueta: "Taller", unidades: 40, stock: null }),
    ]);
    expect(a.categoria).toHaveLength(1);
    expect(a.origen).toHaveLength(1);
    expect(a.producto).toEqual([]);
    expect(a.total.lectura).toBe("sin_referencia");
    expect(a.total.margenPct).toBeCloseTo(0.4, 6);
  });

  it("sin ninguna fila (ventana vacía) no falla", () => {
    const a = agrupar([]);
    expect(a.total.unidades).toBe(0);
    expect(a.producto).toEqual([]);
  });

  it("en el nivel origen el stock es null: no hay días de inventario ni sell-through", () => {
    const e = agrupar([fila({ nivel: "origen", etiqueta: "Taller", unidades: 40, stock: null })]).origen[0];
    expect(e.diasInventario).toBeNull();
    expect(e.sellThrough).toBeNull();
  });
});

describe("textoLectura / pideAtencion", () => {
  it("cada lectura tiene texto propio y solo tres piden atención", () => {
    const todas: Lectura[] = ["inventario_parado", "vende_mucho_deja_poco", "deja_bien_rota_lento", "estrella", "normal", "costo_parcial", "sin_costo", "muestra_chica", "sin_referencia"];
    expect(new Set(todas.map(textoLectura)).size).toBe(todas.length);
    expect(todas.filter(pideAtencion)).toEqual(["inventario_parado", "vende_mucho_deja_poco", "deja_bien_rota_lento"]);
  });
});
