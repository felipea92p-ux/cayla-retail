import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import {
  alcanceConFiltros,
  alcancePorTipo,
  baseConFiltros,
  fraseAlcance,
  alcanceDelModelo,
  diasEnteros,
  modelosQueNoLlegan,
  agotadoDelModelo,
  modelosAgotados,
  queHayQuePedir,
  fechaEnQueSeAcaba,
  textoVendesPorSemana,
  textoVendiste,
  pieDePedir,
  parteDeArriba,
  primerasQuePedir,
  categoriaDe,
  diasANavidad,
  textoRitmo,
  tiposSinRegistrar,
  notaTiposSinRegistrar,
  curvaDeTallas,
  escalaRinde,
  FALLA_RINDE,
  filaRindeDe,
  notaRindeVacio,
  proximaNavidad,
  rindePorCategoria,
  SIN_CATEGORIA,
  solesRinde,
  tipRinde,
  type FilaRinde,
} from "./analisis-pedir";
import { armarModelos } from "./analisis-modelo";

// Datos inventados (el repo es público): modelos, colores y cifras de mentira.
let n = 0;
function prenda(p: Partial<PrendaAnalisis> = {}): PrendaAnalisis {
  n += 1;
  return {
    varianteId: `v${n}`,
    productoId: `p${n}`,
    nombre: `Modelo ${n}`,
    color: "Azul",
    colorHex: null,
    talla: "M",
    categoria: "Polos",
    categoriaPrefijo: "POL",
    categoriaFamilia: "indumentaria",
    fotoUrl: null,
    precio: 50,
    costo: 20,
    origen: null,
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    salioAlPiso: null,
    llego: null,
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    ...p,
  };
}

describe("categoriaDe", () => {
  it("la categoría del catálogo; sin ella, «Sin categoría» (también cuenta en «de cada 100»)", () => {
    expect(categoriaDe({ categoria: "Bodys" })).toBe("Bodys");
    expect(categoriaDe({ categoria: null })).toBe(SIN_CATEGORIA);
    expect(categoriaDe({ categoria: "  " })).toBe(SIN_CATEGORIA);
  });
});

describe("cuenta para Navidad", () => {
  it("el próximo 25 de diciembre: el de este año o, si ya pasó, el del siguiente (el mismo día es hoy)", () => {
    expect(proximaNavidad("2026-10-06")).toBe("2026-12-25");
    expect(proximaNavidad("2026-12-25")).toBe("2026-12-25");
    expect(proximaNavidad("2026-12-26")).toBe("2027-12-25");
  });

});

