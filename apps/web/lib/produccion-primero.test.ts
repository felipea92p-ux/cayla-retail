import { describe, expect, it } from "vitest";
import { filasPorModelo } from "./produccion-decisiones";
import type { DemandaVariante } from "./produccion-decision-reglas";
import { AYUDA_PREPARAR_ORDEN, AYUDA_QUE_FABRICAR, TEXTO_PARA_VIGILAR, ayudaDeQueFabricar, porqueDeModelo, queFabricarPrimero } from "./produccion-primero";

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

  it("cada fila trae sus datos en piezas, no en una frase: lo que queda en tiendas, la venta por semana y las ventas del mes", () => {
    const r = queFabricarPrimero(filas([demanda("a", 12, 0), demanda("b", 18, 4), demanda("c", 2, 0)]));
    const de = (ref: string) => [...r.firmes, ...r.vigilar].find((f) => f.referencia === ref)!;
    // 12 ventas en 10 días = 1,2 por día = 8,4 por semana (el ritmo de esta prueba se mide en 10 días).
    expect(de("Modelo a")).toMatchObject({ enTiendas: 0, ventaPorSemana: (8.4).toLocaleString("es-PE"), ventasDelMes: 12 });
    expect(de("Modelo b")).toMatchObject({ enTiendas: 4, ventaPorSemana: (12.6).toLocaleString("es-PE"), ventasDelMes: 18 });
    expect(de("Modelo c")).toMatchObject({ enTiendas: 0, ventasDelMes: 2 });
    expect(JSON.stringify(r)).not.toContain("·");
  });

  it("el «¿Por qué?» trae la cuenta y dice por qué no hay cantidad con poca base", () => {
    const [firme] = filas([demanda("a", 12, 0)]);
    const [poca] = filas([demanda("b", 2, 0)]);
    expect(porqueDeModelo(firme)).toContain("Vendió 12 en los últimos 30 días");
    expect(porqueDeModelo(firme)).toContain("hacen falta unas 36 prendas");
    expect(porqueDeModelo(poca)).toContain("no sugerimos una cantidad");
    expect(porqueDeModelo(poca)).not.toContain("hacen falta");
  });

  it("con varias tallas el «¿Por qué?» las enumera con comas, sin punto medio", () => {
    const d = [demanda("a", 12, 0), { ...demanda("a", 6, 0), varianteId: "v-a2" }];
    const [m] = filasPorModelo(d, [{ productoId: "p-a", referencia: "Modelo a", variantesIds: ["v-a", "v-a2"], variantes: [{ varianteId: "v-a", talla: "S", color: null, colorHex: null }, { varianteId: "v-a2", talla: "M", color: null, colorHex: null }] }], {});
    expect(porqueDeModelo(m)).toContain("(S 36, M 18)");
    expect(porqueDeModelo(m)).not.toContain("·");
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

  it("«Preparar orden» dice antes de tocarlo que no guarda nada, y «Para vigilar» dice qué hacer (segunda prueba ciega)", () => {
    expect(AYUDA_PREPARAR_ORDEN).toContain("no se guarda nada hasta que la confirmes");
    expect(TEXTO_PARA_VIGILAR).toContain("Revísalos cada semana");
    expect(TEXTO_PARA_VIGILAR).toContain("No cortes tela");
  });

  it("lo que explica la lista va en el «?» de su título: cómo están los modelos, qué hace «Preparar orden» y, con poca historia, que las cantidades son una guía", () => {
    const datos = queFabricarPrimero(filas([demanda("a", 12, 0)]));
    const nota = "El sistema lleva 4 semanas de ventas (desde el 29 de setiembre): las cantidades son una guía, no una orden.";
    expect(ayudaDeQueFabricar(datos, nota)).toEqual([datos.presentacion, AYUDA_PREPARAR_ORDEN, nota]);
    expect(ayudaDeQueFabricar(datos, null)).toEqual([datos.presentacion, AYUDA_PREPARAR_ORDEN]);
    // Sin ningún modelo no se habla de «estos modelos» ni de un botón que no está: se dice qué es la lista.
    expect(ayudaDeQueFabricar(queFabricarPrimero([]), nota)).toEqual([AYUDA_QUE_FABRICAR]);
  });
});
