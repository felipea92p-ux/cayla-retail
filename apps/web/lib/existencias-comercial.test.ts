import { describe, expect, it } from "vitest";
import { DIAS_VENTANA, resumenComercial } from "./existencias-comercial";
import type { FilaSemana } from "./existencias-categorias";

function fila(o: Partial<FilaSemana> & Pick<FilaSemana, "varianteId" | "referencia">): FilaSemana {
  return {
    categoriaId: "c1",
    categoria: "Pantalones",
    sku: o.varianteId,
    talla: "S",
    color: "Negro",
    colorHex: "#111111",
    fotoUrl: null,
    precio: 100,
    costo: 60,
    utilizable: 0,
    stockInicial: 0,
    ventas: 0,
    devoluciones: 0,
    diasConStock: DIAS_VENTANA,
    diasObservables: DIAS_VENTANA,
    ledgerConsistente: true,
    ...o,
  };
}

describe("resumenComercial", () => {
  const filas = [
    // Una prenda que sale: dos tallas, ventas netas 6 + 3 = 9, hay 9 → al ritmo de 9/7 por día alcanza para 7 días.
    fila({ varianteId: "a-s", referencia: "Pantalón Carla", talla: "S", utilizable: 4, ventas: 7, devoluciones: 1 }),
    fila({ varianteId: "a-m", referencia: "Pantalón Carla", talla: "M", utilizable: 5, ventas: 3 }),
    // Una prenda con 10 en stock toda la semana y ninguna venta: quieta.
    fila({ varianteId: "b-s", referencia: "Blusa Emma", color: "Beige", categoriaId: "c2", categoria: "Blusas", utilizable: 10 }),
    // Una prenda que llegó ayer y no vendió: no es una prenda parada.
    fila({ varianteId: "c-s", referencia: "Casaca Ximena", categoriaId: "c2", categoria: "Blusas", utilizable: 8, diasConStock: 1 }),
  ];

  it("suma la sede y calcula el ritmo y la cobertura al ritmo de la semana", () => {
    const r = resumenComercial(filas, { esLider: true });
    expect(r.disponible).toBe(4 + 5 + 10 + 8);
    expect(r.vendidas).toBe(9);
    expect(r.udsPorDia).toBeCloseTo(9 / DIAS_VENTANA);
    expect(r.coberturaDias).toBeCloseTo(27 / (9 / DIAS_VENTANA));
  });

  it("una prenda suma sus tallas: vendidas netas y cobertura", () => {
    const r = resumenComercial(filas, { esLider: true });
    expect(r.rapidas).toHaveLength(1);
    expect(r.rapidas[0]).toMatchObject({ referencia: "Pantalón Carla", vendidas: 9, disponible: 9 });
    expect(r.rapidas[0].coberturaDias).toBeCloseTo(7);
  });

  it("solo es «quieta» la prenda con stock y sin ventas que tuvo stock toda la semana", () => {
    const r = resumenComercial(filas, { esLider: true });
    expect(r.quietas.map((p) => p.referencia)).toEqual(["Blusa Emma"]);
    expect(r.quietasTotal).toEqual({ prendas: 1, unidades: 10 });
  });

  it("las devoluciones no dejan las ventas netas bajo cero", () => {
    const r = resumenComercial([fila({ varianteId: "d", referencia: "Falda", utilizable: 3, ventas: 1, devoluciones: 4 })], { esLider: true });
    expect(r.vendidas).toBe(0);
    expect(r.coberturaDias).toBeNull();
  });

  it("el valor a precio de venta solo lo ve un líder", () => {
    expect(resumenComercial(filas, { esLider: true }).valorPrecio).toBe((4 + 5 + 10 + 8) * 100);
    const sinLider = resumenComercial(filas, { esLider: false });
    expect(sinLider.valorPrecio).toBeNull();
    expect(sinLider.quietas[0].valorPrecio).toBeNull();
  });

  it("agrupa por categoría, la que más vendió primero", () => {
    const r = resumenComercial(filas, { esLider: false });
    expect(r.categorias.map((c) => c.nombre)).toEqual(["Pantalones", "Blusas"]);
    expect(r.categorias[1]).toMatchObject({ disponible: 18, vendidas: 0, coberturaDias: null });
  });
});
