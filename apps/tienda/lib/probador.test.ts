import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import type { StockModelo } from "./stock";
import {
  agotada,
  armarProbador,
  hayParaProbar,
  ayudaDeZona,
  azarDesde,
  busquedaConLook,
  cajaDe,
  cajaVecina,
  achicar,
  codificarLook,
  colorInicial,
  colorPara,
  combinan,
  completarLook,
  elegibles,
  escalaDe,
  fotoDelColor,
  hrefDelProbador,
  indizar,
  interpretarProbador,
  LOOK_VACIO,
  lookDeLaUrl,
  lookParaLaHoja,
  lookInicial,
  memoriaInicial,
  notaDeLaFoto,
  notaDelColor,
  piezasDelLook,
  textoAgregarAlLook,
  piezasParaLasTallas,
  poner,
  presentes,
  puntoDe,
  quitar,
  sorprender,
  totales,
  vecinaDe,
  vecinasDe,
  zonaDe,
  type ColorDelProbador,
  type LecturaProbador,
  type Look,
  type PrendaDelProbador,
  type Zona,
} from "./probador";

const TRU = { id: "11111111-1111-4111-8111-000000000001", nombre: "Trujillo" };
const LIM = { id: "11111111-1111-4111-8111-000000000002", nombre: "Lima" };
const AQP = { id: "11111111-1111-4111-8111-000000000003", nombre: "Arequipa" };
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const URL_FOTO = (n: string) => `https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/recortes/${n}.png`;

function color(c: Partial<ColorDelProbador> & { codigo: string }): ColorDelProbador {
  return {
    nombre: c.codigo,
    hex: "#000000",
    precio: 50,
    precioFinal: 50,
    desde: false,
    pct: null,
    hay: true,
    nota: null,
    solo: null,
    foto: { url: URL_FOTO(c.codigo), proporcion: 0.8, optimizar: true, propia: true, de: null },
    ...c,
  };
}

function prenda(n: number, zona: Zona, colores: ColorDelProbador[], extra: Partial<PrendaDelProbador> = {}): PrendaDelProbador {
  return { id: id(n), codigo: `P-${n}`, nombre: `Prenda ${n}`, categoria: null, zona, metida: false, largo: 60, colores, ...extra };
}

describe("interpretarProbador: lo que dice la base", () => {
  const colorCrudo = { codigo: "NEG", precio: 79.9, precio_final: 63.9, desde: false, campana: { nombre: "Fin de mes", pct: 20 }, stock: { total: "hay", sedes: { [TRU.id]: 2 } } };
  const recorteCrudo = { color: "NEG", color_nombre: "Negro", url: URL_FOTO("a"), proporcion: 0.8 };

  it("lee prendas, recortes, colores y combinaciones, y salta lo mal formado", () => {
    const l = interpretarProbador({
      sede: TRU.id,
      prendas: [
        { id: id(1), largo: 65, recortes: [recorteCrudo, { color: null, color_nombre: null, url: URL_FOTO("b"), proporcion: 1.1 }, { url: "no" }], colores: [colorCrudo, { codigo: "MAL", precio: 10, precio_final: 20, desde: false }] },
        { id: "no-es-uuid", largo: 65, recortes: [recorteCrudo], colores: [colorCrudo] },
        { id: id(2), largo: 65, recortes: [], colores: [colorCrudo] },
        { id: id(3), largo: 4, recortes: [recorteCrudo], colores: [colorCrudo] },
      ],
      combina: { NEG: ["BLA", "CRU"] },
    });
    expect(l).not.toBeNull();
    expect([...l!.prendas.keys()]).toEqual([id(1)]);
    const p = l!.prendas.get(id(1))!;
    expect(p.recortes).toEqual([
      { color: "NEG", colorNombre: "Negro", url: URL_FOTO("a"), proporcion: 0.8 },
      { color: null, colorNombre: null, url: URL_FOTO("b"), proporcion: 1.1 },
    ]);
    expect([...p.colores.keys()]).toEqual(["NEG"]);
    expect(p.colores.get("NEG")).toEqual({ precio: 79.9, precioFinal: 63.9, desde: false, campana: { nombre: "Fin de mes", pct: 20 }, stock: { total: "hay", sedes: { [TRU.id]: 2 } } });
    expect(l!.combina).toEqual({ NEG: ["BLA", "CRU"] });
    expect(l!.sede).toBe(TRU.id);
  });

  it("una respuesta sin forma es null (la página dice que no se pudo cargar); sin combinaciones, ninguna", () => {
    expect(interpretarProbador(null)).toBeNull();
    expect(interpretarProbador({ prendas: "x" })).toBeNull();
    expect(interpretarProbador({ sede: null, prendas: [], combina: "raro" })).toEqual({ sede: null, prendas: new Map(), combina: {} });
  });
});

