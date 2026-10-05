import { describe, it, expect } from "vitest";
import { hoyDeTalla } from "./existencias-hoy";
import { sumarCantidades, type FilaCantidadCruda } from "./inventario-reglas";
import { cantidadCobrable } from "./vender-stock-local";
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
  ordenarPorListaDelDia,
  queHacerPrenda,
  tallasPorPrenda,
  textoTallasRecortadas,
  sePuedeBajar,
  tallaParaBajar,
  tallaPorCodigo,
  urlBajarAlPiso,
  urlEtiquetas,
  urlTrasladar,
  type FilaPrenda,
} from "./existencias-prendas";
import { ACCIONES_PISO, DIAS_VENTANA, planDelPiso, type AccionPiso, type LecturaDelPiso, type PisoDeTalla, type TallaEnSede } from "./piso-plan";
import { porColgarDeLaSede } from "./existencias-para-hoy";
import { existenciasDeAlmacen, filasDelPiso } from "./inicio-almacen-reglas";

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

// Una sola clasificación por talla (rediseño 2026-10-04): la celda (`estadoTalla`) y la pastilla, el filtro y la tabla (`hoyDeTalla`)
// no pueden decir dos cosas de la misma talla. Se recorre cada combinación de piso, almacén y decisión del motor del piso
// (`ACCIONES_PISO`, ADR-0328 act. 7; integración de la ola 1: antes recorría `calcularAccionHoy` con umbral 0 y 4, que el motor retiró).
describe("estadoTalla dice lo mismo que hoyDeTalla, en toda combinación", () => {
  const EQUIVALE = { por_colgar: "por_colgar", sin_stock_atras: "sin_atras", mantener: "normal" } as const;
  for (const accion of ACCIONES_PISO) {
    it(`acción del motor ${accion}`, () => {
      for (let piso = 0; piso <= 6; piso++) {
        for (let almacen = 0; almacen <= 6; almacen++) {
          const f = fila({ varianteId: "v", pisoDisponible: piso, almacenDisponible: almacen, planPiso: plan(accion) });
          const hoy = hoyDeTalla(f);
          const esperado = piso + almacen <= 0 ? "sin_stock" : hoy ? EQUIVALE[hoy] : "normal";
          expect(estadoTalla(f), `piso ${piso}, almacén ${almacen}`).toBe(esperado);
        }
      }
    });
  }
});

describe("estadoTalla", () => {
  it("sin nada libre es «sin stock», aunque la regla pida colgar", () => {
    expect(estadoTalla(fila({ varianteId: "a", pisoDisponible: 0, almacenDisponible: 0, planPiso: plan("sin_atras") }))).toBe("sin_stock");
  });
  it("piso en 0 y algo atrás es «por colgar»", () => {
    expect(estadoTalla(fila({ varianteId: "a", pisoDisponible: 0, almacenDisponible: 3, planPiso: plan("por_colgar") }))).toBe("por_colgar");
  });
  it("falta en el piso y no hay nada atrás, con algo libre en otro lugar de la sede: «sin atrás» (antes «reponer»)", () => {
    expect(estadoTalla(fila({ varianteId: "a", pisoDisponible: 0, almacenDisponible: 0, disponible: 1, planPiso: plan("sin_atras") }))).toBe("sin_atras");
  });
  it("lo demás es normal", () => {
    expect(estadoTalla(fila({ varianteId: "a" }))).toBe("normal");
  });
});

