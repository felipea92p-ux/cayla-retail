import { describe, expect, it } from "vitest";
import { GRUPOS_DE_LA_TIENDA, zonaDelProbador } from "@cayla-retail/shared/categorias-de-la-tienda";
import {
  avisoDeRedondeo,
  cifrasProbador,
  coloresPorFotografiar,
  entraAlProbador,
  errorDeLargo,
  estaLista,
  filtrarPrendas,
  largoEfectivo,
  leerLargo,
  leerProbador,
  queHacerConLaPrenda,
  siguientePaso,
  soloLoQueEntra,
  textoDelLargo,
  veredictoDelProbador,
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

describe("lo que entra al probador: la misma regla de la tienda (/formidable, 2026-10-17)", () => {
  const cat = (prefijo: string | null, nombre = "X") => ({ id: `c-${prefijo ?? nombre}`, nombre, prefijo });

  it("entran la ropa (arriba, vestidos, abajo, encima) y Bolsos y Carteras; no los demás accesorios, la bisutería ni el calzado", () => {
    for (const prefijo of ["TOP", "CMS", "BOD", "VES", "CON", "ENT", "PAN", "JEA", "FAL", "SHO", "CAS", "BLZ", "CAP", "CAR"]) expect(entraAlProbador(cat(prefijo))).toBe(true);
    for (const prefijo of ["ACC", "CIN", "COL", "ARE", "ANL", "BUF", "GOR", "LSO", "MAQ", "ZAP", "LIB"]) expect(entraAlProbador(cat(prefijo))).toBe(false);
    expect(entraAlProbador(null)).toBe(false);
  });

  it("cada prefijo de los grupos de la tienda decide igual en el ERP (una sola regla)", () => {
    for (const g of GRUPOS_DE_LA_TIENDA) for (const prefijo of g.prefijos) expect(entraAlProbador(cat(prefijo))).toBe(zonaDelProbador(prefijo) !== null);
  });

  it("una categoría nueva sin lista cae donde la pone la tienda (Encima y más): entra", () => {
    expect(entraAlProbador(cat("NUE"))).toBe(true);
    expect(entraAlProbador(cat(null, "Kimonos"))).toBe(true);
  });

  it("deja fuera las prendas, los típicos y las fotos de lo que no entra", () => {
    const top = prenda({ productoId: "p1", nombre: "Top", categoria: cat("TOP") });
    const arete = prenda({ productoId: "p2", nombre: "Arete", categoria: cat("ARE") });
    const r = soloLoQueEntra(
      {
        prendas: [top, arete],
        tipicos: [
          { categoriaId: "c-TOP", nombre: "Tops", prefijo: "TOP", largo: 45, prendas: 1 },
          { categoriaId: "c-ARE", nombre: "Aretes", prefijo: "ARE", largo: null, prendas: 1 },
        ],
      },
      [{ productoId: "p1", foto: "fotos/a.jpg" }, { productoId: "p2", foto: "fotos/b.jpg" }],
    );
    expect(r.probador.prendas.map((p) => p.nombre)).toEqual(["Top"]);
    expect(r.probador.tipicos.map((t) => t.nombre)).toEqual(["Tops"]);
    expect(r.fotos.map((f) => f.foto)).toEqual(["fotos/a.jpg"]);
  });
});

describe("una palabra por prenda: «Lista» o lo primero que le falta", () => {
  const v = (p: Partial<PrendaDelProbador>) => veredictoDelProbador(prenda({ productoId: "p", nombre: "P", ...p }));

  it("con largo y un recorte listo, sale", () => {
    expect(v({ tipico: 45, recortes: { listos: 1, porRevisar: 0, sin: 0 } })).toEqual({ sale: true, texto: "Lista" });
  });

  it("un recorte listo sin largo: falta el largo (antes decía «Listo» en verde)", () => {
    expect(v({ recortes: { listos: 1, porRevisar: 0, sin: 0 } })).toMatchObject({ sale: false, falta: "largo", texto: "Falta el largo" });
  });

  it("sin ninguna foto: falta la foto, no el recorte (antes decía «Sin recorte»)", () => {
    expect(v({ fotos: 0, tipico: 65 })).toMatchObject({ falta: "foto", texto: "Falta su foto" });
  });

  it("un recorte por revisar va antes que las fotos sin recortar: está a un toque", () => {
    expect(v({ fotos: 2, tipico: 65, recortes: { listos: 0, porRevisar: 1, sin: 1 } })).toMatchObject({ falta: "revisar" });
    expect(v({ fotos: 2, tipico: 65, recortes: { listos: 0, porRevisar: 0, sin: 2 } })).toMatchObject({ falta: "recortar" });
  });

  it("con fotos y ningún recorte vivo: se descartaron (antes decía «Sin recorte»)", () => {
    expect(v({ fotos: 1, tipico: 65, recortes: { listos: 0, porRevisar: 0, sin: 0 } })).toMatchObject({ falta: "descartado", texto: "Recorte descartado" });
  });

  it("sin recorte y sin largo: primero el recorte (el largo lo dice su columna)", () => {
    expect(v({ fotos: 1, recortes: { listos: 0, porRevisar: 0, sin: 1 } })).toMatchObject({ falta: "recortar" });
  });

  it("dice qué hacer con cada una, sin culpar", () => {
    for (const falta of ["foto", "revisar", "recortar", "descartado", "largo"] as const) {
      expect(queHacerConLaPrenda({ sale: false, falta, texto: "" }).length).toBeGreaterThan(10);
    }
    expect(queHacerConLaPrenda({ sale: true, texto: "Lista" })).toMatch(/Sale/);
  });

  it("coincide con estaLista en todas las combinaciones", () => {
    for (const fotos of [0, 1, 2])
      for (const listos of [0, 1])
        for (const porRevisar of [0, 1])
          for (const sin of [0, 1])
            for (const tipico of [null, 45]) {
              if (listos + porRevisar + sin > fotos) continue;
              const p = prenda({ productoId: "p", nombre: "P", fotos, tipico, recortes: { listos, porRevisar, sin } });
              expect(veredictoDelProbador(p).sale).toBe(estaLista(p));
            }
  });
});

describe("el paso que sigue, arriba", () => {
  it("primero recortar, después revisar, después los largos; sin nada pendiente, ninguno", () => {
    expect(siguientePaso({ sinRecorte: 368, porRevisar: 81, sinLargo: 12 })).toEqual({ tipo: "preparar", n: 368, texto: "Preparar 368 recortes" });
    expect(siguientePaso({ sinRecorte: 0, porRevisar: 81, sinLargo: 12 })).toMatchObject({ tipo: "revisar", texto: "Revisar 81 recortes" });
    expect(siguientePaso({ sinRecorte: 0, porRevisar: 0, sinLargo: 12 })).toMatchObject({ tipo: "largos", texto: "Anotar 12 largos" });
    expect(siguientePaso({ sinRecorte: 0, porRevisar: 0, sinLargo: 0 })).toBeNull();
  });

  it("habla en singular cuando es uno", () => {
    expect(siguientePaso({ sinRecorte: 1, porRevisar: 0, sinLargo: 0 })?.texto).toBe("Preparar 1 recorte");
    expect(siguientePaso({ sinRecorte: 0, porRevisar: 1, sinLargo: 0 })?.texto).toBe("Revisar 1 recorte");
    expect(siguientePaso({ sinRecorte: 0, porRevisar: 0, sinLargo: 1 })?.texto).toBe("Anotar 1 largo");
  });
});

describe("avisoDeRedondeo: la caja dice antes de guardar que el largo va en cm enteros (/chaos ENT-06, 2026-10-17)", () => {
  it("un decimal que cambia al redondear avisa con el número que se va a guardar", () => {
    expect(avisoDeRedondeo("62,5")).toBe("Se guarda en centímetros enteros: 63.");
    expect(avisoDeRedondeo("62.4 cm")).toBe("Se guarda en centímetros enteros: 62.");
  });
  it("un entero, un decimal que no cambia, lo vacío o lo que no sirve no avisan (lo inválido ya tiene su error)", () => {
    for (const v of ["62", "62,0", "", "abc", "300,5", "4,2"]) expect(avisoDeRedondeo(v)).toBeNull();
  });
});