describe("¿para cuánto te alcanza? (B2: por tipo, contra Navidad)", () => {
  // Datos inventados: una tienda con 8 días de ventas en el ERP y Navidad a 79 días.
  const tienda = [
    prenda({ categoria: "Polos", vendidas30: 37, piso: 60, almacen: 187, salioAlPiso: "2026-09-30" }),
    prenda({ categoria: "Polos", vendidas30: 0, piso: 0, almacen: 4, salioAlPiso: null }),
    prenda({ categoria: "Capas", categoriaPrefijo: "CAP", vendidas30: 7, piso: 3, salioAlPiso: "2026-09-30" }),
    prenda({ categoria: "Jeans", categoriaPrefijo: "JEA", vendidas30: 0, piso: 10, almacen: 30, salioAlPiso: "2026-09-30" }),
    prenda({ categoria: "Bodys", categoriaPrefijo: "BOD", vendidas30: 6, piso: 5, almacen: 114, salioAlPiso: "2026-09-30" }),
    prenda({ categoria: "Faldas", vendidas30: 0, piso: 0, almacen: 0 }),
  ];

  it("lo que tienes entre lo que vendes por día (en los días de ventas de la tienda); de lo que menos dura a lo que más; lo que no se vendió, al final", () => {
    const a = alcancePorTipo(tienda, 8, 79, true);
    expect(a.map((t) => t.categoria)).toEqual(["Capas", "Polos", "Bodys", "Jeans"]);
    expect(a.map((t) => (t.dias === null ? null : Math.round(t.dias)))).toEqual([3, 54, 159, null]);
    expect(a.map((t) => t.pide)).toEqual([true, true, false, false]);
    expect(a[1]).toMatchObject({ vendidas: 37, tiene: 251, nunca: 4, prefijo: "POL" });
  });

  it("entre 30 días (una tienda con un mes de ventas) todo dura casi 4 veces más: Polos ya llega a Navidad", () => {
    const a = alcancePorTipo(tienda, 30, 79, true);
    expect(a.find((t) => t.categoria === "Polos")?.pide).toBe(false);
    expect(a.find((t) => t.categoria === "Capas")?.pide).toBe(true);
  });

  it("sin saber cuándo salió al piso cada prenda, «nunca salieron» queda en null (no en 0)", () => {
    expect(alcancePorTipo(tienda, 8, 79, false).every((t) => t.nunca === null)).toBe(true);
  });

  it("lo que se vendió y ya no está dura 0: «Ya no hay», y se pide", () => {
    const a = alcancePorTipo([prenda({ categoria: "Capas", vendidas30: 3, piso: 0, almacen: 0 })], 8, 79, true);
    expect(a[0]).toMatchObject({ dias: 0, pide: true });
  });

  it("cada prenda suma su ritmo en su propia ventana (2026-10-14): una colgada hace poco no se diluye en los días de la tienda", () => {
    // Datos inventados: tienda de 15 días; una blusa colgada hace 4 (ventana 7) vendió 2, otra colgada desde el primer día vendió 3.
    const tipo = [
      prenda({ categoria: "Tops", categoriaPrefijo: "TOP", vendidas30: 2, piso: 4, almacen: 6, diasDeVentas: 7 }),
      prenda({ categoria: "Tops", categoriaPrefijo: "TOP", vendidas30: 3, piso: 3, almacen: 7, diasDeVentas: 15 }),
    ];
    const a = alcancePorTipo(tipo, 15, 72, true)[0]!;
    // 2/7 + 3/15 = 0,486 por día → 20 unidades duran 41 días (entre los 15 de la tienda serían 60 y «llegaría» a Navidad).
    expect(Math.round(a.dias!)).toBe(41);
    expect(a.pide).toBe(true);
    expect(Math.round(alcancePorTipo(tipo.map((p) => ({ ...p, diasDeVentas: undefined })), 15, 72, true)[0]!.dias!)).toBe(60);
  });

  // ADR-0357, act. 2026-10-14: lo vendido sin registrar (anotado en caja con su tipo) cuenta en el ritmo de su tipo.
  describe("con lo vendido sin registrar", () => {
    // Datos inventados: un tipo que se registra poco (8 de 22 ventas con su prenda), en una tienda de 15 días con Navidad a 72.
    const poco = [
      prenda({ categoria: "Faldas", categoriaPrefijo: "FAL", vendidas30: 5, piso: 6, almacen: 20, salioAlPiso: "2026-10-01" }),
      prenda({ categoria: "Faldas", categoriaPrefijo: "FAL", vendidas30: 3, piso: 4, almacen: 19, salioAlPiso: "2026-10-01" }),
    ];

    it("sin contarlo, el tipo parecía llegar a Navidad; con lo vendido sin su prenda, no llega", () => {
      const solo = alcancePorTipo(poco, 15, 72, true)[0]!;
      expect(solo).toMatchObject({ vendidas: 8, sinPrenda: 0, tiene: 49, pide: false });
      expect(Math.round(solo.dias!)).toBe(92);
      const con = alcancePorTipo(poco, 15, 72, true, { Faldas: 14 })[0]!;
      expect(con).toMatchObject({ vendidas: 22, sinPrenda: 14, tiene: 49, pide: true });
      expect(Math.round(con.dias!)).toBe(33);
    });

    it("un tipo vendido SOLO sin registrar deja de ser «No se vendió»: tiene ritmo y se compara con Navidad", () => {
      const tipo = [prenda({ categoria: "Shorts", categoriaPrefijo: "SHO", vendidas30: 0, piso: 8, almacen: 10, salioAlPiso: "2026-10-01" })];
      expect(alcancePorTipo(tipo, 15, 72, true)[0]).toMatchObject({ dias: null, pide: false });
      const a = alcancePorTipo(tipo, 15, 72, true, { Shorts: 16 })[0]!;
      expect(a).toMatchObject({ vendidas: 16, sinPrenda: 16, tiene: 18, pide: true });
      expect(Math.round((a.dias ?? 0) / 7)).toBe(2);
    });

    it("un tipo que la tienda tiene pero hoy sin venta ni stock también suma lo vendido sin registrar (y ya no hay)", () => {
      const agotado = [prenda({ categoria: "Capas", categoriaPrefijo: "CAP", vendidas30: 0, piso: 0, almacen: 0 })];
      expect(alcancePorTipo(agotado, 15, 72, true)).toEqual([]);
      expect(alcancePorTipo(agotado, 15, 72, true, { Capas: 4 })[0]).toMatchObject({ vendidas: 4, sinPrenda: 4, tiene: 0, dias: 0, pide: true });
    });

    it("un tipo que la tienda no tiene registrado no entra a la tabla: se nombra aparte, del más vendido al menos", () => {
      const a = alcancePorTipo(poco, 15, 72, true, { Pulseras: 11, Relojes: 10, Faldas: 14 });
      expect(a.map((t) => t.categoria)).toEqual(["Faldas"]);
      expect(tiposSinRegistrar(poco, { Pulseras: 11, Relojes: 10, Faldas: 14, Lentes: 0 })).toEqual([
        { categoria: "Pulseras", vendidas: 11 },
        { categoria: "Relojes", vendidas: 10 },
      ]);
      expect(notaTiposSinRegistrar([{ categoria: "Pulseras", vendidas: 11 }])).toBe(
        "También vendiste 11 Pulseras sin registrar: no están en el sistema, así que no se sabe para cuánto te alcanzan.",
      );
      expect(notaTiposSinRegistrar([
        { categoria: "Pulseras", vendidas: 11 },
        { categoria: "Relojes", vendidas: 10 },
      ])).toContain("11 Pulseras y 10 Relojes sin registrar");
      expect(
        notaTiposSinRegistrar(["A", "B", "C", "D", "E"].map((c, k) => ({ categoria: c, vendidas: 9 - k }))),
      ).toContain("9 A, 8 B, 7 C y 2 tipos más sin registrar");
    });

    it("sin lo vendido sin registrar (o vacío), todo queda como antes", () => {
      const tienda = [
        prenda({ categoria: "Polos", vendidas30: 37, piso: 60, almacen: 187 }),
        prenda({ categoria: "Capas", categoriaPrefijo: "CAP", vendidas30: 7, piso: 3 }),
      ];
      expect(alcancePorTipo(tienda, 8, 79, true, {})).toEqual(alcancePorTipo(tienda, 8, 79, true));
      expect(alcancePorTipo(tienda, 8, 79, true).every((t) => t.sinPrenda === 0)).toBe(true);
    });
  });

  it("de qué días habla el ritmo", () => {
    // 2026-10-14: cada prenda mide su ritmo desde que se colgó (de 7 días hasta los de la tienda); con una semana o menos es lo mismo.
    expect(textoRitmo(8)).toBe("Al ritmo desde que se colgó · hasta 8 días");
    expect(textoRitmo(7)).toBe("Al ritmo de los últimos 7 días");
    expect(textoRitmo(1)).toBe("Al ritmo de los últimos 1 día");
  });

  it("los días a Navidad", () => {
    expect(diasANavidad("2026-10-07")).toBe(79);
    expect(diasANavidad("2026-12-25")).toBe(0);
    expect(diasANavidad("2026-12-26")).toBe(364);
  });
});

