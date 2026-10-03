import { describe, expect, it } from "vitest";
import {
  armarMatriz,
  cambiosDeStock,
  cantidadDeCelda,
  conPaso,
  fijarCelda,
  grupoDeStockEnHoja,
  hrefEtiquetasDeSubidas,
  juntarSubidas,
  lineasDelLote,
  minimoDeCelda,
  pasoDeCelda,
  rangoDePrecios,
  resumenVariantes,
  tonoDeBarra,
  totalesMatriz,
} from "./matriz-ficha-reglas";
import type { VarianteAjuste } from "./ajuste-reglas";
import type { FilaFicha, NombresFicha } from "./variantes-ficha-reglas";

const TALLAS: Record<string, string> = { s: "S", m: "M", l: "L", xl: "XL" };
const n: NombresFicha = { color: (c) => c ?? "Sin color", talla: (t) => (t ? TALLAS[t] : "") };

function fila(color: string | null, talla: string | null, extra: Partial<FilaFicha> = {}): FilaFicha {
  const id = `${color}-${talla}`;
  return {
    clave: id,
    id,
    colorCodigo: color,
    tallaId: talla,
    guardada: { colorCodigo: color, tallaId: talla, precio: "69", costo: "30", activo: true, codigo: null, etiquetaIds: [] },
    codigosBarras: [],
    precio: "69",
    costo: "30",
    costoFijo: false,
    activo: true,
    etiquetaIds: [],
    ...extra,
  };
}

function variante(id: string, o: Partial<VarianteAjuste> = {}): VarianteAjuste {
  return {
    varianteId: id,
    sku: id,
    talla: null,
    color: null,
    stockPiso: 0,
    stockAlmacen: 0,
    stockSinDividir: 0,
    apartadoPiso: 0,
    apartadoAlmacen: 0,
    apartadoSinDividir: 0,
    sinHistoria: false,
    ...o,
  };
}

describe("armarMatriz", () => {
  it("toma los colores en el orden de la ficha y las tallas en orden de curva, solo de las activas", () => {
    const m = armarMatriz([fila("CRU", "l"), fila("NEG", "s"), fila("CRU", "s"), fila("AZU", "xl", { activo: false }), fila("CRU", "m")], n);
    expect(m.colores).toEqual(["CRU", "NEG"]);
    expect(m.tallas).toEqual(["s", "m", "l"]);
    expect(m.celda("NEG", "s")?.id).toBe("NEG-s");
    expect(m.celda("NEG", "m")).toBeUndefined();
    expect(m.celda("AZU", "xl")).toBeUndefined();
  });

  it("una prenda sin talla deja una sola columna al final", () => {
    const m = armarMatriz([fila("CRU", null), fila("CRU", "s")], n);
    expect(m.tallas).toEqual(["s", null]);
  });
});

describe("la celda: número, piso y paso", () => {
  it("el número es el stock de hoy en el lugar más lo tocado, nunca arranca en 0 si hay stock", () => {
    const v = variante("a", { stockAlmacen: 4, stockPiso: 2 });
    expect(cantidadDeCelda(v, "almacen", 0)).toBe(4);
    expect(cantidadDeCelda(v, "piso", 1)).toBe(3);
    expect(cantidadDeCelda(undefined, "almacen", 0)).toBe(0);
  });

  it("no baja de cero ni de lo apartado para clientas", () => {
    expect(pasoDeCelda(0, 0, -1, 0)).toBeNull();
    expect(pasoDeCelda(2, -1, -1, 0)).toBe(-2);
    expect(pasoDeCelda(2, -2, -1, 0)).toBeNull();
    const v = variante("a", { stockAlmacen: 3, apartadoAlmacen: 2 });
    const min = minimoDeCelda(v, "almacen");
    expect(min).toBe(2);
    expect(pasoDeCelda(3, 0, -1, min)).toBe(-1);
    expect(pasoDeCelda(3, -1, -1, min)).toBeNull();
    expect(pasoDeCelda(0, 4, 1, 0)).toBe(5);
  });

  it("lo que vuelve a 0 deja de estar pendiente", () => {
    expect(conPaso({ a: 1 }, "a", 0)).toEqual({});
    expect(conPaso({}, "a", -1)).toEqual({ a: -1 });
  });
});

describe("lineasDelLote", () => {
  const vs = [variante("a", { stockAlmacen: 4 }), variante("b", { stockAlmacen: 0 }), variante("c", { stockAlmacen: 9 })];

  it("con «Conteo físico» escribe cuántas hay, y la base recibe la misma diferencia", () => {
    const l = lineasDelLote(vs, { a: 2, b: 1 }, "almacen", "conteo_fisico");
    expect(l.map((x) => [x.variante.varianteId, x.delta, x.resultado])).toEqual([
      ["a", 2, 6],
      ["b", 1, 1],
    ]);
  });

  it("con los demás motivos, suma o resta; el resultado es el mismo", () => {
    const l = lineasDelLote(vs, { a: 2, c: -3 }, "almacen", "merma");
    expect(l.map((x) => [x.variante.varianteId, x.delta, x.resultado])).toEqual([
      ["a", 2, 6],
      ["c", -3, 6],
    ]);
  });

  it("lo que no se tocó no viaja", () => {
    expect(lineasDelLote(vs, {}, "almacen", "conteo_fisico")).toEqual([]);
  });
});

