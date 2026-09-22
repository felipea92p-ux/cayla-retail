import { describe, it, expect } from "vitest";
import {
  avanceEnVivo,
  compararTallas,
  crearColaEnSerie,
  pendientesEnAlcance,
  modoConteoValido,
  nuevaCantidad,
  pendientesSinCifras,
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