describe("curvaDeTallas", () => {
  const tienda = [
    prenda({ categoria: "Camisas y Blusas", talla: "S", vendidas30: 1, piso: 4 }),
    prenda({ categoria: "Camisas y Blusas", talla: "M", vendidas30: 6, piso: 3 }),
    prenda({ categoria: "Bodys", talla: "L", vendidas30: 3, piso: 3 }),
    prenda({ categoria: "Jeans", talla: "28", vendidas30: 1, piso: 1 }),
    prenda({ categoria: "Polos", talla: "Estándar", vendidas30: 10, piso: 10 }),
  ];

  it("sin tipo elegido: la estándar primero y las tallas del sistema que más pesa (letras), con la nota de cuáles", () => {
    const c = curvaDeTallas(tienda, null);
    expect(c).toEqual({
      tipo: "tallas",
      columnas: [
        { talla: "Estándar", v: 50, t: 50, vend: 10, tiene: 10, pideMas: false },
        { talla: "S", v: 5, t: 20, vend: 1, tiene: 4, pideMas: false },
        { talla: "M", v: 30, t: 15, vend: 6, tiene: 3, pideMas: true },
        { talla: "L", v: 15, t: 15, vend: 3, tiene: 3, pideMas: false },
      ],
      max: 50,
      nota: "Modelos con talla Estándar, S, M y L",
    });
  });

  it("la estándar es una columna más (Felipe 2026-10-12): Polos casi todo Estándar ya no esconde lo vendido", () => {
    const polos = [
      prenda({ categoria: "Polos", talla: "Estándar", vendidas30: 84, piso: 217 }),
      prenda({ categoria: "Polos", talla: "M", vendidas30: 2, piso: 3 }),
      prenda({ categoria: "Polos", talla: "L", vendidas30: 0, piso: 3 }),
      prenda({ categoria: "Polos", talla: "S", vendidas30: 0, piso: 2 }),
      prenda({ categoria: "Polos", talla: "Única", vendidas30: 1, piso: 0 }),
    ];
    const c = curvaDeTallas(polos, "Polos");
    expect(c.tipo === "tallas" && c.columnas.map((x) => [x.talla, x.vend, x.tiene])).toEqual([
      ["Estándar", 85, 217],
      ["S", 0, 2],
      ["M", 2, 3],
      ["L", 0, 3],
    ]);
    expect(c).not.toHaveProperty("falta");
  });

  it("sin tipo elegido y con más números que letras, compara los números", () => {
    const c = curvaDeTallas(
      [
        prenda({ categoria: "Jeans", talla: "30", vendidas30: 5, piso: 5 }),
        prenda({ categoria: "Jeans", talla: "26", vendidas30: 1, piso: 5 }),
        prenda({ categoria: "Chalecos", talla: "M", vendidas30: 1, piso: 1 }),
      ],
      null,
    );
    expect(c.tipo === "tallas" && c.columnas.map((x) => x.talla)).toEqual(["26", "30"]);
    expect(c.tipo === "tallas" && c.nota).toBe("Modelos con talla 26 y 30");
  });

  it("con un tipo elegido, solo sus tallas, en el orden de la tienda (XS, S, M, L, XL; números de menor a mayor)", () => {
    const c = curvaDeTallas(
      [
        prenda({ categoria: "Chalecos", talla: "XL", vendidas30: 1, piso: 1 }),
        prenda({ categoria: "Chalecos", talla: "S", vendidas30: 1, piso: 1 }),
        prenda({ categoria: "Chalecos", talla: "XS", vendidas30: 1, piso: 1 }),
        prenda({ categoria: "Chalecos", talla: "L", vendidas30: 1, piso: 1 }),
        prenda({ categoria: "Polos", talla: "M", vendidas30: 9, piso: 1 }),
      ],
      "Chalecos",
    );
    expect(c.tipo === "tallas" && c.columnas.map((x) => x.talla)).toEqual(["XS", "S", "L", "XL"]);
    expect(c.tipo === "tallas" && c.nota).toBeNull();
  });

  it("un tipo que solo se vende en talla única o estándar no tiene curva", () => {
    expect(curvaDeTallas(tienda, "Polos")).toEqual({ tipo: "unica" });
    expect(curvaDeTallas([prenda({ talla: "Única", vendidas30: 2, piso: 1 })], null)).toEqual({ tipo: "unica" });
  });

  it("sin ventas ni prendas del tipo, vacía", () => {
    expect(curvaDeTallas(tienda, "Casacas")).toEqual({ tipo: "vacia" });
    expect(curvaDeTallas([prenda({ talla: "S", vendidas30: 0, piso: 0 })], null)).toEqual({ tipo: "vacia" });
  });
});