describe("sePuedeBajar: un hecho físico, no una recomendación (revisión adversarial del motor del piso)", () => {
  it("hay algo libre en el almacén → se puede bajar, diga lo que diga el motor", () => {
    expect(sePuedeBajar(fila({ varianteId: "a", planPiso: plan("por_colgar"), pisoDisponible: 0, almacenDisponible: 1 }))).toBe(true);
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

describe("«Colgar en el piso» y «Colgar en el piso» no se apagan con «Mantener» ni con el motor caído (hallazgo H-A de la revisión)", () => {
  // S, M y L con 1 colgada y 3 guardadas, y XL con 0 y 2: con el mínimo de 1 por talla central, el motor dice «Mantener» en las
  // cuatro (XL es extrema). Hay 11 guardadas: el botón no puede decir que el almacén está vacío.
  const tallas = [
    fila({ varianteId: "s", talla: "S", pisoDisponible: 1, almacenDisponible: 3, planPiso: plan("mantener") }),
    fila({ varianteId: "m", talla: "M", pisoDisponible: 1, almacenDisponible: 3, planPiso: plan("mantener") }),
    fila({ varianteId: "l", talla: "L", pisoDisponible: 1, almacenDisponible: 3, planPiso: plan("mantener") }),
    fila({ varianteId: "xl", talla: "XL", pisoDisponible: 0, almacenDisponible: 2, planPiso: plan("mantener") }),
  ];
  it("con «Mantener» en todas: hay talla para reponer y las cuatro van a «Colgar en el piso»", () => {
    expect(tallaParaBajar(tallas)?.varianteId).toBe("s");
    expect(lineasParaBajar(tallas).map((l) => l.varianteId)).toEqual(["s", "m", "l", "xl"]);
    expect(agruparPorPrenda(tallas)[0].tallasParaBajar).toBe(4);
  });
  it("con el motor caído (planPiso null en todas): lo mismo", () => {
    const sinMotor = tallas.map((f) => ({ ...f, planPiso: null }));
    expect(tallaParaBajar(sinMotor)?.varianteId).toBe("s");
    expect(urlBajarAlPiso(sinMotor)).toBe("/inventario/bajar?lineas=s:1,m:1,l:1,xl:1");
  });
  it("que se pueda bajar no la vuelve urgente: con «Mantener» no entra a «Por colgar» de «Para hoy» ni del Inicio", () => {
    expect(porColgarDeLaSede(tallas, [])).toMatchObject({ tallas: 0, prendas: [] });
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

  it("Colgar en el piso lleva lo marcado que tiene algo libre atrás, lo pida el motor o no, de a una unidad (CAYLA no sugiere cantidades)", () => {
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

describe("la lista del día ordena Existencias igual que el Inicio (revisión adversarial, caso H-B)", () => {
  // La misma lectura de una sede, como la recibe el Inicio (TallaEnSede) y como la ve Existencias (una fila por talla con la
  // decisión del motor). Casaca Ximena XL (talla extrema) se vendió ayer; Top Luna S·M·L no tiene ninguna colgada; Short Mía M no
  // tiene nada atrás.
  const t = (p: Partial<TallaEnSede> & { varianteId: string; productoId: string; referencia: string; talla: string }): TallaEnSede => ({
    categoriaId: "cat-polos",
    tallaId: `t-${p.talla}`,
    colorCodigo: "NEG",
    color: "Negro",
    colorHex: "#1A1A1A",
    familiaColor: "neutro",
    retirada: false,
    fotoUrl: null,
    pisoLibre: 0,
    almacenLibre: 0,
    enCamino: 0,
    vendidasHoy: 0,
    vendidasAyer: 0,
    vendidas14: 0,
    ...p,
  });
  const tallas = [
    t({ varianteId: "luna-s", productoId: "luna", referencia: "Top Luna", talla: "S", almacenLibre: 2 }),
    t({ varianteId: "luna-m", productoId: "luna", referencia: "Top Luna", talla: "M", almacenLibre: 2 }),
    t({ varianteId: "luna-l", productoId: "luna", referencia: "Top Luna", talla: "L", almacenLibre: 2 }),
    t({ varianteId: "mia-m", productoId: "mia", referencia: "Short Mía", talla: "M" }),
    t({ varianteId: "xim-xl", productoId: "ximena", referencia: "Casaca Ximena", talla: "XL", almacenLibre: 1, vendidasAyer: 1, vendidas14: 1 }),
    t({ varianteId: "xim-m", productoId: "ximena", referencia: "Casaca Ximena", talla: "M", pisoLibre: 2, almacenLibre: 1 }),
  ];
  const lectura: LecturaDelPiso = {
    ubicacionId: "tru",
    separaPiso: true,
    cuadradoEn: "2026-10-01T15:00:00+00:00",
    hoy: "2026-10-04",
    dias: DIAS_VENTANA,
    tallas,
    ventas: [],
    anotadasRecientes: [],
    curvas: [{ categoriaId: "cat-polos", categoria: "Polos", prefijo: null, familia: null, tallas: ["XS", "S", "M", "L", "XL"] }],
  };
  const plan = planDelPiso(lectura);
  const filas = tallas.map((x) =>
    fila({
      varianteId: x.varianteId,
      productoId: x.productoId,
      referencia: x.referencia,
      talla: x.talla,
      color: x.color,
      pisoDisponible: x.pisoLibre,
      almacenDisponible: x.almacenLibre,
      planPiso: plan.porTalla.get(x.varianteId) ?? null,
    })
  );
  const perchas = (ps: { referencia: string; tallas: (string | null)[] }[]) => ps.map((p) => `${p.referencia}:${p.tallas.join("·")}`);

  it("«Para hoy» dice EXACTAMENTE lo que el Inicio: mismas prendas, mismas tallas, mismo orden", () => {
    // El Inicio no lee Existencias: cuenta sobre la lectura del motor (`filasDelPiso`) con la MISMA función.
    const inicio = existenciasDeAlmacen(filasDelPiso(lectura, plan), plan.listaDelDia).primeras;
    const paraHoy = porColgarDeLaSede(filas, plan.listaDelDia).prendas.map((p) => ({ referencia: p.referencia, tallas: p.tallas.map((f) => f.talla) }));
    expect(perchas(paraHoy)).toEqual(perchas(inicio));
    // Lo vendido ayer primero, y «Sin stock atrás» (Short Mía) no se cuelga.
    expect(perchas(inicio)).toEqual(["Casaca Ximena:XL", "Top Luna:S·M·L"]);
  });
  it("sin búsqueda, la lista «Por prenda» va en el mismo orden y el resto después, en el orden en que llegó", () => {
    expect(ordenarPorListaDelDia(agruparPorPrenda(filas), plan.listaDelDia).map((p) => p.productoId)).toEqual(["ximena", "luna", "mia"]);
  });
  it("sin lista (el motor no respondió o el piso está en pausa): el orden de llegada, también en «Para hoy»", () => {
    expect(ordenarPorListaDelDia(agruparPorPrenda(filas), []).map((p) => p.productoId)).toEqual(["luna", "mia", "ximena"]);
    expect(porColgarDeLaSede(filas, []).prendas.map((p) => p.productoId)).toEqual(["luna", "ximena"]);
  });
});

describe("tallaParaBajar (tarea #7): «Reponer N tallas» abre una talla que se pueda bajar", () => {
  const sinAtras = fila({ varianteId: "sin-atras", talla: "S", planPiso: plan("sin_atras"), pisoDisponible: 1, almacenDisponible: 0 });
  const mantener = fila({ varianteId: "mantener", talla: "M", planPiso: plan("mantener"), pisoDisponible: 2, almacenDisponible: 3 });
  const porColgar = fila({ varianteId: "por-colgar", talla: "L", planPiso: plan("por_colgar"), pisoDisponible: 0, almacenDisponible: 2 });

  it("primero una por colgar que se pueda bajar", () => {
    expect(tallaParaBajar([sinAtras, mantener, porColgar])?.varianteId).toBe("por-colgar");
  });
  it("si el motor no pide nada, igual abre una que se pueda bajar: la primera con algo atrás — nunca una sin nada atrás", () => {
    const xl = fila({ varianteId: "xl", talla: "XL", planPiso: plan("mantener"), pisoDisponible: 1, almacenDisponible: 4 });
    expect(tallaParaBajar([sinAtras, xl])?.varianteId).toBe("xl");
    expect(tallaParaBajar([sinAtras, mantener, xl])?.varianteId).toBe("mantener");
  });
  it("sin ninguna que se pueda bajar, ninguna", () => {
    expect(tallaParaBajar([sinAtras])).toBeNull();
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
      fila({ varianteId: "c", pisoDisponible: 0, almacenDisponible: 2, planPiso: plan("por_colgar") }),
      fila({ varianteId: "d", pisoDisponible: 1, almacenDisponible: 2, planPiso: plan("mantener") }),
    ]);
    expect(q).toEqual({ tipo: "por_colgar", n: 2 });
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
  it("«en stock» es el `total` de la base (piso + almacén contando lo apartado); «en la sede» le suma lo dañado", () => {
    const total = [...cant.values()].reduce((n, c) => n + c.total, 0);
    const danado = [...cant.values()].reduce((n, c) => n + (c.danado ?? 0), 0);
    expect(d.enStock).toBe(total);
    expect(d.enLaSede).toBe(total + danado);
  });
  it("lo que cobra la caja es el piso del cajón, ni más ni menos (atado a `cantidadCobrable`, la regla de la caja)", () => {
    const cobrable = [...cant.values()].reduce((n, c) => n + cantidadCobrable(c), 0);
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
  it("con dañadas dice cuánto es la suma sin ellas y que están en cuarentena, en singular y plural", () => {
    expect(lineaDeLaSuma(con(8, 5, 2, 1)).aparte).toBe("15 sin contar la dañada, que está en cuarentena");
    expect(lineaDeLaSuma(con(8, 5, 2, 3)).aparte).toBe("15 sin contar las dañadas, que están en cuarentena");
    expect(lineaDeLaSuma(con(1, 0, 0, 2)).aparte).toBe("1 sin contar las dañadas, que están en cuarentena");
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
