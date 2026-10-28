import { describe, expect, it } from "vitest";
import {
  ALTO_NOMBRE_MM,
  ANCHO_NOMBRE_MM,
  anchoEm,
  armarRotulos,
  copiasDeTexto,
  INTERLINEA_NOMBRE,
  MAX_COPIAS,
  MAX_MODELOS_EN_URL,
  MAX_NOMBRE_MM,
  medidaNombre,
  origenDeParam,
  papelDeTiraCm,
  quienesSalen,
  recorridoDeImpresion,
  textoVarios,
  tiraConSalientes,
  urlRotulos,
  volverDeRotulos,
  type ModeloRotulo,
} from "./rotulos-reglas";

const ID_A = "00000000-0000-4000-8000-00000000000a";
const ID_B = "00000000-0000-4000-8000-00000000000b";

const modelo = (m: Partial<ModeloRotulo> & { productoId: string; referencia: string }): ModeloRotulo => ({
  marca: null,
  tallas: [],
  ...m,
});

const valeria = modelo({ productoId: ID_A, referencia: "Chaleco Valeria", marca: "Mias", tallas: ["L", "S", "M"] });
const mia = modelo({ productoId: ID_B, referencia: "Chaleco Mia", marca: "Mias", tallas: ["XL", "M"] });

describe("armarRotulos", () => {
  it("uno por modelo, en el orden elegido", () => {
    const r = armarRotulos([valeria, mia], false);
    expect(r.map((x) => x.modelos)).toEqual([["Chaleco Valeria"], ["Chaleco Mia"]]);
    expect(r[0]).toMatchObject({ marcas: ["Mias"], tallas: ["S", "M", "L"] });
  });
  it("juntos: un rótulo, con marcas y tallas sin repetir (el «CHALECO VALERIA MIA» a mano)", () => {
    const [r, ...resto] = armarRotulos([valeria, mia], true);
    expect(resto).toEqual([]);
    expect(r).toEqual({
      clave: `${ID_A}+${ID_B}`,
      modelos: ["Chaleco Valeria", "Chaleco Mia"],
      marcas: ["Mias"],
      tallas: ["S", "M", "L", "XL"],
    });
  });
  it("un solo modelo con «juntar» es igual que sin juntar; sin modelos, nada", () => {
    expect(armarRotulos([valeria], true)).toEqual(armarRotulos([valeria], false));
    expect(armarRotulos([], true)).toEqual([]);
  });
  it("una marca repetida con otra mayúscula o espacios cuenta una vez; distintas, las dos; sin marca, no se inventa", () => {
    expect(armarRotulos([valeria, modelo({ productoId: ID_B, referencia: "Mia", marca: " mias " })], true)[0].marcas).toEqual(["Mias"]);
    expect(armarRotulos([valeria, modelo({ productoId: ID_B, referencia: "Mia", marca: "Zara" })], true)[0].marcas).toEqual(["Mias", "Zara"]);
    expect(armarRotulos([modelo({ productoId: ID_A, referencia: "Mia" })], false)[0]).toMatchObject({ marcas: [] });
  });
});

// Lo que hace el navegador con el nombre a `mm`: cortar por palabras en una caja de ANCHO_NOMBRE_MM. Las líneas que salen.
function lineasEnCaja(nombres: string[], mm: number): string[] {
  const palabras = nombres.flatMap((n, i) => {
    const p = n.split(/\s+/);
    if (i < nombres.length - 1) p[p.length - 1] += " ·";
    return p;
  });
  const lineas: string[] = [];
  for (const p of palabras) {
    const ultima = lineas[lineas.length - 1];
    if (ultima !== undefined && anchoEm(`${ultima} ${p}`) * mm <= ANCHO_NOMBRE_MM) lineas[lineas.length - 1] = `${ultima} ${p}`;
    else lineas.push(p);
  }
  return lineas;
}

