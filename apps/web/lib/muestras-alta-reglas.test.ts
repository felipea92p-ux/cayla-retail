import { describe, expect, it } from "vitest";
import {
  aLaVista,
  agruparTallas,
  alternar,
  coincideBusqueda,
  curvaCambiada,
  faltanDeLaCategoria,
  grupoDeTalla,
  porOfrecer,
  seccionesMuestras,
  textoCurva,
  unirSinRepetir,
} from "./muestras-alta-reglas";

const v = (id: string, texto = id) => ({ id, texto });
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("aLaVista: lo elegido nunca se esconde", () => {
  const lista = ["a", "b", "c", "d", "e", "f", "g"].map((x) => v(x));

  it("sin elegido muestra las primeras 5 en su orden", () => {
    expect(ids(aLaVista(lista, null))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("si lo elegido ya está entre las 5, nada se mueve", () => {
    expect(ids(aLaVista(lista, v("c")))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("si lo elegido está más abajo, va primero y empuja a la última", () => {
    expect(ids(aLaVista(lista, v("g")))).toEqual(["g", "a", "b", "c", "d"]);
  });

  it("si lo elegido vino del catálogo (no está en la lista), también va primero", () => {
    expect(ids(aLaVista(lista, v("pana")))).toEqual(["pana", "a", "b", "c", "d"]);
  });

  it("con pocas, se ven todas y lo elegido de afuera se suma adelante", () => {
    expect(ids(aLaVista([v("a"), v("b")], v("x")))).toEqual(["x", "a", "b"]);
  });
});

describe("buscar sin tildes ni mayúsculas", () => {
  it("«algodon» encuentra «Algodón» y «PÍMA» encuentra «Algodón pima»", () => {
    expect(coincideBusqueda("Algodón", "algodon")).toBe(true);
    expect(coincideBusqueda("Algodón pima", "PÍMA")).toBe(true);
    expect(coincideBusqueda("Lino", "seda")).toBe(false);
  });

  it("sin búsqueda, todo coincide", () => {
    expect(coincideBusqueda("Lino", "   ")).toBe(true);
  });
});

describe("seccionesMuestras: los de la categoría y los del catálogo", () => {
  const propios = [v("t2", "Lino"), v("t1", "Algodón")];
  const universo = [v("t1", "Algodón"), v("t2", "Lino"), v("t4", "Pana"), v("t3", "Denim")];

  it("los propios en el orden de la categoría; el resto del catálogo de la A a la Z", () => {
    const s = seccionesMuestras(propios, universo, "");
    expect(ids(s.propias)).toEqual(["t2", "t1"]);
    expect(ids(s.delCatalogo)).toEqual(["t3", "t4"]);
  });

  it("la búsqueda filtra las dos secciones", () => {
    const s = seccionesMuestras(propios, universo, "an");
    expect(ids(s.propias)).toEqual([]);
    expect(ids(s.delCatalogo)).toEqual(["t4"]);
  });

  it("el total de «Ver todos» no cuenta dos veces lo que está en las dos listas", () => {
    expect(unirSinRepetir(propios, universo)).toHaveLength(4);
  });
});

describe("grupos de la hoja «+ Otra talla»", () => {
  it("letras, números y el resto en Otras", () => {
    expect(grupoDeTalla("XS")).toBe("Letras");
    expect(grupoDeTalla("xxl")).toBe("Letras");
    expect(grupoDeTalla("28")).toBe("Números");
    expect(grupoDeTalla("6")).toBe("Números");
    expect(grupoDeTalla("Estándar")).toBe("Otras");
    expect(grupoDeTalla("Única")).toBe("Otras");
    expect(grupoDeTalla("Talla rara")).toBe("Otras");
  });

  it("agrupa en orden Letras, Números, Otras; ordena como curva y omite grupos vacíos", () => {
    const tallas = [v("1", "L"), v("2", "30"), v("3", "Única"), v("4", "S"), v("5", "28")];
    expect(agruparTallas(tallas).map((g) => [g.grupo, g.tallas.map((t) => t.texto)])).toEqual([
      ["Letras", ["S", "L"]],
      ["Números", ["28", "30"]],
      ["Otras", ["Única"]],
    ]);
    expect(agruparTallas(tallas, "unica").map((g) => g.grupo)).toEqual(["Otras"]);
  });
});

describe("atajos de tallas", () => {
  it("la curva cambió si hay una de más o una de menos, sin importar el orden", () => {
    expect(curvaCambiada(["b", "a"], ["a", "b"])).toBe(false);
    expect(curvaCambiada(["a"], ["a", "b"])).toBe(true);
    expect(curvaCambiada(["a", "b", "c"], ["a", "b"])).toBe(true);
    expect(curvaCambiada(["a"], [])).toBe(false);
  });

  it("el rótulo de la curva: rango con más de 3, todas con 3 o menos", () => {
    expect(textoCurva(["30", "28", "34", "32"])).toBe("28–34");
    expect(textoCurva(["M", "S", "L"])).toBe("S M L");
  });

  it("qué falta de la categoría y qué hay que ofrecerle", () => {
    const cat = [v("s"), v("m"), v("l")];
    expect(faltanDeLaCategoria(["s"], cat)).toEqual(["m", "l"]);
    expect(porOfrecer(["s", "xl"], cat)).toEqual(["xl"]);
  });

  it("alternar marca y desmarca sin repetir", () => {
    expect(alternar(["a"], "b")).toEqual(["a", "b"]);
    expect(alternar(["a", "b"], "a")).toEqual(["b"]);
  });
});
