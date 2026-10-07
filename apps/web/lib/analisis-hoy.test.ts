import { describe, expect, it } from "vitest";
import type { PrendaAnalisis, PrendaEnOtraSede } from "./analisis-tipos";
import {
  ALTO_COLUMNA,
  grosorCamino,
  altoNecesario,
  CAB_SE_QUEDAN,
  caminosDeHoy,
  cintaFlujo,
  carrilesDeCinta,
  ejeCinta,
  puntosDeCinta,
  SEGUNDOS_PUNTO,
  columnasFlujo,
  DIFERENCIA_PIDE_MAS,
  estadoLlegadas,
  estadoQuieta,
  estadosDelFlujo,
  etiquetaFlujo,
  FLUJO,
  geometriaFlujo,
  listaTip,
  miniMariposa,
  paraReponerPiso,
  partesPorCategoria,
  pastillaFlujo,
  px,
  quietasHoy,
  seAcabanHoy,
  textoDiasQueQuedan,
  textoPastilla,
  TIP_PRENDAS,
  titulosFlujo,
  todosLosCaminos,
  type CaminoHoy,
  type CaminosHoy,
  type EntradaColumna,
  type GeometriaFlujo,
} from "./analisis-hoy";
import { SIN_CATEGORIA } from "./analisis-pedir";

// Datos inventados para la prueba (no son de producción ni del catálogo).
let siguiente = 0;
function prenda(parcial: Partial<PrendaAnalisis> = {}): PrendaAnalisis {
  siguiente += 1;
  return {
    varianteId: `v${siguiente}`,
    productoId: `p${siguiente}`,
    nombre: `Prenda ${siguiente}`,
    color: "Azul",
    colorHex: "#3366AA",
    talla: "M",
    categoria: "Polos",
    categoriaPrefijo: "POL",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 50,
    costo: 20,
    origen: "terceros",
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [],
    llega: [],
    ...parcial,
  };
}

const sedes = [
  { id: "tru", ciudad: "Trujillo" },
  { id: "aqp", ciudad: "Arequipa" },
  { id: "lim", ciudad: "Lima" },
];
const otras = (aqp: Partial<PrendaEnOtraSede>, lim: Partial<PrendaEnOtraSede> = {}): PrendaEnOtraSede[] => [
  { sedeId: "aqp", stock: 0, vendidas30: 0, ...aqp },
  { sedeId: "lim", stock: 0, vendidas30: 0, ...lim },
];

// Las cuatro clases de prenda de Hoy, con 60 días para liquidar.
const seAcaba = (p: Partial<PrendaAnalisis> = {}) => prenda({ piso: 1, almacen: 0, vendidas30: 6, diasSinVender: 2, ...p }); // 5 días
const agotada = (p: Partial<PrendaAnalisis> = {}) => prenda({ piso: 0, almacen: 0, vendidas30: 4, diasSinVender: 3, ...p });
const paraEnviar = (sede: "aqp" | "lim", p: Partial<PrendaAnalisis> = {}) =>
  prenda({ piso: 2, almacen: 1, vendidas30: 0, diasSinVender: 70, otras: sede === "aqp" ? otras({ vendidas30: 3 }) : otras({}, { vendidas30: 4 }), ...p });
const paraLiquidar = (p: Partial<PrendaAnalisis> = {}) => prenda({ piso: 3, almacen: 0, vendidas30: 0, diasSinVender: 75, otras: otras({}), ...p });

