import { describe, expect, it } from "vitest";
import { mapearEnRed, mapearFila, type FilaCruda } from "./resumen-mapeo";

const base: FilaCruda = { variante_id: "v1", producto_id: "p1", referencia: "Blusa Camila" };

describe("mapear una fila de la RPC", () => {
  it("un dato que falta NO se convierte en cero cuando cero significaría algo distinto", () => {
    const f = mapearFila(base);
    // Unidades que faltan: cero. Días o precio que faltan: «no hay dato».
    expect(f.piso).toBe(0);
    expect(f.ventas).toBe(0);
    expect(f.diasConStock).toBeNull();
    expect(f.diasObservables).toBeNull();
    expect(f.precio).toBeNull();
    expect(f.costo).toBeNull();
    expect(f.estadoCosto).toBeNull();
  });

  it("lee números que PostgREST manda como texto (numeric)", () => {
    const f = mapearFila({ ...base, precio: "129.90" as unknown as number, costo: "40.5" as unknown as number, dias_con_stock: "22.654" as unknown as number });
    expect(f.precio).toBe(129.9);
    expect(f.costo).toBe(40.5);
    expect(f.diasConStock).toBeCloseTo(22.654, 3);
  });

  it("lo utilizable es piso + almacén donde hay separación, y todo lo no dañado donde no", () => {
    expect(mapearFila({ ...base, separa_piso_almacen: true, piso: 2, almacen: 5, disponible: 9 }).utilizable).toBe(7);
    expect(mapearFila({ ...base, separa_piso_almacen: false, piso: 0, almacen: 0, disponible: 9 }).utilizable).toBe(9);
  });

  it("un ledger que no se informó se da por bueno; uno que dice false, no", () => {
    expect(mapearFila(base).ledgerConsistente).toBe(true);
    expect(mapearFila({ ...base, ledger_consistente: false }).ledgerConsistente).toBe(false);
  });

  it("valores desconocidos de estado de costo u origen no se cuelan", () => {
    const f = mapearFila({ ...base, estado_costo: "raro", origen_abastecimiento: "otro" });
    expect(f.estadoCosto).toBeNull();
    expect(f.origenAbastecimiento).toBeNull();
    expect(mapearFila({ ...base, estado_costo: "declarado", origen_abastecimiento: "produccion" })).toMatchObject({ estadoCosto: "declarado", origenAbastecimiento: "produccion" });
  });

  it("producto sin estado se considera activo; códigos de barras nulos son una lista vacía", () => {
    const f = mapearFila({ ...base, producto_estado: null, codigos_barras: null });
    expect(f.productoEstado).toBe("activo");
    expect(f.codigosBarras).toEqual([]);
  });
});

describe("mapear lo que tienen las otras sedes", () => {
  it("nada o algo que no es una lista: sin red", () => {
    expect(mapearEnRed(null)).toEqual([]);
    expect(mapearEnRed({})).toEqual([]);
  });

  it("una sede con sus números; el tipo desconocido cae en tienda", () => {
    const [taller, rara] = mapearEnRed([
      { ubicacion_id: "u1", nombre: "Taller", tipo: "taller", disponible: 15, almacen: 15, dias_con_stock: 30, ventas_ventana: 0 },
      { ubicacion_id: "u2", nombre: "Otra", tipo: "bodega", separa_piso_almacen: true, piso: 3, almacen: 4, disponible: 7 },
    ]);
    expect(taller).toMatchObject({ tipo: "taller", disponible: 15, utilizable: 15, diasConStock: 30, ledgerConsistente: true });
    expect(rara).toMatchObject({ tipo: "tienda", utilizable: 7, diasConStock: null });
  });
});
