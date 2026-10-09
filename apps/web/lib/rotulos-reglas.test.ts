import { describe, expect, it } from "vitest";
import {
  armarRotulos,
  copiasDeTexto,
  MAX_COLORES,
  MAX_COPIAS,
  MAX_MODELOS_EN_URL,
  nombreSinCategoria,
  origenDeParam,
  tamanoNombre,
  textoColores,
  urlRotulos,
  volverDeRotulos,
  type ModeloRotulo,
} from "./rotulos-reglas";

const ID_A = "00000000-0000-4000-8000-00000000000a";
const ID_B = "00000000-0000-4000-8000-00000000000b";

const modelo = (m: Partial<ModeloRotulo> & { productoId: string; referencia: string }): ModeloRotulo => ({
  codigo: null,
  categoria: "Chalecos",
  colores: [],
  tallas: [],
  ...m,
});

const valeria = modelo({ productoId: ID_A, referencia: "Chaleco Valeria", codigo: "CHL-0001", colores: ["Beige", "Marrón"], tallas: ["L", "S", "M"] });
const mia = modelo({ productoId: ID_B, referencia: "Chaleco Mia", codigo: "CHL-0002", colores: ["Marrón", "Negro"], tallas: ["XL", "M"] });

describe("armarRotulos", () => {
  it("uno por modelo, en el orden elegido", () => {
    const r = armarRotulos([valeria, mia], false);
    expect(r.map((x) => x.modelos)).toEqual([["Chaleco Valeria"], ["Chaleco Mia"]]);
    expect(r[0]).toMatchObject({ titulo: "Chalecos", colores: ["Beige", "Marrón"], tallas: ["S", "M", "L"], codigos: ["CHL-0001"] });
  });
  it("juntos: un rótulo, con colores y tallas sin repetir y la categoría compartida (el «CHALECO VALERIA MIA» a mano)", () => {
    const [r, ...resto] = armarRotulos([valeria, mia], true);
    expect(resto).toEqual([]);
    expect(r).toMatchObject({
      titulo: "Chalecos",
      modelos: ["Chaleco Valeria", "Chaleco Mia"],
      colores: ["Beige", "Marrón", "Negro"],
      tallas: ["S", "M", "L", "XL"],
      codigos: ["CHL-0001", "CHL-0002"],
    });
    expect(r.clave).toBe(`${ID_A}+${ID_B}`);
  });
  it("categorías distintas: sin título (ninguno sería verdad para los dos)", () => {
    const blusa = modelo({ productoId: ID_B, referencia: "Blusa Aurora", categoria: "Blusas" });
    expect(armarRotulos([valeria, blusa], true)[0].titulo).toBeNull();
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

describe("nombreSinCategoria", () => {
  it("quita la categoría del principio, en singular o plural y sin tildes", () => {
    expect(nombreSinCategoria("Chaleco Valeria", "Chalecos")).toBe("Valeria");
    expect(nombreSinCategoria("Pantalón Mia", "Pantalones")).toBe("Mia");
    expect(nombreSinCategoria("Blusas Aurora", "Blusas")).toBe("Aurora");
  });
  it("no deja el nombre vacío ni toca otro nombre", () => {
    expect(nombreSinCategoria("Chaleco", "Chalecos")).toBe("Chaleco");
    expect(nombreSinCategoria("Valeria", "Chalecos")).toBe("Valeria");
    expect(nombreSinCategoria("Chaleco Valeria", null)).toBe("Chaleco Valeria");
  });
});

describe("tamanoNombre", () => {
  it("baja de tamaño a medida que crece lo que se escribe", () => {
    expect(tamanoNombre(["Valeria"])).toBe("xl");
    expect(tamanoNombre(["Valeria", "Mia"])).toBe("l");
    expect(tamanoNombre(["Valeria", "Mia", "Ximena"])).toBe("m");
    expect(tamanoNombre(["Valeria", "Mia", "Ximena", "Aurora"])).toBe("s");
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
