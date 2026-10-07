import { describe, expect, it } from "vitest";
import type { PrendaAnalisis } from "./analisis-tipos";
import {
  alcancePorTipo,
  categoriaDe,
  DIAS_ALCANZA_MAX,
  diasANavidad,
  finEjeAlcance,
  textoAlcance,
  textoRitmo,
  tipoCorto,
  cuentaNavidad,
  curvaDeTallas,
  escalaRinde,
  estadoQuedan,
  FALLA_RINDE,
  filaRindeDe,
  masVendidas,
  notaRindeVacio,
  PRENDAS_EN_RANKING,
  proximaNavidad,
  rielNavidad,
  rindePorCategoria,
  SIN_CATEGORIA,
  solesRinde,
  tipRinde,
  ventaMaxima,
  type FilaRinde,
} from "./analisis-pedir";

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

  it("semanas enteras mientras falte una o más (el 6 de octubre: 80 días = 11 semanas, como la maqueta)", () => {
    expect(cuentaNavidad("2026-10-06")).toEqual({ valor: 11, texto: "semanas para Navidad" });
    expect(cuentaNavidad("2026-12-18")).toEqual({ valor: 1, texto: "semana para Navidad" });
    expect(cuentaNavidad("2026-12-26")).toEqual({ valor: 52, texto: "semanas para Navidad" });
  });

  it("en la última semana, días; el mismo día, sin número", () => {
    expect(cuentaNavidad("2026-12-20")).toEqual({ valor: 5, texto: "días para Navidad" });
    expect(cuentaNavidad("2026-12-24")).toEqual({ valor: 1, texto: "día para Navidad" });
    expect(cuentaNavidad("2026-12-25")).toEqual({ valor: null, texto: "es Navidad" });
  });
});