describe("zonaDe: la zona de cada categoría, por su prefijo (máximo 3 prendas: arriba, abajo y bolso; ADR-0444)", () => {
  const de = (prefijo: string | null, nombre = "X") => zonaDe({ nombre, prefijo });
  it("arriba, abajo y el bolso (Bolsos y Carteras)", () => {
    expect(["CMS", "TOP", "BOD", "POL"].map((p) => de(p))).toEqual(["arriba", "arriba", "arriba", "arriba"]);
    expect(["PAN", "JEA", "FAL", "SHO"].map((p) => de(p))).toEqual(["abajo", "abajo", "abajo", "abajo"]);
    expect(de("CAR")).toBe("bolso");
  });
  it("una casaca, un chaleco, un blazer o un abrigo ES la prenda de arriba: no va encima de otra", () => {
    expect(["BLZ", "CHA", "CAS", "ABR"].map((p) => de(p))).toEqual(["arriba", "arriba", "arriba", "arriba"]);
  });
  it("los vestidos, enterizos y conjuntos, y las capas, no entran", () => {
    expect(["VES", "CON", "ENT", "TBA", "CAP"].map((p) => de(p))).toEqual([null, null, null, null, null]);
  });
  it("ninguna categoría cae en las zonas «vestido» ni «encima»", () => {
    for (const p of ["CMS", "TOP", "BOD", "POL", "VES", "CON", "ENT", "PAN", "JEA", "FAL", "SHO", "BLZ", "CHA", "CAS", "CAP", "ABR", "CAR", "KIM"]) {
      expect(["vestido", "encima"]).not.toContain(de(p));
    }
  });
  it("los demás accesorios, la bisutería, el calzado y el empaque no entran", () => {
    expect(["MOC", "ARE", "ZAP", "BOL", "MAQ"].map((p) => de(p))).toEqual([null, null, null, null, null]);
    expect(zonaDe(null)).toBeNull();
  });
  it("una categoría nueva que nadie ordenó cae en «Chompas/Abrigos» del menú, y en el armador es prenda de arriba", () => {
    expect(de("KIM")).toBe("arriba");
  });
});

describe("la foto de cada color: solo fotos reales", () => {
  const recortes = [
    { color: "BEI", colorNombre: "Beige", url: URL_FOTO("bei"), proporcion: 0.8 },
    { color: null, colorNombre: null, url: URL_FOTO("todos"), proporcion: 0.9 },
  ];
  it("la suya; si no tiene, la de «todos los colores»; si tampoco, la de otro color", () => {
    expect(fotoDelColor("BEI", recortes)).toEqual({ url: URL_FOTO("bei"), proporcion: 0.8, propia: true, de: null });
    expect(fotoDelColor("NEG", recortes)).toEqual({ url: URL_FOTO("todos"), proporcion: 0.9, propia: false, de: null });
    expect(fotoDelColor("NEG", [recortes[0]])).toEqual({ url: URL_FOTO("bei"), proporcion: 0.8, propia: false, de: "Beige" });
    expect(fotoDelColor("NEG", [])).toBeNull();
  });
  it("lo dice sin nombrar un color que el sistema no sabe", () => {
    const foto = (de: string | null, propia = false) => ({ url: "u", proporcion: 1, optimizar: false, propia, de });
    expect(notaDeLaFoto({ nombre: "Negro", foto: foto(null, true) })).toBeNull();
    expect(notaDeLaFoto({ nombre: "Negro", foto: foto("Gris perla") })).toBe("Aún no hay foto en negro: ves la del gris perla");
    expect(notaDeLaFoto({ nombre: "Negro", foto: foto(null) })).toBe("Aún no hay foto en negro: ves otra foto de esta prenda");
  });
});

