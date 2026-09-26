import { describe, it, expect } from "vitest";
import {
  agruparPorPrenda,
  estadoTalla,
  lineasEnUrl,
  lineasParaBajar,
  lineasParaTrasladar,
  MAX_VARIANTES_EN_URL,
  ordenarPorUrgencia,
  sePuedeBajar,
  tallaParaReponer,
  tallaPorCodigo,
  urlBajarAlPiso,
  urlEtiquetas,
  urlTrasladar,
  urgenciaDePrenda,
  type FilaPrenda,
} from "./existencias-prendas";

const REPONER = { tipo: "reponer_a_piso" as const, texto: "Reponer a piso", motivo: "poco en piso", contexto: null };
const SIN_ACCION = { tipo: "sin_accion" as const, texto: "Sin acción", motivo: null, contexto: null };

function fila(p: Partial<FilaPrenda> & { varianteId: string }): FilaPrenda {
  const piso = p.pisoDisponible ?? 2;
  const almacen = p.almacenDisponible ?? 2;
  return {
    productoId: "blusa",
    referencia: "Blusa Carlita",
    sku: `CMS-${p.varianteId}`,
    talla: "M",
    color: "Beige",
    colorHex: "#c9ad8a",
    fotoUrl: null,
    codigosBarras: [],
    pisoDisponible: piso,
    almacenDisponible: almacen,
    disponible: (piso ?? 0) + (almacen ?? 0),
    apartado: 0,
    danado: 0,
    enTransito: 0,
    accionHoy: SIN_ACCION,
    marca: "Doradas Chic",
    ...p,
  } as FilaPrenda;
}

describe("estadoTalla", () => {
  it("sin nada libre es «sin stock», aunque la regla pida reponer", () => {
    expect(estadoTalla(fila({ varianteId: "a", pisoDisponible: 0, almacenDisponible: 0, accionHoy: REPONER }))).toBe("sin_stock");
  });
  it("piso en 0 y algo atrás es «por colgar» (gana sobre «reponer»)", () => {
    expect(estadoTalla(fila({ varianteId: "a", pisoDisponible: 0, almacenDisponible: 3, accionHoy: REPONER }))).toBe("por_colgar");
  });
  it("poco en piso según Acción hoy es «reponer»", () => {
    expect(estadoTalla(fila({ varianteId: "a", pisoDisponible: 2, almacenDisponible: 3, accionHoy: REPONER }))).toBe("reponer");
  });
  it("lo demás es normal", () => {
    expect(estadoTalla(fila({ varianteId: "a" }))).toBe("normal");
  });
});

describe("sePuedeBajar", () => {
  it("pide reponer Y hay algo libre en el almacén", () => {
    expect(sePuedeBajar(fila({ varianteId: "a", accionHoy: REPONER, almacenDisponible: 1 }))).toBe(true);
    expect(sePuedeBajar(fila({ varianteId: "a", accionHoy: REPONER, almacenDisponible: 0 }))).toBe(false);
    expect(sePuedeBajar(fila({ varianteId: "a", accionHoy: SIN_ACCION, almacenDisponible: 5 }))).toBe(false);
  });
  it("sin piso/almacén (Taller) no se baja nada", () => {
    expect(sePuedeBajar(fila({ varianteId: "a", accionHoy: null, pisoDisponible: null, almacenDisponible: null, disponible: 5 }))).toBe(false);
  });
});