describe("rielNavidad", () => {
  it("del 1 del mes de hoy al 31 de diciembre: hoy, cada mes en su mitad y Navidad, en % del tramo", () => {
    const r = rielNavidad("2026-10-06");
    // 1 oct → 31 dic son 91 días: hoy es el día 5 y Navidad el 85 (las posiciones de la maqueta).
    expect(r.hoyPct).toBe(5.5);
    expect(r.navidadPct).toBe(93.4);
    expect(r.meses.map((m) => m.texto)).toEqual(["octubre", "noviembre", "diciembre"]);
    expect(r.meses.map((m) => m.pct)).toEqual([16.5, 50, 83.5]);
    expect(r.juntos).toBe(false);
    expect(r.etiqueta).toBe("Hoy 6 de octubre, Navidad 25 de diciembre");
  });

  it("todo queda dentro del riel y en orden: hoy antes que Navidad, los meses de izquierda a derecha", () => {
    for (const hoy of ["2026-01-01", "2026-06-30", "2026-09-01", "2026-12-01", "2026-12-25", "2026-12-31"]) {
      const r = rielNavidad(hoy);
      expect(r.hoyPct).toBeGreaterThanOrEqual(0);
      expect(r.navidadPct).toBeLessThanOrEqual(100);
      expect(r.hoyPct).toBeLessThanOrEqual(r.navidadPct);
      const pcts = r.meses.map((m) => m.pct);
      expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
      expect(new Set(r.meses.map((m) => m.clave)).size).toBe(r.meses.length);
    }
  });

  it("cerca de Navidad los rótulos se pisarían: «Hoy» queda solo como punto", () => {
    expect(rielNavidad("2026-12-10").juntos).toBe(false);
    expect(rielNavidad("2026-12-23").juntos).toBe(true);
    expect(rielNavidad("2026-12-25").juntos).toBe(true);
  });

  it("con 5 a 7 meses, abreviados; con más, abreviados y uno sí, uno no, siempre con diciembre", () => {
    expect(rielNavidad("2026-08-15").meses.map((m) => m.texto)).toEqual(["ago", "set", "oct", "nov", "dic"]);
    expect(rielNavidad("2027-03-10").meses.map((m) => m.texto)).toEqual(["abr", "jun", "ago", "oct", "dic"]);
    // Pasada la Navidad, el riel llega a la del año siguiente: 13 meses.
    const r = rielNavidad("2026-12-26");
    expect(r.meses.map((m) => m.texto)).toEqual(["dic", "feb", "abr", "jun", "ago", "oct", "dic"]);
    expect(r.etiqueta).toBe("Hoy 26 de diciembre, Navidad 25 de diciembre");
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
    expect(textoAlcance(0)).toBe("Ya no hay");
  });

  it("las palabras: días bajo una semana, semanas hasta 6 meses, y lo que no se vendió", () => {
    expect(textoAlcance(3.4)).toBe("3 días");
    expect(textoAlcance(0.4)).toBe("1 día");
    expect(textoAlcance(20)).toBe("3 semanas");
    expect(textoAlcance(7)).toBe("1 semana");
    expect(textoAlcance(181)).toBe("26 semanas");
    expect(textoAlcance(DIAS_ALCANZA_MAX)).toBe("Más de 6 meses");
    expect(textoAlcance(null)).toBe("No se vendió");
    expect(textoRitmo(8)).toBe("Al ritmo de los últimos 8 días");
    expect(textoRitmo(1)).toBe("Al ritmo de los últimos 1 día");
  });

  it("los días a Navidad, el nombre corto de un tipo y el fin del eje (6 meses, o más si Navidad queda lejos)", () => {
    expect(diasANavidad("2026-10-07")).toBe(79);
    expect(diasANavidad("2026-12-25")).toBe(0);
    expect(diasANavidad("2026-12-26")).toBe(364);
    expect(tipoCorto("Gorros y Sombreros")).toBe("Gorros");
    expect(tipoCorto("Polos")).toBe("Polos");
    expect(finEjeAlcance(79)).toBe(DIAS_ALCANZA_MAX);
    expect(finEjeAlcance(300)).toBe(345);
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

  it("sin tipo elegido: las tallas del sistema que más pesa (letras), con la nota de cuáles", () => {
    const c = curvaDeTallas(tienda, null);
    expect(c).toEqual({
      tipo: "tallas",
      columnas: [
        { talla: "S", v: 10, t: 40, vend: 1, tiene: 4, pideMas: false },
        { talla: "M", v: 60, t: 30, vend: 6, tiene: 3, pideMas: true },
        { talla: "L", v: 30, t: 30, vend: 3, tiene: 3, pideMas: false },
      ],
      max: 60,
      falta: "M",
      nota: "Modelos con talla S, M y L",
    });
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
    expect(c.tipo === "tallas" && c.falta).toBeNull();
  });

  it("si nada falta por 4 o más, «Parejo» (falta null); a igual diferencia, la primera talla", () => {
    const parejo = curvaDeTallas(
      [prenda({ categoria: "Bodys", talla: "S", vendidas30: 34, piso: 33 }), prenda({ categoria: "Bodys", talla: "M", vendidas30: 66, piso: 67 })],
      "Bodys",
    );
    expect(parejo.tipo === "tallas" && parejo.falta).toBeNull();
    const empate = curvaDeTallas(
      [
        prenda({ categoria: "Bodys", talla: "S", vendidas30: 30, piso: 20 }),
        prenda({ categoria: "Bodys", talla: "M", vendidas30: 30, piso: 20 }),
        prenda({ categoria: "Bodys", talla: "L", vendidas30: 40, piso: 60 }),
      ],
      "Bodys",
    );
    expect(empate.tipo === "tallas" && empate.falta).toBe("S");
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

describe("lo que más se vende", () => {
  it(`las ${PRENDAS_EN_RANKING} que más se venden, sin las que no se vendieron; a igual venta, por nombre`, () => {
    const prendas = [
      ...Array.from({ length: 9 }, (_, k) => prenda({ nombre: `Polo ${String.fromCharCode(73 - k)}`, vendidas30: k + 1 })),
      prenda({ nombre: "Polo Z", vendidas30: 9 }),
      prenda({ nombre: "Polo quieto", vendidas30: 0, piso: 5 }),
    ];
    const tops = masVendidas(prendas, null);
    expect(tops).toHaveLength(PRENDAS_EN_RANKING);
    expect(tops.map((p) => p.vendidas30)).toEqual([9, 9, 8, 7, 6, 5, 4, 3]);
    expect(tops[0]!.nombre).toBe("Polo A");
    expect(tops[1]!.nombre).toBe("Polo Z");
    expect(tops.some((p) => p.nombre === "Polo quieto")).toBe(false);
  });

  it("con un tipo elegido, solo ese tipo", () => {
    const prendas = [prenda({ categoria: "Polos", vendidas30: 5 }), prenda({ categoria: "Bodys", vendidas30: 9 }), prenda({ categoria: null, vendidas30: 2 })];
    expect(masVendidas(prendas, "Polos").map((p) => p.categoria)).toEqual(["Polos"]);
    expect(masVendidas(prendas, SIN_CATEGORIA).map((p) => p.vendidas30)).toEqual([2]);
  });

  it("la venta más alta de la tienda (para medir las barras), al menos 1", () => {
    expect(ventaMaxima([prenda({ vendidas30: 3 }), prenda({ vendidas30: 8 })])).toBe(8);
    expect(ventaMaxima([])).toBe(1);
  });

  it("lo que queda: agotada en rojo, 1 o 2 en ámbar, más en verde", () => {
    expect(estadoQuedan({ piso: 0, almacen: 0 })).toEqual({ est: "urg", texto: "Agotada" });
    expect(estadoQuedan({ piso: 1, almacen: 0 })).toEqual({ est: "ate", texto: "Queda 1" });
    expect(estadoQuedan({ piso: 1, almacen: 1 })).toEqual({ est: "ate", texto: "Quedan 2" });
    expect(estadoQuedan({ piso: 2, almacen: 3 })).toEqual({ est: "bien", texto: "Quedan 5" });
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
    expect(solesRinde(1.3)).toBe("S/ 1.30");
    expect(solesRinde(0)).toBe("S/ 0.00");
    expect(solesRinde(-0.2)).toBe("S/ −0.20");
    expect(tipRinde({ categoria: "Polos", porSol: 1.1 })).toBe("Por cada S/ 1 que tienes en Polos, ganaste S/ 1.10 en 90 días");
    expect(tipRinde({ categoria: "Gorros", porSol: -0.25 })).toBe("Por cada S/ 1 que tienes en Gorros, perdiste S/ 0.25 en 90 días");
  });

  it("sin nada que mostrar: si la base no respondió, eso; si no, que todavía no alcanza", () => {
    expect(notaRindeVacio([FALLA_RINDE])).toBe("No se pudo leer ahora.");
    expect(notaRindeVacio(["No se pudo leer el último conteo"])).toBe("Todavía no hay 90 días de ventas con su costo para medirlo.");
  });
});