describe("las cuatro tarjetas", () => {
  it("«¿Qué se acaba?»: solo lo que se acaba, lo agotado primero y, a igual plazo, lo que más se vende", () => {
    const a = seAcaba({ nombre: "A", piso: 2, vendidas30: 6 }); // 10 días
    const b = agotada({ nombre: "B" });
    const c = seAcaba({ nombre: "C", piso: 1, vendidas30: 15 }); // 2 días
    const quieta = paraLiquidar();
    expect(seAcabanHoy([a, quieta, b, c], 60).map((p) => p.nombre)).toEqual(["B", "C", "A"]);
  });

  it("«¿Qué no se mueve?»: mandar y liquidar, de la que más espera a la que menos; lo que se vigila no entra", () => {
    const x = paraLiquidar({ nombre: "X", diasSinVender: 65 });
    const y = paraEnviar("aqp", { nombre: "Y", diasSinVender: 120 });
    const vigila = paraLiquidar({ nombre: "V", diasSinVender: 40 });
    expect(quietasHoy([x, vigila, y], 60).map((p) => p.nombre)).toEqual(["Y", "X"]);
    // Con el umbral más bajo, la que se vigilaba ya no se mueve.
    expect(quietasHoy([x, vigila, y], 35).map((p) => p.nombre)).toEqual(["Y", "X", "V"]);
  });

  it("los días que quedan: «Ya no hay» en rojo, una semana o menos en ámbar, más en pizarra", () => {
    expect(textoDiasQueQuedan(0)).toEqual({ texto: "Ya no hay", est: "urg", agotada: true });
    expect(textoDiasQueQuedan(1)).toEqual({ texto: "Queda 1 día", est: "ate", agotada: false });
    expect(textoDiasQueQuedan(7)).toEqual({ texto: "Quedan 7 días", est: "ate", agotada: false });
    expect(textoDiasQueQuedan(8)).toEqual({ texto: "Quedan 8 días", est: "info", agotada: false });
  });

  it("una quieta va en rojo desde los 3 meses", () => {
    expect(estadoQuieta(89)).toBe("ate");
    expect(estadoQuieta(90)).toBe("urg");
  });

  it("«¿Se vende lo que llega?»: va bien desde la meta (6 de 10); sin llegadas solo se informa", () => {
    expect(estadoLlegadas(6)).toBe("bien");
    expect(estadoLlegadas(10)).toBe("bien");
    expect(estadoLlegadas(5)).toBe("ate");
    expect(estadoLlegadas(0)).toBe("ate");
    expect(estadoLlegadas(null)).toBe("info");
  });
});

describe("la mariposa de «¿Qué pedir?»", () => {
  const tienda = [
    prenda({ categoria: "Polos", vendidas30: 30, piso: 10, almacen: 10 }),
    prenda({ categoria: "Jeans", vendidas30: 10, piso: 30, almacen: 10 }),
    prenda({ categoria: "Bodys", vendidas30: 40, piso: 10, almacen: 0 }),
    prenda({ categoria: "Tops", vendidas30: 20, piso: 10, almacen: 10 }),
    prenda({ categoria: "Gorros", vendidas30: 0, piso: 10, almacen: 0 }),
  ];

  it("de cada 100 ventas y de cada 100 prendas, por categoría, la que más se vende arriba", () => {
    expect(partesPorCategoria(tienda)).toEqual([
      { categoria: "Bodys", vende: 40, tiene: 10 },
      { categoria: "Polos", vende: 30, tiene: 20 },
      { categoria: "Tops", vende: 20, tiene: 20 },
      { categoria: "Jeans", vende: 10, tiene: 40 },
      { categoria: "Gorros", vende: 0, tiene: 10 },
    ]);
  });

  it("sin ventas no hay qué comparar; sin categoría se agrupa aparte", () => {
    expect(partesPorCategoria([prenda({ piso: 5 })])).toEqual([]);
    expect(partesPorCategoria([prenda({ categoria: null, vendidas30: 2, piso: 1 })])).toEqual([{ categoria: SIN_CATEGORIA, vende: 100, tiene: 100 }]);
  });

  it("muestra 3 y nombra las que piden más (hasta 2), que siempre están en el dibujo", () => {
    const m = miniMariposa(partesPorCategoria(tienda));
    expect(m.piden).toEqual(["Bodys", "Polos"]);
    // Bodys +30 y Polos +10 piden más; la tercera es la de más diferencia del resto: Jeans −30.
    expect(m.filas.map((f) => [f.categoria, f.pideMas])).toEqual([
      ["Bodys", true],
      ["Polos", true],
      ["Jeans", false],
    ]);
    expect(m.max).toBe(40);
  });

  it("una que pide poco más que lo que tiene no «pide más»", () => {
    const parejo = [
      { categoria: "Polos", vende: 50, tiene: 50 - DIFERENCIA_PIDE_MAS + 1 },
      { categoria: "Jeans", vende: 50, tiene: 50 + DIFERENCIA_PIDE_MAS - 1 },
    ];
    const m = miniMariposa(parejo);
    expect(m.piden).toEqual([]);
    expect(m.filas.every((f) => !f.pideMas)).toBe(true);
    expect(miniMariposa([])).toEqual({ filas: [], piden: [], max: 1 });
  });
});

