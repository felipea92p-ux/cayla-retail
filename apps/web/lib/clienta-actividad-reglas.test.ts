import { describe, expect, it } from "vitest";
import { COMPRAS_PARA_FRECUENTE, agruparPorMes, comprasRecientes, deducirTallas, diaYMesDe, estadoFrecuente, filtrosDeLaLinea, lineaDeTiempo, totalComprado } from "./clienta-actividad-reglas";
import type { Compra } from "./clientas-reglas";

function compra(fecha: string, items: Compra["items"]): Compra {
  return { ventaId: fecha, fecha, ubicacion: "Tienda Trujillo", total: 0, items };
}

describe("deducirTallas", () => {
  it("toma la talla MÁS RECIENTE por categoría, no la más frecuente", () => {
    // Compras ya vienen ordenadas de más reciente a más antigua (como las entrega fn_clienta_compras).
    const compras = [
      compra("2026-09-20", [{ categoria: "Blusas", talla: "M", cantidad: 1 }]),
      compra("2026-06-10", [{ categoria: "Blusas", talla: "S", cantidad: 1 }]),
      compra("2026-06-10", [{ categoria: "Blusas", talla: "S", cantidad: 1 }]),
    ];
    expect(deducirTallas(compras)).toEqual([{ categoria: "Blusas", talla: "M" }]);
  });

  it("una talla por categoría distinta, ignora ítems sin categoría o sin talla", () => {
    const compras = [
      compra("2026-09-20", [
        { categoria: "Blusas", talla: "M", cantidad: 1 },
        { categoria: "Pantalones", talla: "28", cantidad: 1 },
        { categoria: null, talla: "M", cantidad: 1 },
        { categoria: "Accesorios", talla: null, cantidad: 1 },
      ]),
    ];
    expect(deducirTallas(compras)).toEqual([
      { categoria: "Blusas", talla: "M" },
      { categoria: "Pantalones", talla: "28" },
    ]);
  });

  it("sin compras, no deduce nada", () => {
    expect(deducirTallas([])).toEqual([]);
  });
});

describe("comprasRecientes / estadoFrecuente", () => {
  const ahora = new Date("2026-09-27T00:00:00Z");

  it("cuenta solo las compras dentro de la ventana de 6 meses", () => {
    const compras = [
      compra("2026-09-01T00:00:00Z", []),
      compra("2026-06-01T00:00:00Z", []), // dentro (hace ~3.9 meses)
      compra("2026-01-01T00:00:00Z", []), // fuera (hace ~9 meses)
    ];
    expect(comprasRecientes(compras, ahora)).toBe(2);
  });

  it(`con menos de ${COMPRAS_PARA_FRECUENTE} compras recientes, dice cuántas faltan`, () => {
    const compras = [compra("2026-09-01T00:00:00Z", []), compra("2026-08-01T00:00:00Z", [])];
    expect(estadoFrecuente(compras, ahora)).toEqual({ esFrecuente: false, faltanParaFrecuente: 1, comprasEnVentana: 2 });
  });

  it(`con ${COMPRAS_PARA_FRECUENTE} o más compras recientes, ya es frecuente`, () => {
    const compras = [compra("2026-09-01T00:00:00Z", []), compra("2026-08-01T00:00:00Z", []), compra("2026-07-01T00:00:00Z", [])];
    expect(estadoFrecuente(compras, ahora)).toEqual({ esFrecuente: true, faltanParaFrecuente: 0, comprasEnVentana: 3 });
  });

  it("sin compras, faltan todas", () => {
    expect(estadoFrecuente([], ahora)).toEqual({ esFrecuente: false, faltanParaFrecuente: COMPRAS_PARA_FRECUENTE, comprasEnVentana: 0 });
  });
});

