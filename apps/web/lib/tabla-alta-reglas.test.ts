import { describe, expect, it } from "vitest";
import { claveCelda, construirCeldas } from "./alta-producto";
import {
  celdaSinPrecio,
  costoDistinto,
  leyendaVariantes,
  limpiarPrecio,
  llenarTodas,
  montoDeCelda,
  nombreCelda,
  pasoCantidad,
  precioDistinto,
  precioPropioInvalido,
  textoCostoBase,
  textoFotosDeFila,
  textoPrecioBase,
  totalesCantidades,
  vaciarTodas,
} from "./tabla-alta-reglas";

// Peor caso real (README del spike): 9 tallas × 8 colores = 72 celdas.
const TALLAS = ["26", "28", "30", "32", "34", "36", "38", "40", "42"];
const COLORES = ["NEG", "AZU", "CEL", "BLA", "GRI", "BEI", "VER", "TER"];

describe("totalesCantidades", () => {
  const celdas = construirCeldas(["S", "M"], ["NEG", "BLA"]);

  it("suma por color, por talla y en general", () => {
    const t = totalesCantidades(celdas, new Set(), { [claveCelda("S", "NEG")]: "2", [claveCelda("M", "NEG")]: "3", [claveCelda("M", "BLA")]: "1" });
    expect(t.porFila).toEqual({ NEG: 5, BLA: 1 });
    expect(t.porColumna).toEqual({ S: 2, M: 4 });
    expect(t.total).toBe(6);
  });

  it("una celda quitada no suma aunque tenga algo escrito", () => {
    const fuera = new Set([claveCelda("M", "NEG")]);
    const t = totalesCantidades(celdas, fuera, { [claveCelda("S", "NEG")]: "2", [claveCelda("M", "NEG")]: "9" });
    expect(t.porFila.NEG).toBe(2);
    expect(t.total).toBe(2);
  });

  it("vacío o inválido cuenta 0; sin talla ni color la clave del eje es vacía", () => {
    const una = construirCeldas([], []);
    expect(totalesCantidades(una, new Set(), { [una[0].clave]: "4" })).toEqual({ porFila: { "": 4 }, porColumna: { "": 4 }, total: 4 });
    expect(totalesCantidades(celdas, new Set(), { [claveCelda("S", "NEG")]: "2.5" }).total).toBe(0);
  });
});

describe("llenarTodas", () => {
  const celdas = construirCeldas(TALLAS, COLORES);

  it("pone la cantidad en las 72 celdas menos las quitadas", () => {
    const fuera = new Set([claveCelda("42", "TER"), claveCelda("40", "TER"), claveCelda("42", "VER"), claveCelda("26", "NEG")]);
    const r = llenarTodas(celdas, fuera, "3");
    expect(r).toHaveLength(68);
    expect(r.every((x) => x.valor === "3")).toBe(true);
    expect(r.some((x) => fuera.has(x.clave))).toBe(false);
  });

  it("con la caja vacía o sin dígitos no toca nada", () => {
    expect(llenarTodas(celdas, new Set(), "")).toEqual([]);
    expect(llenarTodas(celdas, new Set(), "dos")).toEqual([]);
  });

  it("limpia lo escrito: «007» se llena como 7; 0 sí se aplica", () => {
    expect(llenarTodas(celdas, new Set(), "007")[0].valor).toBe("7");
    expect(llenarTodas(celdas, new Set(), "0")[0].valor).toBe("0");
    expect(llenarTodas(celdas, new Set(), "-2")[0].valor).toBe("2");
  });
});

describe("vaciarTodas", () => {
  const celdas = construirCeldas(TALLAS, COLORES);

  it("deja vacías las 72 celdas menos las quitadas", () => {
    const fuera = new Set([claveCelda("42", "TER"), claveCelda("26", "NEG")]);
    const r = vaciarTodas(celdas, fuera);
    expect(r).toHaveLength(70);
    expect(r.every((x) => x.valor === "")).toBe(true);
    expect(r.some((x) => fuera.has(x.clave))).toBe(false);
  });
});

describe("pasoCantidad", () => {
  it("suma y resta 1; vacío cuenta como 0", () => {
    expect(pasoCantidad("", 1)).toBe("1");
    expect(pasoCantidad("3", 1)).toBe("4");
    expect(pasoCantidad("3", -1)).toBe("2");
  });

  it("no baja de 0 (y 0 se guarda vacío, igual que tipeado a mano)", () => {
    expect(pasoCantidad("", -1)).toBe("");
    expect(pasoCantidad("0", -1)).toBe("");
    expect(pasoCantidad("1", -1)).toBe("");
  });

  it("no pasa de 9999", () => {
    expect(pasoCantidad("9999", 1)).toBe("9999");
  });
});

describe("leyendaVariantes", () => {
  it("el ejemplo es el último color en la última talla de ESTA prenda", () => {
    expect(leyendaVariantes(12, ["Negro", "Terracota"], ["S", "M", "L"])).toEqual({ cuantas: "12 variantes", deDonde: "cada talla en cada color", ejemplo: "Terracota en L" });
  });

  it("solo tallas, solo colores o nada", () => {
    expect(leyendaVariantes(3, [], ["S", "M", "L"])).toEqual({ cuantas: "3 variantes", deDonde: "una por talla", ejemplo: "la talla L" });
    expect(leyendaVariantes(2, ["Negro", "Blanco"], [])).toEqual({ cuantas: "2 variantes", deDonde: "una por color", ejemplo: "Blanco" });
    expect(leyendaVariantes(1, [], [])).toEqual({ cuantas: "1 variante", deDonde: "sin tallas ni colores", ejemplo: null });
  });

  it("con una sola celda no hay ejemplo que quitar", () => {
    expect(leyendaVariantes(1, ["Negro"], ["Única"]).ejemplo).toBeNull();
  });
});

