import { describe, it, expect } from "vitest";
import {
  avanceEnVivo,
  codigoDePrendaNueva,
  codigosDeConteo,
  coincidenciasPorCodigo,
  compararTallas,
  crearColaEnSerie,
  pendientesConCodigo,
  pendientesEnAlcance,
  modoConteoValido,
  nuevaCantidad,
  pendientesSinCifras,
  prioridadDesdeFila,
  resultadoConteo,
  tocar,
  ultimoConteoConPrendas,
} from "./conteo-reglas";
import type { FilaPrevisualizacion } from "./conteo-varianza";

// Tres reglas de Felipe (ADR-0174) que se rompen calladas si nadie las fija:
//  · un conteo cerrado con 0 prendas no puede salir en verde «Sin diferencias»;
//  · la lista de pendientes que ve quien cuenta nunca trae la cifra del sistema;
//  · con «suma por escaneo», lecturas rápidas no pueden pisarse entre ellas al guardar.

function fila(p: Partial<FilaPrevisualizacion> = {}): FilaPrevisualizacion {
  return {
    variante_id: "v1",
    codigo: "BLU-EMMA-M-NEG",
    referencia: "Blusa Emma",
    talla: "M",
    color: "Negro",
    contada: null,
    sistema: 4,
    diferencia: null,
    origen: "no_contado",
    ...p,
  };
}

describe("resultadoConteo", () => {
  it("un conteo cerrado sin prendas es «vacío», no «sin diferencias»", () => {
    expect(resultadoConteo({ estado: "cerrado", lineas: 0, lineasConDiferencia: 0 })).toBe("vacio");
  });

  it("abierto es «en curso» aunque todavía no tenga prendas", () => {
    expect(resultadoConteo({ estado: "abierto", lineas: 0, lineasConDiferencia: 0 })).toBe("en_curso");
  });

  it("cerrado con prendas: sin o con diferencia según las líneas", () => {
    expect(resultadoConteo({ estado: "cerrado", lineas: 12, lineasConDiferencia: 0 })).toBe("sin_diferencias");
    expect(resultadoConteo({ estado: "cerrado", lineas: 12, lineasConDiferencia: 3 })).toBe("con_diferencia");
  });
});

describe("ultimoConteoConPrendas", () => {
  it("salta el abierto y los vacíos", () => {
    const conteos = [
      { numero: 6, estado: "abierto", lineas: 3 },
      { numero: 5, estado: "cerrado", lineas: 0 },
      { numero: 4, estado: "cerrado", lineas: 18 },
      { numero: 3, estado: "cerrado", lineas: 9 },
    ];
    expect(ultimoConteoConPrendas(conteos)?.numero).toBe(4);
  });

  it("sin ningún conteo con prendas devuelve null (los 4 de TRU al 2026-09-22)", () => {
    expect(ultimoConteoConPrendas([{ estado: "cerrado", lineas: 0 }, { estado: "cerrado", lineas: 0 }])).toBeNull();
  });
});