describe("Qué hacer hoy: los caminos", () => {
  it("compra lo que se acaba, manda a la tienda que más vende y liquida lo que no se vende en ninguna", () => {
    const prendas = [
      agotada({ nombre: "Agotada" }),
      seAcaba({ nombre: "Llega", llega: [{ de: "compra", cantidad: 4, fecha: null }] }),
      paraEnviar("lim", { nombre: "A Lima" }),
      paraEnviar("aqp", { nombre: "A Arequipa 1", diasSinVender: 80 }),
      paraEnviar("aqp", { nombre: "A Arequipa 2", diasSinVender: 100 }),
      paraLiquidar({ nombre: "Rebaja" }),
      prenda({ nombre: "Se vende bien", piso: 20, vendidas30: 10 }),
    ];
    const c = caminosDeHoy(prendas, 60, sedes);
    expect(c.compra).toMatchObject({ verbo: "Compra", grupo: "comprar", vista: "acaba", est: "urg", motivo: "1 agotada · 1 por llegar", primero: true });
    expect(c.compra!.prendas.map((p) => p.nombre)).toEqual(["Agotada", "Llega"]);
    // Un camino por tienda destino, en el orden de las tiendas; adentro, la que más espera primero.
    expect(c.manda.map((m) => [m.verbo, m.prendas.map((p) => p.nombre)])).toEqual([
      ["Manda a Arequipa", ["A Arequipa 2", "A Arequipa 1"]],
      ["Manda a Lima", ["A Lima"]],
    ]);
    expect(c.manda.every((m) => m.grupo === "enviar" && m.vista === "nose" && m.est === "ate" && !m.primero)).toBe(true);
    expect(c.reb).toHaveLength(1);
    expect(c.reb[0]).toMatchObject({ verbo: "Liquidar", grupo: "liquidar", est: "ate", motivo: "Más de 60 días quietas" });
    expect(estadosDelFlujo(c)).toEqual(["urg", "ate"]);
    expect(todosLosCaminos(c).map((x) => x.clave)).toEqual(["comprar", "manda-aqp", "manda-lim", "liquidar"]);
  });

  it("los motivos: plural, sin partes vacías, y un respaldo si no hay agotadas ni por llegar", () => {
    expect(caminosDeHoy([agotada(), agotada()], 60, sedes).compra!.motivo).toBe("2 agotadas");
    expect(caminosDeHoy([seAcaba()], 60, sedes).compra!.motivo).toBe("Quedan 14 días o menos");
    // Liquidar es urgente si alguna lleva 3 meses o más, y lo dice.
    const c = caminosDeHoy([paraLiquidar({ diasSinVender: 95 }), paraLiquidar({ diasSinVender: 120 }), paraLiquidar()], 60, sedes);
    expect(c.reb[0]).toMatchObject({ est: "urg", motivo: "2 con más de 3 meses" });
    expect(estadosDelFlujo(c)).toEqual(["urg"]);
  });

  it("sin nada que hacer, no hay caminos", () => {
    const c = caminosDeHoy([prenda({ piso: 10, vendidas30: 3 })], 60, sedes);
    expect(c).toEqual({ compra: null, manda: [], reb: [] });
    expect(estadosDelFlujo(c)).toEqual([]);
    expect(todosLosCaminos(c)).toEqual([]);
  });

  it("el tooltip nombra hasta 8 prendas y cuenta el resto", () => {
    expect(listaTip([1, 2, 3])).toEqual({ mostradas: [1, 2, 3], resto: 0 });
    const muchas = Array.from({ length: 20 }, (_, i) => i);
    expect(listaTip(muchas).mostradas).toHaveLength(TIP_PRENDAS);
    expect(listaTip(muchas).resto).toBe(20 - TIP_PRENDAS);
  });

  it("«Repón el piso»: se venden, no hay nada colgado y sí hay guardado; la que más se vende primero", () => {
    const lista = [
      prenda({ nombre: "Guardada", piso: 0, almacen: 3, vendidas30: 2 }),
      prenda({ nombre: "Colgada", piso: 1, almacen: 3, vendidas30: 9 }),
      prenda({ nombre: "Sin almacén", piso: 0, almacen: 0, vendidas30: 9 }),
      prenda({ nombre: "No se vende", piso: 0, almacen: 4, vendidas30: 0 }),
      prenda({ nombre: "La que más", piso: 0, almacen: 1, vendidas30: 7 }),
    ];
    expect(paraReponerPiso(lista).map((p) => p.nombre)).toEqual(["La que más", "Guardada"]);
  });
});