describe("precios de la tabla", () => {
  it("un precio distinto es el que no es el de venta; vacío nunca", () => {
    expect(precioDistinto("99", "89.9")).toBe(true);
    expect(precioDistinto("89.90", "89.9")).toBe(false);
    expect(precioDistinto("", "89.9")).toBe(false);
    expect(precioDistinto(undefined, "89.9")).toBe(false);
    expect(precioDistinto("50", "")).toBe(true);
  });

  it("la caja de precio acepta coma, un solo punto y 2 decimales", () => {
    expect(limpiarPrecio("89,9")).toBe("89.9");
    expect(limpiarPrecio("1.2.3")).toBe("1.23");
    expect(limpiarPrecio("S/ 45.505")).toBe("45.50");
    expect(limpiarPrecio("abc")).toBe("");
  });

  it("vacía = S/ precio de venta", () => {
    expect(textoPrecioBase("89.9")).toBe("S/ 89.90");
    expect(textoPrecioBase("")).toBe("el precio de venta");
  });
});

describe("costos de la tabla", () => {
  it("un costo distinto es el que no es el de arriba; sin costo arriba, el de todas es 0", () => {
    expect(costoDistinto("1.80", "1.2")).toBe(true);
    expect(costoDistinto("1.20", "1.2")).toBe(false);
    expect(costoDistinto("", "1.2")).toBe(false);
    expect(costoDistinto(undefined, "1.2")).toBe(false);
    expect(costoDistinto("0.90", "")).toBe(true);
    expect(costoDistinto("0", "")).toBe(false);
    expect(costoDistinto(".", "1.2")).toBe(false);
  });

  it("vacía = S/ costo de arriba, o sin costo (es opcional)", () => {
    expect(textoCostoBase("1.2")).toBe("S/ 1.20");
    expect(textoCostoBase("")).toBe("sin costo");
    expect(textoCostoBase("0")).toBe("sin costo");
  });
});

describe("montoDeCelda", () => {
  it("lo escrito en la celda, o vacía, el de todas", () => {
    expect(montoDeCelda("2.5", 1.2)).toBe(2.5);
    expect(montoDeCelda("0", 1.2)).toBe(0);
    expect(montoDeCelda("", 1.2)).toBe(1.2);
    expect(montoDeCelda("  ", 1.2)).toBe(1.2);
    expect(montoDeCelda(undefined, 1.2)).toBe(1.2);
  });

  it("un texto que no es número no se vuelve el de todas: da NaN para que el formulario lo frene", () => {
    expect(montoDeCelda(".", 1.2)).toBeNaN();
  });
});

describe("textoFotosDeFila", () => {
  it("cuenta las suyas, o dice si usa la de todos los colores", () => {
    expect(textoFotosDeFila(0, false)).toBe("agrega su foto");
    expect(textoFotosDeFila(0, true)).toBe("usa la de todos");
    expect(textoFotosDeFila(1, true)).toBe("1 foto");
    expect(textoFotosDeFila(3, false)).toBe("3 fotos");
  });
});

describe("celdaSinPrecio — un 0 escrito en una celda de «Precios» no crea la variante a S/ 0 (ADR-0384)", () => {
  const celdas = construirCeldas(["s", "m"], ["NEG", "BEI"]);
  const clave = (talla: string, color: string) => claveCelda(talla, color);

  it("vacía no cuenta: toma el precio de todas, que se revisa aparte", () => {
    expect(celdaSinPrecio(celdas, {})).toBeNull();
    expect(celdaSinPrecio(celdas, { [clave("m", "NEG")]: "  " })).toBeNull();
    expect(precioPropioInvalido(undefined)).toBe(false);
    expect(precioPropioInvalido("")).toBe(false);
  });

  it("un precio mayor que 0 sirve; 0, 0.00 y lo que no es número no", () => {
    expect(precioPropioInvalido("59.90")).toBe(false);
    expect(precioPropioInvalido("0.01")).toBe(false);
    for (const malo of ["0", "0.00", ".", "abc"]) expect(precioPropioInvalido(malo)).toBe(true);
  });

  it("devuelve la PRIMERA celda en 0, en el orden de la tabla (color por color, talla por talla)", () => {
    const precios = { [clave("m", "BEI")]: "0", [clave("s", "NEG")]: "79.90", [clave("m", "NEG")]: "0" };
    expect(celdaSinPrecio(celdas, precios)?.clave).toBe(clave("m", "NEG"));
  });

  it("una celda quitada de la tabla no cuenta: no se crea", () => {
    const incluidas = celdas.filter((c) => c.clave !== clave("m", "NEG"));
    expect(celdaSinPrecio(incluidas, { [clave("m", "NEG")]: "0" })).toBeNull();
  });
});

describe("nombreCelda — la celda se llama igual en la tabla y en «Falta»", () => {
  it("color en talla; sin color o sin talla, lo dice", () => {
    expect(nombreCelda("Negro", "M")).toBe("Negro en M");
    expect(nombreCelda(null, "M")).toBe("Sin color en M");
    expect(nombreCelda("Negro", null)).toBe("Negro en Única");
    expect(nombreCelda(undefined, undefined)).toBe("Sin color en Única");
  });
});
