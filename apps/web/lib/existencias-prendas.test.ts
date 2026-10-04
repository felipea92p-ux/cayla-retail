import { describe, it, expect } from "vitest";
import {
  agruparPorPrenda,
  estadoTalla,
  lineasEnUrl,
  lineasParaBajar,
  lineasParaTrasladar,
  MAX_VARIANTES_EN_URL,
  ordenarPorUrgencia,
  queHacerPrenda,
  tallasPorPrenda,
  textoTallasRecortadas,
  sePuedeBajar,
  tallaParaReponer,
  tallaPorCodigo,
  urlBajarAlPiso,
  urlEtiquetas,
  urlTrasladar,
  urgenciaDePrenda,
  type FilaPrenda,
} from "./existencias-prendas";
import type { AccionPiso, PisoDeTalla } from "./piso-plan";

// La decisión del motor del piso (`lib/piso-plan.ts`) que trae cada fila. Por defecto la fila no pide nada, salvo que no tenga
// ninguna colgada y sí algo atrás (así eran las filas de estas pruebas con la regla de antes); cada caso que importa la escribe.
const plan = (accion: AccionPiso): PisoDeTalla => ({ accion, requisito: 1, central: true, vendidasRecientes: 0, anotadasRecientes: 0, ritmoAtributo: 0, entraUnaSaleUna: false });

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
    planPiso: plan(piso !== null && piso <= 0 && (almacen ?? 0) > 0 ? "por_colgar" : "mantener"),
    marca: "Doradas Chic",
    ...p,
  } as FilaPrenda;
}

describe("estadoTalla", () => {
  it("sin nada libre es «sin stock», aunque la regla pida reponer", () => {
    expect(estadoTalla(fila({ varianteId: "a", pisoDisponible: 0, almacenDisponible: 0, planPiso: plan("sin_atras") }))).toBe("sin_stock");
  });
  it("piso en 0 y algo atrás es «por colgar» (gana sobre «reponer»)", () => {
    expect(estadoTalla(fila({ varianteId: "a", pisoDisponible: 0, almacenDisponible: 3, planPiso: plan("por_colgar") }))).toBe("por_colgar");
  });
  it("poco en piso según Acción hoy es «reponer»", () => {
    expect(estadoTalla(fila({ varianteId: "a", pisoDisponible: 2, almacenDisponible: 3, planPiso: plan("por_reponer") }))).toBe("reponer");
  });
  it("lo demás es normal", () => {
    expect(estadoTalla(fila({ varianteId: "a" }))).toBe("normal");
  });
});

describe("sePuedeBajar: un hecho físico, no una recomendación (revisión adversarial del motor del piso)", () => {
  it("hay algo libre en el almacén → se puede bajar, diga lo que diga el motor", () => {
    expect(sePuedeBajar(fila({ varianteId: "a", planPiso: plan("por_reponer"), almacenDisponible: 1 }))).toBe(true);
    // «Mantener» es lo normal en un piso cuadrado: bajar una más sigue siendo decisión de quien está en la tienda (ADR-0306).
    expect(sePuedeBajar(fila({ varianteId: "a", planPiso: plan("mantener"), almacenDisponible: 5 }))).toBe(true);
    // Con el piso sin cuadrar el motor no recomienda, pero bajar se puede.
    expect(sePuedeBajar(fila({ varianteId: "a", planPiso: plan("pausa_sin_cuadre"), almacenDisponible: 2 }))).toBe(true);
    // El motor no respondió (o su SQL no está pegado): los botones no se apagan.
    expect(sePuedeBajar(fila({ varianteId: "a", planPiso: null, almacenDisponible: 3 }))).toBe(true);
  });
  it("sin nada libre atrás no se baja, aunque el motor lo pidiera", () => {
    expect(sePuedeBajar(fila({ varianteId: "a", planPiso: plan("sin_atras"), almacenDisponible: 0 }))).toBe(false);
    expect(sePuedeBajar(fila({ varianteId: "a", planPiso: plan("por_colgar"), pisoDisponible: 0, almacenDisponible: 0 }))).toBe(false);
  });
  it("sin piso/almacén (Taller) no se baja nada", () => {
    expect(sePuedeBajar(fila({ varianteId: "a", planPiso: null, pisoDisponible: null, almacenDisponible: null, disponible: 5 }))).toBe(false);
  });
});

