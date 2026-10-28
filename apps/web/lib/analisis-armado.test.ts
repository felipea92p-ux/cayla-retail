import { describe, expect, it } from "vitest";
import type { PrendaSede } from "./analisis-tipos";
import { armarPrendas, conPreciosDeMiTienda } from "./analisis-armado";
import { armarModelos } from "./analisis-modelo";
import { dineroDe, subtituloFicha } from "./analisis-ficha";

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
    salioAlPiso: null,
    llego: null,
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

describe("el precio de MI tienda (Felipe 2026-10-10)", () => {
  const talla = (varianteId: string, talla: string, extra: Partial<PrendaSede> = {}) => fila({ varianteId, talla, precio: 79.9, costo: 40, piso: 2, ...extra });
  const mias = [talla("s", "S"), talla("m", "M"), talla("l", "L")];

  it("la prenda con precio propio en mi tienda lo toma; las demás quedan igual", () => {
    const r = conPreciosDeMiTienda(mias, { s: 69.9, m: 69.9 });
    expect(r.map((p) => p.precio)).toEqual([69.9, 69.9, 79.9]);
  });
  it("un precio propio MÁS ALTO que el de la prenda también gana", () => {
    expect(conPreciosDeMiTienda(mias, { l: 89.9 }).map((p) => p.precio)).toEqual([79.9, 79.9, 89.9]);
  });
  it("sin lectura o sin precios propios, las mismas prendas (nada cambia)", () => {
    expect(conPreciosDeMiTienda(mias, undefined)).toBe(mias);
    expect(conPreciosDeMiTienda(mias, {})).toBe(mias);
  });
  it("una prenda sin precio en la prenda también toma el de la tienda (precio null → el propio)", () => {
    expect(conPreciosDeMiTienda([talla("s", "S", { precio: null })], { s: 69.9 })[0]!.precio).toBe(69.9);
  });
  it("de las otras tiendas no se toca nada: solo unidades y ventas", () => {
    const [p] = armarPrendas(conPreciosDeMiTienda([talla("s", "S")], { s: 69.9 }), [{ sede: aqp, filas: [talla("s", "S", { precio: 79.9, piso: 3 })] }], {});
    expect(p!.precio).toBe(69.9);
    expect(p!.otras[0]).toEqual({ sedeId: "aqp", stock: 3, vendidas30: 0 });
  });
  it("de punta a punta: «Ganas por cada una» y el precio del modelo salen con el precio de la tienda", () => {
    const prendas = armarPrendas(conPreciosDeMiTienda(mias, { s: 69.9, m: 69.9, l: 69.9 }), [], {});
    expect(dineroDe(prendas[0]!).ganas).toBe("S/\u00a029.90");
    const [modelo] = armarModelos(prendas, "2026-10-11");
    expect(modelo!.precio).toBe(69.9);
    expect(subtituloFicha({ color: "Terracota", talla: "S", precio: prendas[0]!.precio })).toContain("69.90");
  });
});