describe("Qué hacer hoy: las columnas del flujo", () => {
  const camino = (clave: string, n: number, parcial: Partial<CaminoHoy> = {}): CaminoHoy => ({
    clave,
    grupo: "enviar",
    vista: "nose",
    verbo: clave,
    icono: "camion",
    est: "ate",
    prendas: Array.from({ length: n }, () => prenda()),
    motivo: "",
    primero: false,
    ...parcial,
  });

  it("a la izquierda compra; a la derecha manda y, con las dos cosas, la franja «Se quedan» antes de liquidar", () => {
    const c: CaminosHoy = { compra: camino("comprar", 3), manda: [camino("manda-aqp", 2)], reb: [camino("liquidar", 4)] };
    const { izq, der } = columnasFlujo(c);
    expect(izq).toHaveLength(1);
    expect(der.map((e) => ("cab" in e ? e.cab : e.camino.clave))).toEqual(["manda-aqp", CAB_SE_QUEDAN, "liquidar"]);
    expect(titulosFlujo(c)).toEqual({ izq: "CÓMPRALAS", der: "MÁNDALAS A OTRA TIENDA" });
  });

  it("sin mandar no hay franja: «Se quedan en tu tienda» va arriba; una columna vacía no se nombra", () => {
    const c: CaminosHoy = { compra: null, manda: [], reb: [camino("liquidar", 4)] };
    expect(columnasFlujo(c).der.some((e) => "cab" in e)).toBe(false);
    expect(titulosFlujo(c)).toEqual({ izq: null, der: CAB_SE_QUEDAN });
    expect(columnasFlujo(c).izq).toEqual([]);
  });

  it("el alto que pide una columna: cada camino al menos 30, 8 entre caminos y 34 por franja", () => {
    const col: EntradaColumna<string>[] = [{ camino: "a", n: 1 }, { camino: "b", n: 10 }, { cab: "X" }, { camino: "c", n: 1 }];
    expect(altoNecesario(col, 0)).toBe(30 + 8 + 30 + 34 + 30);
    // Con la escala 40, un camino de n prendas mide 40·√n (más de 30): 40, 40·√10 y 40.
    expect(altoNecesario(col, 40)).toBeCloseTo(40 + 8 + 40 * Math.sqrt(10) + 34 + 40, 6);
  });
});