describe("notaDelColor: cada color dice cuánto hay", () => {
  const stock = (sedes: Record<string, "hay" | number>, total: "hay" | number) => ({ sedes, total });
  it("con una tienda elegida, la nota de la tarjeta", () => {
    expect(notaDelColor(stock({ [TRU.id]: 2 }, 2), TRU, [TRU, LIM])).toEqual({ texto: "Quedan 2 en Trujillo", tono: "poco" });
    expect(notaDelColor(stock({ [TRU.id]: 0 }, 0), TRU, [TRU, LIM])).toEqual({ texto: "No hay en Trujillo", tono: "no" });
  });
  it("con «Todas», también donde la tarjeta calla porque hay de sobra", () => {
    expect(notaDelColor(stock({ [TRU.id]: "hay", [LIM.id]: "hay", [AQP.id]: 1 }, "hay"), null, [TRU, LIM, AQP])).toEqual({ texto: "Hay en todas las tiendas", tono: "ok" });
    expect(notaDelColor(stock({ [TRU.id]: "hay", [LIM.id]: 2, [AQP.id]: 0 }, "hay"), null, [TRU, LIM, AQP])).toEqual({ texto: "Hay en 2 tiendas", tono: "ok" });
    expect(notaDelColor(stock({ [TRU.id]: "hay" }, "hay"), null, [TRU])).toEqual({ texto: "Hay en Trujillo", tono: "ok" });
    expect(notaDelColor(stock({ [TRU.id]: 0, [LIM.id]: 3 }, 3), null, [TRU, LIM])).toEqual({ texto: "Solo en Lima", tono: "poco" });
    expect(notaDelColor(stock({}, 0), null, [TRU, LIM])).toEqual({ texto: "No hay por ahora", tono: "no" });
  });
  it("sin el dato o sin tiendas en la web, nada (no se afirma lo que no se sabe)", () => {
    expect(notaDelColor(null, null, [TRU])).toBeNull();
    expect(notaDelColor(stock({}, "hay"), null, [])).toBeNull();
  });
});

describe("armarProbador: el catálogo y lo del probador, juntos", () => {
  const delCatalogo = (n: number, prefijo: string, colores: string[], extra: Partial<Prenda> = {}): Prenda => ({
    empresa: null,
    id: id(n),
    codigo: `P-${n}`,
    nombre: `Prenda ${n}`,
    categoria: { nombre: `Cat ${prefijo}`, prefijo },
    precio: 99,
    precioFinal: 99,
    desde: false,
    campana: null,
    colores: colores.map((c) => ({ codigo: c, nombre: `Color ${c}`, hex: "#111111", foto: null })),
    fotos: [],
    stock: null,
    nuevo: null,
    vendidos: null,
    ...extra,
  });
  const leido = (precio: number, final: number, stock: StockModelo | null = null) => ({
    precio,
    precioFinal: final,
    desde: false,
    campana: final < precio ? { nombre: "Campaña", pct: 10 } : null,
    stock,
  });
  const lectura: LecturaProbador = {
    sede: null,
    prendas: new Map([
      [id(1), { largo: 65, recortes: [{ color: "NEG", colorNombre: "Color NEG", url: URL_FOTO("n1"), proporcion: 0.9 }], colores: new Map([["NEG", leido(80, 72, { total: 1, sedes: { [TRU.id]: 1, [LIM.id]: 0 } })], ["BEI", leido(80, 80, { total: 0, sedes: {} })]]) }],
      [id(2), { largo: 100, recortes: [{ color: null, colorNombre: null, url: URL_FOTO("c2"), proporcion: 0.45 }], colores: new Map([["AZU", leido(120, 120)]]) }],
      [id(3), { largo: 30, recortes: [{ color: "NEG", colorNombre: "Negro", url: URL_FOTO("z3"), proporcion: 1 }], colores: new Map([["NEG", leido(60, 60)]]) }],
      [id(4), { largo: 65, recortes: [{ color: "ROJ", colorNombre: "Rojo", url: URL_FOTO("b4"), proporcion: 0.5 }], colores: new Map([["ROJ", leido(40, 40)]]) }],
    ]),
    combina: {},
  };
  const catalogo = [
    delCatalogo(4, "BOD", ["ROJ"]),
    delCatalogo(1, "CMS", ["NEG", "BEI", "VER"]),
    delCatalogo(2, "PAN", ["AZU"]),
    delCatalogo(3, "ZAP", ["NEG"]),
    delCatalogo(5, "TOP", ["NEG"]),
  ];
  const prendas = armarProbador(catalogo, lectura, { elegida: null, tiendas: [TRU, LIM], optimizable: (u) => u.includes("n1") });

  it("en el orden del catálogo, solo lo que cae en una zona y la base trae (sin zapatos, sin lo que no tiene recortes)", () => {
    expect(prendas.map((p) => [p.nombre, p.zona, p.largo, p.metida])).toEqual([
      ["Prenda 4", "arriba", 65, true],
      ["Prenda 1", "arriba", 65, false],
      ["Prenda 2", "abajo", 100, false],
    ]);
  });

  it("los colores del catálogo que la base trae, con el precio, el stock y la foto de ESE color", () => {
    const blusa = prendas[1];
    expect(blusa.colores.map((c) => c.codigo)).toEqual(["NEG", "BEI"]);
    expect(blusa.colores[0]).toMatchObject({ nombre: "Color NEG", precio: 80, precioFinal: 72, pct: 10, hay: true, solo: "Trujillo", nota: { texto: "Solo en Trujillo", tono: "poco" } });
    expect(blusa.colores[0].foto).toEqual({ url: URL_FOTO("n1"), proporcion: 0.9, optimizar: true, propia: true, de: null });
    expect(blusa.colores[1]).toMatchObject({ precio: 80, precioFinal: 80, pct: null, hay: false, nota: { texto: "No hay por ahora", tono: "no" } });
    expect(blusa.colores[1].foto).toMatchObject({ propia: false, de: "Color NEG", optimizar: true });
    expect(prendas[2].colores[0].foto).toMatchObject({ propia: false, de: null, optimizar: false });
  });

  it("con una tienda elegida, «hay» es de esa tienda y no hay insignia de «solo en»", () => {
    const enLima = armarProbador(catalogo, lectura, { elegida: LIM, tiendas: [TRU, LIM], optimizable: () => false });
    expect(enLima[1].colores[0]).toMatchObject({ hay: false, solo: null, nota: { texto: "No hay en Lima", tono: "no" } });
    expect(agotada(enLima[1])).toBe(true);
    // Sin el dato del stock, sí hay (no se esconde lo que no se sabe).
    expect(enLima[2].colores[0].hay).toBe(true);
  });

  it("¿hay algo que probar? (la cabecera muestra «Arma el tuyo» solo entonces): la misma regla que arma el probador", () => {
    expect(hayParaProbar(catalogo, lectura)).toBe(true);
    // Sin recortes listos (la base no trae la prenda), en una zona que el probador no dibuja o sin un color con foto: nada que probar.
    expect(hayParaProbar([delCatalogo(5, "TOP", ["NEG"]), delCatalogo(3, "ZAP", ["NEG"])], lectura)).toBe(false);
    expect(hayParaProbar([delCatalogo(1, "CMS", ["VER"])], lectura)).toBe(false);
    expect(hayParaProbar([], lectura)).toBe(false);
  });
});