describe("lo que más rinde", () => {
  const fila = (f: Partial<FilaRinde> = {}): FilaRinde => ({
    categoria: "Polos",
    costo: 20,
    importe: 0,
    costoVentas: 0,
    costoDevoluciones: 0,
    udsSinCosto: 0,
    totalPromedio: 10,
    stockInicio: 5,
    ...f,
  });

  it("lee la fila cruda de la base (números o textos); el costo 0 o sin costo es «no se sabe»", () => {
    expect(
      filaRindeDe({
        categoria_nombre: "Bodys",
        costo: "18.50",
        a_importe: 590,
        a_costo_ventas: "120",
        a_costo_devoluciones: null,
        a_uds_sin_costo: 1,
        a_total_promedio: "7.25",
        a_stock_inicio: 4,
      }),
    ).toEqual({ categoria: "Bodys", costo: 18.5, importe: 590, costoVentas: 120, costoDevoluciones: 0, udsSinCosto: 1, totalPromedio: 7.25, stockInicio: 4 });
    expect(filaRindeDe({ costo: 0 }).costo).toBeNull();
    expect(filaRindeDe(null)).toEqual({ categoria: null, costo: null, importe: 0, costoVentas: 0, costoDevoluciones: 0, udsSinCosto: 0, totalPromedio: 0, stockInicio: 0 });
  });

  it("ganancia (venta sin IGV − costo de lo vendido) entre lo que hubo en ropa, al costo y en promedio", () => {
    // 1,180 con IGV = 1,000; costo vendido 400 → ganó 600; hubo 25 en promedio a S/ 20 = S/ 500 → S/ 1.20 por cada S/ 1.
    expect(rindePorCategoria([fila({ importe: 1180, costoVentas: 400, totalPromedio: 25 })], 0.18)).toEqual([{ categoria: "Polos", porSol: 1.2 }]);
  });

  it("las devoluciones devuelven su costo; lo vendido sin costo guardado se cuenta con el costo de hoy", () => {
    // 1,000 sin IGV − (400 − 50 + 2 × 20) = 610 → 610 / 500 = 1.22.
    expect(rindePorCategoria([fila({ importe: 1180, costoVentas: 400, costoDevoluciones: 50, udsSinCosto: 2, totalPromedio: 25 })], 0.18)).toEqual([
      { categoria: "Polos", porSol: 1.22 },
    ]);
  });

  it("suma por tipo; las prendas sin costo no cuentan (ni lo que se ganó ni lo que hay)", () => {
    const r = rindePorCategoria(
      [
        fila({ importe: 590, costoVentas: 200, totalPromedio: 10 }),
        fila({ importe: 590, costoVentas: 200, totalPromedio: 10 }),
        fila({ costo: null, importe: 5900, totalPromedio: 1 }),
      ],
      0.18,
    );
    // (500 − 200) × 2 = 600 sobre (20 × 10) × 2 = 400 → 1.5.
    expect(r).toEqual([{ categoria: "Polos", porSol: 1.5 }]);
  });

  it("un tipo que no tenía ropa el primer día de los 90 todavía no se mide", () => {
    const r = rindePorCategoria([fila({ categoria: "Conjuntos", stockInicio: 0, importe: 1180 }), fila({ categoria: "Polos", importe: 236 })], 0.18);
    expect(r.map((x) => x.categoria)).toEqual(["Polos"]);
  });

  it("de la que más rinde a la que menos; si se perdió, en negativo; sin categoría, «Sin categoría»", () => {
    const r = rindePorCategoria(
      [
        fila({ categoria: "Polos", importe: 236, totalPromedio: 10 }),
        fila({ categoria: "Bodys", importe: 1180, costoVentas: 200, totalPromedio: 10 }),
        fila({ categoria: null, importe: 118, costoVentas: 160, totalPromedio: 10 }),
      ],
      0.18,
    );
    expect(r).toEqual([
      { categoria: "Bodys", porSol: 4 },
      { categoria: "Polos", porSol: 1 },
      { categoria: SIN_CATEGORIA, porSol: -0.3 },
    ]);
  });

  it("sin filas, vacío", () => {
    expect(rindePorCategoria([], 0.18)).toEqual([]);
  });

  it("la escala llega a S/ 1.40 (la maqueta) o a una décima más que el que más rinde", () => {
    expect(escalaRinde([])).toBe(1.4);
    expect(escalaRinde([{ porSol: 1.3 }, { porSol: 0.2 }])).toBe(1.4);
    expect(escalaRinde([{ porSol: 1.1 }])).toBe(1.4);
    expect(escalaRinde([{ porSol: 1.35 }])).toBe(1.5);
    expect(escalaRinde([{ porSol: 2.5 }])).toBe(2.6);
    expect(escalaRinde([{ porSol: -0.4 }])).toBe(1.4);
  });

  it("dice los soles con dos decimales y su tooltip en palabras de tienda", () => {
    expect(solesRinde(1.3)).toBe("S/\u00a01.30");
    expect(solesRinde(0)).toBe("S/\u00a00.00");
    expect(solesRinde(-0.2)).toBe("S/\u00a0−0.20");
    expect(tipRinde({ categoria: "Polos", porSol: 1.1 })).toBe("Por cada S/\u00a01 que tienes en Polos, ganaste S/\u00a01.10 en 90 días");
    expect(tipRinde({ categoria: "Gorros", porSol: -0.25 })).toBe("Por cada S/\u00a01 que tienes en Gorros, perdiste S/\u00a00.25 en 90 días");
  });

  it("sin nada que mostrar: si la base no respondió, eso; si no, que todavía no alcanza", () => {
    expect(notaRindeVacio([FALLA_RINDE])).toBe("No se pudo leer ahora.");
    expect(notaRindeVacio(["No se pudo leer el último conteo"])).toBe("Todavía no hay 90 días de ventas con su costo para medirlo.");
  });
});

