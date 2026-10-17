import { describe, expect, it } from "vitest";
import {
  cifrasProbador,
  coloresPorFotografiar,
  errorDeLargo,
  estaLista,
  filtrarPrendas,
  largoEfectivo,
  leerLargo,
  leerProbador,
  textoDelLargo,
  type PrendaDelProbador,
} from "./vitrina-probador-reglas";

function prenda(p: Partial<PrendaDelProbador> & { productoId: string; nombre: string }): PrendaDelProbador {
  return {
    codigo: null,
    categoria: null,
    vendidas: 0,
    largo: null,
    tipico: null,
    colores: [],
    fotos: 1,
    recortes: { listos: 0, porRevisar: 0, sin: 0 },
    miniatura: null,
    miniaturaEsRecorte: false,
    ...p,
  };
}

describe("leerProbador", () => {
  it("lee prendas y típicos, y salta lo mal formado", () => {
    const l = leerProbador({
      prendas: [
        {
          producto_id: "p1",
          codigo: "TOP-0053",
          nombre: "Top Estela",
          categoria: { id: "c1", nombre: "Tops", prefijo: "TOP" },
          vendidas: 3,
          largo: null,
          tipico: 45,
          colores: [{ codigo: "RPA", nombre: "Rosa pálido", hex: "#F7D1D1", foto: true, hay: 2 }, { codigo: "NEG", nombre: "Negro", foto: false, hay: "1" }, { nombre: "sin código" }],
          fotos: 1,
          recortes: { listos: 1, por_revisar: 0, sin: 0 },
          miniatura: "https://x/recortes/a.png",
          miniatura_es_recorte: true,
        },
        { producto_id: "", nombre: "Mal" },
        "basura",
      ],
      tipicos: [{ categoria_id: "c1", nombre: "Tops", prefijo: "TOP", largo: 45, prendas: 1 }, { nombre: "sin id" }],
    });
    expect(l.prendas).toHaveLength(1);
    expect(l.prendas[0]).toMatchObject({ codigo: "TOP-0053", tipico: 45, largo: null, recortes: { listos: 1, porRevisar: 0, sin: 0 }, miniaturaEsRecorte: true });
    expect(l.prendas[0].colores).toEqual([
      { codigo: "RPA", nombre: "Rosa pálido", hex: "#F7D1D1", foto: true, hay: 2 },
      { codigo: "NEG", nombre: "Negro", hex: null, foto: false, hay: 1 },
    ]);
    expect(l.tipicos).toEqual([{ categoriaId: "c1", nombre: "Tops", prefijo: "TOP", largo: 45, prendas: 1 }]);
    expect(leerProbador(null)).toEqual({ prendas: [], tipicos: [] });
  });
});

describe("el largo con que la dibuja el probador", () => {
  it("el propio manda; sin propio, el típico; sin los dos, falta", () => {
    expect(largoEfectivo({ largo: 62, tipico: 45 })).toBe(62);
    expect(largoEfectivo({ largo: null, tipico: 45 })).toBe(45);
    expect(largoEfectivo({ largo: null, tipico: null })).toBeNull();
    expect(textoDelLargo({ largo: 62, tipico: 45 })).toBe("62 cm");
    expect(textoDelLargo({ largo: null, tipico: 45 })).toBe("45 cm · el típico");
    expect(textoDelLargo({ largo: null, tipico: null })).toBe("Falta");
  });
});

describe("estaLista y las cifras", () => {
  const lista = prenda({ productoId: "a", nombre: "Top", tipico: 45, recortes: { listos: 1, porRevisar: 0, sin: 0 } });
  const sinLargo = prenda({ productoId: "b", nombre: "Vestido", recortes: { listos: 2, porRevisar: 0, sin: 0 } });
  const sinRecorte = prenda({
    productoId: "c",
    nombre: "Polo",
    tipico: 60,
    recortes: { listos: 0, porRevisar: 1, sin: 0 },
    colores: [
      { codigo: "NEG", nombre: "Negro", hex: null, foto: false, hay: 3 },
      { codigo: "VIN", nombre: "Vino", hex: null, foto: false, hay: 0 },
      { codigo: "BLA", nombre: "Blanco", hex: null, foto: true, hay: 1 },
    ],
  });

  it("sale en el probador con largo y un recorte listo", () => {
    expect(estaLista(lista)).toBe(true);
    expect(estaLista(sinLargo)).toBe(false);
    expect(estaLista(sinRecorte)).toBe(false);
  });

  it("por fotografiar son los colores CON stock sin foto propia (sin stock no apura)", () => {
    expect(coloresPorFotografiar(sinRecorte).map((c) => c.codigo)).toEqual(["NEG"]);
  });

  it("las cifras cuentan listas, sin largo y colores por fotografiar", () => {
    expect(cifrasProbador([lista, sinLargo, sinRecorte])).toEqual({ prendas: 3, listas: 1, sinLargo: 1, coloresPorFotografiar: 1, prendasPorFotografiar: 1 });
  });

  it("los filtros y el buscador (sin tildes ni mayúsculas, también por código y categoría)", () => {
    const todas = [lista, sinLargo, prenda({ productoId: "d", nombre: "Blusa Ñusta", codigo: "CMS-0099", categoria: { id: "c", nombre: "Camisas y Blusas", prefijo: "CMS" } })];
    expect(filtrarPrendas(todas, "listas", "").map((p) => p.productoId)).toEqual(["a"]);
    expect(filtrarPrendas(todas, "sin_largo", "").map((p) => p.productoId)).toEqual(["b", "d"]);
    expect(filtrarPrendas([sinRecorte], "por_fotografiar", "").map((p) => p.productoId)).toEqual(["c"]);
    expect(filtrarPrendas(todas, "todas", "nusta").map((p) => p.productoId)).toEqual(["d"]);
    expect(filtrarPrendas(todas, "todas", "cms-0099").map((p) => p.productoId)).toEqual(["d"]);
    expect(filtrarPrendas(todas, "todas", "camisas").map((p) => p.productoId)).toEqual(["d"]);
  });
});

describe("leerLargo: lo que se escribe en la caja", () => {
  it("un entero de 5 a 250, con o sin «cm» y con coma", () => {
    expect(leerLargo("62")).toEqual({ valor: 62 });
    expect(leerLargo(" 62 cm ")).toEqual({ valor: 62 });
    expect(leerLargo("62,4")).toEqual({ valor: 62 });
    expect(leerLargo("5")).toEqual({ valor: 5 });
    expect(leerLargo("250")).toEqual({ valor: 250 });
  });
  it("vacío vuelve al típico", () => {
    expect(leerLargo("")).toEqual({ valor: null });
    expect(leerLargo("   ")).toEqual({ valor: null });
  });
  it("no adivina ni acepta lo que la base rechazaría", () => {
    expect(leerLargo("6 2")).toHaveProperty("error");
    expect(leerLargo("abc")).toHaveProperty("error");
    expect(leerLargo("4")).toHaveProperty("error");
    expect(leerLargo("251")).toHaveProperty("error");
    expect(leerLargo("-10")).toHaveProperty("error");
  });
});

describe("errorDeLargo", () => {
  it("traduce los errores de la base y deja pasar los demás", () => {
    expect(errorDeLargo("vitrina_largo_sin_vitrina")).toMatch(/muéstrala/);
    expect(errorDeLargo("vitrina_largo_invalido")).toMatch(/5 a 250/);
    expect(errorDeLargo("otra cosa")).toBeNull();
  });
});
