import { describe, expect, it } from "vitest";
import { calcularConfianza, leerHechosConfianza, PESOS, textoEstado, tonoPieza, type HechosConfianza } from "./finanzas-confianza";

// Lo que midió producción el 15-oct-2026: el 64 % de la venta con costo 0 (hoy estimado), cero fijos, cero facturas pero
// 9 entradas sin factura, cero saldos, la tarjeta directa al banco, la planilla sin pagar, cero conciliaciones.
const HOY: HechosConfianza = {
  mes: "2026-10-01", hasta: "2026-10-15", corte: "2026-10-01",
  costo: { unidadesEstimadas: 737, ventaEstimada: 35311, unidadesSinCosto: 0, ventaSinCosto: 0, unidadesTotal: 1096, ventaTotal: 55339 },
  fijos: { configurados: 0, sedesActivas: 3, sedesConFijos: 0, faltanMes: 0 },
  facturas: { lotesSinFactura: 9, egresosSinClasificar: 0 },
  saldos: { registrados: 0, bancos: 1 },
  tarjeta: { porAbonarCuentas: 0, directoAlBanco: true, cobrosMes: 23430 },
  planilla: { visible: true, mesPagada: false },
  conciliacion: { bancos: 1, conciliadosMes: 0 },
};

const TODO_BIEN: HechosConfianza = {
  ...HOY,
  costo: { unidadesEstimadas: 0, ventaEstimada: 0, unidadesSinCosto: 0, ventaSinCosto: 0, unidadesTotal: 1096, ventaTotal: 55339 },
  fijos: { configurados: 9, sedesActivas: 3, sedesConFijos: 3, faltanMes: 0 },
  facturas: { lotesSinFactura: 0, egresosSinClasificar: 0 },
  saldos: { registrados: 2, bancos: 2 },
  tarjeta: { porAbonarCuentas: 2, directoAlBanco: false, cobrosMes: 23430 },
  planilla: { visible: true, mesPagada: true },
  conciliacion: { bancos: 2, conciliadosMes: 2 },
};

describe("los pesos", () => {
  it("suman 100, para que el porcentaje sea lo logrado sobre lo posible", () => {
    expect(Object.values(PESOS).reduce((s, p) => s + p, 0)).toBe(100);
  });
});

