import { describe, it, expect } from "vitest";
import {
  agrupar,
  danadasPorTienda,
  DEVUELTAS_MINIMAS_ATENCION,
  evaluar,
  MUESTRA_MINIMA,
  ordenarPorAtencion,
  tasa,
  textoLectura,
  ultimosMeses,
  type FilaCalidad,
  type FilaDanadas,
} from "./calidad-reglas";

function fila(parcial: Partial<FilaCalidad> & { etiqueta: string }): FilaCalidad {
  return { nivel: "talla", clave: parcial.etiqueta, vendidas: 0, devueltas: 0, vendibles: 0, danadas: 0, aProveedor: 0, cambiadas: 0, ...parcial };
}

describe("tasa", () => {
  it("parte ÷ total, y null sin total (nunca NaN ni infinito)", () => {
    expect(tasa(3, 12)).toBe(0.25);
    expect(tasa(0, 0)).toBeNull();
    expect(tasa(5, 0)).toBeNull();
  });
});

// Una cohorte de 1.000 unidades vendidas con 100 devoluciones (10% en total). Cada caso dice qué fila "ocupa" parte de eso.
const T = { vendidas: 1000, devueltas: 100 };

describe("evaluar — una tasa con pocas ventas no es una tasa", () => {
  it("EL CASO QUE MOTIVÓ EL DISEÑO: 2 ventas y 1 devolución (50%) es muestra chica, NO atención", () => {
    const e = evaluar(fila({ etiqueta: "XS", vendidas: 2, devueltas: 1 }), T);
    expect(e.tasa).toBe(0.5);
    expect(e.estado).toBe("muestra_chica");
  });

  it("con muestra suficiente, el doble del resto y suficientes devoluciones sí requiere atención", () => {
    // fila: 50 vendidas, 10 devueltas (20%). Resto: 950 vendidas, 90 devueltas (9,47%) → 2,1 veces.
    const e = evaluar(fila({ etiqueta: "M", vendidas: 50, devueltas: 10 }), T);
    expect(e.estado).toBe("atencion");
    expect(e.vsResto).toBeCloseTo(2.11, 2);
  });

  it("borde exacto: el doble del resto ya es atención; un poco menos, no", () => {
    // Resto exacto de 10%: total 1.000 / 110 con la fila 100 / 20 → resto 900 / 90.
    const total = { vendidas: 1000, devueltas: 110 };
    expect(evaluar(fila({ etiqueta: "a", vendidas: 100, devueltas: 20 }), total).estado).toBe("atencion"); // 20% = 2 × 10%
    expect(evaluar(fila({ etiqueta: "b", vendidas: 100, devueltas: 19 }), { vendidas: 1000, devueltas: 109 }).estado).toBe("normal"); // 19% vs 10%
  });

  it("EL DEFECTO QUE ESTO CORRIGE: una fila que concentra las devoluciones no se disimula a sí misma", () => {
    // 412 vendidas, 38 devueltas (9,2%). La talla L: 120 vendidas y 21 devueltas (17,5%).
    // Contra el TOTAL (9,2%) sería 1,9 veces → "normal". Contra el RESTO (17 de 292 = 5,8%) son 3 veces → atención.
    const total = { vendidas: 412, devueltas: 38 };
    const e = evaluar(fila({ etiqueta: "L", vendidas: 120, devueltas: 21 }), total);
    expect(e.estado).toBe("atencion");
    expect(e.vsResto).toBeGreaterThan(2.9);
  });

  it("muy alta la tasa pero menos devoluciones que el mínimo: no es un patrón", () => {
    const e = evaluar(fila({ etiqueta: "c", vendidas: MUESTRA_MINIMA, devueltas: DEVUELTAS_MINIMAS_ATENCION - 1 }), { vendidas: 1000, devueltas: 10 });
    expect(e.estado).toBe("normal");
  });

  it("el borde de la muestra mínima: justo MUESTRA_MINIMA ya cuenta como muestra suficiente", () => {
    expect(evaluar(fila({ etiqueta: "d", vendidas: MUESTRA_MINIMA - 1, devueltas: 5 }), T).estado).toBe("muestra_chica");
    expect(evaluar(fila({ etiqueta: "e", vendidas: MUESTRA_MINIMA, devueltas: 5 }), T).estado).toBe("atencion");
  });

  it("sin ventas no hay tasa ni juicio", () => {
    const e = evaluar(fila({ etiqueta: "f" }), T);
    expect(e.tasa).toBeNull();
    expect(e.estado).toBe("sin_ventas");
  });

  it("si el resto no tuvo NINGUNA devolución, un patrón (con muestra) es atención y no divide por cero", () => {
    const e = evaluar(fila({ etiqueta: "g", vendidas: 20, devueltas: 3 }), { vendidas: 100, devueltas: 3 });
    expect(e.estado).toBe("atencion");
    expect(e.vsResto).toBeNull();
  });

  it("si la fila ES todo (no queda resto), no hay con qué comparar: normal, no una alarma inventada", () => {
    const e = evaluar(fila({ etiqueta: "única", vendidas: 100, devueltas: 30 }), { vendidas: 100, devueltas: 30 });
    expect(e.estado).toBe("normal");
    expect(e.vsResto).toBeNull();
  });

  it("la fila TOTAL nunca requiere atención: no hay contra qué compararla", () => {
    const e = evaluar(fila({ nivel: "total", etiqueta: "Total", vendidas: 412, devueltas: 200 }), { vendidas: 412, devueltas: 200 });
    expect(e.estado).toBe("normal");
  });

  it("calcula por separado la tasa de dañadas (de lo devuelto) y la de cambios (de lo vendido)", () => {
    const e = evaluar(fila({ etiqueta: "h", vendidas: 40, devueltas: 8, danadas: 2, cambiadas: 4 }), T);
    expect(e.tasaDanadas).toBe(0.25);
    expect(e.tasaCambios).toBe(0.1);
  });

  it("sin devoluciones la tasa de dañadas es null, no 0/0", () => {
    expect(evaluar(fila({ etiqueta: "i", vendidas: 30 }), T).tasaDanadas).toBeNull();
  });
});

