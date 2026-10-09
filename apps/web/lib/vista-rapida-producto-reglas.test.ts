import { describe, expect, it } from "vitest";
import type { VarianteListado } from "./catalogo-v2";
import {
  alternarVariantes,
  armarMatriz,
  avisoSinUnidadesAqui,
  etiquetasDeLaSeleccion,
  fichaCorta,
  HEX_SIN_COLOR,
  idsDeColumna,
  idsDeFila,
  precioBaseDe,
  soloLasQueExisten,
  TALLA_UNICA,
  unidadesTexto,
  vendidasEn30Dias,
} from "./vista-rapida-producto-reglas";

let n = 0;
function v(parcial: Partial<VarianteListado>): VarianteListado {
  n += 1;
  return {
    varianteId: parcial.varianteId ?? `v${n}`,
    sku: "",
    codigo: `PAN-0014-${n}`,
    talla: null,
    color: null,
    colorHex: null,
    fotoUrl: null,
    precio: 79.9,
    activo: true,
    productoId: "p",
    referencia: "Pantalón Nuki",
    categoria: "Pantalones",
    codigosBarras: [],
    costo: null,
    ...parcial,
  };
}
const COLORES = ["Beige", "Blanco", "Camel", "Chocolate", "Gris", "Negro"];
const nuki = () => COLORES.flatMap((c) => ["L", "M", "S"].map((t) => v({ varianteId: `${c}-${t}`, color: c, colorHex: "#cccccc", talla: t })));
const stock = (obj: Record<string, number>) => new Map(Object.entries(obj));

describe("armarMatriz · la forma", () => {
  it("6 colores × 3 tallas: 6 filas, 3 columnas en curva de talla (S, M, L, no L, M, S) y 18 celdas", () => {
    const m = armarMatriz(nuki(), stock({}));
    expect(m.filas.map((f) => f.nombre)).toEqual(COLORES);
    expect(m.columnas.map((c) => c.nombre)).toEqual(["S", "M", "L"]);
    expect(m.celdas).toHaveLength(18);
    expect(m.nVariantes).toBe(18);
    expect(m.filas.every((f) => f.celdas.length === 3 && f.celdas.every(Boolean))).toBe(true);
  });

  it("una combinación que no existe (Camel no viene en L) es un hueco, no una celda en cero", () => {
    const vs = nuki().filter((x) => !(x.color === "Camel" && x.talla === "L"));
    const m = armarMatriz(vs, stock({}));
    const camel = m.filas.find((f) => f.nombre === "Camel")!;
    expect(camel.celdas[2]).toBeNull();
    expect(m.celdas).toHaveLength(17);
  });

  it("una talla retirada no se lista ni cuenta (variantesQueSeVenden); si TODAS lo están, se conservan", () => {
    const vs = nuki().map((x) => (x.color === "Gris" && x.talla === "M" ? { ...x, activo: false } : x));
    expect(armarMatriz(vs, stock({})).nVariantes).toBe(17);
    expect(armarMatriz(vs.map((x) => ({ ...x, activo: false })), stock({})).nVariantes).toBe(18);
  });

  it("sin color va al final como «Sin color»; sin talla es la columna «Única»", () => {
    const m = armarMatriz([v({ color: null, talla: "M" }), v({ color: "Negro", colorHex: "#111111", talla: null }), v({ color: "Negro", colorHex: "#111111", talla: "M" })], stock({}));
    expect(m.filas.map((f) => f.nombre)).toEqual(["Negro", "Sin color"]);
    expect(m.filas[1].hex).toBe(HEX_SIN_COLOR);
    expect(m.columnas.map((c) => c.nombre)).toEqual(["M", TALLA_UNICA]);
    expect(m.filas[0].celdas[1]?.talla).toBeNull();
  });

  it("toma la foto y el hex de la primera variante del color que los trae", () => {
    const m = armarMatriz([v({ color: "Camel", talla: "S" }), v({ color: "Camel", talla: "M", colorHex: "#b98a58", fotoUrl: "camel.jpg" })], stock({}));
    expect(m.filas[0].hex).toBe("#b98a58");
    expect(m.filas[0].fotoUrl).toBe("camel.jpg");
  });

  it("una prenda sin variantes no revienta (precio 0, sin filas)", () => {
    const m = armarMatriz([], stock({}));
    expect(m.filas).toEqual([]);
    expect(m.precioMin).toBe(0);
    expect(m.totalGeneral).toBe(0);
  });
});

