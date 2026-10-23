import { describe, expect, it } from "vitest";
import { agruparPendientes, pendientesDeGastos, type PendienteTelar } from "./finanzas-te-toca-reglas";

const vacio = { egresosSinClasificar: 0, egresosSinClasificarMonto: 0, sinComprobante: 0, nPorPagar: 0, porPagar: 0 };

describe("los pendientes de Gastos", () => {
  it("sin nada pendiente, nada", () => {
    expect(pendientesDeGastos(vacio, "")).toEqual([]);
  });

  it("cada cifra que pide algo es un pendiente que lleva a su lugar, con la sede elegida", () => {
    const p = pendientesDeGastos({ egresosSinClasificar: 2, egresosSinClasificarMonto: 120, sinComprobante: 1, nPorPagar: 0, porPagar: 0 }, "sede=l");
    expect(p.map((x) => [x.titulo, x.href])).toEqual([
      ["2 salidas de caja sin clasificar", "/finanzas/gastos?sede=l&tab=egresos"],
      ["1 gasto sin boleta ni factura", "/finanzas/gastos?sede=l"],
    ]);
  });

  it("sin sede elegida la dirección queda limpia", () => {
    expect(pendientesDeGastos({ ...vacio, egresosSinClasificar: 1, egresosSinClasificarMonto: 20 }, "")[0]!.href).toBe("/finanzas/gastos?tab=egresos");
    expect(pendientesDeGastos({ ...vacio, sinComprobante: 2 }, "")[0]!.href).toBe("/finanzas/gastos");
  });
});

describe("el cajón agrupa por submódulo", () => {
  const SUB = [
    { clave: "finanzas.resumen", etiqueta: "Resumen" },
    { clave: "finanzas.gastos", etiqueta: "Gastos" },
    { clave: "finanzas.cierre", etiqueta: "Cierre de mes" },
  ];
  const p = (submodulo: string, id: string, estado: "frena" | "avisa"): PendienteTelar => ({ submodulo, id, estado, titulo: id, detalle: "", verbo: "Ver", href: "/" });

  it("el submódulo donde se está va primero, los vacíos no salen y lo que frena va arriba", () => {
    const g = agruparPendientes([p("finanzas.gastos", "a", "avisa"), p("finanzas.cierre", "b", "avisa"), p("finanzas.cierre", "c", "frena")], SUB, "finanzas.cierre");
    expect(g.map((x) => [x.etiqueta, x.pendientes.map((y) => y.id)])).toEqual([
      ["Cierre de mes", ["c", "b"]],
      ["Gastos", ["a"]],
    ]);
  });
});
