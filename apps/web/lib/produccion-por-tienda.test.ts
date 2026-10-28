import { describe, expect, it } from "vitest";
import { demandaDeLaRed } from "./produccion-decision-reglas";
import { demandaPorSede, type SedeConFilas } from "./produccion-por-tienda";
import type { FilaResumen } from "./resumen-reglas";

// Una fila mínima: solo lo que usan `velocidadDeFila` y la demanda.
const fila = (varianteId: string, extra: Partial<FilaResumen> = {}): FilaResumen =>
  ({ varianteId, productoId: "p1", utilizable: 0, enCamino: 0, ventas: 0, devoluciones: 0, diasConStock: 30, diasObservables: 30, ledgerConsistente: true, ...extra }) as FilaResumen;

const sede = (id: string, tipo: SedeConFilas["tipo"], filas: FilaResumen[]): SedeConFilas => ({ id, nombre: id, tipo, filas });

// Una red con de todo: ritmo medido y no medido (2 días de historia), devoluciones, un almacén, el Taller, una variante que una sede no nombra y una que no importa.
const RED: SedeConFilas[] = [
  sede("lim", "tienda", [fila("v1", { utilizable: 6, ventas: 30, enCamino: 2 }), fila("v2", { utilizable: 0, ventas: 9, devoluciones: 1 }), fila("fuera", { utilizable: 99, ventas: 99 })]),
  sede("aqp", "tienda", [fila("v1", { utilizable: 4, ventas: 15 }), fila("v2", { utilizable: 1, ventas: 5, diasConStock: 2, diasObservables: 2 })]),
  sede("tru", "tienda", [fila("v2", { utilizable: 3, ventas: 3, enCamino: 1 })]),
  sede("alm", "almacen", [fila("v1", { utilizable: 7, enCamino: 0 })]),
  sede("taller", "taller", [fila("v1", { utilizable: 10, ventas: 4 }), fila("v2", { utilizable: 2 })]),
];
const IMPORTAN = new Set(["v1", "v2"]);

describe("demandaPorSede abre lo que demandaDeLaRed suma", () => {
  const porSede = demandaPorSede(RED, IMPORTAN);
  const red = demandaDeLaRed(RED.map((s) => ({ tipo: s.tipo, filas: s.filas })));
  const dePorSede = (varianteId: string) => porSede.filter((s) => s.tipo !== "taller").map((s) => s.porVariante[varianteId]).filter(Boolean);

  it.each(["v1", "v2"])("la suma de las sedes que venden da las cifras de la red en %s (ventas, stock, en camino, ritmo, base)", (id) => {
    const cs = dePorSede(id);
    const r = red.get(id)!;
    expect(cs.reduce((a, c) => a + c.ventas, 0)).toBe(r.ventasNetas);
    expect(cs.reduce((a, c) => a + c.stock, 0)).toBe(r.stockRed);
    expect(cs.reduce((a, c) => a + c.enCamino, 0)).toBe(r.enCamino);
    expect(cs.reduce((a, c) => a + c.ventasBase, 0)).toBe(r.ventasBase);
    const ritmos = cs.map((c) => c.ritmoDia).filter((x): x is number => x !== null);
    expect(ritmos.length ? ritmos.reduce((a, b) => a + b, 0) : null).toBe(r.ritmoDia);
  });
  it("el Taller no vende ni mide ritmo y su stock es el de `stockTaller`", () => {
    const t = porSede.find((s) => s.tipo === "taller")!;
    expect(t.porVariante.v1).toEqual({ ventas: 0, stock: 10, enCamino: 0, ritmoDia: null, ventasBase: 0 });
    expect(t.porVariante.v1.stock).toBe(red.get("v1")!.stockTaller);
  });
  it("una sede con poco historial cuenta sus ventas pero no afirma ritmo", () => {
    const aqpV2 = porSede.find((s) => s.id === "aqp")!.porVariante.v2;
    expect(aqpV2.ventas).toBe(5);
    expect(aqpV2.ritmoDia).toBeNull();
    expect(aqpV2.ventasBase).toBe(0);
  });
  it("solo guarda las variantes que importan y no guarda las que no tienen nada (el mensaje al navegador no carga filas vacías)", () => {
    for (const s of porSede) expect(Object.keys(s.porVariante)).not.toContain("fuera");
    const vacio = demandaPorSede([sede("x", "tienda", [fila("v1")])], IMPORTAN);
    expect(vacio[0].porVariante).toEqual({});
  });
  it("conserva el orden de las sedes que recibe", () => {
    expect(porSede.map((s) => s.id)).toEqual(["lim", "aqp", "tru", "alm", "taller"]);
  });
});