const NOMBRES: string[][] = [
  ["Mia"],
  ["Body Bonita"],
  ["Camisa crop con amarres"],
  ["Vestido midi Sol"],
  ["Pantalón wide leg tiro alto"],
  ["Chaleco Valeria", "Chaleco Mia"],
  ["Blazer Demo Franja", "Blusa Aurora"],
  ["Valeria", "Mia", "Ximena", "Aurora"],
  ["Casaca Wanda", "Maxi Walk Woman", "Mom jeans"],
  ["Supercalifragilisticoespialidoso"],
];

describe("medidaNombre (el nombre lo más grande que entra en 62 × 40,1)", () => {
  it.each(NOMBRES)("«%s…» nunca se sale: ni a lo ancho ni a lo alto", (...nombres) => {
    const { mm, lineas } = medidaNombre(nombres);
    const salen = lineasEnCaja(nombres, mm);
    expect(salen.length).toBe(lineas);
    for (const l of salen) expect(anchoEm(l) * mm).toBeLessThanOrEqual(ANCHO_NOMBRE_MM);
    expect(lineas * mm * INTERLINEA_NOMBRE).toBeLessThanOrEqual(ALTO_NOMBRE_MM);
  });
  it("una palabra corta no pasa del tope", () => {
    expect(medidaNombre(["Mia"])).toEqual({ mm: MAX_NOMBRE_MM, lineas: 1 });
  });
  it("«Camisa crop con amarres» (que se cortaba en la tienda) entra entera y se lee: 6 mm o más", () => {
    const { mm, lineas } = medidaNombre(["Camisa crop con amarres"]);
    expect(lineas).toBeGreaterThan(1);
    expect(mm).toBeGreaterThanOrEqual(6);
  });
  it("un nombre más largo nunca sale más grande", () => {
    expect(medidaNombre(["Body Bonita"]).mm).toBeGreaterThanOrEqual(medidaNombre(["Camisa crop con amarres"]).mm);
    expect(medidaNombre(["Chaleco Valeria"]).mm).toBeGreaterThanOrEqual(medidaNombre(["Chaleco Valeria", "Chaleco Mia"]).mm);
  });
  it("cuatro modelos juntos siguen legibles (4 mm o más)", () => {
    expect(medidaNombre(["Valeria", "Mia", "Ximena", "Aurora"]).mm).toBeGreaterThanOrEqual(4);
  });
  it("las tildes miden como su letra, y la Ñ como la N", () => {
    expect(anchoEm("PANTALÓN")).toBeCloseTo(anchoEm("PANTALON"));
    expect(anchoEm("Ñ")).toBeCloseTo(anchoEm("N"));
  });
});

describe("textoVarios", () => {
  it("uno tal cual, varios con «/», ninguno: no sale la línea", () => {
    expect(textoVarios(["CAYLA"])).toBe("CAYLA");
    expect(textoVarios(["CAYLA", "Zara"])).toBe("CAYLA / Zara");
    expect(textoVarios([])).toBeNull();
  });
});

describe("copiasDeTexto", () => {
  it("entero entre 0 y el tope", () => {
    expect(copiasDeTexto("2")).toBe(2);
    expect(copiasDeTexto("2.7")).toBe(2);
    expect(copiasDeTexto("-1")).toBe(0);
    expect(copiasDeTexto("")).toBe(0);
    expect(copiasDeTexto("abc")).toBe(0);
    expect(copiasDeTexto("999")).toBe(MAX_COPIAS);
  });
});