/** Lo que ocupa el dibujo: de dónde a dónde llega cualquier cosa que se pinta. */
function bordes(g: GeometriaFlujo<CaminoHoy>) {
  const ys: number[] = [g.centro.y, g.centro.y + g.centro.alto];
  const xs: number[] = [FLUJO.CX0, FLUJO.CX1];
  for (const [lado, bandas] of [
    ["izq", g.izq],
    ["der", g.der],
  ] as const) {
    for (const b of bandas) {
      ys.push(b.y0, b.y1, b.yb, b.c0, b.c1);
      const p = pastillaFlujo(textoPastilla(b.camino), b.cy, lado);
      const e = etiquetaFlujo(b.cy, lado);
      ys.push(p.y, p.y + p.h, e.y, e.y + e.h);
      xs.push(p.x, p.x + p.w, e.x, e.x + e.w);
    }
  }
  for (const f of [g.franjaIzq, g.franjaDer]) if (f) ys.push(f.y, f.y + f.alto);
  return { arriba: Math.min(...ys), abajo: Math.max(...ys), izquierda: Math.min(...xs), derecha: Math.max(...xs) };
}

describe("Qué hacer hoy: el flujo mide lo mismo con 1, 20 o 300 prendas", () => {
  // La misma tienda a tres escalas: compra el 40 %, manda a Arequipa el 20 %, a Lima el 10 % y liquida el 30 %.
  const escenario = (total: number): CaminosHoy => {
    const prendas: PrendaAnalisis[] = [];
    const reparto = [
      [0.4, () => agotada()],
      [0.2, () => paraEnviar("aqp")],
      [0.1, () => paraEnviar("lim")],
      [0.3, () => paraLiquidar({ diasSinVender: 100 })],
    ] as const;
    for (const [parte, crear] of reparto) for (let i = 0; i < Math.max(1, Math.round(total * parte)); i++) prendas.push(crear());
    return caminosDeHoy(total === 1 ? prendas.slice(0, 1) : prendas, 60, sedes);
  };

  for (const total of [1, 20, 300]) {
    it(`con ${total} ${total === 1 ? "prenda" : "prendas"}, todo cabe en el lienzo fijo de ${FLUJO.W} × ${FLUJO.H}`, () => {
      const c = escenario(total);
      const { izq, der } = columnasFlujo(c);
      const g = geometriaFlujo(izq, der);
      const b = bordes(g);
      expect(b.arriba).toBeGreaterThanOrEqual(0);
      expect(b.abajo).toBeLessThanOrEqual(FLUJO.H);
      expect(b.izquierda).toBeGreaterThanOrEqual(0);
      expect(b.derecha).toBeLessThanOrEqual(FLUJO.W);
      // Las columnas y el bloque «Tu tienda» quedan en el alto útil.
      for (const x of [...g.izq, ...g.der]) {
        expect(x.y0).toBeGreaterThanOrEqual(FLUJO.TOPC - 1e-9);
        expect(x.yb).toBeLessThanOrEqual(FLUJO.TOPC + ALTO_COLUMNA + 1e-9);
      }
      expect(g.centro.y).toBeGreaterThanOrEqual(FLUJO.TOPC - 1e-9);
      expect(g.centro.y + g.centro.alto).toBeLessThanOrEqual(FLUJO.TOPC + ALTO_COLUMNA + 1e-9);
    });

    it(`con ${total}: el grosor de cada camino crece como la raíz de sus prendas (s·√n, s nunca más de ${FLUJO.SMAX}) y nada se pisa`, () => {
      const { izq, der } = columnasFlujo(escenario(total));
      const g = geometriaFlujo(izq, der);
      expect(g.s).toBeGreaterThan(0);
      expect(g.s).toBeLessThanOrEqual(FLUJO.SMAX);
      for (const col of [g.izq, g.der]) {
        for (const [i, x] of col.entries()) {
          expect(x.y1 - x.y0).toBeCloseTo(grosorCamino(x.n, g.s), 6);
          expect(x.c1 - x.c0).toBeCloseTo(grosorCamino(x.n, g.s), 6);
          const siguienteBanda = col[i + 1];
          if (siguienteBanda) {
            // El lugar del siguiente empieza donde termina este (o más abajo), y las cintas entran pegadas al centro.
            expect(siguienteBanda.yb - Math.max(FLUJO.MIN, grosorCamino(siguienteBanda.n, g.s))).toBeGreaterThanOrEqual(x.yb - 1e-9);
            expect(siguienteBanda.c0).toBeCloseTo(x.c1, 9);
          }
          expect(x.c0).toBeGreaterThanOrEqual(g.centro.y - 1e-9);
          expect(x.c1).toBeLessThanOrEqual(g.centro.y + g.centro.alto + 1e-9);
        }
      }
    });
  }

  it("cintas finas (A1): un solo camino de 49 prendas ya no llena el alto, y uno de 3 se sigue viendo", () => {
    const g = geometriaFlujo<string>([{ camino: "compra", n: 49 }], [{ camino: "aqp", n: 3 }, { camino: "liq", n: 6 }]);
    expect(g.s).toBe(FLUJO.SMAX);
    expect(g.izq[0]!.y1 - g.izq[0]!.y0).toBeCloseTo(56, 6);
    expect(g.izq[0]!.y1 - g.izq[0]!.y0).toBeLessThan(ALTO_COLUMNA / 4);
    expect(g.der[0]!.y1 - g.der[0]!.y0).toBeGreaterThan(13);
    // La tarjeta «Tu tienda» mide lo de la columna más gruesa más su borde, y nunca menos de 92.
    expect(g.centro.alto).toBeCloseTo(Math.max(56, 64) + 28, 6);
    expect(geometriaFlujo<string>([{ camino: "c", n: 1 }], []).centro.alto).toBe(92);
  });

  it("si no cabe, la escala baja; la proporción entre caminos es la de la raíz de sus prendas", () => {
    const pocas = columnasFlujo(escenario(5));
    expect(geometriaFlujo(pocas.izq, pocas.der).s).toBe(FLUJO.SMAX);
    const muchas = columnasFlujo(escenario(5000));
    const g = geometriaFlujo(muchas.izq, muchas.der);
    expect(g.s).toBeLessThan(FLUJO.SMAX);
    const [aqp, lim] = g.der;
    expect((aqp!.y1 - aqp!.y0) / (lim!.y1 - lim!.y0)).toBeCloseTo(Math.sqrt(aqp!.n / lim!.n), 6);
  });

  it("la franja «Se quedan en tu tienda» abarca de su título hasta el último camino", () => {
    const { izq, der } = columnasFlujo(escenario(20));
    const g = geometriaFlujo(izq, der);
    expect(g.franjaIzq).toBeNull();
    expect(g.franjaDer?.texto).toBe(CAB_SE_QUEDAN);
    const liquidar = g.der[g.der.length - 1]!;
    expect(g.franjaDer!.y).toBeLessThan(liquidar.y0);
    expect(g.franjaDer!.y + g.franjaDer!.alto).toBeGreaterThanOrEqual(liquidar.yb);
    // Y la franja no tapa a los caminos de mandar, que van antes.
    for (const m of g.der.slice(0, -1)) expect(m.yb).toBeLessThanOrEqual(g.franjaDer!.y);
  });

  it("más tiendas destino de las que caben (CAYLA tiene 3): la cuenta no da números raros y nada se cruza", () => {
    const muchas = Array.from({ length: 7 }, (_, i) => ({ camino: `s${i}`, n: 1 + i }));
    const g = geometriaFlujo<string>([], [...muchas, { cab: "X" }, { camino: "liq", n: 3 }]);
    for (const b of g.der) for (const v of [b.y0, b.y1, b.cy, b.yb, b.c0, b.c1]) expect(Number.isFinite(v)).toBe(true);
    for (let i = 1; i < g.der.length; i++) expect(g.der[i]!.y0).toBeGreaterThanOrEqual(g.der[i - 1]!.yb);
  });
});