/* ---------------------------------------------------------------- El look ---------------------------------------------------------------- */

const ROSA = color({ codigo: "RPA", nombre: "Rosa pálido" });
const NEGRO_SIN_FOTO = color({ codigo: "NEG", nombre: "Negro", foto: { url: URL_FOTO("RPA"), proporcion: 0.8, optimizar: true, propia: false, de: "Rosa pálido" } });
const TOP = prenda(1, "arriba", [NEGRO_SIN_FOTO, ROSA]);
const CAMISA = prenda(2, "arriba", [color({ codigo: "GRI" })]);
const BODY = prenda(3, "arriba", [color({ codigo: "AMM", hay: false })]);
const PANTALON = prenda(4, "abajo", [color({ codigo: "CAM", precio: 89.9, precioFinal: 89.9 })]);
const JEAN = prenda(5, "abajo", [color({ codigo: "AZA" }), color({ codigo: "AZD", desde: true, precioFinal: 40 })]);
const VESTIDO = prenda(6, "vestido", [color({ codigo: "ROS" })]);
const BLAZER = prenda(7, "encima", [color({ codigo: "GRA" }), color({ codigo: "NEG" })], { categoria: "Blazers" });
const CHALECO = prenda(8, "encima", [color({ codigo: "VIN" })], { categoria: "Chalecos" });
const CARTERA = prenda(9, "bolso", [color({ codigo: "NEG" })], { categoria: "Bolsos y Carteras" });
const TODAS = [TOP, CAMISA, BODY, PANTALON, JEAN, VESTIDO, BLAZER, CHALECO, CARTERA];
const INDICE = indizar(TODAS);
const pieza = (p: PrendaDelProbador, c = colorInicial(p).codigo) => ({ id: p.id, color: c });