describe("Qué pedir por modelo (ADR-0357, decisión 12)", () => {
  const HOY_PEDIR = "2026-10-10";
  // Un modelo colgado en M con su L guardada, y otro modelo que nadie colgó.
  const colgado = [
    prenda({ productoId: "mA", nombre: "Polo Ensayo", piso: 2, vendidas30: 4, salioAlPiso: "2026-10-01" }),
    prenda({ productoId: "mA", nombre: "Polo Ensayo", talla: "L", almacen: 3 }),
  ];
  const guardado = [prenda({ productoId: "mB", nombre: "Polo Guardado", almacen: 5 })];
  const modelos = armarModelos([...colgado, ...guardado], HOY_PEDIR);

  it("«nunca salió al piso» solo cuenta lo del modelo que nadie colgó, no la talla guardada de uno colgado", () => {
    const [polos] = alcancePorTipo(modelos, 10, 76, true);
    expect(polos).toMatchObject({ vendidas: 4, tiene: 10, nunca: 5 });
  });

  it("las tallas se siguen comparando talla por talla (con las filas de la base, no con los modelos)", () => {
    // La L guardada del modelo colgado es una columna con lo que tiene: con los modelos (talla "" si tienen varias) se perdería.
    const curva = curvaDeTallas([...colgado, ...guardado], null);
    expect(curva.tipo === "tallas" ? curva.columnas.map((c) => c.talla) : []).toEqual(["M", "L"]);
  });

});

