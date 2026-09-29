import { describe, expect, it } from "vitest";
import {
  cambioVisible,
  colorDeCampo,
  etiquetaCampo,
  nombresPorBuscar,
  textoValorCambio,
  type NombresHistorial,
} from "./historial-producto-reglas";

const NOMBRES: NombresHistorial = {
  temporadas: new Map([
    ["verano", "Verano"],
    ["invierno", "Invierno"],
  ]),
  colores: new Map([["MAR", "Marfil"]]),
  tallas: new Map([["t-s", "S"]]),
  marcas: new Map([["m-1", "Cayla"]]),
  proveedores: new Map([["p-1", "Textiles Norte"]]),
};

describe("etiquetaCampo — cada campo del historial con su nombre", () => {
  it("los de siempre", () => {
    expect(etiquetaCampo("precio")).toBe("Precio");
    expect(etiquetaCampo("categoria_id")).toBe("Categoría");
    expect(etiquetaCampo("estado")).toBe("Estado");
  });
  it("los que el panel no conocía: marca, proveedor, costo y temporada (ADR-0246)", () => {
    expect(etiquetaCampo("marca_id")).toBe("Marca");
    expect(etiquetaCampo("proveedor_id")).toBe("Proveedor");
    expect(etiquetaCampo("costo")).toBe("Costo");
    expect(etiquetaCampo("temporada")).toBe("Temporada");
  });
  it("la excepción de un color lleva el nombre del color (o su código si no se pudo leer)", () => {
    expect(etiquetaCampo("temporada:MAR", NOMBRES)).toBe("Temporada · Marfil");
    expect(etiquetaCampo("temporada:NEG", NOMBRES)).toBe("Temporada · NEG");
  });
  it("un campo desconocido sale con su nombre, no vacío", () => {
    expect(etiquetaCampo("algo_nuevo")).toBe("algo_nuevo");
  });
});

describe("textoValorCambio — nunca «S/NaN»", () => {
  it("la temporada de la prenda: su nombre; vacía = sin temporada propia", () => {
    expect(textoValorCambio("temporada", null, null, NOMBRES)).toBe("Sin temporada propia");
    expect(textoValorCambio("temporada", "verano", null, NOMBRES)).toBe("Verano");
  });
  it("la de un color: su nombre; vacía = igual que su prenda", () => {
    expect(textoValorCambio("temporada:MAR", "invierno", null, NOMBRES)).toBe("Invierno");
    expect(textoValorCambio("temporada:MAR", null, null, NOMBRES)).toBe("Igual que su prenda");
  });
  it("sin la lista (lectura caída), la clave tal cual", () => {
    expect(textoValorCambio("temporada", "otono_invierno", null)).toBe("otono_invierno");
  });
  it("precio y costo en soles; categoría por su nombre; estado en palabras", () => {
    expect(textoValorCambio("precio", "59.9", null)).toBe("S/59.90");
    expect(textoValorCambio("costo", null, null)).toBe("—");
    expect(textoValorCambio("categoria_id", "uuid", "Blusas")).toBe("Blusas");
    expect(textoValorCambio("categoria_id", null, null)).toBe("Sin categoría");
    expect(textoValorCambio("estado", "descontinuado", null)).toBe("Descontinuado");
  });
  it("marca y proveedor por su nombre, no por el uuid", () => {
    expect(textoValorCambio("marca_id", "m-1", null, NOMBRES)).toBe("Cayla");
    expect(textoValorCambio("marca_id", null, null, NOMBRES)).toBe("Sin marca");
    expect(textoValorCambio("proveedor_id", "p-9", null, NOMBRES)).toBe("Un proveedor que ya no está");
  });
  it("un campo desconocido muestra su valor tal cual, no como dinero", () => {
    expect(textoValorCambio("algo_nuevo", "texto", null)).toBe("texto");
    expect(textoValorCambio("algo_nuevo", null, null)).toBe("—");
  });
});

describe("cambioVisible — el historial no es otra puerta para ver el costo", () => {
  it("el costo solo a quien ve el dinero de compras; lo demás, a todos", () => {
    expect(cambioVisible("costo", false)).toBe(false);
    expect(cambioVisible("costo", true)).toBe(true);
    expect(cambioVisible("temporada:MAR", false)).toBe(true);
    expect(cambioVisible("precio", false)).toBe(true);
  });
});