describe("el color con que entra una prenda", () => {
  it("el primero con foto propia y que hay; el que el cliente eligió, si lo sigue teniendo", () => {
    expect(colorInicial(TOP).codigo).toBe("RPA");
    expect(colorInicial(BODY).codigo).toBe("AMM");
    expect(colorPara(TOP, { [TOP.id]: "NEG" }).codigo).toBe("NEG");
    expect(colorPara(TOP, { [TOP.id]: "XXX" }).codigo).toBe("RPA");
  });
});

describe("poner y sacar: un vestido ocupa arriba y abajo", () => {
  const base: Look = { ...LOOK_VACIO, arriba: pieza(TOP), abajo: pieza(PANTALON), bolso: pieza(CARTERA) };
  it("el vestido guarda lo de arriba y abajo y los saca", () => {
    const r = poner(base, { arriba: null, abajo: null }, VESTIDO, "ROS");
    expect(presentes(r.look)).toEqual(["vestido", "bolso"]);
    expect(r.memoria).toEqual({ arriba: base.arriba, abajo: base.abajo });
    expect(r.restaurada).toBeNull();
  });
  it("algo de arriba sobre el vestido lo saca y vuelve lo de abajo que había", () => {
    const conVestido = poner(base, { arriba: null, abajo: null }, VESTIDO, "ROS");
    const r = poner(conVestido.look, conVestido.memoria, CAMISA, "GRI");
    expect(r.look).toMatchObject({ vestido: null, arriba: { id: CAMISA.id, color: "GRI" }, abajo: base.abajo });
    expect(r.restaurada).toBe("abajo");
  });
  it("solo se saca lo que puede faltar (algo encima y el bolso)", () => {
    expect(quitar(base, "bolso").bolso).toBeNull();
    expect(quitar(base, "arriba")).toBe(base);
  });
});

describe("deslizar: la siguiente y las que asoman", () => {
  it("en círculo y sin las agotadas", () => {
    expect(elegibles(TODAS, "arriba").map((p) => p.id)).toEqual([TOP.id, CAMISA.id]);
    expect(vecinaDe(TODAS, "arriba", TOP.id, 1)?.id).toBe(CAMISA.id);
    expect(vecinaDe(TODAS, "arriba", CAMISA.id, 1)?.id).toBe(TOP.id);
    expect(vecinaDe(TODAS, "arriba", TOP.id, -1)?.id).toBe(CAMISA.id);
    expect(vecinaDe(TODAS, "vestido", VESTIDO.id, 1)).toBeNull();
    // La puesta llegó agotada (por la dirección): se pasa a la primera que sí se puede poner.
    expect(vecinaDe(TODAS, "arriba", BODY.id, 1)?.id).toBe(TOP.id);
  });
  it("asoman la anterior y la siguiente; una sola si son la misma; ninguna si no hay otra", () => {
    expect(vecinasDe(TODAS, "abajo", PANTALON.id).map((v) => [v.lado, v.prenda.id])).toEqual([[1, JEAN.id]]);
    expect(vecinasDe([...TODAS, prenda(10, "abajo", [color({ codigo: "X" })])], "abajo", PANTALON.id).map((v) => v.lado)).toEqual([-1, 1]);
    expect(vecinasDe(TODAS, "vestido", VESTIDO.id)).toEqual([]);
  });
});

describe("Sorpréndeme", () => {
  const base: Look = { ...LOOK_VACIO, arriba: pieza(TOP), abajo: pieza(PANTALON), encima: pieza(BLAZER), bolso: pieza(CARTERA) };
  it("lo que tiene candado no se toca; lo demás cambia", () => {
    const r = sorprender(base, { arriba: true, bolso: true }, TODAS, {}, azarDesde(0.3));
    expect(r.arriba).toEqual(base.arriba);
    expect(r.bolso).toEqual(base.bolso);
    expect(r.abajo?.id).toBe(JEAN.id);
    expect(r.encima?.id).toBe(CHALECO.id);
  });
  it("nunca pone algo agotado, y prefiere la foto propia", () => {
    for (let i = 0; i < 20; i++) {
      const r = sorprender(base, {}, TODAS, {}, azarDesde(i / 20));
      expect(r.arriba?.id).not.toBe(BODY.id);
      // El top tiene el negro sin foto propia: si vuelve al top, es en rosa.
      if (r.arriba?.id === TOP.id) expect(r.arriba.color).toBe("RPA");
    }
  });
  it("prefiere los colores que combinan con lo que se queda", () => {
    const fijo: Look = { ...LOOK_VACIO, arriba: pieza(CAMISA, "GRI"), abajo: pieza(PANTALON), encima: pieza(CHALECO) };
    for (let i = 0; i < 10; i++) {
      const r = sorprender(fijo, { arriba: true, abajo: true }, TODAS, { GRI: ["NEG"] }, azarDesde(i / 10));
      expect(r.encima).toEqual({ id: BLAZER.id, color: "NEG" });
    }
    expect(combinan("GRI", "NEG", { NEG: ["GRI"] })).toBe(true);
    expect(combinan("NEG", "NEG", { NEG: ["NEG"] })).toBe(false);
  });
  it("con la misma semilla, el mismo look", () => {
    expect(sorprender(base, {}, TODAS, {}, azarDesde(0.42))).toEqual(sorprender(base, {}, TODAS, {}, azarDesde(0.42)));
  });
});