describe("ordenarPorAtencion", () => {
  it("atención primero; muestra chica al final aunque su tasa sea la más alta", () => {
    const orden = ordenarPorAtencion(
      [
        fila({ etiqueta: "chica-50%", vendidas: 2, devueltas: 1 }),
        fila({ etiqueta: "normal", vendidas: 100, devueltas: 10 }),
        fila({ etiqueta: "atencion", vendidas: 50, devueltas: 15 }),
        fila({ etiqueta: "sin-ventas" }),
      ].map((f) => evaluar(f, T))
    ).map((f) => f.etiqueta);
    expect(orden).toEqual(["atencion", "normal", "chica-50%", "sin-ventas"]);
  });

  it("entre dos en atención, la de mayor tasa primero", () => {
    const total = { vendidas: 1000, devueltas: 30 };
    const orden = ordenarPorAtencion(
      [fila({ etiqueta: "20%", vendidas: 50, devueltas: 10 }), fila({ etiqueta: "40%", vendidas: 50, devueltas: 20 })].map((f) => evaluar(f, total))
    ).map((f) => f.etiqueta);
    expect(orden).toEqual(["40%", "20%"]);
  });

  it("entre muestras chicas, la de más ventas primero (más evidencia)", () => {
    const orden = ordenarPorAtencion(
      [fila({ etiqueta: "3", vendidas: 3 }), fila({ etiqueta: "8", vendidas: 8 })].map((f) => evaluar(f, T))
    ).map((f) => f.etiqueta);
    expect(orden).toEqual(["8", "3"]);
  });

  it("no muta el arreglo original", () => {
    const original = [fila({ etiqueta: "a", vendidas: 1 }), fila({ etiqueta: "b", vendidas: 5 })].map((f) => evaluar(f, T));
    ordenarPorAtencion(original);
    expect(original[0].etiqueta).toBe("a");
  });
});