describe("totalesMatriz", () => {
  it("suma por color, por talla y general lo que muestra cada celda", () => {
    const m = armarMatriz([fila("CRU", "s"), fila("CRU", "m"), fila("NEG", "s")], n);
    const num: Record<string, number> = { "CRU-s": 6, "CRU-m": 9, "NEG-s": 3 };
    const t = totalesMatriz(m, (f) => num[f.id!]);
    expect(t.porColor.get("CRU")).toBe(15);
    expect(t.porTalla.get("s")).toBe(9);
    expect(t.total).toBe(18);
  });
});

describe("textos", () => {
  it("la barra se apaga en 0 y avisa con 3 o menos", () => {
    expect(tonoDeBarra(0)).toBe("cero");
    expect(tonoDeBarra(3)).toBe("bajo");
    expect(tonoDeBarra(4)).toBe("normal");
  });

  it("el rango de precios", () => {
    expect(rangoDePrecios([69, 89, 79])).toBe("S/ 69–89");
    expect(rangoDePrecios([69.9, 69.9])).toBe("S/ 69.90");
    expect(resumenVariantes([fila("CRU", "s"), fila("NEG", "s", { precio: "89" }), fila("NEG", "m", { activo: false })])).toBe("2 variantes activas · S/ 69–89");
  });
});

describe("stock que espera a «Revisar y guardar» (ADR-0313, act. 2026-10-02 noche)", () => {
  it("fijarCelda: lo escrito a mano es lo tocado contra el stock de hoy; nunca debajo de lo apartado ni algo que no es un entero", () => {
    expect(fijarCelda(4, 6, 0)).toBe(2);
    expect(fijarCelda(4, 1, 0)).toBe(-3);
    expect(fijarCelda(4, 4, 0)).toBe(0);
    expect(fijarCelda(4, 1, 2)).toBeNull();
    expect(fijarCelda(4, 2, 2)).toBe(-2);
    expect(fijarCelda(4, -1, 0)).toBeNull();
    expect(fijarCelda(4, 1.5, 0)).toBeNull();
  });

  it("cambiosDeStock: de cuánto a cuánto en el lugar que se ajusta, solo lo tocado", () => {
    const vs = [variante("a", { talla: "S", color: "Blanco", stockAlmacen: 4 }), variante("b", { talla: "M", color: "Blanco", stockAlmacen: 3 })];
    expect(cambiosDeStock(vs, { a: 2 }, "almacen")).toEqual([{ varianteId: "a", color: "Blanco", talla: "S", antes: 4, despues: 6 }]);
    expect(cambiosDeStock(vs, { b: -1 }, "piso")).toEqual([{ varianteId: "b", color: "Blanco", talla: "M", antes: 0, despues: -1 }]);
    expect(cambiosDeStock(vs, {}, "almacen")).toEqual([]);
  });

  it("grupoDeStockEnHoja: una línea por talla y la nota con motivo, lugar y las etiquetas si algo sube", () => {
    expect(grupoDeStockEnHoja([], "Conteo físico", "en el almacén")).toBeNull();
    const g = grupoDeStockEnHoja(
      [
        { varianteId: "a", color: "Blanco", talla: "S", antes: 4, despues: 6 },
        { varianteId: "b", color: "Rojo", talla: null, antes: 3, despues: 2 },
      ],
      "Conteo físico",
      "en el almacén"
    )!;
    expect(g.lineas).toEqual([
      { texto: "S · Blanco", antes: "4", despues: "6" },
      { texto: "Única · Rojo", antes: "3", despues: "2" },
    ]);
    expect(g.nota).toBe("Se registra como «Conteo físico» en el almacén. Entran 2 unidades: al guardar te propone imprimir sus etiquetas.");
    expect(grupoDeStockEnHoja([{ varianteId: "b", color: "Rojo", talla: "M", antes: 3, despues: 2 }], "Merma", "en esta sede")!.nota).toBe(
      "Se registra como «Merma» en esta sede."
    );
  });

  it("juntarSubidas y hrefEtiquetasDeSubidas: una etiqueta por unidad nueva, sumando lo que se repite", () => {
    const una = juntarSubidas([], [{ varianteId: "a", color: "Blanco", talla: "S", unidades: 2 }, { varianteId: "b", color: "Rojo", talla: "M", unidades: 0 }]);
    const dos = juntarSubidas(una, [{ varianteId: "a", color: "Blanco", talla: "S", unidades: 1 }, { varianteId: "c", color: "Rojo", talla: "L", unidades: 4 }]);
    expect(dos.map((s) => [s.varianteId, s.unidades])).toEqual([["a", 3], ["c", 4]]);
    expect(una[0].unidades).toBe(2);
    expect(hrefEtiquetasDeSubidas(dos)).toBe("/etiquetas-de-precio?unidades=a:3,c:4");
    expect(hrefEtiquetasDeSubidas([])).toBeNull();
  });
});
