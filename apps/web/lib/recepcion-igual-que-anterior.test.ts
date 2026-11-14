import { describe, expect, it } from "vitest";
import { anteriorDeLaCategoria, fichaDeLaAnterior, leerPrendasCreadas, loQueLlena, marcaDelAnterior, recordarPrenda, textoDeTallas, type PrendaAnterior } from "./recepcion-igual-que-anterior";

const curva = [
  { id: "l", valor: "L" },
  { id: "s", valor: "S" },
  { id: "m", valor: "M" },
  { id: "xl", valor: "XL" },
];
const anterior: PrendaAnterior = {
  categoriaId: "blusas",
  nombre: "Blusa Dalia",
  tejido: { id: "alg", texto: "Algodón" },
  patron: { id: "liso", texto: "Liso" },
  tallas: [
    { id: "s", valor: "S" },
    { id: "m", valor: "M" },
    { id: "l", valor: "L" },
  ],
};
const vacia = { tejidoId: "", patronId: "", tallaIds: [] as string[] };
const hoja = { categoriaId: "blusas", curva, pideTejido: true, pidePatron: true, elegido: vacia };

describe("textoDeTallas", () => {
  it("seguidas en la curva: «S a L», sin importar el orden en que llegan", () => {
    expect(textoDeTallas([curva[0], curva[1], curva[2]], curva)).toBe("S a L");
  });
  it("salteadas o solo dos: en lista", () => {
    expect(textoDeTallas([curva[1], curva[3]], curva)).toBe("S y XL");
    expect(textoDeTallas([curva[1], curva[2]], curva)).toBe("S y M");
    expect(textoDeTallas([curva[1], curva[2], curva[3]], curva)).toBe("S, M y XL");
  });
  it("una sola o ninguna", () => {
    expect(textoDeTallas([curva[2]], curva)).toBe("M");
    expect(textoDeTallas([], curva)).toBe("");
  });
});

describe("fichaDeLaAnterior", () => {
  it("ofrece lo de la prenda anterior de la misma categoría", () => {
    expect(fichaDeLaAnterior(anterior, hoja)).toEqual({
      nombre: "Blusa Dalia",
      datos: [
        { clave: "tejido", texto: "Algodón" },
        { clave: "patron", texto: "Liso" },
        { clave: "tallas", texto: "S a L" },
      ],
    });
  });
  it("sin anterior o de otra categoría, no se ofrece", () => {
    expect(fichaDeLaAnterior(null, hoja)).toBeNull();
    expect(fichaDeLaAnterior(anterior, { ...hoja, categoriaId: "casacas" })).toBeNull();
  });
  it("no pisa lo que la persona ya eligió", () => {
    expect(fichaDeLaAnterior(anterior, { ...hoja, elegido: { ...vacia, tejidoId: "seda" } })).toBeNull();
    expect(fichaDeLaAnterior(anterior, { ...hoja, elegido: { ...vacia, patronId: "rayas" } })).toBeNull();
    expect(fichaDeLaAnterior(anterior, { ...hoja, elegido: { ...vacia, tallaIds: ["m"] } })).toBeNull();
  });
  it("lo que se quita con su ✕ sale de la ficha; sin nada, no hay ficha", () => {
    expect(fichaDeLaAnterior(anterior, hoja, new Set(["patron"]))?.datos.map((d) => d.clave)).toEqual(["tejido", "tallas"]);
    expect(fichaDeLaAnterior(anterior, hoja, new Set(["tejido", "patron", "tallas"]))).toBeNull();
  });
  it("lo que la hoja no pregunta o la categoría ya no tiene no se ofrece", () => {
    expect(fichaDeLaAnterior(anterior, { ...hoja, pideTejido: false, pidePatron: false })?.datos.map((d) => d.clave)).toEqual(["tallas"]);
    expect(fichaDeLaAnterior(anterior, { ...hoja, curva: [{ id: "xl", valor: "XL" }] })?.datos.map((d) => d.clave)).toEqual(["tejido", "patron"]);
  });
  it("una anterior sin tejido, patrón ni tallas no ofrece nada", () => {
    expect(fichaDeLaAnterior({ ...anterior, tejido: null, patron: null, tallas: [] }, hoja)).toBeNull();
  });
});

