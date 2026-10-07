import { describe, expect, it } from "vitest";
import type { PrendaSede } from "./analisis-tipos";
import { armarPrendas } from "./analisis-armado";

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