describe("pendientesSinCifras", () => {
  it("solo lo no contado, y SIN la cantidad del sistema", () => {
    const res = pendientesSinCifras([fila(), fila({ variante_id: "v2", origen: "contado", contada: 3 })]);
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual({ varianteId: "v1", sku: "BLU-EMMA-M-NEG", referencia: "Blusa Emma", talla: "M", color: "Negro" });
    expect(Object.keys(res[0])).not.toContain("sistema");
    expect(JSON.stringify(res)).not.toContain('"4"');
  });

  it("una variante en piso y almacén sale una sola vez", () => {
    expect(pendientesSinCifras([fila(), fila({ sistema: 2 })])).toHaveLength(1);
  });

  it("las tallas van en el orden del rack, no alfabético", () => {
    expect(["L", "S", "XL", "M", "XS"].sort(compararTallas)).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(["36", "28", "30"].sort(compararTallas)).toEqual(["28", "30", "36"]);
    expect(["Única", "M", "S"].sort(compararTallas)).toEqual(["S", "M", "Única"]);
    expect([null, "S"].sort(compararTallas)).toEqual(["S", null]);
  });

  it("ordena por nombre y talla, para recorrer el rack", () => {
    const res = pendientesSinCifras([
      fila({ variante_id: "a", referencia: "Camisa Lino", talla: "S" }),
      fila({ variante_id: "b", referencia: "Blusa Emma", talla: "M" }),
      fila({ variante_id: "c", referencia: "Blusa Emma", talla: "L" }),
    ]);
    // Blusa Emma M antes que L (orden del rack), después Camisa Lino.
    expect(res.map((p) => p.varianteId)).toEqual(["b", "c", "a"]);
  });

  it("ignora filas sin variante (no se pueden contar)", () => {
    expect(pendientesSinCifras([fila({ variante_id: null })])).toEqual([]);
  });
});

describe("nuevaCantidad", () => {
  it("un escaneo suma 1 sobre lo ya anotado, y la primera lectura es 1", () => {
    expect(nuevaCantidad(undefined, { tipo: "suma", paso: 1 })).toBe(1);
    expect(nuevaCantidad(4, { tipo: "suma", paso: 1 })).toBe(5);
  });

  it("el botón − nunca baja de 0", () => {
    expect(nuevaCantidad(0, { tipo: "suma", paso: -1 })).toBe(0);
    expect(nuevaCantidad(undefined, { tipo: "suma", paso: -1 })).toBe(0);
  });

  it("escribir reemplaza; solo enteros ≥ 0", () => {
    expect(nuevaCantidad(4, { tipo: "fijar", valor: "12" })).toBe(12);
    expect(nuevaCantidad(4, { tipo: "fijar", valor: 0 })).toBe(0);
    expect(nuevaCantidad(4, { tipo: "fijar", valor: "" })).toBeNull();
    expect(nuevaCantidad(4, { tipo: "fijar", valor: "-1" })).toBeNull();
    expect(nuevaCantidad(4, { tipo: "fijar", valor: "2.5" })).toBeNull();
    expect(nuevaCantidad(4, { tipo: "fijar", valor: "abc" })).toBeNull();
  });
});

