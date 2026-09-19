import { describe, expect, it } from "vitest";
import { AHORA, TRUJILLO, enDias, fila, taller, tienda } from "./resumen-fixtures";
import { contextoAccion, partesOportunidad, resolverAccion } from "./resumen-acciones";
import { analizarSede } from "./resumen-reglas";

const una = (o: Parameters<typeof fila>[0]) => analizarSede([fila(o)], TRUJILLO, { ahora: AHORA, hayComparacion: false })[0];
const ctx = (a: ReturnType<typeof una>, puede = true) => contextoAccion(a, TRUJILLO, puede);

describe("resolver una acción: siempre un flujo real, nunca una escritura directa", () => {
  it("bajar al piso abre el modal de Existencias con la cantidad; sin sububicaciones cae al detalle", () => {
    const a = una({ ventas: 123, piso: 2, almacen: 5 });
    expect(resolverAccion(a.plan.principal, ctx(a))).toEqual({ via: "bajar_al_piso", cantidad: 5 });
    expect(resolverAccion(a.plan.principal, ctx(a, false))).toEqual({ via: "detalle" });
  });

  it("trasladar desde otra sede prellena el formulario de traslados (origen, destino, variante, cantidad)", () => {
    const a = una({ ventas: 30, piso: 3, almacen: 0, enRed: [tienda()] });
    const accion = resolverAccion(a.plan.principal, ctx(a));
    expect(accion).toEqual({ via: "enlace", href: `/inventario/mover?origen=u-lim&destino=${TRUJILLO.id}&variante=${a.fila.varianteId}&cantidad=14` });
  });

  it("pedir al Taller usa el mismo formulario, con el Taller como origen", () => {
    const a = una({ ventas: 60, piso: 0, almacen: 0, enRed: [taller({ disponible: 8, utilizable: 8, almacen: 8 })] });
    const accion = resolverAccion(a.plan.principal, ctx(a));
    expect(accion).toMatchObject({ via: "enlace" });
    expect((accion as { href: string }).href).toContain("origen=u-taller");
    expect((accion as { href: string }).href).toContain("cantidad=8");
  });

  it("esperar llegada lleva al traslado que viene en camino (o a la lista si no se sabe cuál)", () => {
    const suficiente = una({ ventas: 30, piso: 3, almacen: 0, enCamino: 20, enCaminoATiempo: 20, proximaLlegada: enDias(1), proximoTrasladoId: "t-9", enRed: [taller()] });
    expect(resolverAccion(suficiente.plan.principal, ctx(suficiente))).toEqual({ via: "enlace", href: "/inventario/traslados/t-9" });
    const sinId = una({ ventas: 30, piso: 3, almacen: 0, enCamino: 20, enCaminoATiempo: 20, proximaLlegada: enDias(1), proximoTrasladoId: null });
    expect(resolverAccion(sinId.plan.principal, ctx(sinId))).toEqual({ via: "enlace", href: "/inventario/traslados" });
  });

  it("revisar compra / producción solo enlaza cuando se sabe cómo se repone la prenda", () => {
    const por = (origen: "compra" | "produccion" | "ambos" | null) => {
      const a = una({ ventas: 60, piso: 0, almacen: 0, origenAbastecimiento: origen, enRed: [] });
      return resolverAccion(a.plan.principal, ctx(a));
    };
    expect(por("compra")).toEqual({ via: "enlace", href: "/compras" });
    expect(por("produccion")).toEqual({ via: "enlace", href: "/produccion" });
    expect(por("ambos")).toEqual({ via: "detalle" });
    expect(por(null)).toEqual({ via: "detalle" });
  });

  it("lo que no tiene un flujo propio abre el detalle, que lo explica", () => {
    const sobrestock = una({ ventas: 0, piso: 8, almacen: 4 });
    expect(resolverAccion(sobrestock.plan.principal, ctx(sobrestock))).toEqual({ via: "detalle" });
    const pocoHistorial = una({ ventas: 5, diasConStock: 2, diasObservables: 2, piso: 0, almacen: 0 });
    expect(resolverAccion(pocoHistorial.plan.principal, ctx(pocoHistorial))).toEqual({ via: "detalle" });
  });

  it("sin recomendación no hay acción", () => {
    expect(resolverAccion(null, { destinoId: "x", varianteId: "y", origenAbastecimiento: null, puedeBajarAlPiso: true })).toEqual({ via: "ninguna" });
  });
});

describe("la columna «Oportunidad / dónde hay»", () => {
  it("almacén de la tienda, lo que llega y dónde más hay", () => {
    const a = una({ ventas: 123, piso: 2, almacen: 5, enCamino: 8, enCaminoATiempo: 8, proximaLlegada: enDias(1), enRed: [taller()] });
    expect(partesOportunidad(a, TRUJILLO)).toEqual(["Almacén Trujillo: 5", "Llegan +8 mañana", "Taller: 15"]);
  });

  it("solo dónde hay, sin acción de almacén ni de espera", () => {
    const a = una({ ventas: 0, diasConStock: 4, diasObservables: 4, piso: 0, almacen: 0, enRed: [taller({ disponible: 10, utilizable: 10, almacen: 10 })] });
    expect(partesOportunidad(a, TRUJILLO)).toEqual(["Taller: 10"]);
  });

  it("sin nada que ofrecer: un guion, no un texto inventado", () => {
    expect(partesOportunidad(una({ ventas: 30, piso: 15, almacen: 5 }), TRUJILLO)).toEqual(["—"]);
  });
});