describe("Qué hacer hoy: las piezas del dibujo", () => {
  it("la cinta son dos curvas cerradas entre las dos bandas, con coordenadas de una décima", () => {
    expect(cintaFlujo(298, 100, 128, 486, 150.04, 178.06)).toBe("M298,100 C392,100 392,150 486,150 L486,178.1 C392,178.1 392,128 298,128 Z");
    expect(px(1.25)).toBe(1.3);
  });

  it("la etiqueta dice cuántas son, sin «empieza aquí» (A1)", () => {
    expect(textoPastilla({ prendas: [prenda()] })).toBe("1 prenda");
    expect(textoPastilla({ prendas: [prenda(), prenda()] })).toBe("2 prendas");
  });

  it("la etiqueta «N prendas» va en el medio de su cinta (a la izquierda) o junto a su final (a la derecha); el verbo, por fuera", () => {
    const izq = pastillaFlujo("7 prendas", 100, "izq");
    expect(izq.x + izq.w / 2).toBeCloseTo((FLUJO.LX + FLUJO.NW + FLUJO.CX0) / 2, 0);
    expect(izq.y).toBe(90);
    const der = pastillaFlujo("7 prendas", 100, "der");
    expect(der.x + der.w).toBe(FLUJO.RX - 8);
    expect(etiquetaFlujo(100, "izq")).toEqual({ x: 0, y: 78, w: FLUJO.LX - 10, h: 44 });
    const e = etiquetaFlujo(100, "der");
    expect(e.x + e.w).toBe(FLUJO.W);
  });
});

