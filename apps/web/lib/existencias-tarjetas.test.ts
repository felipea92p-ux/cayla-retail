import { describe, expect, it } from "vitest";
import { agruparPorPrenda, type FilaPrenda, type PrendaAgrupada } from "./existencias-prendas";
import { agruparPorModelo, opcionesOrden, ordenarModelos, type ModeloPrendas } from "./existencias-tarjetas";

let n = 0;
const talla = (referencia: string, color: string, t: string | null, piso: number, almacen: number): FilaPrenda => ({
  varianteId: `v${++n}`,
  productoId: referencia,
  referencia,
  sku: `SKU-${n}`,
  talla: t,
  color,
  colorHex: null,
  fotoUrl: null,
  codigosBarras: [],
  pisoDisponible: piso,
  almacenDisponible: almacen,
  disponible: piso + almacen,
  apartado: 0,
  danado: 0,
  enTransito: 0,
  accionHoy: null,
  marca: null,
});

describe("agruparPorModelo", () => {
  const p = (productoId: string, color: string): PrendaAgrupada<FilaPrenda> => agruparPorPrenda([talla(productoId, color, "M", 0, 1)])[0];

  it("respeta el orden de llegada: el primer color que aparece decide dónde va la tarjeta del modelo", () => {
    const tarjetas = agruparPorModelo([p("Polo", "Azul"), p("Blusa", "Rojo"), p("Polo", "Negro")]);
    expect(tarjetas.map((t) => [t.productoId, t.colores.map((c) => c.color)])).toEqual([
      ["Polo", ["Azul", "Negro"]],
      ["Blusa", ["Rojo"]],
    ]);
  });

  it("cada tarjeta tiene una clave única en la lista (React la usa de llave y la tarjeta recuerda su color con ella)", () => {
    const claves = agruparPorModelo([p("Polo", "Azul"), p("Polo", "Negro"), p("Blusa", "Rojo")]).map((t) => t.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });
});

describe("ordenarModelos y opcionesOrden", () => {
  const modelo = (ref: string, piso: number, almacen: number): ModeloPrendas<FilaPrenda> => {
    const prenda = agruparPorPrenda([talla(ref, "Azul", "M", piso, almacen)])[0];
    return { clave: ref, productoId: ref, colores: [prenda] };
  };
  const lista = [modelo("Polo", 1, 9), modelo("Blusa", 5, 0), modelo("Abrigo", 3, 3)];
  const refs = (m: ModeloPrendas<FilaPrenda>[]) => m.map((x) => x.productoId);

  it("«Más relevantes» deja el orden en que llegó; los demás suman los colores de la tarjeta", () => {
    expect(refs(ordenarModelos(lista, "relevancia"))).toEqual(["Polo", "Blusa", "Abrigo"]);
    expect(refs(ordenarModelos(lista, "nombre"))).toEqual(["Abrigo", "Blusa", "Polo"]);
    expect(refs(ordenarModelos(lista, "mas-piso"))).toEqual(["Blusa", "Abrigo", "Polo"]);
    expect(refs(ordenarModelos(lista, "menos-piso"))).toEqual(["Polo", "Abrigo", "Blusa"]);
    expect(refs(ordenarModelos(lista, "mas-almacen"))).toEqual(["Polo", "Abrigo", "Blusa"]);
    expect(refs(ordenarModelos(lista, "mas-disponible"))).toEqual(["Polo", "Abrigo", "Blusa"]);
    expect(refs(ordenarModelos(lista, "menos-disponible"))).toEqual(["Blusa", "Abrigo", "Polo"]);
  });

  it("no reordena la lista que recibe", () => {
    ordenarModelos(lista, "nombre");
    expect(refs(lista)).toEqual(["Polo", "Blusa", "Abrigo"]);
  });

  it("donde no se separa piso y almacén (Taller) no hay «más en el piso»", () => {
    expect(opcionesOrden(false).map((o) => o.valor)).not.toContain("mas-piso");
    expect(opcionesOrden(true).map((o) => o.valor)).toContain("mas-almacen");
  });
});