describe("el historial de la ficha: una sola línea de tiempo", () => {
  const ficha = {
    compras: [
      { ventaId: "v1", fecha: "2026-10-16T20:00:00Z", ubicacion: "Tienda Lima", total: 289, items: [{ categoria: "Blusas", talla: "M", cantidad: 2 }, { categoria: null, talla: null, cantidad: 1 }] },
      { ventaId: "v2", fecha: "2026-09-28T20:00:00Z", ubicacion: "Tienda Lima", total: 329, items: [] },
    ],
    cambios: [{ id: "c1", fecha: "2026-09-30T20:00:00Z", ubicacion: "Tienda Lima", motivo: null, diferencia: 0 }],
    devoluciones: [{ id: "d1", fecha: "2026-10-01T20:00:00Z", estado: "aprobada", motivo: "Le quedó grande", reembolsoMonto: 99 }],
    separaciones: [{ id: "s1", codigo: "APT-0231", fecha: "2026-10-10T20:00:00Z", estado: "vigente", total: 159, venceEl: "2026-11-10" }],
  };

  it("junta todo y lo ordena de lo más nuevo a lo más viejo", () => {
    expect(lineaDeTiempo(ficha).map((m) => m.clave)).toEqual(["compra-v1", "apartado-s1", "devolucion-d1", "cambio-c1", "compra-v2"]);
  });

  it("cada movimiento dice su detalle, su monto y su estado como los dio la base", () => {
    const [compra, apartado, devolucion, cambio, vacia] = lineaDeTiempo(ficha);
    expect(compra).toMatchObject({ tipo: "compra", sede: "Tienda Lima", detalle: "2× Blusas (M), 1× prenda", monto: 289, estado: null });
    expect(apartado).toMatchObject({ detalle: "APT-0231", monto: 159, estado: "Vigente" });
    expect(devolucion).toMatchObject({ detalle: "Le quedó grande", monto: 99, estado: "Aprobada", sede: null });
    expect(cambio).toMatchObject({ detalle: "Cambio de prenda", monto: null });
    expect(vacia.detalle).toBe("Sin detalle");
  });

  it("sin nada, la línea está vacía", () => {
    expect(lineaDeTiempo({ compras: [], cambios: [], devoluciones: [], separaciones: [] })).toEqual([]);
  });

  it("el total son las compras leídas, sin descontar devoluciones", () => {
    expect(totalComprado(ficha.compras)).toBe(618);
    expect(totalComprado([])).toBe(0);
  });

  it("las píldoras: «Todo» y solo los tipos que tienen algo, con su cuenta", () => {
    expect(filtrosDeLaLinea(lineaDeTiempo(ficha))).toEqual([
      { valor: "todo", texto: "Todo", cuenta: 5 },
      { valor: "compra", texto: "Compras", cuenta: 2 },
      { valor: "cambio", texto: "Cambios", cuenta: 1 },
      { valor: "devolucion", texto: "Devoluciones", cuenta: 1 },
      { valor: "apartado", texto: "Apartados", cuenta: 1 },
    ]);
    expect(filtrosDeLaLinea([]).map((f) => f.valor)).toEqual(["todo"]);
  });

  it("agrupa por mes en hora de Lima y respeta el orden", () => {
    const grupos = agruparPorMes(lineaDeTiempo(ficha));
    expect(grupos.map((g) => [g.mes, g.movimientos.length])).toEqual([["Octubre 2026", 3], ["Setiembre 2026", 2]]);
    // Las 21:00 de Lima del 30 de setiembre son las 02:00 UTC del 1.º de octubre: el mes es el de Lima.
    expect(agruparPorMes([{ fecha: "2026-10-01T02:00:00Z" }])[0].mes).toBe("Setiembre 2026");
    expect(agruparPorMes([{ fecha: "no es fecha" }])[0].mes).toBe("Sin fecha");
  });

  it("el día y el mes de la insignia", () => {
    expect(diaYMesDe("2026-10-16T20:00:00Z")).toEqual({ dia: "16", mes: "oct" });
    expect(diaYMesDe("basura")).toEqual({ dia: "—", mes: "" });
  });
});