describe("Qué pedir con los filtros de la barra (cara B)", () => {
  const sin = { q: "", tipo: [], talla: [], color: [], precio: [], origen: [], quieta: [] };
  const tallas = [
    prenda({ productoId: "p1", categoria: "Polos", talla: "S", vendidas30: 6, piso: 6 }),
    prenda({ productoId: "p1", categoria: "Polos", talla: "M", vendidas30: 6, piso: 0 }),
    prenda({ productoId: "p2", categoria: "Faldas", talla: "S", vendidas30: 3, piso: 9 }),
  ];
  const modelos = armarModelos(tallas, "2026-11-21");
  it("sin talla ni color cuenta los modelos; con talla, solo esa talla", () => {
    expect(baseConFiltros(modelos, tallas, sin)).toHaveLength(2);
    const conM = baseConFiltros(modelos, tallas, { ...sin, talla: ["M"] });
    expect(conM.map((p) => p.talla)).toEqual(["M"]);
    const polosM = alcanceConFiltros(modelos, tallas, { ...sin, talla: ["M"] }, 30, 34, true, {});
    expect(polosM.find((x) => x.categoria === "Polos")?.dias).toBe(0);
  });
  it("lo vendido sin registrar solo se suma sin otros filtros que el tipo", () => {
    const conTodo = alcanceConFiltros(modelos, tallas, sin, 30, 34, true, { Polos: 12 });
    const conTalla = alcanceConFiltros(modelos, tallas, { ...sin, talla: ["S"] }, 30, 34, true, { Polos: 12 });
    expect(conTodo.find((x) => x.categoria === "Polos")?.sinPrenda).toBe(12);
    expect(conTalla.find((x) => x.categoria === "Polos")?.sinPrenda).toBe(0);
  });
  it("la frase", () => {
    expect(fraseAlcance(1, 34)).toBe("para la campaña: no te alcanza hasta Navidad, en 34 días");
    expect(fraseAlcance(5, 1)).toBe("para la campaña: no te alcanzan hasta Navidad, en 1 día");
  });
});

describe("Qué pedir por modelo (Felipe 2026-11-21: las tarjetas son modelos; el tipo es un filtro)", () => {
  const sin = { talla: [] as string[], color: [] as string[] };
  // Datos inventados: un polo que se vende en S y M (la M agotada), una falda que dura y un top que no se vendió.
  const tallas = [
    prenda({ productoId: "q1", nombre: "Polo Prueba", categoria: "Polos", talla: "S", vendidas30: 6, piso: 6 }),
    prenda({ productoId: "q1", nombre: "Polo Prueba", categoria: "Polos", talla: "M", vendidas30: 6, piso: 0 }),
    prenda({ productoId: "q2", nombre: "Falda Prueba", categoria: "Faldas", talla: "S", vendidas30: 3, piso: 9 }),
    prenda({ productoId: "q3", nombre: "Top Quieto", categoria: "Tops", talla: "S", vendidas30: 0, piso: 4 }),
    prenda({ productoId: "q4", nombre: "Body Agotado", categoria: "Bodys", talla: "S", vendidas30: 2, piso: 0 }),
  ];
  const modelos = armarModelos(tallas, "2026-11-21");
  const de = (nombre: string) => modelos.find((m) => m.nombre === nombre)!;

  it("lo que tiene entre lo que vende por día, sumando sus tallas; sin ventas no hay ritmo", () => {
    expect(alcanceDelModelo(de("Polo Prueba"), sin, 30)).toMatchObject({ vendidas: 12, tiene: 6, dias: 15 });
    expect(alcanceDelModelo(de("Falda Prueba"), sin, 30).dias).toBe(90);
    expect(alcanceDelModelo(de("Top Quieto"), sin, 30).dias).toBeNull();
    expect(alcanceDelModelo(de("Body Agotado"), sin, 30).dias).toBe(0);
  });

  it("con una talla en los filtros, solo esa talla del modelo", () => {
    expect(alcanceDelModelo(de("Polo Prueba"), { ...sin, talla: ["M"] }, 30).dias).toBe(0);
    expect(alcanceDelModelo(de("Polo Prueba"), { ...sin, talla: ["S"] }, 30).dias).toBe(30);
    expect(alcanceDelModelo(de("Falda Prueba"), { ...sin, talla: ["M"] }, 30)).toMatchObject({ vendidas: 0, dias: null });
  });

  it("piden los que se venden, todavía tienen algo y no llegan a Navidad; los que llegan, no se venden o ya no tienen nada, no", () => {
    const piden = modelosQueNoLlegan(modelos, sin, 30, 34, "vende").map((a) => a.modelo.nombre);
    // «Body Agotado» no tiene nada: va arriba, en «Ya se agotaron» (Felipe 2026-11-24).
    expect(piden).toEqual(["Polo Prueba"]);
    expect(modelosQueNoLlegan(modelos, sin, 30, 120, "vende").map((a) => a.modelo.nombre)).toContain("Falda Prueba");
  });

  it("el orden: lo que más se vende (de siempre), lo que se acaba antes o por nombre", () => {
    const nombres = (orden: string) => modelosQueNoLlegan(modelos, sin, 30, 120, orden).map((a) => a.modelo.nombre);
    expect(nombres("vende")).toEqual(["Polo Prueba", "Falda Prueba"]);
    expect(nombres("acaba")).toEqual(["Polo Prueba", "Falda Prueba"]);
    expect(nombres("nombre")).toEqual(["Falda Prueba", "Polo Prueba"]);
  });

  it("«lo que más se vende y quedan pocos»: primero lo que se acaba en 2 semanas o menos, de lo más vendido a lo menos; después el resto", () => {
    // Datos inventados, con la forma de los de TRU del 2026-11-24: el que más vende se acaba en 13 días; otro vende poco y se acaba en 3.
    const t = [
      prenda({ productoId: "o1", nombre: "Polo Mucho", vendidas30: 60, piso: 26 }), // 2 por día: 13 días, quedan pocos
      prenda({ productoId: "o2", nombre: "Falda Poca", vendidas30: 10, piso: 1 }), // 3 días, quedan pocos
      prenda({ productoId: "o3", nombre: "Blusa Media", vendidas30: 30, piso: 20 }), // 20 días: no son pocos
      prenda({ productoId: "o4", nombre: "Short Lento", vendidas30: 5, piso: 3 }), // 18 días: no son pocos
    ];
    const ms = armarModelos(t, "2026-11-24");
    const nombres = (orden: string) => modelosQueNoLlegan(ms, sin, 30, 31, orden).map((a) => a.modelo.nombre);
    expect(nombres("pocos")).toEqual(["Polo Mucho", "Falda Poca", "Blusa Media", "Short Lento"]);
    expect(nombres("vende")).toEqual(["Polo Mucho", "Blusa Media", "Falda Poca", "Short Lento"]);
    expect(nombres("acaba")).toEqual(["Falda Poca", "Polo Mucho", "Short Lento", "Blusa Media"]);
  });

  it("el ritmo por día viaja con el alcance: es el que da «Vendes N por semana»", () => {
    // Polo Prueba: 6 + 6 vendidas en 30 días cada talla = 0,4 por día.
    expect(alcanceDelModelo(de("Polo Prueba"), sin, 30).porDia).toBeCloseTo(0.4);
    expect(textoVendesPorSemana(0.4)).toBe("Vendes 3 por semana");
    expect(textoVendesPorSemana(5.49)).toBe("Vendes 38 por semana");
    expect(textoVendesPorSemana(0.05)).toBe("Vendes menos de 1 por semana");
  });

  it("el día en que se acaba: hoy más los días que alcanza (al menos 1)", () => {
    expect(fechaEnQueSeAcaba("2026-11-24", 13.1)).toBe("7 dic.");
    expect(fechaEnQueSeAcaba("2026-11-24", 0.3)).toBe("25 nov.");
    expect(fechaEnQueSeAcaba("2026-12-30", 3)).toBe("2 ene.");
  });

  it("los días de la tarjeta, enteros: «Ya no hay» es solo el 0", () => {
    expect(diasEnteros(null)).toBeNull();
    expect(diasEnteros(0)).toBe(0);
    expect(diasEnteros(0.4)).toBe(1);
    expect(diasEnteros(15.6)).toBe(16);
  });
});