describe("los puntos que corren por una cinta (al pasar el mouse)", () => {
  it("el eje va por el centro de la cinta, del nodo a tu tienda", () => {
    expect(ejeCinta(298, 100, 128, 486, 150.04, 178.06)).toBe("M298,114 C392,114 392,164.1 486,164.1");
  });
  it("del lado derecho va de tu tienda hacia el destino (la misma cuenta, al revés)", () => {
    expect(ejeCinta(586, 150, 170, 736, 60, 80)).toBe("M586,160 C661,160 661,70 736,70");
  });
  it("en una cinta gruesa corren dos carriles fuera de la pastilla; en una delgada, por el centro", () => {
    expect(carrilesDeCinta(14, 2.2)).toEqual([0]);
    const [arriba, abajo] = carrilesDeCinta(112, 4.5);
    expect(arriba).toBeLessThanOrEqual(-16.5);
    expect(abajo).toBeGreaterThanOrEqual(16.5);
    expect(abajo).toBeLessThanOrEqual(112 / 2 - 4.5 - 1);
    expect(ejeCinta(298, 100, 128, 486, 150, 178, 6)).toBe("M298,120 C392,120 392,170 486,170");
  });
  it("de 3 a 5 puntos chicos (A1), apenas más en una cinta gruesa, y nunca un punto invisible", () => {
    expect(puntosDeCinta(0)).toEqual({ n: 3, r: 2 });
    expect(puntosDeCinta(56)).toEqual({ n: 5, r: 3 });
    expect(puntosDeCinta(14).n).toBe(4);
    expect(puntosDeCinta(200)).toEqual({ n: 5, r: 3 });
    expect(puntosDeCinta(-5)).toEqual({ n: 3, r: 2 });
  });
  it("un punto cruza en menos de 2 segundos", () => {
    expect(SEGUNDOS_PUNTO).toBeGreaterThan(1);
    expect(SEGUNDOS_PUNTO).toBeLessThanOrEqual(2);
  });
});