describe("calcularConfianza", () => {
  it("con todo conectado, 100 % y el número dice la verdad", () => {
    const c = calcularConfianza(TODO_BIEN);
    expect(c.pct).toBe(100);
    expect(c.nivel).toBe("alto");
    expect(c.piezas.every((p) => p.estado === "ok")).toBe(true);
    expect(c.frase).toBe("El número dice la verdad.");
    expect(c.piezas.every((p) => p.href === undefined)).toBe(true);
  });

  it("con lo que había el 15 de octubre, es bajo y dice qué falta primero", () => {
    const c = calcularConfianza(HOY);
    // costo: 30 × (1 − 0.638) ≈ 10.86 · fijos 0 · facturas 7.5 · saldos 0 · tarjeta 0 · planilla 5 · conciliación 0 → 23 %
    expect(c.pct).toBe(23);
    expect(c.nivel).toBe("bajo");
    expect(c.frase).toMatch(/^Todavía no sirve para decidir/);
    // Lo que más pesa de lo que falta va primero: alquileres (20 perdidos) antes que el costo (19.14 perdidos).
    expect(c.frase).toContain("alquileres y servicios");
    const porClave = Object.fromEntries(c.piezas.map((p) => [p.clave, p]));
    expect(porClave.costo.estado).toBe("falta");
    expect(porClave.costo.detalle).toContain("64 % de lo vendido lleva costo estimado");
    expect(porClave.costo.href).toBe("/inventario/por-regularizar");
    expect(porClave.fijos.estado).toBe("falta");
    expect(porClave.facturas.estado).toBe("parcial");
    expect(porClave.facturas.detalle).toContain("9 entradas de mercadería sin factura");
    expect(porClave.saldos.estado).toBe("falta");
    expect(porClave.tarjeta.estado).toBe("falta");
    expect(porClave.tarjeta.detalle).toContain("23,430");
    expect(porClave.planilla.estado).toBe("parcial");
    expect(porClave.conciliacion.estado).toBe("falta");
  });

  it("el costo estimado baja la pieza en proporción a la venta, y una parte chica es «a medias»", () => {
    const c = calcularConfianza({ ...TODO_BIEN, costo: { ...TODO_BIEN.costo, unidadesEstimadas: 10, ventaEstimada: 5534 } });
    const costo = c.piezas.find((p) => p.clave === "costo")!;
    expect(costo.estado).toBe("parcial");
    expect(costo.logrado).toBe(27);
    expect(c.pct).toBe(97);
  });

  it("sin ventas en el mes, el costo no resta", () => {
    const c = calcularConfianza({ ...TODO_BIEN, costo: { unidadesEstimadas: 0, ventaEstimada: 0, unidadesSinCosto: 0, ventaSinCosto: 0, unidadesTotal: 0, ventaTotal: 0 } });
    expect(c.piezas.find((p) => p.clave === "costo")!.estado).toBe("ok");
    expect(c.pct).toBe(100);
  });

  it("los fijos a medias: faltan sedes o faltan los del mes", () => {
    const sedes = calcularConfianza({ ...TODO_BIEN, fijos: { configurados: 3, sedesActivas: 3, sedesConFijos: 2, faltanMes: 0 } }).piezas.find((p) => p.clave === "fijos")!;
    expect(sedes.estado).toBe("parcial");
    expect(sedes.detalle).toContain("2 de 3 sedes");
    expect(sedes.logrado).toBeCloseTo(20 * (2 / 3), 1);
    const mes = calcularConfianza({ ...TODO_BIEN, fijos: { configurados: 9, sedesActivas: 3, sedesConFijos: 3, faltanMes: 2 } }).piezas.find((p) => p.clave === "fijos")!;
    expect(mes.estado).toBe("parcial");
    expect(mes.detalle).toContain("2 fijos del mes todavía no están registrados");
    expect(mes.logrado).toBe(12);
  });

  it("la planilla que el líder no ve queda sin dato y no cuenta en el porcentaje", () => {
    const c = calcularConfianza({ ...TODO_BIEN, planilla: { visible: false, mesPagada: false } });
    const planilla = c.piezas.find((p) => p.clave === "planilla")!;
    expect(planilla.estado).toBe("sin_dato");
    expect(c.pct).toBe(100);
  });

  it("la tarjeta que cae directo al banco falta; con «por abonar» pero también directa, a medias; sin cobros, completa", () => {
    const directa = calcularConfianza({ ...TODO_BIEN, tarjeta: { porAbonarCuentas: 0, directoAlBanco: true, cobrosMes: 100 } }).piezas.find((p) => p.clave === "tarjeta")!;
    expect(directa.estado).toBe("falta");
    const mixta = calcularConfianza({ ...TODO_BIEN, tarjeta: { porAbonarCuentas: 1, directoAlBanco: true, cobrosMes: 100 } }).piezas.find((p) => p.clave === "tarjeta")!;
    expect(mixta.estado).toBe("parcial");
    const sin = calcularConfianza({ ...TODO_BIEN, tarjeta: { porAbonarCuentas: 0, directoAlBanco: true, cobrosMes: 0 } }).piezas.find((p) => p.clave === "tarjeta")!;
    expect(sin.estado).toBe("ok");
  });

  it("el nivel medio dice que sirve para orientarse, con las dos piezas que más faltan", () => {
    const c = calcularConfianza({ ...TODO_BIEN, saldos: { registrados: 0, bancos: 2 }, conciliacion: { bancos: 2, conciliadosMes: 0 }, fijos: { configurados: 3, sedesActivas: 3, sedesConFijos: 1, faltanMes: 0 } });
    expect(c.nivel).toBe("medio");
    expect(c.frase).toMatch(/^Sirve para orientarte/);
    expect(c.frase).toContain("alquileres y servicios");
    expect(c.frase).toContain("con cuánto empezaste");
  });
});

describe("leerHechosConfianza", () => {
  it("lee el JSON de la base (números como texto incluidos) y lo que falta vale 0 o false", () => {
    const h = leerHechosConfianza({
      mes: "2026-10-01", hasta: "2026-10-15", corte: null,
      costo: { unidades_estimadas: "737", venta_estimada: "35311.00", unidades_total: 1096, venta_total: 55339 },
      fijos: { configurados: 0 },
      tarjeta: { directo_al_banco: true, cobros_mes: "23430" },
      planilla: { visible: "true", mes_pagada: false },
    });
    expect(h.costo.unidadesEstimadas).toBe(737);
    expect(h.costo.ventaEstimada).toBe(35311);
    expect(h.costo.unidadesSinCosto).toBe(0);
    expect(h.fijos.sedesActivas).toBe(0);
    expect(h.tarjeta.directoAlBanco).toBe(true);
    expect(h.planilla.visible).toBe(true);
    expect(h.conciliacion.bancos).toBe(0);
    expect(h.corte).toBeNull();
    // Y con nada, todo vale 0: ninguna pieza puede salir «ok» por un dato que no llegó, salvo las que no aplican sin ventas.
    const vacio = calcularConfianza(leerHechosConfianza(null));
    expect(vacio.piezas.find((p) => p.clave === "fijos")!.estado).toBe("falta");
    expect(vacio.piezas.find((p) => p.clave === "saldos")!.estado).toBe("falta");
  });
});

describe("tono y texto de cada estado", () => {
  it("van con la guía: verde hecho, ámbar a medias, rojo falta, apagado sin dato", () => {
    expect([tonoPieza("ok"), tonoPieza("parcial"), tonoPieza("falta"), tonoPieza("sin_dato")]).toEqual(["verde", "ambar", "rojo", "apagado"]);
    expect([textoEstado("ok"), textoEstado("parcial"), textoEstado("falta"), textoEstado("sin_dato")]).toEqual(["Completo", "A medias", "Falta", "Sin dato"]);
  });
});