describe("«Reponer prenda» y «Bajar al piso» no se apagan con «Mantener» ni con el motor caído (hallazgo H-A de la revisión)", () => {
  // S, M y L con 1 colgada y 3 guardadas, y XL con 0 y 2: con el mínimo de 1 por talla central, el motor dice «Mantener» en las
  // cuatro (XL es extrema). Hay 11 guardadas: el botón no puede decir que el almacén está vacío.
  const tallas = [
    fila({ varianteId: "s", talla: "S", pisoDisponible: 1, almacenDisponible: 3, planPiso: plan("mantener") }),
    fila({ varianteId: "m", talla: "M", pisoDisponible: 1, almacenDisponible: 3, planPiso: plan("mantener") }),
    fila({ varianteId: "l", talla: "L", pisoDisponible: 1, almacenDisponible: 3, planPiso: plan("mantener") }),
    fila({ varianteId: "xl", talla: "XL", pisoDisponible: 0, almacenDisponible: 2, planPiso: plan("mantener") }),
  ];
  it("con «Mantener» en todas: hay talla para reponer y las cuatro van a «Bajar al piso»", () => {
    expect(tallaParaReponer(tallas)?.varianteId).toBe("s");
    expect(lineasParaBajar(tallas).map((l) => l.varianteId)).toEqual(["s", "m", "l", "xl"]);
    expect(agruparPorPrenda(tallas)[0].tallasParaBajar).toBe(4);
  });
  it("con el motor caído (planPiso null en todas): lo mismo", () => {
    const sinMotor = tallas.map((f) => ({ ...f, planPiso: null }));
    expect(tallaParaReponer(sinMotor)?.varianteId).toBe("s");
    expect(urlBajarAlPiso(sinMotor)).toBe("/inventario/bajar?lineas=s:1,m:1,l:1,xl:1");
  });
  it("que se pueda bajar no la vuelve urgente: sin nada que el motor pida, la prenda queda al final", () => {
    expect(urgenciaDePrenda(agruparPorPrenda(tallas)[0])).toBe(2);
  });
});