describe("nombresPorBuscar — solo se consulta lo que hace falta", () => {
  it("junta temporadas, colores, marcas y proveedores de las filas", () => {
    const falta = nombresPorBuscar([
      { campo: "temporada:MAR", valor_anterior: null, valor_nuevo: "invierno" },
      { campo: "marca_id", valor_anterior: "m-1", valor_nuevo: "m-2" },
      { campo: "proveedor_id", valor_anterior: null, valor_nuevo: "p-1" },
      { campo: "precio", valor_anterior: "10", valor_nuevo: "12" },
    ]);
    expect(falta).toEqual({ temporadas: true, colores: ["MAR"], tallas: [], marcas: ["m-1", "m-2"], proveedores: ["p-1"] });
  });
  it("sin filas de temporada, no se lee la lista", () => {
    expect(nombresPorBuscar([{ campo: "precio", valor_anterior: "1", valor_nuevo: "2" }]).temporadas).toBe(false);
  });
  it("colorDeCampo solo reconoce el prefijo de la temporada por color", () => {
    expect(colorDeCampo("temporada:NEG")).toBe("NEG");
    expect(colorDeCampo("temporada")).toBeNull();
    expect(colorDeCampo("temporada:")).toBeNull();
  });
});

// ADR-0263: corregir el color o la talla de una variante, y activarla o desactivarla, deja rastro con quién lo hizo.
describe("los campos de una variante corregida (ADR-0263)", () => {
  it("color, talla, código y estado, con su nombre", () => {
    expect(etiquetaCampo("color")).toBe("Color");
    expect(etiquetaCampo("talla")).toBe("Talla");
    expect(etiquetaCampo("codigo")).toBe("Código");
    expect(etiquetaCampo("activo")).toBe("Estado");
  });
  it("el color por su nombre (vacío = «Sin color»); la talla tal cual (vacía = «Sin talla»)", () => {
    expect(textoValorCambio("color", null, null, NOMBRES)).toBe("Sin color");
    expect(textoValorCambio("color", "MAR", null, NOMBRES)).toBe("Marfil");
    expect(textoValorCambio("color", "NEG", null, NOMBRES)).toBe("NEG");
    expect(textoValorCambio("talla", "S", null)).toBe("S");
    expect(textoValorCambio("talla", null, null)).toBe("Sin talla");
  });
  it("activa o desactivada en palabras; el código tal cual", () => {
    expect(textoValorCambio("activo", "true", null)).toBe("Activa");
    expect(textoValorCambio("activo", "false", null)).toBe("Desactivada");
    expect(textoValorCambio("codigo", "BOD-0003-NEG-S", null)).toBe("BOD-0003-NEG-S");
  });
  it("se buscan los nombres de los dos colores de una corrección", () => {
    const falta = nombresPorBuscar([{ campo: "color", valor_anterior: null, valor_nuevo: "NEG" }, { campo: "color", valor_anterior: "NEG", valor_nuevo: "AZU" }]);
    expect(falta.colores).toEqual(["NEG", "AZU"]);
    expect(falta.temporadas).toBe(false);
  });
});

// ADR-0258 (pegada en producción antes que ADR-0263) anotaba la corrección como `color_codigo` y `talla_id` (el uuid). Esas
// filas ya existen: se dicen igual que las de ahora, sin mostrar nunca un uuid.
describe("los campos de ADR-0258 que ya están en el historial", () => {
  it("color_codigo es «Color», con su nombre", () => {
    expect(etiquetaCampo("color_codigo")).toBe("Color");
    expect(textoValorCambio("color_codigo", "MAR", null, NOMBRES)).toBe("Marfil");
    expect(textoValorCambio("color_codigo", null, null, NOMBRES)).toBe("Sin color");
  });
  it("talla_id es «Talla», con su valor buscado; sin leerlo, se dice sin el uuid", () => {
    expect(etiquetaCampo("talla_id")).toBe("Talla");
    expect(textoValorCambio("talla_id", "t-s", null, NOMBRES)).toBe("S");
    expect(textoValorCambio("talla_id", null, null, NOMBRES)).toBe("Sin talla");
    expect(textoValorCambio("talla_id", "3f2b0c1e-0000-4000-8000-000000000000", null, NOMBRES)).toBe("Una talla que no se pudo leer");
  });
  it("se buscan los dos colores y las dos tallas (por id) de una corrección de ADR-0258", () => {
    const falta = nombresPorBuscar([
      { campo: "color_codigo", valor_anterior: null, valor_nuevo: "NEG" },
      { campo: "talla_id", valor_anterior: "t-s", valor_nuevo: "t-m" },
    ]);
    expect(falta.colores).toEqual(["NEG"]);
    expect(falta.tallas).toEqual(["t-s", "t-m"]);
  });
});