describe("Ya se agotaron (Felipe 2026-11-24: lo que se vendió entero no se va de «Qué pedir»)", () => {
  // Hoy 2026-11-24: las 8 semanas empiezan el 2026-09-30. Modelos inventados.
  const hoy = "2026-11-24";
  const sin = { talla: [] as string[], color: [] as string[] };
  const tallas = [
    // Se trajo poco para probar y se vendió todo en una semana, hace más de 30 días: antes se iba de la lista.
    prenda({ productoId: "a1", nombre: "Camisa Prueba", talla: "S", vendidas30: 0, semanas: [0, 0, 5, 0, 0, 0, 0, 0], salioAlPiso: "2026-10-17", ultimaVenta: "2026-10-22" }),
    prenda({ productoId: "a1", nombre: "Camisa Prueba", talla: "M", vendidas30: 0, semanas: [0, 0, 7, 0, 0, 0, 0, 0], salioAlPiso: "2026-10-18", ultimaVenta: "2026-10-23" }),
    // Agotado hace poco; se colgó antes de las 8 semanas: cuenta desde el 30 de setiembre.
    prenda({ productoId: "a2", nombre: "Top Prueba", talla: "S", vendidas30: 14, semanas: [2, 2, 2, 3, 3, 4, 4, 3], salioAlPiso: "2026-08-01", ultimaVenta: "2026-11-20", otras: [{ sedeId: "lim", stock: 2, vendidas30: 1 }] }),
    // Le queda una talla: no está agotado.
    prenda({ productoId: "a3", nombre: "Short Prueba", talla: "S", vendidas30: 3, semanas: [0, 0, 0, 0, 0, 1, 1, 1], piso: 0, ultimaVenta: "2026-11-10" }),
    prenda({ productoId: "a3", nombre: "Short Prueba", talla: "M", vendidas30: 1, semanas: [0, 0, 0, 0, 0, 0, 0, 1], almacen: 2, ultimaVenta: "2026-11-12" }),
    // Sin nada y sin ventas en 8 semanas: no es «se agotó», es algo que no se vende.
    prenda({ productoId: "a4", nombre: "Body Quieto", talla: "S", vendidas30: 0, ultimaVenta: "2026-06-01" }),
    // La base sin la última venta: se agotó, pero no se sabe cuándo.
    prenda({ productoId: "a5", nombre: "Falda Sin Fecha", talla: "S", vendidas30: 2, semanas: [0, 0, 0, 0, 0, 0, 1, 1], salioAlPiso: "2026-11-01" }),
  ];
  const modelos = armarModelos(tallas, hoy);
  const de = (nombre: string) => modelos.find((m) => m.nombre === nombre)!;

  it("sin nada aquí y con ventas en 8 semanas: cuándo se agotó y cuántas en cuántos días", () => {
    expect(agotadoDelModelo(de("Camisa Prueba"), sin, hoy)).toMatchObject({ vendidas: 12, agoto: "2026-10-23", dias: 7 });
    expect(agotadoDelModelo(de("Top Prueba"), sin, hoy)).toMatchObject({ vendidas: 23, agoto: "2026-11-20", dias: 52 });
    expect(agotadoDelModelo(de("Falda Sin Fecha"), sin, hoy)).toMatchObject({ vendidas: 2, agoto: null, dias: null });
  });

  it("lo que todavía tiene algo, o no se vendió en 8 semanas, no es un agotado", () => {
    expect(agotadoDelModelo(de("Short Prueba"), sin, hoy)).toBeNull();
    expect(agotadoDelModelo(de("Body Quieto"), sin, hoy)).toBeNull();
  });

  it("con una talla en los filtros, solo esa talla: la S del short se agotó aunque quede la M", () => {
    expect(agotadoDelModelo(de("Short Prueba"), { ...sin, talla: ["S"] }, hoy)).toMatchObject({ vendidas: 3, agoto: "2026-11-10" });
  });

  it("el orden: lo que más se vendió, lo que lleva más tiempo agotado o por nombre", () => {
    const nombres = (orden: string) => modelosAgotados(modelos, sin, hoy, orden).map((a) => a.modelo.nombre);
    expect(nombres("vende")).toEqual(["Top Prueba", "Camisa Prueba", "Falda Sin Fecha"]);
    expect(nombres("acaba")).toEqual(["Falda Sin Fecha", "Camisa Prueba", "Top Prueba"]);
    expect(nombres("nombre")).toEqual(["Camisa Prueba", "Falda Sin Fecha", "Top Prueba"]);
  });

  it("las dos partes juntas cuentan una vez cada modelo: los agotados arriba, los que se acaban abajo", () => {
    const { agotados, seAcaban, todos } = queHayQuePedir(modelos, sin, 30, hoy, "vende");
    expect(agotados.map((a) => a.modelo.nombre)).toEqual(["Top Prueba", "Camisa Prueba", "Falda Sin Fecha"]);
    expect(seAcaban.map((a) => a.modelo.nombre)).toEqual(["Short Prueba"]);
    expect(todos.map((m) => m.nombre)).toEqual(["Top Prueba", "Camisa Prueba", "Falda Sin Fecha", "Short Prueba"]);
  });

  it("arriba va la parte que responde el orden: «quedan pocos» → lo que se acaba; «no hay stock» y los demás → lo agotado", () => {
    expect(parteDeArriba("pocos")).toBe("seAcaban");
    expect(parteDeArriba("agotado")).toBe("agotados");
    expect(parteDeArriba("acaba")).toBe("agotados");
    expect(parteDeArriba("nombre")).toBe("agotados");
  });

  it("«Mostrar»: las primeras 10, 20 o 50 de cada parte, o todas", () => {
    const doce = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(primerasQuePedir(doce, "10")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(primerasQuePedir(doce, "20")).toHaveLength(12);
    expect(primerasQuePedir(doce, "todas")).toHaveLength(12);
    expect(primerasQuePedir(doce, "")).toHaveLength(12);
    expect(primerasQuePedir([], "10")).toEqual([]);
  });

  it("«Vendiste 12» «en 7 días»; sin saber los días, «en 8 semanas»", () => {
    expect(textoVendiste({ vendidas: 12, dias: 7 })).toEqual(["Vendiste 12", "en 7 días"]);
    expect(textoVendiste({ vendidas: 1, dias: 1 })).toEqual(["Vendiste 1", "en 1 día"]);
    expect(textoVendiste({ vendidas: 2, dias: null })).toEqual(["Vendiste 2", "en 8 semanas"]);
  });

  it("el pie: lo que viene en camino; si nada viene, otra tienda que lo tiene; si no, nada", () => {
    const ciudad = (id: string) => (id === "lim" ? "Lima" : undefined);
    expect(pieDePedir(de("Top Prueba"), hoy, ciudad)).toBe("Lima tiene 2");
    expect(pieDePedir(de("Camisa Prueba"), hoy, ciudad)).toBeNull();
    const conLlegada = { ...de("Top Prueba"), llega: [{ de: "compra" as const, cantidad: 12, fecha: "2026-12-06" }] };
    expect(pieDePedir(conLlegada, hoy, ciudad)).toBe("Llegan 12 el 6 dic.");
  });
});