describe("agruparPorPrenda", () => {
  const filas = [
    fila({ varianteId: "bei-L", talla: "L" }),
    fila({ varianteId: "neg-S", color: "Negro", talla: "S" }),
    fila({ varianteId: "bei-XS", talla: "XS", pisoDisponible: 0, almacenDisponible: 2, planPiso: plan("por_colgar") }),
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
    // Las tres tienen algo libre atrás: las tres SE PUEDEN bajar; solo la XS está «Por colgar» según el motor.
    expect(beige.tallasParaBajar).toBe(3);
    expect(beige.tallasPorColgar).toBe(1);
    expect(beige.tallasPorReponer).toBe(0);
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
  const bajable = fila({ varianteId: "v1", planPiso: plan("por_colgar"), pisoDisponible: 0, almacenDisponible: 3 });
  const normal = fila({ varianteId: "v2" });
  const sinAtras = fila({ varianteId: "v3", planPiso: plan("sin_atras"), pisoDisponible: 1, almacenDisponible: 0 });

  it("Bajar al piso lleva lo marcado que tiene algo libre atrás, lo pida el motor o no, de a una unidad (CAYLA no sugiere cantidades)", () => {
    expect(lineasParaBajar([bajable, normal, sinAtras])).toEqual([
      { varianteId: "v1", cantidad: 1 },
      { varianteId: "v2", cantidad: 1 },
    ]);
    expect(urlBajarAlPiso([bajable, normal])).toBe("/inventario/bajar?lineas=v1:1,v2:1");
  });
  it("sin nada libre atrás no hay enlace", () => {
    expect(urlBajarAlPiso([sinAtras, fila({ varianteId: "v4", almacenDisponible: 0 })])).toBeNull();
  });
  it("Trasladar lleva lo que tiene algo libre para mandar", () => {
    expect(lineasParaTrasladar([bajable, normal, sinAtras]).map((l) => l.varianteId)).toEqual(["v1", "v2"]);
    expect(urlTrasladar([bajable, normal])).toBe("/inventario/traslados/nuevo?lineas=v1:1,v2:1&desde=existencias");
  });
  it("en el Taller (sin almacén) Trasladar mira lo disponible", () => {
    const taller = fila({ varianteId: "t", pisoDisponible: null, almacenDisponible: null, disponible: 3 });
    expect(urlTrasladar([taller])).toBe("/inventario/traslados/nuevo?lineas=t:1&desde=existencias");
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
    fila({ varianteId: "reponer", productoId: "reponer", pisoDisponible: 1, almacenDisponible: 3, planPiso: plan("por_reponer") }),
    fila({ varianteId: "colgar-1", productoId: "colgar-1", pisoDisponible: 0, almacenDisponible: 2, planPiso: plan("por_colgar") }),
    fila({ varianteId: "colgar-2a", productoId: "colgar-2", talla: "S", pisoDisponible: 0, almacenDisponible: 2, planPiso: plan("por_colgar") }),
    fila({ varianteId: "colgar-2b", productoId: "colgar-2", talla: "M", pisoDisponible: 0, almacenDisponible: 1, planPiso: plan("por_colgar") }),
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
  const sinAtras = fila({ varianteId: "sin-atras", talla: "S", planPiso: plan("sin_atras"), pisoDisponible: 1, almacenDisponible: 0 });
  const reponer = fila({ varianteId: "reponer", talla: "M", planPiso: plan("por_reponer"), pisoDisponible: 2, almacenDisponible: 3 });
  const porColgar = fila({ varianteId: "por-colgar", talla: "L", planPiso: plan("por_colgar"), pisoDisponible: 0, almacenDisponible: 2 });

  it("primero una por colgar que se pueda bajar", () => {
    expect(tallaParaReponer([sinAtras, reponer, porColgar])?.varianteId).toBe("por-colgar");
  });
  it("si no hay por colgar, la que pide reponer — nunca una sin nada atrás", () => {
    expect(tallaParaReponer([sinAtras, reponer])?.varianteId).toBe("reponer");
  });
  it("si el motor no pide nada, igual abre una que se pueda bajar: la primera con algo atrás", () => {
    const mantener = fila({ varianteId: "mantener", talla: "XL", planPiso: plan("mantener"), pisoDisponible: 1, almacenDisponible: 4 });
    expect(tallaParaReponer([sinAtras, mantener])?.varianteId).toBe("mantener");
    expect(tallaParaReponer([mantener, reponer])?.varianteId).toBe("reponer");
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

describe("queHacerPrenda — el diagnóstico de la prenda, con las palabras del filtro «Hoy» (2026-10-03)", () => {
  it("«Por colgar» va primero y cuenta solo las tallas con el piso en 0 y algo atrás", () => {
    const q = queHacerPrenda([
      fila({ varianteId: "a", pisoDisponible: 0, almacenDisponible: 6, planPiso: plan("por_colgar") }),
      fila({ varianteId: "b", pisoDisponible: 0, almacenDisponible: 0, planPiso: plan("sin_atras") }),
      fila({ varianteId: "c", pisoDisponible: 1, almacenDisponible: 2, planPiso: plan("por_reponer") }),
    ]);
    expect(q).toEqual({ tipo: "por_colgar", n: 1 });
  });
  it("sin nada por colgar, cuenta las que se pueden reponer (hay algo libre atrás)", () => {
    const q = queHacerPrenda([
      fila({ varianteId: "a", pisoDisponible: 2, almacenDisponible: 5, planPiso: plan("por_reponer") }),
      fila({ varianteId: "b", pisoDisponible: 9, almacenDisponible: 5, planPiso: plan("mantener") }),
      fila({ varianteId: "c", pisoDisponible: 1, almacenDisponible: 0, planPiso: plan("sin_atras") }),
    ]);
    expect(q).toEqual({ tipo: "por_reponer", n: 1 });
  });
  it("si lo que pide reponer tiene el almacén vacío: «Sin stock atrás» (el caso del Polo Lucky: piso 1, almacén 0)", () => {
    const q = queHacerPrenda([
      fila({ varianteId: "a", pisoDisponible: 1, almacenDisponible: 0, planPiso: plan("sin_atras") }),
      fila({ varianteId: "b", pisoDisponible: 0, almacenDisponible: 0, planPiso: plan("sin_atras") }),
    ]);
    expect(q).toEqual({ tipo: "sin_stock_atras", n: 2 });
  });
  it("si nada pide nada: «Mantener»", () => {
    expect(queHacerPrenda([fila({ varianteId: "a", pisoDisponible: 8, almacenDisponible: 1, planPiso: plan("mantener") })])).toEqual({ tipo: "mantener", n: 0 });
  });
  it("donde no se separa piso y almacén (Taller) no hay diagnóstico de piso", () => {
    expect(queHacerPrenda([fila({ varianteId: "a", pisoDisponible: null, almacenDisponible: null, disponible: 5, planPiso: null })])).toBeNull();
  });
  it("con el motor caído no hay diagnóstico: nunca un «Mantener» que no sabe (revisión adversarial)", () => {
    expect(queHacerPrenda([fila({ varianteId: "a", pisoDisponible: 0, almacenDisponible: 4, planPiso: null })])).toBeNull();
  });
  it("con el piso sin cuadrar: «En pausa» con cuántas tallas esperan, después de lo que sí se sabe de la prenda", () => {
    const enPausa = fila({ varianteId: "p", pisoDisponible: 0, almacenDisponible: 4, planPiso: plan("pausa_sin_cuadre") });
    const atras = fila({ varianteId: "s", pisoDisponible: 0, almacenDisponible: 0, planPiso: plan("sin_atras") });
    const ok = fila({ varianteId: "m", planPiso: plan("mantener") });
    expect(queHacerPrenda([enPausa, ok])).toEqual({ tipo: "en_pausa", n: 1 });
    expect(queHacerPrenda([enPausa, atras, ok])).toEqual({ tipo: "sin_stock_atras", n: 1 });
  });
});

describe("textoTallasRecortadas y tallasPorPrenda — la tarjeta dice qué tallas está sumando (2026-10-03)", () => {
  it("con todas las tallas a la vista no dice nada", () => {
    expect(textoTallasRecortadas(["S", "M", "L"], 3)).toBeNull();
    expect(textoTallasRecortadas([], 3)).toBeNull();
  });
  it("con un filtro que dejó algunas, las nombra y dice de cuántas", () => {
    expect(textoTallasRecortadas(["M", "L"], 4)).toBe("Solo M · L (de 4 tallas)");
    expect(textoTallasRecortadas([null], 2)).toBe("Solo Única (de 2 tallas)");
  });
  it("cuenta las tallas por modelo y color, sin filtros", () => {
    const cuenta = tallasPorPrenda([
      { productoId: "p1", color: "Beige" },
      { productoId: "p1", color: "Beige" },
      { productoId: "p1", color: "Negro" },
      { productoId: "p2", color: "Beige" },
    ]);
    expect(cuenta.get(JSON.stringify(["p1", "Beige"]))).toBe(2);
    expect(cuenta.get(JSON.stringify(["p1", "Negro"]))).toBe(1);
    expect(cuenta.get(JSON.stringify(["p2", "Beige"]))).toBe(1);
  });
});
