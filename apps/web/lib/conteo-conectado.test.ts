import { describe, it, expect } from "vitest";
import {
  HUECO_MINIMO_MS,
  agruparPorPercha,
  cantidadTrasLectura,
  debeContarLectura,
  faltanDecidir,
  idsACero,
  noEncontradas,
  sonidoDeLectura,
  urlBajarTrasConteo,
  urlEtiquetasDe,
} from "./conteo-conectado";
import type { PrendaPendiente } from "./conteo-reglas";
import type { FilaPrevisualizacion } from "./conteo-varianza";

const p = (varianteId: string, referencia: string, color: string | null, talla: string | null, sku = ""): PrendaPendiente => ({ varianteId, referencia, color, talla, sku });

describe("agruparPorPercha", () => {
  it("junta por modelo y color, con las tallas en orden de talla y el código sin la talla", () => {
    const grupos = agruparPorPercha([
      p("a-xl", "Blusa Carlita", "Negro", "XL", "CMS-0001-NEG-XL"),
      p("a-s", "Blusa Carlita", "Negro", "S", "CMS-0001-NEG-S"),
      p("b-m", "Blusa Carlita", "Gris", "M", "CMS-0001-GRI-M"),
      p("a-m", "Blusa Carlita", "Negro", "M", "CMS-0001-NEG-M"),
    ]);
    expect(grupos.map((g) => [g.color, g.codigoBase, g.tallas.map((t) => t.talla)])).toEqual([
      ["Negro", "CMS-0001-NEG", ["S", "M", "XL"]],
      ["Gris", "CMS-0001-GRI", ["M"]],
    ]);
  });

  it("si el código no termina en la talla, lo deja entero (no inventa un código)", () => {
    expect(agruparPorPercha([p("x", "Polo", null, "M", "POL-9")])[0].codigoBase).toBe("POL-9");
  });
});

describe("debeContarLectura (cámara en ráfaga)", () => {
  const ultima = { codigo: "CMS-0001-NEG-M", en: 1000 };

  it("la primera lectura y un código distinto siempre suman", () => {
    expect(debeContarLectura("CMS-0001-NEG-M", null, { huboHueco: false, ahora: 1000 })).toBe(true);
    expect(debeContarLectura("CMS-0001-NEG-S", ultima, { huboHueco: false, ahora: 1010 })).toBe(true);
  });

  it("la misma etiqueta quieta frente a la cámara NO suma sola, por más que pase el tiempo", () => {
    expect(debeContarLectura("CMS-0001-NEG-M", ultima, { huboHueco: false, ahora: 60_000 })).toBe(false);
  });

  it("el mismo código vuelve a sumar cuando la etiqueta salió del cuadro (la prenda siguiente de la pila)", () => {
    expect(debeContarLectura("CMS-0001-NEG-M", ultima, { huboHueco: true, ahora: 1000 + HUECO_MINIMO_MS })).toBe(true);
  });

  it("un cuadro perdido un instante no cuenta como otra prenda", () => {
    expect(debeContarLectura("CMS-0001-NEG-M", ultima, { huboHueco: true, ahora: 1000 + HUECO_MINIMO_MS - 1 })).toBe(false);
  });

  it("un código vacío nunca suma", () => {
    expect(debeContarLectura("", null, { huboHueco: true, ahora: 0 })).toBe(false);
  });
});

describe("sonidoDeLectura", () => {
  it("distingue otra unidad, la primera unidad y un código que no existe", () => {
    expect(sonidoDeLectura({ encontrada: true, yaContada: true })).toBe("suma");
    expect(sonidoDeLectura({ encontrada: true, yaContada: false })).toBe("nueva");
    expect(sonidoDeLectura({ encontrada: false, yaContada: false })).toBe("desconocida");
  });
});

describe("cantidadTrasLectura (recontar, opción A)", () => {
  it("suma 1 sobre lo anotado", () => {
    expect(cantidadTrasLectura(undefined, false)).toBe(1);
    expect(cantidadTrasLectura(12, false)).toBe(13);
  });
  it("una prenda marcada para recontar empieza desde 1: su cifra anterior no cuenta", () => {
    expect(cantidadTrasLectura(12, true)).toBe(1);
  });
});

function fila(x: Partial<FilaPrevisualizacion>): FilaPrevisualizacion {
  return { variante_id: "v", codigo: "C", referencia: "Blusa", talla: "M", color: "Negro", contada: null, sistema: 1, diferencia: null, origen: "no_contado", ...x };
}

describe("noEncontradas", () => {
  it("solo lo no contado, con stock y dentro del alcance; sin repetir", () => {
    const lista = noEncontradas(
      [
        fila({ variante_id: "a", sistema: 2 }),
        fila({ variante_id: "a", sistema: 2 }),
        fila({ variante_id: "b", sistema: 0 }),
        fila({ variante_id: "c", origen: "contado", sistema: 3 }),
        fila({ variante_id: "d", sistema: 1 }),
      ],
      new Set(["a", "b", "c"])
    );
    expect(lista.map((n) => [n.varianteId, n.sistema])).toEqual([["a", 2]]);
  });
});

describe("decisiones sobre las no encontradas", () => {
  const lista = [{ varianteId: "a" }, { varianteId: "b" }, { varianteId: "c" }];
  it("cerrar espera a que todas estén decididas", () => {
    expect(faltanDecidir(lista, {})).toBe(3);
    expect(faltanDecidir(lista, { a: "cero", b: "dejar" })).toBe(1);
  });
  it("solo las «no está» se cuentan como 0", () => {
    expect(idsACero(lista, { a: "cero", b: "dejar", c: "cero" })).toEqual(["a", "c"]);
  });
});

describe("urlBajarTrasConteo", () => {
  it("lleva las que quedaron en 0 en el piso y tienen algo libre en el almacén, con 1 (llegan por escanear)", () => {
    const r = urlBajarTrasConteo(
      [
        { varianteId: "a", contado: 0 },
        { varianteId: "b", contado: 0 },
        { varianteId: "c", contado: 3 },
      ],
      new Map([["a", 4], ["b", 0], ["c", 9]])
    );
    expect(r).toEqual({ url: "/inventario/bajar?lineas=a:1", cuantas: 1 });
  });
  it("sin ninguna, no hay acceso", () => {
    expect(urlBajarTrasConteo([{ varianteId: "a", contado: 2 }], new Map([["a", 4]]))).toBeNull();
  });
});

describe("urlEtiquetasDe", () => {
  it("tallas sueltas por `?variantes=`, sin repetir", () => {
    expect(urlEtiquetasDe(["a", "b", "a"])).toBe("/etiquetas-de-precio?variantes=a,b");
    expect(urlEtiquetasDe([])).toBeNull();
  });
});
