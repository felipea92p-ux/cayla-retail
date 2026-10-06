import { describe, expect, it } from "vitest";
import type { PrendaSede } from "./analisis-tipos";
import { armarPrendas, resumenDeSede } from "./analisis-armado";

// Datos inventados para la prueba.
function fila(parcial: Partial<PrendaSede>): PrendaSede {
  return {
    varianteId: "v1",
    productoId: "p1",
    nombre: "Body Sonali",
    color: "Terracota",
    colorHex: "#B3573F",
    talla: "M",
    categoria: "Bodys",
    categoriaPrefijo: "BOD",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 40,
    costo: 16,
    origen: "taller",
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    ...parcial,
  };
}

const aqp = { id: "aqp", codigo: "AQP", nombre: "Tienda AQP", ciudad: "Arequipa" };
const lim = { id: "lim", codigo: "LIM", nombre: "Tienda LIM", ciudad: "Lima" };

describe("las prendas de mi tienda con su red", () => {
  it("cada otra tienda aparece, aunque no tenga nada", () => {
    const [p] = armarPrendas([fila({ piso: 0, almacen: 1, vendidas30: 4 })], [{ sede: aqp, filas: [fila({ piso: 3, almacen: 2 })] }, { sede: lim, filas: [] }], {});
    expect(p!.otras).toEqual([
      { sedeId: "aqp", stock: 5, vendidas30: 0 },
      { sedeId: "lim", stock: 0, vendidas30: 0 },
    ]);
    expect(p!.llega).toEqual([]);
  });
  it("trae lo que viene en camino de esa prenda", () => {
    const [p] = armarPrendas([fila({})], [], { v1: [{ de: "compra", cantidad: 10, fecha: "2026-10-15" }] });
    expect(p!.llega).toEqual([{ de: "compra", cantidad: 10, fecha: "2026-10-15" }]);
  });
});

describe("el resumen de una tienda", () => {
  it("cuenta lo que se acaba y lo que no se mueve desde el umbral (no lo que solo se vigila)", () => {
    const prendas = armarPrendas(
      [
        fila({ varianteId: "a", vendidas30: 6 }), // agotada: se acaba
        fila({ varianteId: "b", piso: 3, diasSinVender: 70 }), // quieta: liquidar
        fila({ varianteId: "c", piso: 3, diasSinVender: 40 }), // se vigila
        fila({ varianteId: "d", piso: 9, vendidas30: 3, llegaron30: 10, vendidasDeLasQueLlegaron30: 7 }),
      ],
      [],
      {},
    );
    const r = resumenDeSede("tru", prendas, 60, false);
    expect(r).toMatchObject({ sedeId: "tru", seAcaban: 1, noSeMueven: 1, vendioDe10: 7, unidades: 15, puedeHablar: false });
  });
});