describe("armarMatriz · lo que dice el stock", () => {
  it("cada celda lleva sus unidades; los totales de fila, de columna y general cuadran", () => {
    const m = armarMatriz(nuki(), stock({ "Beige-S": 3, "Beige-M": 5, "Beige-L": 2, "Negro-S": 9, "Negro-M": 12 }));
    expect(m.filas[0].total).toBe(10);
    expect(m.filas[5].total).toBe(21);
    expect(m.columnas.map((c) => c.total)).toEqual([12, 17, 2]);
    expect(m.totalGeneral).toBe(31);
    const sumaFilas = m.filas.reduce((t, f) => t + (f.total ?? 0), 0);
    const sumaColumnas = m.columnas.reduce((t, c) => t + (c.total ?? 0), 0);
    expect(sumaFilas).toBe(m.totalGeneral);
    expect(sumaColumnas).toBe(m.totalGeneral);
  });

  it("una variante sin fila de stock tiene 0 (`stock` solo guarda lo que hay)", () => {
    const m = armarMatriz(nuki(), stock({ "Beige-S": 3 }));
    expect(m.celdas.find((c) => c.varianteId === "Blanco-M")?.unidades).toBe(0);
  });

  it("mientras no se lee (null), NINGUNA cifra es 0: todo es null, nunca un 0 que no es cierto", () => {
    const m = armarMatriz(nuki(), null);
    expect(m.totalGeneral).toBeNull();
    expect(m.filas.every((f) => f.total === null)).toBe(true);
    expect(m.columnas.every((c) => c.total === null)).toBe(true);
    expect(m.celdas.every((c) => c.unidades === null && c.nivel === null)).toBe(true);
  });

  it("el nivel de la barra es relativo al mayor stock de la matriz (0 a 1)", () => {
    const m = armarMatriz(nuki(), stock({ "Negro-M": 12, "Beige-S": 3 }));
    expect(m.celdas.find((c) => c.varianteId === "Negro-M")?.nivel).toBe(1);
    expect(m.celdas.find((c) => c.varianteId === "Beige-S")?.nivel).toBe(0.25);
    expect(m.celdas.find((c) => c.varianteId === "Gris-S")?.nivel).toBe(0);
  });

  it("todo en cero no divide por cero", () => {
    const m = armarMatriz(nuki(), stock({}));
    expect(m.celdas.every((c) => c.nivel === 0)).toBe(true);
  });

  it("un stock negativo (descuadre) se cuenta como 0", () => {
    const m = armarMatriz(nuki(), stock({ "Beige-S": -4 }));
    expect(m.celdas.find((c) => c.varianteId === "Beige-S")?.unidades).toBe(0);
  });
});

describe("armarMatriz · el precio", () => {
  it("igual en todas: se dice una vez y ninguna celda lo repite", () => {
    const m = armarMatriz(nuki(), stock({}));
    expect(m.precioUnico).toBe(true);
    expect(m.precioBase).toBe(79.9);
    expect(m.celdas.some((c) => c.precioDistinto)).toBe(false);
  });

  it("una talla a otro precio es la excepción marcada, y el precio base es el que más se repite", () => {
    const vs = nuki().map((x) => (x.varianteId === "Negro-L" ? { ...x, precio: 10 } : x));
    const m = armarMatriz(vs, stock({}));
    expect(m.precioUnico).toBe(false);
    expect(m.precioBase).toBe(79.9);
    expect(m.precioMin).toBe(10);
    expect(m.precioMax).toBe(79.9);
    expect(m.celdas.filter((c) => c.precioDistinto).map((c) => c.varianteId)).toEqual(["Negro-L"]);
  });

  it("precioBaseDe: en un empate gana el más bajo", () => {
    expect(precioBaseDe([100, 80, 100, 80])).toBe(80);
    expect(precioBaseDe([])).toBe(0);
  });
});