describe("agruparPorPrenda", () => {
  const filas = [
    fila({ varianteId: "bei-L", talla: "L" }),
    fila({ varianteId: "neg-S", color: "Negro", talla: "S" }),
    fila({ varianteId: "bei-XS", talla: "XS", pisoDisponible: 0, almacenDisponible: 2, accionHoy: REPONER }),
    fila({ varianteId: "bei-M", talla: "M", apartado: 1 }),
  ];

  it("una prenda por modelo y color, en el orden en que aparece su primera talla", () => {
    const g = agruparPorPrenda(filas);
    expect(g.map((p) => p.color)).toEqual(["Beige", "Negro"]);
  });
  it("las tallas van en curva, no en el orden de llegada", () => {
    expect(agruparPorPrenda(filas)[0].tallas.map((f) => f.talla)).toEqual(["XS", "M", "L"]);
  });
  it("suma lo libre y cuenta qué tallas se pueden bajar o están por colgar", () => {
    const [beige] = agruparPorPrenda(filas);
    expect(beige.piso).toBe(4);
    expect(beige.almacen).toBe(6);
    expect(beige.apartado).toBe(1);
    expect(beige.tallasParaBajar).toBe(1);
    expect(beige.tallasPorColgar).toBe(1);
  });
  it("donde no se separa piso y almacén, piso y almacén quedan en null (no en 0)", () => {
    const [p] = agruparPorPrenda([fila({ varianteId: "t", pisoDisponible: null, almacenDisponible: null, disponible: 4 })]);
    expect(p.piso).toBeNull();
    expect(p.almacen).toBeNull();
    expect(p.disponible).toBe(4);
  });
  it("el mismo modelo en dos productos distintos no se mezcla", () => {
    const g = agruparPorPrenda([fila({ varianteId: "a" }), fila({ varianteId: "b", productoId: "otra" })]);
    expect(g).toHaveLength(2);
  });
});

describe("enlaces con la lista cargada", () => {
  const bajable = fila({ varianteId: "v1", accionHoy: REPONER, pisoDisponible: 0, almacenDisponible: 3 });
  const normal = fila({ varianteId: "v2" });
  const sinAtras = fila({ varianteId: "v3", accionHoy: REPONER, pisoDisponible: 1, almacenDisponible: 0 });

  it("Bajar al piso lleva solo lo que se puede bajar, de a una unidad (CAYLA no sugiere cantidades)", () => {
    expect(lineasParaBajar([bajable, normal, sinAtras])).toEqual([{ varianteId: "v1", cantidad: 1 }]);
    expect(urlBajarAlPiso([bajable, normal])).toBe("/inventario/bajar?lineas=v1:1");
  });
  it("sin nada que bajar no hay enlace", () => {
    expect(urlBajarAlPiso([normal, sinAtras])).toBeNull();
  });
  it("Trasladar lleva lo que tiene algo libre para mandar", () => {
    expect(lineasParaTrasladar([bajable, normal, sinAtras]).map((l) => l.varianteId)).toEqual(["v1", "v2"]);
    expect(urlTrasladar([bajable, normal])).toBe("/inventario/mover?lineas=v1:1,v2:1");
  });
  it("en el Taller (sin almacén) Trasladar mira lo disponible", () => {
    const taller = fila({ varianteId: "t", pisoDisponible: null, almacenDisponible: null, disponible: 3 });
    expect(urlTrasladar([taller])).toBe("/inventario/mover?lineas=t:1");
  });
  it("Etiquetas: SIEMPRE las tallas exactas por ?variantes= — un producto por ?producto= imprimía todos sus colores (tarea #7)", () => {
    expect(urlEtiquetas([bajable, normal])).toBe("/etiquetas-de-precio?variantes=v1,v2");
    expect(urlEtiquetas([bajable, fila({ varianteId: "p2", productoId: "polo" })])).toBe("/etiquetas-de-precio?variantes=v1,p2");
    expect(urlEtiquetas([])).toBeNull();
  });
  it("con demasiadas variantes no arma un enlace que se cortaría", () => {
    const muchas = Array.from({ length: MAX_VARIANTES_EN_URL + 1 }, (_, i) => fila({ varianteId: `v${i}` }));
    expect(urlTrasladar(muchas)).toBeNull();
    expect(urlEtiquetas(muchas)).toBeNull();
  });
  it("lineasEnUrl descarta cantidades que no son enteras positivas", () => {
    expect(lineasEnUrl([{ varianteId: "a", cantidad: 2 }, { varianteId: "b", cantidad: 0 }, { varianteId: "c", cantidad: 1.5 }])).toBe("a:2");
  });
});

describe("tallaPorCodigo", () => {
  const filas = [fila({ varianteId: "m", sku: "POL-0004-NEG-M", codigosBarras: ["7750000000017"] }), fila({ varianteId: "l", sku: "POL-0004-NEG-L" })];
  it("encuentra por código de etiqueta, sin importar mayúsculas ni espacios", () => {
    expect(tallaPorCodigo(filas, "  pol-0004-neg-m ")?.varianteId).toBe("m");
  });
  it("encuentra por código de barras", () => {
    expect(tallaPorCodigo(filas, "7750000000017")?.varianteId).toBe("m");
  });
  it("nunca por un pedazo: «POL-0004-NEG» no abre ninguna talla", () => {
    expect(tallaPorCodigo(filas, "POL-0004-NEG")).toBeNull();
    expect(tallaPorCodigo(filas, "")).toBeNull();
  });
});