describe("el look con que abre", () => {
  it("lo primero que hay arriba y abajo, y un bolso; nada encima", () => {
    expect(lookInicial(TODAS)).toEqual({ ...LOOK_VACIO, arriba: pieza(TOP), abajo: pieza(PANTALON), bolso: pieza(CARTERA) });
  });
  it("si falta arriba o abajo, un vestido", () => {
    expect(lookInicial([VESTIDO, PANTALON])).toEqual({ ...LOOK_VACIO, vestido: pieza(VESTIDO) });
    expect(lookInicial([PANTALON])).toEqual({ ...LOOK_VACIO, abajo: pieza(PANTALON) });
  });
  it("un look que perdió lo de arriba o lo de abajo se completa; uno con vestido, no", () => {
    expect(completarLook({ ...LOOK_VACIO, abajo: pieza(JEAN), bolso: pieza(CARTERA) }, TODAS)).toEqual({ ...LOOK_VACIO, arriba: pieza(TOP), abajo: pieza(JEAN), bolso: pieza(CARTERA) });
    expect(completarLook({ ...LOOK_VACIO, vestido: pieza(VESTIDO) }, TODAS)).toEqual({ ...LOOK_VACIO, vestido: pieza(VESTIDO) });
    // Solo un bolso y, en esta tienda, nada de abajo: un vestido.
    expect(completarLook({ ...LOOK_VACIO, bolso: pieza(CARTERA) }, [TOP, VESTIDO, CARTERA])).toEqual({ ...LOOK_VACIO, vestido: pieza(VESTIDO), bolso: pieza(CARTERA) });
  });
  it("la memoria del vestido: lo de arriba y abajo del look o, si no había, lo primero que hay", () => {
    expect(memoriaInicial({ ...LOOK_VACIO, vestido: pieza(VESTIDO) }, TODAS)).toEqual({ arriba: pieza(TOP), abajo: pieza(PANTALON) });
    expect(memoriaInicial({ ...LOOK_VACIO, arriba: pieza(CAMISA) }, TODAS)).toEqual({ arriba: pieza(CAMISA), abajo: pieza(PANTALON) });
  });
});

describe("lo que cuesta el look", () => {
  it("la suma de lo que se paga por cada prenda en su color, con «Desde» si alguna lo lleva", () => {
    const look: Look = { ...LOOK_VACIO, arriba: pieza(TOP), abajo: pieza(JEAN, "AZD") };
    expect(totales(look, INDICE)).toEqual({ cuantas: 2, final: 90, lista: 100, desde: true });
    expect(totales(LOOK_VACIO, INDICE)).toEqual({ cuantas: 0, final: 0, lista: 0, desde: false });
  });
  it("sin las prendas que el cliente no lleva («✕»): no cuentan ni en la cantidad ni en el precio; con todas fuera, cero", () => {
    const look: Look = { ...LOOK_VACIO, arriba: pieza(TOP), abajo: pieza(JEAN, "AZD") };
    expect(totales(look, INDICE, new Set([TOP.id]))).toEqual({ cuantas: 1, final: 40, lista: 50, desde: true });
    expect(totales(look, INDICE, new Set([TOP.id, JEAN.id]))).toEqual({ cuantas: 0, final: 0, lista: 0, desde: false });
    // Una prenda que ya no está en el look no cambia nada.
    expect(totales(look, INDICE, new Set(["otra"]))).toEqual(totales(look, INDICE));
  });
  it("«Algo encima» dice qué hay en esa zona", () => {
    expect(ayudaDeZona(TODAS, "encima")).toBe("blazers o chalecos");
    expect(ayudaDeZona(TODAS, "bolso")).toBe("bolsos y carteras");
    expect(ayudaDeZona([...TODAS, prenda(11, "encima", [color({ codigo: "X" })], { categoria: "Casacas" }), prenda(12, "encima", [color({ codigo: "X" })], { categoria: "Capas" })], "encima")).toBe(
      "blazers, chalecos o casacas",
    );
    expect(ayudaDeZona(TODAS, "vestido")).toBeNull();
  });
});

