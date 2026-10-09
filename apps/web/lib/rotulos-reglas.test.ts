import { describe, expect, it } from "vitest";
import {
  ALTO_NOMBRE_MM,
  ANCHO_NOMBRE_MM,
  anchoEm,
  armarRotulos,
  copiasDeTexto,
  INTERLINEA_NOMBRE,
  MAX_COLORES,
  MAX_COPIAS,
  MAX_MODELOS_EN_URL,
  MAX_NOMBRE_MM,
  medidaNombre,
  origenDeParam,
  textoColores,
  urlRotulos,
  volverDeRotulos,
  type ModeloRotulo,
} from "./rotulos-reglas";

const ID_A = "00000000-0000-4000-8000-00000000000a";
const ID_B = "00000000-0000-4000-8000-00000000000b";

const modelo = (m: Partial<ModeloRotulo> & { productoId: string; referencia: string }): ModeloRotulo => ({
  colores: [],
  tallas: [],
  ...m,
});

const valeria = modelo({ productoId: ID_A, referencia: "Chaleco Valeria", colores: ["Beige", "Marrón"], tallas: ["L", "S", "M"] });
const mia = modelo({ productoId: ID_B, referencia: "Chaleco Mia", colores: ["Marrón", "Negro"], tallas: ["XL", "M"] });

describe("armarRotulos", () => {
  it("uno por modelo, en el orden elegido", () => {
    const r = armarRotulos([valeria, mia], false);
    expect(r.map((x) => x.modelos)).toEqual([["Chaleco Valeria"], ["Chaleco Mia"]]);
    expect(r[0]).toMatchObject({ colores: ["Beige", "Marrón"], tallas: ["S", "M", "L"] });
  });
  it("juntos: un rótulo, con colores y tallas sin repetir (el «CHALECO VALERIA MIA» a mano)", () => {
    const [r, ...resto] = armarRotulos([valeria, mia], true);
    expect(resto).toEqual([]);
    expect(r).toEqual({
      clave: `${ID_A}+${ID_B}`,
      modelos: ["Chaleco Valeria", "Chaleco Mia"],
      colores: ["Beige", "Marrón", "Negro"],
      tallas: ["S", "M", "L", "XL"],
    });
  });
  it("un solo modelo con «juntar» es igual que sin juntar; sin modelos, nada", () => {
    expect(armarRotulos([valeria], true)).toEqual(armarRotulos([valeria], false));
    expect(armarRotulos([], true)).toEqual([]);
  });
  it("colores repetidos con otra mayúscula o espacios cuentan una vez", () => {
    const otro = modelo({ productoId: ID_B, referencia: "Mia", colores: [" beige ", "Negro"] });
    expect(armarRotulos([valeria, otro], true)[0].colores).toEqual(["Beige", "Marrón", "Negro"]);
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

describe("textoColores", () => {
  it(`hasta ${MAX_COLORES} se nombran; los demás, «y N más»`, () => {
    expect(textoColores(["Beige", "Negro"])).toBe("Beige · Negro");
    const muchos = Array.from({ length: MAX_COLORES + 3 }, (_, i) => `C${i}`);
    expect(textoColores(muchos)).toMatch(/ y 3 más$/);
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
