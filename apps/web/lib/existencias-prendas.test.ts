import { describe, it, expect } from "vitest";
import { calcularAccionHoy } from "./existencias-recomendaciones";
import { hoyDeTalla } from "./existencias-hoy";
import { sumarCantidades, type FilaCantidadCruda } from "./inventario-reglas";
import {
  aclaracionDeLaCaja,
  agruparPorPrenda,
  deLaPrenda,
  desgloseDePrenda,
  estadoTalla,
  lineaDeLaSuma,
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

// Una sola clasificación por talla (rediseño 2026-10-04): la celda (`estadoTalla`) y la pastilla, el filtro y la tabla (`hoyDeTalla`)
// no pueden decir dos cosas de la misma talla. Se recorre cada combinación de piso y almacén con el umbral de hoy (0) y con el de
// antes (4), con la «Acción hoy» que calcula el motor real.
describe("estadoTalla dice lo mismo que hoyDeTalla, en toda combinación", () => {
  const EQUIVALE = { por_colgar: "por_colgar", por_reponer: "reponer", sin_stock_atras: "reponer", mantener: "normal" } as const;
  for (const umbral of [0, 4]) {
    it(`umbral de piso ${umbral}`, () => {
      for (let piso = 0; piso <= 6; piso++) {
        for (let almacen = 0; almacen <= 6; almacen++) {
          const accionHoy = calcularAccionHoy({ varianteId: "v", pisoDisponible: piso, almacenDisponible: almacen, enTransito: 0 }, { minDiasExposicionRitmo: 3, umbralStockPisoReposicion: umbral });
          const f = fila({ varianteId: "v", pisoDisponible: piso, almacenDisponible: almacen, accionHoy });
          const hoy = hoyDeTalla(f);
          const esperado = piso + almacen <= 0 ? "sin_stock" : hoy ? EQUIVALE[hoy] : "normal";
          expect(estadoTalla(f), `piso ${piso}, almacén ${almacen}`).toBe(esperado);
        }
      }
    });
  }
});

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

describe("queHacerPrenda — el diagnóstico de la prenda, con las palabras del filtro «Hoy» (2026-10-03)", () => {
  it("«Por colgar» va primero y cuenta solo las tallas con el piso en 0 y algo atrás", () => {
    const q = queHacerPrenda([
      fila({ varianteId: "a", pisoDisponible: 0, almacenDisponible: 6, accionHoy: REPONER }),
      fila({ varianteId: "b", pisoDisponible: 0, almacenDisponible: 0, accionHoy: REPONER }),
      fila({ varianteId: "c", pisoDisponible: 1, almacenDisponible: 2, accionHoy: REPONER }),
    ]);
    expect(q).toEqual({ tipo: "por_colgar", n: 1 });
  });
  it("sin nada por colgar, cuenta las que se pueden reponer (hay algo libre atrás)", () => {
    const q = queHacerPrenda([
      fila({ varianteId: "a", pisoDisponible: 2, almacenDisponible: 5, accionHoy: REPONER }),
      fila({ varianteId: "b", pisoDisponible: 9, almacenDisponible: 5, accionHoy: SIN_ACCION }),
      fila({ varianteId: "c", pisoDisponible: 1, almacenDisponible: 0, accionHoy: REPONER }),
    ]);
    expect(q).toEqual({ tipo: "por_reponer", n: 1 });
  });
  it("si lo que pide reponer tiene el almacén vacío: «Sin stock atrás» (el caso del Polo Lucky: piso 1, almacén 0)", () => {
    const q = queHacerPrenda([
      fila({ varianteId: "a", pisoDisponible: 1, almacenDisponible: 0, accionHoy: REPONER }),
      fila({ varianteId: "b", pisoDisponible: 0, almacenDisponible: 0, accionHoy: REPONER }),
    ]);
    expect(q).toEqual({ tipo: "sin_stock_atras", n: 2 });
  });
  it("si nada pide nada: «Mantener»", () => {
    expect(queHacerPrenda([fila({ varianteId: "a", pisoDisponible: 8, almacenDisponible: 1, accionHoy: SIN_ACCION })])).toEqual({ tipo: "mantener", n: 0 });
  });
  it("donde no se separa piso y almacén (Taller) no hay diagnóstico de piso", () => {
    expect(queHacerPrenda([fila({ varianteId: "a", pisoDisponible: null, almacenDisponible: null, disponible: 5, accionHoy: null })])).toEqual({ tipo: "mantener", n: 0 });
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

// Los cuatro lugares de una prenda (2026-10-04): la suma se prueba contra la regla REAL de cantidades (`sumarCantidades`), no
// contra números escritos a mano — si alguien cambia cómo cuenta el stock, esta prueba falla en vez de dejar al cajón
// diciendo una suma que ya no es la de la lista.
describe("desgloseDePrenda — piso + almacén + apartada + dañada", () => {
  // Una tienda: la talla M tiene 10 en el piso (2 apartadas ahí), 5 en el almacén (1 apartada) y 3 en cuarentena.
  const crudas: FilaCantidadCruda[] = [
    { variante_id: "M", cantidad: 10, cantidad_apartada: 2, sububicacion: { tipo: "piso_venta" } },
    { variante_id: "M", cantidad: 5, cantidad_apartada: 1, sububicacion: { tipo: "almacen_tienda" } },
    { variante_id: "M", cantidad: 3, cantidad_apartada: 0, sububicacion: { tipo: "cuarentena" } },
    { variante_id: "L", cantidad: 4, cantidad_apartada: 0, sububicacion: { tipo: "piso_venta" } },
    { variante_id: "L", cantidad: 0, cantidad_apartada: 0, sububicacion: { tipo: "almacen_tienda" } },
    { variante_id: "L", cantidad: 0, cantidad_apartada: 0, sububicacion: { tipo: "cuarentena" } },
  ];
  const cant = sumarCantidades(crudas);
  const filasReales = (["M", "L"] as const).map((id) => {
    const c = cant.get(id)!;
    return fila({
      varianteId: id,
      talla: id,
      pisoDisponible: c.pisoDisponible,
      almacenDisponible: c.almacenDisponible,
      disponible: c.disponible,
      apartado: c.apartado,
      danado: c.danado,
    });
  });
  const [prenda] = agruparPorPrenda(filasReales);
  const d = desgloseDePrenda(prenda)!;

  it("las cuatro cifras no se pisan: lo apartado sale del piso y del almacén, lo dañado queda fuera", () => {
    expect(d).toMatchObject({ piso: 8 + 4, almacen: 4, apartada: 3, danada: 3 });
  });
  it("«en stock» es el total de la lista y del Conteo; «en la sede» le suma lo dañado", () => {
    const total = [...cant.values()].reduce((n, c) => n + c.total, 0);
    const danado = [...cant.values()].reduce((n, c) => n + (c.danado ?? 0), 0);
    expect(d.enStock).toBe(total);
    expect(d.enLaSede).toBe(total + danado);
  });
  it("lo que cobra la caja es el piso del cajón, ni más ni menos", () => {
    const cobrable = [...cant.values()].reduce((n, c) => n + (c.pisoDisponible ?? 0), 0);
    expect(d.piso).toBe(cobrable);
  });
  it("sin piso y almacén (Taller) no hay desglose, y 0 no se confunde con «no aplica»", () => {
    const [taller] = agruparPorPrenda([fila({ varianteId: "t", pisoDisponible: null, almacenDisponible: null, disponible: 4 })]);
    expect(desgloseDePrenda(taller)).toBeNull();
    const [vacia] = agruparPorPrenda([fila({ varianteId: "v", pisoDisponible: 0, almacenDisponible: 0, disponible: 0 })]);
    expect(desgloseDePrenda(vacia)).toMatchObject({ piso: 0, almacen: 0, apartada: 0, danada: 0, enStock: 0, enLaSede: 0 });
  });
  it("recorre toda combinación: la suma de las cuatro siempre es «en la sede»", () => {
    for (let piso = 0; piso <= 4; piso++)
      for (let almacen = 0; almacen <= 4; almacen++)
        for (let apartada = 0; apartada <= 3; apartada++)
          for (let danada = 0; danada <= 3; danada++) {
            const x = desgloseDePrenda({ piso, almacen, apartado: apartada, danado: danada })!;
            expect(x.piso + x.almacen + x.apartada + x.danada).toBe(x.enLaSede);
            expect(x.enStock).toBe(x.enLaSede - x.danada);
          }
  });
});

describe("lineaDeLaSuma y aclaracionDeLaCaja — lo que se lee bajo las cuatro cifras", () => {
  const con = (piso: number, almacen: number, apartada: number, danada: number) => desgloseDePrenda({ piso, almacen, apartado: apartada, danado: danada })!;
  it("escribe la cuenta entera, también con ceros: el contrato de la suma no cambia de una prenda a otra", () => {
    expect(lineaDeLaSuma(con(8, 5, 2, 1)).cuenta).toBe("8 + 5 + 2 + 1 = 16");
    expect(lineaDeLaSuma(con(0, 0, 0, 0)).cuenta).toBe("0 + 0 + 0 + 0 = 0");
  });
  it("sin dañadas no hay aclaración aparte (nada que comparar con la lista)", () => {
    expect(lineaDeLaSuma(con(8, 5, 2, 0)).aparte).toBeNull();
  });
  it("con dañadas dice cuántas cuentan como stock y que lo dañado va aparte, en singular y plural", () => {
    expect(lineaDeLaSuma(con(8, 5, 2, 1)).aparte).toBe("15 cuentan como stock: la dañada va aparte");
    expect(lineaDeLaSuma(con(8, 5, 2, 3)).aparte).toBe("15 cuentan como stock: las dañadas van aparte");
    expect(lineaDeLaSuma(con(1, 0, 0, 2)).aparte).toBe("1 cuenta como stock: las dañadas van aparte");
  });
  it("«prenda» en singular solo con una", () => {
    expect(lineaDeLaSuma(con(1, 0, 0, 0)).texto).toBe("prenda en esta sede");
    expect(lineaDeLaSuma(con(0, 0, 0, 0)).texto).toBe("prendas en esta sede");
  });
  it("la aclaración da el número que SÍ cobra la caja y nunca dice «clienta»", () => {
    expect(aclaracionDeLaCaja(con(8, 5, 2, 1))).toContain("hoy,\u00a08.");
    expect(aclaracionDeLaCaja(con(0, 5, 0, 0))).toContain("hoy,\u00a00.");
    expect(aclaracionDeLaCaja(con(8, 5, 2, 1))).not.toMatch(/clienta/i);
  });
});

describe("deLaPrenda — lo de la sede que es de ESTA prenda", () => {
  const prenda = agruparPorPrenda([fila({ varianteId: "bei-M" }), fila({ varianteId: "bei-L", talla: "L" })])[0];
  const cola = [
    { id: "1", varianteId: "bei-M" },
    { id: "2", varianteId: "neg-S" },
    { id: "3", varianteId: "bei-L" },
  ];
  it("deja solo lo de sus tallas, en el orden en que venía", () => {
    expect(deLaPrenda(cola, prenda).map((x) => x.id)).toEqual(["1", "3"]);
  });
  it("sin nada suyo, lista vacía (la cifra no se vuelve un enlace a una ventana vacía)", () => {
    expect(deLaPrenda([{ id: "9", varianteId: "otra" }], prenda)).toEqual([]);
  });
});