describe("elegir variantes", () => {
  const m = armarMatriz(nuki(), stock({}));
  it("tocar una fila elige todas sus tallas; volver a tocarla las quita", () => {
    const ids = idsDeFila(m.filas[2]);
    expect(ids).toEqual(["Camel-S", "Camel-M", "Camel-L"]);
    const una = alternarVariantes(new Set(), ids);
    expect([...una]).toEqual(ids);
    expect(alternarVariantes(una, ids).size).toBe(0);
  });

  it("si falta aunque sea una de la fila, tocarla las suma todas (no quita las que ya estaban)", () => {
    const parcial = new Set(["Camel-S"]);
    expect(alternarVariantes(parcial, idsDeFila(m.filas[2])).size).toBe(3);
  });

  it("una columna reúne esa talla de todos los colores", () => {
    expect(idsDeColumna(m.columnas[1])).toHaveLength(6);
    expect(idsDeColumna(m.columnas[1]).every((id) => id.endsWith("-M"))).toBe(true);
  });

  it("no muta el conjunto que recibe", () => {
    const original = new Set(["a"]);
    alternarVariantes(original, ["b"]);
    expect([...original]).toEqual(["a"]);
  });

  it("al cambiar la página se descartan las elegidas que ya no existen", () => {
    expect([...soloLasQueExisten(new Set(["Camel-S", "fantasma"]), m)]).toEqual(["Camel-S"]);
  });
});

describe("etiquetasDeLaSeleccion · qué va a imprimir el botón", () => {
  const m = armarMatriz(nuki(), stock({ "Camel-M": 8, "Negro-M": 12 }));
  it("sin elegir nada: toda la prenda, con lo que hay en la sede", () => {
    const e = etiquetasDeLaSeleccion(m, new Set(), "Pantalón Nuki");
    expect(e).toMatchObject({ texto: "Etiquetas", cantidad: 0, que: "Pantalón Nuki", unidades: 20, sinUnidades: false, varias: false });
  });
  it("una celda: dice cuál («Etiqueta · Camel M») y cuántas hay", () => {
    const e = etiquetasDeLaSeleccion(m, new Set(["Camel-M"]), "Pantalón Nuki");
    expect(e).toMatchObject({ texto: "Etiqueta · Camel M", que: "Camel M", unidades: 8, cantidad: 1 });
  });
  it("varias: suma sus unidades y el aviso habla en plural", () => {
    const e = etiquetasDeLaSeleccion(m, new Set(["Camel-M", "Negro-M", "Gris-S"]), "Pantalón Nuki");
    expect(e).toMatchObject({ cantidad: 3, unidades: 20, varias: true, que: "Las 3 prendas elegidas" });
  });
  it("lo elegido sin unidades se marca `sinUnidades`, pero nada se bloquea aquí (EnlaceEtiquetas lee fresco al tocar)", () => {
    const e = etiquetasDeLaSeleccion(m, new Set(["Gris-S"]), "Pantalón Nuki");
    expect(e.unidades).toBe(0);
    expect(e.sinUnidades).toBe(true);
  });
  it("sin lectura, ni se afirma que hay ni que no hay", () => {
    const e = etiquetasDeLaSeleccion(armarMatriz(nuki(), null), new Set(), "Pantalón Nuki");
    expect(e.unidades).toBeNull();
    expect(e.sinUnidades).toBe(false);
  });
});

describe("textos", () => {
  it("unidadesTexto: singular y plural", () => {
    expect(unidadesTexto(1)).toBe("1 unidad");
    expect(unidadesTexto(8)).toBe("8 unidades");
    expect(unidadesTexto(0)).toBe("0 unidades");
  });
  it("avisoSinUnidadesAqui nombra la sede y, si hay, lo de las otras", () => {
    expect(avisoSinUnidadesAqui("Tienda AQP", "+24 en LIM · +11 en TRU")).toBe("Sin unidades en Tienda AQP. En otras sedes: +24 en LIM · +11 en TRU.");
    expect(avisoSinUnidadesAqui("", null)).toBe("Sin unidades en tu sede.");
  });
});

describe("fichaCorta (material, patrón, marca y ventas)", () => {
  it("lista los cuatro datos en orden y dice null lo que falta", () => {
    const f = fichaCorta({ tejido: " Lino ", patron: null, marca: "", demandaDiaria: 0.5 });
    expect(f.map((d) => d.clave)).toEqual(["tejido", "patron", "marca", "vendidas"]);
    expect(f[0].valor).toBe("Lino");
    expect(f[1].valor).toBeNull();
    expect(f[2].valor).toBeNull();
    expect(f[3].valor).toBe("15 unidades en 30 días");
  });
  it("redacta las ventas sin promedios", () => {
    expect(vendidasEn30Dias(0)).toBe("Ninguna en 30 días");
    expect(vendidasEn30Dias(0.01)).toBe("Ninguna en 30 días");
    expect(vendidasEn30Dias(1 / 30)).toBe("1 unidad en 30 días");
    expect(vendidasEn30Dias(Number.NaN)).toBe("Ninguna en 30 días");
  });
});