describe("tallas y a la bolsa", () => {
  const look: Look = { ...LOOK_VACIO, arriba: pieza(TOP, "NEG"), abajo: pieza(JEAN, "AZD"), bolso: pieza(CARTERA) };
  it("lo que se pide: de 1 a 4 prendas, cada una su modelo y su color; lo demás, nada", () => {
    expect(piezasDelLook(look)).toEqual([
      { id: TOP.id, color: "NEG" },
      { id: JEAN.id, color: "AZD" },
      { id: CARTERA.id, color: "NEG" },
    ]);
    expect(piezasParaLasTallas([{ id: TOP.id, color: "neg" }])).toEqual([{ id: TOP.id, color: "NEG" }]);
    for (const malo of [[], [{ id: "x", color: "NEG" }], [{ id: TOP.id, color: "N E G" }], Array.from({ length: 5 }, () => ({ id: TOP.id, color: "NEG" })), "x", null]) {
      expect(piezasParaLasTallas(malo), JSON.stringify(malo)).toBeNull();
    }
  });
  it("lo que no se lleva no se pide ni va a la hoja, y la hoja numera de nuevo lo que sí", () => {
    const sin = new Set([JEAN.id]);
    expect(piezasDelLook(look, sin)).toEqual([
      { id: TOP.id, color: "NEG" },
      { id: CARTERA.id, color: "NEG" },
    ]);
    const hoja = lookParaLaHoja(look, INDICE, [{ id: TOP.id, color: "NEG", tallas: [] }, { id: CARTERA.id, color: "NEG", tallas: [] }], sin);
    expect(hoja.piezas.map((p) => [p.posicion, p.prenda.nombre])).toEqual([
      [1, "Prenda 1"],
      [2, "Prenda 9"],
    ]);
    expect(hoja).toMatchObject({ total: 100, totalFinal: 100 });
  });
  it("el botón dice cuántas prendas se agregan, no «todo»; sin ninguna que llevar se apaga y dice qué hacer", () => {
    expect(textoAgregarAlLook(3)).toEqual({ texto: "Agregar 3 prendas a mi bolsa", apagado: false });
    expect(textoAgregarAlLook(2).texto).toBe("Agregar 2 prendas a mi bolsa");
    expect(textoAgregarAlLook(1).texto).toBe("Agregar 1 prenda a mi bolsa");
    expect(textoAgregarAlLook(0)).toEqual({ texto: "Elige qué llevar", apagado: true });
  });
  it("la hoja de los looks recibe cada prenda en su color, con su recorte, lo que vale ese color y sus tallas", () => {
    const hoja = lookParaLaHoja(look, INDICE, [
      { id: TOP.id, color: "NEG", tallas: [{ varianteId: id(91), talla: "M", hay: true }] },
      { id: JEAN.id, color: "AZD", tallas: [{ varianteId: id(92), talla: "28", hay: false }] },
    ]);
    expect(hoja.piezas.map((p) => [p.posicion, p.prenda.nombre, p.color.codigo, p.foto, p.prenda.precioFinal, p.tallas.length])).toEqual([
      [1, "Prenda 1", "NEG", URL_FOTO("RPA"), 50, 1],
      [2, "Prenda 5", "AZD", URL_FOTO("AZD"), 40, 1],
      [3, "Prenda 9", "NEG", URL_FOTO("NEG"), 50, 0],
    ]);
    expect(hoja).toMatchObject({ nombre: "Una talla por prenda", total: 150, totalFinal: 140, desde: true });
  });
});