describe("agrupar", () => {
  const filas: FilaCalidad[] = [
    fila({ nivel: "total", etiqueta: "Total", vendidas: 100, devueltas: 10 }),
    fila({ nivel: "talla", etiqueta: "S", vendidas: 50, devueltas: 4 }),
    fila({ nivel: "talla", etiqueta: "M", vendidas: 50, devueltas: 6 }),
    fila({ nivel: "origen", etiqueta: "Proveedor A", vendidas: 60, devueltas: 9 }),
    fila({ nivel: "origen", etiqueta: "Taller", vendidas: 40, devueltas: 1 }),
  ];
  it("separa por vista, calcula la tasa general del total y evalúa cada fila contra el resto", () => {
    const a = agrupar(filas);
    expect(a.tasaGeneral).toBe(0.1);
    expect(a.talla).toHaveLength(2);
    expect(a.origen).toHaveLength(2);
    expect(a.producto).toEqual([]);
    expect(a.total.tasa).toBe(0.1);
    expect(a.total.estado).toBe("normal");
  });
  it("una vista donde una fila concentra las devoluciones la marca (Proveedor A: 15% vs el resto 2,5%)", () => {
    const a = agrupar(filas);
    expect(a.origen[0].etiqueta).toBe("Proveedor A");
    expect(a.origen[0].estado).toBe("atencion");
  });
  it("sin ninguna fila (ventana vacía) no falla: total en cero y sin tasa general", () => {
    const a = agrupar([]);
    expect(a.total.vendidas).toBe(0);
    expect(a.tasaGeneral).toBeNull();
    expect(a.talla).toEqual([]);
  });
});

describe("ultimosMeses — calendario sin Date", () => {
  it("del más reciente al más antiguo, cruzando de año", () => {
    expect(ultimosMeses("2026-02-14", 4)).toEqual(["2026-02-01", "2026-01-01", "2025-12-01", "2025-11-01"]);
  });
  it("un solo mes", () => {
    expect(ultimosMeses("2026-09-18", 1)).toEqual(["2026-09-01"]);
  });
});

describe("danadasPorTienda", () => {
  const filas: FilaDanadas[] = [
    { ubicacionId: "A", mes: "2026-08-01", condicion: "danada_reparacion", origen: "devolucion", unidades: 1 },
    { ubicacionId: "A", mes: "2026-08-01", condicion: "danada_donar", origen: "anulacion", unidades: 2 },
    { ubicacionId: "A", mes: "2026-08-01", condicion: "devolver_proveedor", origen: "devolucion", unidades: 4 },
    { ubicacionId: "B", mes: "2026-09-01", condicion: "danada_reparacion", origen: "devolucion", unidades: 5 },
  ];
  const r = danadasPorTienda(filas, ["A", "B", "C"], ["2026-09-01", "2026-08-01"]);

  it("dañada = a reparar + a donar; devolver al proveedor se cuenta aparte", () => {
    const a = r.find((t) => t.ubicacionId === "A")!;
    expect(a.meses.find((m) => m.mes === "2026-08-01")).toEqual({ mes: "2026-08-01", danadas: 3, aProveedor: 4 });
    expect(a.totalDanadas).toBe(3);
    expect(a.totalAProveedor).toBe(4);
  });
  it("un mes sin nada aparece en 0 (no se omite) y una tienda sin filas también", () => {
    expect(r.find((t) => t.ubicacionId === "A")!.meses[0]).toEqual({ mes: "2026-09-01", danadas: 0, aProveedor: 0 });
    const c = r.find((t) => t.ubicacionId === "C")!;
    expect(c.meses.every((m) => m.danadas === 0 && m.aProveedor === 0)).toBe(true);
  });
  it("no mezcla tiendas", () => {
    expect(r.find((t) => t.ubicacionId === "B")!.totalDanadas).toBe(5);
  });
});

describe("textoLectura", () => {
  it("cada estado tiene su texto y el de atención dice cuántas veces el promedio", () => {
    // 50 vendidas / 15 devueltas = 30%; el resto: 950 / 85 = 8,9% → 3,4 veces.
    expect(textoLectura(evaluar(fila({ etiqueta: "x", vendidas: 50, devueltas: 15 }), T))).toMatch(/3[.,]4 veces la tasa del resto/);
    expect(textoLectura(evaluar(fila({ etiqueta: "y", vendidas: 2, devueltas: 1 }), T))).toContain("Muestra chica");
    const textos = [
      textoLectura(evaluar(fila({ etiqueta: "a", vendidas: 50, devueltas: 15 }), T)),
      textoLectura(evaluar(fila({ etiqueta: "b", vendidas: 100, devueltas: 10 }), T)),
      textoLectura(evaluar(fila({ etiqueta: "c", vendidas: 2, devueltas: 1 }), T)),
      textoLectura(evaluar(fila({ etiqueta: "d" }), T)),
    ];
    expect(new Set(textos).size).toBe(4);
  });
});