describe("loQueLlena", () => {
  it("llena solo lo que sigue en la ficha", () => {
    const ficha = fichaDeLaAnterior(anterior, hoja, new Set(["patron"]))!;
    expect(loQueLlena(anterior, ficha, curva)).toEqual({ tejidoId: "alg", tallaIds: ["s", "m", "l"] });
  });
  it("las tallas que la categoría ya no tiene no se marcan", () => {
    const corta = [curva[1], curva[2]];
    const ficha = fichaDeLaAnterior(anterior, { ...hoja, curva: corta })!;
    expect(loQueLlena(anterior, ficha, corta).tallaIds).toEqual(["s", "m"]);
  });
});

describe("recordarPrenda", () => {
  it("guarda lo elegido con sus textos; lo vacío queda vacío", () => {
    const r = recordarPrenda(
      { categoriaId: "blusas", nombre: "Blusa Dalia", tejidoId: "alg", patronId: "", tallaIds: ["s", "l"] },
      { tejidos: [{ id: "alg", texto: "Algodón" }], patrones: [{ id: "liso", texto: "Liso" }], tallas: curva },
    );
    expect(r).toEqual({ categoriaId: "blusas", nombre: "Blusa Dalia", tejido: { id: "alg", texto: "Algodón" }, patron: null, tallas: [curva[0], curva[1]] });
  });
});

describe("marcaDelAnterior", () => {
  const marcas = [
    { id: "z", nombre: "Zara" },
    { id: "m", nombre: "Mango" },
  ];
  it("ofrece la marca anterior si todavía no se eligió una", () => {
    expect(marcaDelAnterior({ id: "z", nombre: "Zara" }, "", marcas)).toEqual({ id: "z", nombre: "Zara" });
  });
  it("con una marca elegida, sin anterior o si ya no está en el combo, no se ofrece", () => {
    expect(marcaDelAnterior({ id: "z", nombre: "Zara" }, "m", marcas)).toBeNull();
    expect(marcaDelAnterior(null, "", marcas)).toBeNull();
    expect(marcaDelAnterior({ id: "x", nombre: "Otra" }, "", marcas)).toBeNull();
  });
});

describe("leerPrendasCreadas y anteriorDeLaCategoria (la anterior sale de la base)", () => {
  const fila = (o: Record<string, unknown>) => ({
    id: "p1",
    nombre: "Blusa Dalia",
    categoria_id: "blusas",
    created_at: "2026-11-14T15:00:00Z",
    tejido: { id: "alg", nombre: "Algodón" },
    patron: null,
    variantes: [{ talla: { id: "s", valor: "S" } }, { talla: { id: "s", valor: "S" } }, { talla: { id: "m", valor: "M" } }],
    ...o,
  });
  it("lee tejido, patrón y las tallas sin repetir", () => {
    expect(leerPrendasCreadas([fila({})], null)).toEqual([
      { categoriaId: "blusas", nombre: "Blusa Dalia", tejido: { id: "alg", texto: "Algodón" }, patron: null, tallas: [{ id: "s", valor: "S" }, { id: "m", valor: "M" }], creadaEn: "2026-11-14T15:00:00Z" },
    ]);
  });
  it("solo las creadas desde que se abrió el envío; lo ilegible se salta", () => {
    const filas = [fila({ id: "vieja", created_at: "2026-10-01T00:00:00Z" }), fila({ id: "nueva" }), { id: "x" }, null];
    expect(leerPrendasCreadas(filas, "2026-11-14T14:00:00Z").map((f) => f.nombre)).toEqual(["Blusa Dalia"]);
    expect(leerPrendasCreadas("no", null)).toEqual([]);
  });
  it("la anterior es la más reciente de esa categoría", () => {
    const creadas = leerPrendasCreadas(
      [fila({ nombre: "Blusa Uno", created_at: "2026-11-14T15:00:00Z" }), fila({ nombre: "Blusa Dos", created_at: "2026-11-14T16:00:00Z" }), fila({ nombre: "Casaca", categoria_id: "casacas", created_at: "2026-11-14T17:00:00Z" })],
      null,
    );
    expect(anteriorDeLaCategoria(creadas, "blusas")?.nombre).toBe("Blusa Dos");
    expect(anteriorDeLaCategoria(creadas, "casacas")?.nombre).toBe("Casaca");
    expect(anteriorDeLaCategoria(creadas, "faldas")).toBeNull();
    expect(anteriorDeLaCategoria(creadas, "blusas")).not.toHaveProperty("creadaEn");
  });
});