describe("modoConteoValido y tocar", () => {
  it("cualquier valor guardado raro vuelve a «suma»", () => {
    expect(modoConteoValido("escribir")).toBe("escribir");
    expect(modoConteoValido("suma")).toBe("suma");
    expect(modoConteoValido(null)).toBe("suma");
    expect(modoConteoValido("otra-cosa")).toBe("suma");
  });

  it("lo último tocado va al final (se pinta arriba), sin duplicarse", () => {
    expect(tocar(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
    expect(tocar(["a"], "z")).toEqual(["a", "z"]);
  });
});

describe("crearColaEnSerie", () => {
  it("escribe en el orden en que se leyó aunque la primera respuesta tarde más", async () => {
    const cola = crearColaEnSerie();
    const escrito: number[] = [];
    const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await Promise.all([
      cola.agregar(async () => {
        await esperar(30);
        escrito.push(1);
      }),
      cola.agregar(async () => {
        await esperar(1);
        escrito.push(2);
      }),
      cola.agregar(async () => {
        escrito.push(3);
      }),
    ]);
    expect(escrito).toEqual([1, 2, 3]);
  });

  it("una tarea que falla no frena las que siguen, y su error llega a quien la encoló", async () => {
    const cola = crearColaEnSerie();
    const falla = cola.agregar(async () => {
      throw new Error("sin red");
    });
    const sigue = cola.agregar(async () => "ok");
    await expect(falla).rejects.toThrow("sin red");
    await expect(sigue).resolves.toBe("ok");
  });

  it("vaciar espera a que no quede nada por guardar", async () => {
    const cola = crearColaEnSerie();
    let listo = false;
    void cola.agregar(async () => {
      await new Promise((r) => setTimeout(r, 10));
      listo = true;
    });
    expect(cola.pendientes).toBe(1);
    await cola.vaciar();
    expect(listo).toBe(true);
    expect(cola.pendientes).toBe(0);
  });
});

describe("pendientesEnAlcance y avanceEnVivo", () => {
  const p = (id: string) => ({ varianteId: id, sku: id, referencia: id, talla: null, color: null });
  const categoriaDe = new Map<string, string | null>([
    ["b1", "Camisas y Blusas"],
    ["b2", "Camisas y Blusas"],
    ["v1", "Vestidos"],
  ]);

  it("un conteo «Solo Camisas y Blusas» solo lista blusas; «todo el catálogo» no filtra", () => {
    expect(pendientesEnAlcance([p("b1"), p("v1"), p("b2")], categoriaDe, "Camisas y Blusas").map((x) => x.varianteId)).toEqual(["b1", "b2"]);
    expect(pendientesEnAlcance([p("b1"), p("v1")], categoriaDe, null)).toHaveLength(2);
  });

  it("al contar una prenda sale de pendientes y suma a contadas; el total no cambia", () => {
    const antes = avanceEnVivo(new Set(), [p("b1"), p("b2")]);
    const despues = avanceEnVivo(new Set(["b1"]), [p("b1"), p("b2")]);
    expect(antes).toMatchObject({ contadas: 0, total: 2, porcentaje: 0 });
    expect(despues).toMatchObject({ contadas: 1, total: 2, porcentaje: 50 });
    expect(despues.pendientes.map((x) => x.varianteId)).toEqual(["b2"]);
  });

  it("una prenda contada fuera de la lista (sin stock en el sistema) suma al total", () => {
    expect(avanceEnVivo(new Set(["nueva"]), [p("b1")])).toMatchObject({ contadas: 1, total: 2, porcentaje: 50 });
  });

  it("sin nada que contar, 0 % y no NaN", () => {
    expect(avanceEnVivo(new Set(), [])).toMatchObject({ contadas: 0, total: 0, porcentaje: 0 });
  });
});

// El código de la etiqueta (2026-09-26). En producción 128 de 130 variantes tienen `sku` NULL (ADR-0058) pero
// `variantes.codigo` existe en 129: las pantallas del conteo que leían solo `sku` mostraban un hueco justo donde la
// colaboradora busca qué talla y color es, y la caja de escanear no encontraba «POL-0004» aunque la prenda existiera.
describe("prioridadDesdeFila", () => {
  const fila = { variante_id: "v1", sku: null, referencia: "Polo Basic", talla: "L", color: "Violeta", sububicacion_id: "s1", dias_sin_contar: null, valor_en_riesgo: "120.5" };

  it("una variante sin sku y con código en la etiqueta muestra el código", () => {
    const p = prioridadDesdeFila(fila, { colorHex: "#6d3fa0", fotoUrl: null, codigo: "POL-0004-VIO-L" });
    expect(p.sku).toBe("POL-0004-VIO-L");
    expect(p.valorEnRiesgo).toBe(120.5);
    expect(p.apariencia?.colorHex).toBe("#6d3fa0");
  });

  it("sin código pero con el sku legado que trajo la función, cae al sku", () => {
    expect(prioridadDesdeFila({ ...fila, sku: "POL-BASIC-VIO-L" }, { colorHex: null, fotoUrl: null, codigo: "" }).sku).toBe("POL-BASIC-VIO-L");
  });

  it("si la lectura decorativa falló (sin apariencia), no inventa: sku de la función o vacío", () => {
    expect(prioridadDesdeFila({ ...fila, sku: "POL-BASIC-VIO-L" }).sku).toBe("POL-BASIC-VIO-L");
    expect(prioridadDesdeFila(fila).sku).toBe("");
  });
});

describe("codigosDeConteo y coincidenciasPorCodigo", () => {
  const sinSku = { varianteId: "v1", sku: "", codigo: "POL-0004-VIO-L", codigosBarras: ["POL-0004-VIO-L", "7750000000012"] };
  const conSkuLegado = { varianteId: "v2", sku: "VES-SOFI-NEG-M", codigo: "VES-0002-NEG-M", codigosBarras: ["VES-0002-NEG-M"] };
  const soloSku = { varianteId: "v3", sku: "LEGADO-1", codigo: null, codigosBarras: ["LEGADO-1"] };
  const catalogo = [sinSku, conSkuLegado, soloSku].map((v) => ({ varianteId: v.varianteId, referencia: "x", ...codigosDeConteo(v) }));

  it("una variante sin sku y con código: el campo `sku` es el código y se puede buscar por él", () => {
    expect(catalogo[0].sku).toBe("POL-0004-VIO-L");
    // Tecleado a medias: antes no encontraba nada y la pantalla ofrecía «Dar de alta esta prenda» para una que sí existía.
    expect(coincidenciasPorCodigo("pol-0004", catalogo).map((v) => v.varianteId)).toEqual(["v1"]);
  });

  it("con sku y sin código cae al sku, y no lo duplica entre los códigos de barras", () => {
    expect(catalogo[2].sku).toBe("LEGADO-1");
    expect(catalogo[2].codigosBarras).toEqual(["LEGADO-1"]);
  });

  it("con código y con sku legado: se muestra el código, pero el sku de siempre sigue resolviendo al escanear", () => {
    expect(catalogo[1].sku).toBe("VES-0002-NEG-M");
    expect(catalogo[1].codigosBarras).toEqual(["VES-0002-NEG-M", "VES-SOFI-NEG-M"]);
    expect(coincidenciasPorCodigo("ves-sofi-neg-m", catalogo).map((v) => v.varianteId)).toEqual(["v2"]);
  });

  it("el código de barras se acepta solo exacto; texto vacío no devuelve nada", () => {
    expect(coincidenciasPorCodigo("7750000000012", catalogo).map((v) => v.varianteId)).toEqual(["v1"]);
    expect(coincidenciasPorCodigo("775000", catalogo)).toEqual([]);
    expect(coincidenciasPorCodigo("   ", catalogo)).toEqual([]);
  });
});

describe("codigoDePrendaNueva y pendientesConCodigo", () => {
  it("una prenda dada de alta al vuelo (nace sin sku) muestra el código de barras que se escaneó, no un hueco", () => {
    expect(codigoDePrendaNueva({ sku: null, codigo_barras: "7750000000099" })).toBe("7750000000099");
  });

  it("si la base devuelve el código de la etiqueta, gana ese; el sku legado va detrás", () => {
    expect(codigoDePrendaNueva({ sku: null, codigo: "POL-0009-NEG-M", codigo_barras: "7750000000099" })).toBe("POL-0009-NEG-M");
    expect(codigoDePrendaNueva({ sku: "VIEJO-1", codigo: null, codigo_barras: "7750000000099" })).toBe("VIEJO-1");
  });

  it("«Faltan por contar» dice el código de la etiqueta del catálogo; sin él se queda el de la función", () => {
    const pendientes = [
      { varianteId: "a", sku: "7750000000001", referencia: "A", talla: "M", color: null },
      { varianteId: "b", sku: "BLU-0002-NEG-S", referencia: "B", talla: "S", color: null },
    ];
    const r = pendientesConCodigo(pendientes, new Map([["a", "BLU-0001-NEG-M"]]));
    expect(r.map((p) => p.sku)).toEqual(["BLU-0001-NEG-M", "BLU-0002-NEG-S"]);
    // No toca el arreglo de entrada.
    expect(pendientes[0].sku).toBe("7750000000001");
  });
});