describe("el look en la dirección (`?p=`)", () => {
  const look: Look = { ...LOOK_VACIO, arriba: pieza(TOP, "NEG"), abajo: pieza(PANTALON), bolso: pieza(CARTERA) };
  it("cada prenda por su código y su color, en el orden de las zonas, y vuelve igual", () => {
    expect(codificarLook(look, INDICE)).toBe("P-1.NEG~P-4.CAM~P-9.NEG");
    expect(lookDeLaUrl("P-1.NEG~P-4.CAM~P-9.NEG", TODAS)).toEqual(look);
    // Sin código, va su id.
    const sinCodigo = prenda(20, "encima", [color({ codigo: "X" })], { codigo: null });
    expect(codificarLook({ ...LOOK_VACIO, encima: pieza(sinCodigo) }, indizar([sinCodigo]))).toBe(`${sinCodigo.id}.X`);
  });
  it("sin importar mayúsculas; lo que ya no está se salta; un color que ya no tiene, el inicial", () => {
    expect(lookDeLaUrl("p-1.neg~NADA.XX~P-4.ZZZ", TODAS)).toEqual({ ...LOOK_VACIO, arriba: pieza(TOP, "NEG"), abajo: pieza(PANTALON) });
  });
  it("con las reglas de poner: un vestido saca lo de arriba y abajo", () => {
    expect(presentes(lookDeLaUrl("P-1.RPA~P-4.CAM~P-6.ROS", TODAS)!)).toEqual(["vestido"]);
  });
  it("la dirección del probador lleva la tienda y el look", () => {
    expect(hrefDelProbador(null)).toBe("/looks/arma");
    expect(hrefDelProbador("trujillo", "P-1.NEG~P-4.CAM")).toBe("/looks/arma?sede=trujillo&p=P-1.NEG~P-4.CAM");
    expect(busquedaConLook("?sede=lima&p=VIEJO.X", "P-9.NEG")).toBe("?sede=lima&p=P-9.NEG");
    expect(busquedaConLook("?p=VIEJO.X", null)).toBe("");
    expect(new URLSearchParams(busquedaConLook("", "A B.X~C")).get("p")).toBe("A B.X~C");
    expect(lookDeLaUrl(new URLSearchParams(hrefDelProbador(null, "P-2.GRI").split("?")[1]).get("p") ?? undefined, TODAS)).toEqual({ ...LOOK_VACIO, arriba: pieza(CAMISA) });
  });
  it("vacía, rara o sin nada que siga en el probador: null (abre con el look inicial)", () => {
    expect(lookDeLaUrl(undefined, TODAS)).toBeNull();
    expect(lookDeLaUrl("   ", TODAS)).toBeNull();
    expect(lookDeLaUrl("NADA.X~OTRA", TODAS)).toBeNull();
    expect(lookDeLaUrl(["P-2.GRI", "P-4.CAM"], TODAS)).toEqual({ ...LOOK_VACIO, arriba: pieza(CAMISA) });
  });
});

describe("la figura: a escala desde los hombros o la cintura", () => {
  it("el largo a 2,5 px por cm y el ancho por la proporción del recorte, desde su línea", () => {
    expect(cajaDe("arriba", 47, 1.233)).toEqual({ x: 123, y: 44, w: 145, h: 118 });
    expect(cajaDe("abajo", 100, 0.509)).toEqual({ x: 132, y: 152, w: 127, h: 250 });
    expect(cajaDe("vestido", 135, 0.33).y).toBe(46);
    expect(cajaDe("encima", 50, 0.789).y).toBe(40);
    expect(cajaDe("bolso", 39, 0.977)).toEqual({ x: 229, y: 178, w: 96, h: 98 });
  });
  it("lo que no cabe achica toda la figura igual; lo que cabe, no", () => {
    const pantalon = cajaDe("abajo", 110, 0.45);
    expect(escalaDe([cajaDe("arriba", 45, 1), cajaDe("abajo", 100, 0.5)])).toBe(1);
    const k = escalaDe([pantalon]);
    expect(k).toBeCloseTo(412 / (152 + 275), 5);
    const chico = achicar(pantalon, k);
    expect(chico.y + chico.h).toBeLessThanOrEqual(412);
    expect(chico.x + chico.w / 2).toBeCloseTo(195, 0);
  });
  it("la que asoma va al 62 % y a 172 px del centro; el punto, en su esquina", () => {
    expect(cajaVecina({ x: 131, y: 152, w: 127, h: 250 }, 1)).toEqual({ x: 328, y: 200, w: 79, h: 155 });
    expect(puntoDe("abajo", { x: 131, y: 152, w: 127, h: 250 })).toEqual({ x: 139, y: 257 });
    expect(puntoDe("arriba", { x: 123, y: 44, w: 145, h: 118 })).toEqual({ x: 254, y: 58 });
  });
});
