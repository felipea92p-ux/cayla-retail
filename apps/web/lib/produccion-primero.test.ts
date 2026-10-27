import { describe, expect, it } from "vitest";
import { filasPorModelo } from "./produccion-decisiones";
import type { DemandaVariante } from "./produccion-decision-reglas";
import { fraseDeModelo, porqueDeModelo, queFabricarPrimero } from "./produccion-primero";

// Un modelo de una sola variante: `ventas` en 30 días y `stock` en tiendas. Se mide con filasPorModelo (la regla real), no con filas inventadas.
const demanda = (id: string, ventas: number, stock: number, extra: Partial<DemandaVariante> = {}): DemandaVariante => ({
  varianteId: `v-${id}`,
  productoId: `p-${id}`,
  stockRed: stock,
  stockTaller: 0,
  enCamino: 0,
  ritmoDia: ventas / 10,
  sedesConRitmo: 1,
  ventasNetas: ventas,
  ventasBase: ventas,
  cobertura: { tipo: stock <= 0 ? "agotado" : "medida", dias: stock / (ventas / 10) },
  banda: stock <= 0 ? "agotado" : "critica",
  ...extra,
});
const modelos = (...ids: string[]) => ids.map((id) => ({ productoId: `p-${id}`, referencia: `Modelo ${id}`, variantesIds: [`v-${id}`] }));
const filas = (ds: DemandaVariante[], enProd: Record<string, number> = {}) =>
  filasPorModelo(ds, modelos(...ds.map((d) => d.productoId.slice(2))), enProd);

describe("«¿Qué fabrico primero?» (Formidable, Producción ▸ Resumen)", () => {
  it("parte los modelos de «Producir ya» por cuántas ventas los respaldan: 3 o más son firmes, 1 o 2 se vigilan", () => {
    const r = queFabricarPrimero(filas([demanda("a", 12, 0), demanda("b", 2, 0), demanda("c", 3, 0), demanda("d", 1, 0)]));
    expect(r.firmes.map((f) => f.referencia).sort()).toEqual(["Modelo a", "Modelo c"]);
    expect(r.vigilar.map((f) => f.referencia).sort()).toEqual(["Modelo b", "Modelo d"]);
  });

  it("solo entra lo que hoy dice «Producir ya»: un modelo con stock de sobra no aparece", () => {
    const r = queFabricarPrimero(filas([demanda("a", 12, 0), demanda("b", 5, 500)]));
    expect([...r.firmes, ...r.vigilar].map((f) => f.referencia)).toEqual(["Modelo a"]);
  });

  it("la cantidad es la de «Nueva orden»; con poca base no se dice ninguna", () => {
    const r = queFabricarPrimero(filas([demanda("a", 12, 0), demanda("b", 2, 0)]));
    // 12 ventas en 10 días = 1,2 por día; 30 días de venta = 36 prendas, y no hay nada en tiendas, en camino ni en órdenes.
    expect(r.firmes[0].cantidad).toBe(36);
    expect(r.vigilar[0].cantidad).toBeNull();
  });

  it("la frase dice qué pasó, sin ritmo ni barras", () => {
    const [agotado] = filas([demanda("a", 12, 0)]);
    const [queda] = filas([demanda("b", 18, 4)]);
    expect(fraseDeModelo(agotado)).toBe("Se agotó en las tiendas · vendió 12 en el último mes");
    expect(fraseDeModelo(queda)).toBe("Quedan 4 en tiendas · vendió 18 en el último mes");
    expect(fraseDeModelo(agotado)).not.toMatch(/semana|cobertura|ritmo/i);
  });

  it("el «¿Por qué?» trae la cuenta y dice por qué no hay cantidad con poca base", () => {
    const [firme] = filas([demanda("a", 12, 0)]);
    const [poca] = filas([demanda("b", 2, 0)]);
    expect(porqueDeModelo(firme)).toContain("Vendió 12 en los últimos 30 días");
    expect(porqueDeModelo(firme)).toContain("hacen falta unas 36 prendas");
    expect(porqueDeModelo(poca)).toContain("no sugerimos una cantidad");
    expect(porqueDeModelo(poca)).not.toContain("hacen falta");
  });

  it("lo que ya está en camino, en el Taller o en una orden se dice, para no pedir de más", () => {
    const [m] = filas([demanda("a", 12, 0, { stockTaller: 5, enCamino: 3 })], { "v-a": 10 });
    const t = porqueDeModelo(m);
    expect(t).toContain("En el Taller ya hay 5 terminadas");
    expect(t).toContain("Vienen 3 en camino");
    expect(t).toContain("Ya hay una orden abierta de 10 prendas, pero no alcanza");
  });

  it("la frase de arriba nunca afirma «ninguno tiene orden» delante de una orden", () => {
    const sin = queFabricarPrimero(filas([demanda("a", 12, 0), demanda("b", 12, 0)]));
    expect(sin.presentacion).toBe("Estos modelos se están agotando y sí se venden. Hoy ninguno tiene una orden abierta.");
    const algunos = queFabricarPrimero(filas([demanda("a", 12, 0), demanda("b", 12, 0)], { "v-a": 2 }));
    expect(algunos.presentacion).toContain("Uno ya tiene una orden abierta, pero no alcanza");
    expect(algunos.presentacion).not.toContain("ninguno");
    const todos = queFabricarPrimero(filas([demanda("a", 12, 0), demanda("b", 12, 0)], { "v-a": 2, "v-b": 2 }));
    expect(todos.presentacion).toContain("Ya tienen una orden abierta");
  });

  it("conserva el orden de la tabla: el más urgente primero", () => {
    const r = queFabricarPrimero(filas([demanda("lento", 4, 0), demanda("rapido", 20, 0)]));
    expect(r.firmes.map((f) => f.referencia)).toEqual(["Modelo rapido", "Modelo lento"]);
  });

  it("sin modelos por producir devuelve listas vacías (la pantalla dice «todo al día», no inventa)", () => {
    const r = queFabricarPrimero(filas([demanda("a", 5, 900)]));
    expect(r.firmes).toEqual([]);
    expect(r.vigilar).toEqual([]);
  });
});