describe("ordenarPorUrgencia (análisis de Existencias, tarea #5)", () => {
  // Cuatro prendas en orden de llegada: una sin nada que hacer, una que pide reponer, una con 1 talla por colgar y una
  // con 2 tallas por colgar.
  const filas = [
    fila({ varianteId: "tranquila", productoId: "tranquila" }),
    fila({ varianteId: "reponer", productoId: "reponer", pisoDisponible: 1, almacenDisponible: 3, accionHoy: REPONER }),
    fila({ varianteId: "colgar-1", productoId: "colgar-1", pisoDisponible: 0, almacenDisponible: 2, accionHoy: REPONER }),
    fila({ varianteId: "colgar-2a", productoId: "colgar-2", talla: "S", pisoDisponible: 0, almacenDisponible: 2, accionHoy: REPONER }),
    fila({ varianteId: "colgar-2b", productoId: "colgar-2", talla: "M", pisoDisponible: 0, almacenDisponible: 1, accionHoy: REPONER }),
  ];
  const prendas = agruparPorPrenda(filas);

  it("primero lo que la clienta no ve (por colgar, la de más tallas antes), después lo que pide reponer, al final el resto", () => {
    expect(ordenarPorUrgencia(prendas).map((p) => p.productoId)).toEqual(["colgar-2", "colgar-1", "reponer", "tranquila"]);
  });
  it("la urgencia de cada una", () => {
    expect(prendas.map((p) => [p.productoId, urgenciaDePrenda(p)])).toEqual([
      ["tranquila", 2],
      ["reponer", 1],
      ["colgar-1", 0],
      ["colgar-2", 0],
    ]);
  });
  it("a igual urgencia respeta el orden de llegada, y no toca la lista original", () => {
    const dos = agruparPorPrenda([fila({ varianteId: "b", productoId: "b" }), fila({ varianteId: "a", productoId: "a" })]);
    expect(ordenarPorUrgencia(dos).map((p) => p.productoId)).toEqual(["b", "a"]);
    expect(prendas.map((p) => p.productoId)).toEqual(["tranquila", "reponer", "colgar-1", "colgar-2"]);
  });
});

describe("tallaParaReponer (tarea #7): «Reponer N tallas» abre una talla que se pueda bajar", () => {
  const sinAtras = fila({ varianteId: "sin-atras", talla: "S", accionHoy: REPONER, pisoDisponible: 1, almacenDisponible: 0 });
  const reponer = fila({ varianteId: "reponer", talla: "M", accionHoy: REPONER, pisoDisponible: 2, almacenDisponible: 3 });
  const porColgar = fila({ varianteId: "por-colgar", talla: "L", accionHoy: REPONER, pisoDisponible: 0, almacenDisponible: 2 });

  it("primero una por colgar que se pueda bajar", () => {
    expect(tallaParaReponer([sinAtras, reponer, porColgar])?.varianteId).toBe("por-colgar");
  });
  it("si no hay por colgar, la primera que se pueda bajar — nunca una que pide reponer sin nada atrás", () => {
    expect(tallaParaReponer([sinAtras, reponer])?.varianteId).toBe("reponer");
  });
  it("sin ninguna que se pueda bajar, ninguna", () => {
    expect(tallaParaReponer([sinAtras])).toBeNull();
  });
});

describe("tallaPorCodigo con un código repetido (tarea #11)", () => {
  const a = fila({ varianteId: "a", codigosBarras: ["7750001"] });
  const b = fila({ varianteId: "b", codigosBarras: ["7750001"] });
  const c = fila({ varianteId: "c", codigosBarras: ["7750002"] });
  it("un código que está en dos tallas no abre ninguna", () => {
    expect(tallaPorCodigo([a, b, c], "7750001")).toBeNull();
  });
  it("un código único abre su talla, sin importar mayúsculas ni espacios", () => {
    expect(tallaPorCodigo([a, b, c], " 7750002 ")?.varianteId).toBe("c");
    expect(tallaPorCodigo([a, c], "CMS-a".toLowerCase())?.varianteId).toBe("a");
  });
});