describe("enlaces de ida y vuelta", () => {
  it("desde Existencias o Almacén lleva su origen; desde Productos, la vista exacta", () => {
    expect(urlRotulos([ID_A, ID_A, ID_B], { desde: "existencias" })).toBe(`/rotulos?productos=${ID_A},${ID_B}&origen=existencias`);
    expect(urlRotulos([], { desde: "almacen" })).toBe("/rotulos?origen=almacen");
    expect(urlRotulos([ID_A], { productos: "/productos?vista=tabla" })).toBe(`/rotulos?productos=${ID_A}&desde=${encodeURIComponent("/productos?vista=tabla")}`);
    // Un `desde` que no es de Productos no viaja (nadie arma una vuelta a otro sitio).
    expect(urlRotulos([ID_A], { productos: "https://otro.example" })).toBe(`/rotulos?productos=${ID_A}`);
  });
  it("demasiados para una URL: no hay enlace", () => {
    const ids = Array.from({ length: MAX_MODELOS_EN_URL + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(urlRotulos(ids, { desde: "existencias" })).toBeNull();
  });
  it("«Volver» va a donde se salió", () => {
    expect(volverDeRotulos(origenDeParam(undefined, "/productos?vista=grilla"), "/productos?vista=grilla")).toEqual({ href: "/productos?vista=grilla", a: "Productos" });
    expect(volverDeRotulos(origenDeParam("existencias", null), null)).toEqual({ href: "/inventario", a: "Existencias" });
    expect(volverDeRotulos(origenDeParam("almacen", null), null)).toEqual({ href: "/", a: "Inicio" });
    expect(volverDeRotulos(origenDeParam("cualquiera", null), null)).toEqual({ href: "/", a: "Inicio" });
  });
});

describe("la tira de la Brother", () => {
  it("papelDeTiraCm: 40,1 mm por rótulo, en cm con un decimal", () => {
    expect(papelDeTiraCm(0)).toBe(0);
    expect(papelDeTiraCm(1)).toBe(4);
    expect(papelDeTiraCm(5)).toBe(20.1);
    expect(papelDeTiraCm(20)).toBe(80.2);
    expect(papelDeTiraCm(-3)).toBe(0);
  });

  it("recorridoDeImpresion: ronda el segundo con pocos o con muchos, y nada si no sale ninguno", () => {
    expect(recorridoDeImpresion(0)).toEqual({ porRotulo: 0, total: 0 });
    expect(recorridoDeImpresion(1)).toEqual({ porRotulo: 320, total: 440 });
    for (const n of [1, 2, 3, 5, 8, 13, 20, 40, 100]) {
      const { porRotulo, total } = recorridoDeImpresion(n);
      expect(porRotulo).toBeGreaterThanOrEqual(40);
      expect(porRotulo).toBeLessThanOrEqual(320);
      expect(total).toBeLessThanOrEqual(n <= 25 ? 1_150 : 4_200);
    }
  });

  const r = (clave: string) => ({ clave });
  const clave = (x: { clave: string }) => x.clave;

  it("quienesSalen: los que ya no están, con su lugar de antes", () => {
    expect(quienesSalen([r("a"), r("b"), r("c")], [r("a"), r("c")], clave)).toEqual([{ item: r("b"), lugar: 1 }]);
    expect(quienesSalen([r("a"), r("b")], [r("a"), r("b"), r("c")], clave)).toEqual([]);
    expect(quienesSalen([r("a"), r("b")], [], clave).map((s) => s.lugar)).toEqual([0, 1]);
  });

  it("tiraConSalientes: el que sale se dibuja en su lugar, y el orden de los que quedan no cambia", () => {
    const antes = [r("a"), r("b"), r("c"), r("d")];
    const ahora = [r("a"), r("d")];
    const tira = tiraConSalientes(ahora, quienesSalen(antes, ahora, clave));
    expect(tira.map((t) => `${t.item.clave}${t.sale ? "-" : ""}`)).toEqual(["a", "b-", "c-", "d"]);
    // «Quitar todas»: la tira entera sale, en su orden.
    expect(tiraConSalientes([], quienesSalen(antes, [], clave)).map((t) => t.item.clave)).toEqual(["a", "b", "c", "d"]);
    // Juntar: los sueltos se van desde arriba (en su lugar) y el junto sube a ocupar la tira mientras se pliegan.
    const junto = [r("a+b")];
    expect(tiraConSalientes(junto, quienesSalen([r("a"), r("b")], junto, clave)).map((t) => `${t.item.clave}${t.sale ? "-" : ""}`)).toEqual(["a-", "b-", "a+b"]);
  });
});
