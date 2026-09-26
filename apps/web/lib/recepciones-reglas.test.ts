import { describe, expect, it } from "vitest";
import type { CompraResumen } from "./compras-reglas";
import type { NotaCreditoCompra } from "./compras-faltantes";
import { chipLlegada, cierresElegidos, diasDeAtraso, estadoLinea, etiquetaConfirmar, estadoNotaFaltante, faltanteDeLinea, fechaEsperada, disponibilidadNota, montoDeCierres, notasPorReclamar, reparteNota, sinDecidir, ordenarPorUrgencia, resumenConteo, tasaIgv, textoEsperada, valorPorLlegar } from "./recepciones-reglas";

// Hoy en Lima = 2026-09-18 (a las 19:30 de Lima en UTC ya es 09-19).
const AHORA = new Date("2026-09-19T00:30:00Z");

describe("estadoLinea (D1: sin valor = sin contar; 0 = contada, no llegó nada)", () => {
  it("una línea que nadie tocó es «sin contar», no «completa»", () => {
    expect(estadoLinea(null, 24)).toBe("sin_contar");
  });
  it("un 0 anotado es un dato: no llegó nada, faltan todas — y ahí se puede cerrar el faltante", () => {
    expect(estadoLinea(0, 24)).toBe("faltan");
    expect(faltanteDeLinea(0, 24)).toBe(24);
  });
  it("completa, faltan y excede", () => {
    expect(estadoLinea(24, 24)).toBe("completa");
    expect(estadoLinea(20, 24)).toBe("faltan");
    expect(estadoLinea(25, 24)).toBe("excede");
  });
});

describe("faltanteDeLinea", () => {
  it("sin contar no tiene faltante: no se sabe qué pasó", () => {
    expect(faltanteDeLinea(null, 24)).toBe(0);
  });
  it("es lo pendiente menos lo que llegó, nunca negativo", () => {
    expect(faltanteDeLinea(20, 24)).toBe(4);
    expect(faltanteDeLinea(24, 24)).toBe(0);
    expect(faltanteDeLinea(30, 24)).toBe(0);
  });
});

describe("resumenConteo", () => {
  it("cuenta líneas contadas (incluida la que llegó en 0), unidades y excedidas", () => {
    const r = resumenConteo([
      { llego: 24, pendiente: 24 },
      { llego: 36, pendiente: 36 },
      { llego: null, pendiente: 30 },
      { llego: 20, pendiente: 24 },
      { llego: null, pendiente: 60 },
      { llego: 0, pendiente: 66 },
    ]);
    expect(r).toEqual({ total: 6, contadas: 4, sinContar: 2, unidades: 80, excedidas: 0 });
  });
  it("cuenta las excedidas", () => {
    expect(resumenConteo([{ llego: 25, pendiente: 24 }, { llego: null, pendiente: 5 }]).excedidas).toBe(1);
  });
});

describe("cierres de faltante dentro de la guía", () => {
  const filas = [
    { lineaId: "a", compraId: "c1", faltan: 3, costoUnitario: 20 },
    { lineaId: "b", compraId: "c1", faltan: 4, costoUnitario: 10 },
    { lineaId: "c", compraId: "c2", faltan: 2, costoUnitario: 50 },
  ];
  it("solo se cierran las líneas a las que se les eligió un motivo; las demás siguen pendientes", () => {
    const r = cierresElegidos(filas, { a: "no_llego", c: "danada" });
    expect(r.map((x) => [x.lineaId, x.motivo])).toEqual([["a", "no_llego"], ["c", "danada"]]);
  });
  it("un motivo sobre una línea sin faltante no cierra nada", () => {
    expect(cierresElegidos([{ lineaId: "z", compraId: "c1", faltan: 0, costoUnitario: 1 }], { z: "no_llego" })).toEqual([]);
  });
  it("el monto de la nota es la suma de lo cerrado a su costo, más IGV", () => {
    // 3 × 20 + 4 × 10 = 100 → 118 con IGV 18 %
    expect(montoDeCierres(filas.slice(0, 2), 0.18)).toBe(118);
    expect(montoDeCierres([], 0.18)).toBe(0);
  });
  it("el botón dice qué va a registrar", () => {
    expect(etiquetaConfirmar({ unidades: 27, cierres: 0, ubicacion: "Almacén" })).toBe("Recibir 27 unidades en Almacén");
    expect(etiquetaConfirmar({ unidades: 1, cierres: 0, ubicacion: "Almacén" })).toBe("Recibir 1 unidad en Almacén");
    expect(etiquetaConfirmar({ unidades: 27, cierres: 2, ubicacion: "Almacén" })).toBe("Recibir 27 unidades y cerrar 2 faltantes");
    expect(etiquetaConfirmar({ unidades: 0, cierres: 1, ubicacion: "Almacén" })).toBe("Cerrar 1 faltante");
  });
});

describe("decisiones por línea", () => {
  const filas = [
    { lineaId: "a", compraId: "c1", faltan: 3, costoUnitario: 20 },
    { lineaId: "b", compraId: "c1", faltan: 4, costoUnitario: 10 },
  ];
  it("«lo espero» no cierra nada, pero cuenta como decidido", () => {
    const d = { a: "espero", b: "no_llego" } as const;
    expect(cierresElegidos(filas, d).map((c) => c.lineaId)).toEqual(["b"]);
    expect(sinDecidir(filas, d)).toEqual([]);
  });
  it("una línea corta sin decisión bloquea el confirmar", () => {
    expect(sinDecidir(filas, { a: "danada" }).map((f) => f.lineaId)).toEqual(["b"]);
    expect(sinDecidir(filas, {}).length).toBe(2);
  });
});

describe("disponibilidadNota: se anticipa lo que la base va a exigir", () => {
  const base = { pendiente: 24, llegando: 20, cerrandoAhora: 4, cerradoAntes: 0, yaTieneNotaFaltante: false };
  it("disponible cuando la guía deja el comprobante resuelto al 100 %", () => {
    expect(disponibilidadNota(base)).toEqual({ estado: "disponible" });
  });
  it("bloqueada si después de la guía quedan unidades sin recibir ni cerrar (y dice cuántas)", () => {
    expect(disponibilidadNota({ ...base, llegando: 10 })).toEqual({ estado: "bloqueada", quedan: 10 });
    // `pendiente` ya descuenta lo cerrado antes: con 4 cerrados antes quedan 20 pendientes en las líneas.
    expect(disponibilidadNota({ ...base, pendiente: 20, llegando: 10, cerrandoAhora: 0, cerradoAntes: 4 })).toEqual({ estado: "bloqueada", quedan: 10 });
  });
  it("sin ningún cierre (ni antes ni ahora) no hay nota por faltante", () => {
    expect(disponibilidadNota({ ...base, cerrandoAhora: 0, llegando: 24 })).toEqual({ estado: "sin_cierres" });
  });
  it("los cierres de guías anteriores cuentan para poder registrar la nota", () => {
    expect(disponibilidadNota({ ...base, pendiente: 20, cerrandoAhora: 0, cerradoAntes: 4, llegando: 20 })).toEqual({ estado: "disponible" });
  });
  it("si ya tiene su nota por faltante, no hay otra", () => {
    expect(disponibilidadNota({ ...base, yaTieneNotaFaltante: true })).toEqual({ estado: "ya_registrada" });
  });
});

describe("notasPorReclamar: Recepción avisa lo que el proveedor va a deber, ya no lo registra", () => {
  const compra = (id: string) => ({ id, documento: `F001-${id}`, proveedorNombre: "Textiles Andina SAC", igv: 18, subtotal: 100 });
  const bloque = (id: string, extra: Partial<{ cierresAhora: { faltan: number; costoUnitario: number }[]; cerradoAntes: { faltan: number; costoUnitario: number }[]; yaTieneNotaFaltante: boolean }> = {}) => ({
    compra: compra(id),
    cierresAhora: [],
    cerradoAntes: [],
    yaTieneNotaFaltante: false,
    ...extra,
  });

  it("lo que se cierra en esta guía se avisa a su costo con IGV", () => {
    expect(notasPorReclamar([bloque("c1", { cierresAhora: [{ faltan: 4, costoUnitario: 50 }] })])).toEqual([
      { compraId: "c1", documento: "F001-c1", proveedorNombre: "Textiles Andina SAC", unidades: 4, cerrandoAhora: 4, monto: 236 },
    ]);
  });
  it("un faltante cerrado en una guía anterior sigue avisándose, con `cerrandoAhora` en 0", () => {
    expect(notasPorReclamar([bloque("c1", { cerradoAntes: [{ faltan: 2, costoUnitario: 50 }] })])).toMatchObject([{ unidades: 2, cerrandoAhora: 0, monto: 118 }]);
  });
  it("lo de antes y lo de ahora suman en un solo reclamo: la nota es una sola por comprobante", () => {
    expect(notasPorReclamar([bloque("c1", { cerradoAntes: [{ faltan: 2, costoUnitario: 50 }], cierresAhora: [{ faltan: 4, costoUnitario: 50 }] })])).toMatchObject([{ unidades: 6, cerrandoAhora: 4, monto: 354 }]);
  });
  it("sin nada cerrado, o con la nota ya registrada, no hay nada que reclamar", () => {
    expect(notasPorReclamar([bloque("c1")])).toEqual([]);
    expect(notasPorReclamar([bloque("c1", { cierresAhora: [{ faltan: 4, costoUnitario: 50 }], yaTieneNotaFaltante: true })])).toEqual([]);
  });
  it("un envío de varios comprobantes deja un reclamo por comprobante", () => {
    const r = notasPorReclamar([bloque("c1", { cierresAhora: [{ faltan: 1, costoUnitario: 100 }] }), bloque("c2"), bloque("c3", { cerradoAntes: [{ faltan: 1, costoUnitario: 200 }] })]);
    expect(r.map((x) => x.compraId)).toEqual(["c1", "c3"]);
  });
});

describe("estadoNotaFaltante: vive en un módulo puro para que el detalle (servidor) pueda llamarla", () => {
  // Solo importan las tres cantidades; el resto del comprobante no interviene.
  const compra = (facturado: number, recibido: number, cerrado: number) => ({ facturadoCantidad: facturado, recibidoCantidad: recibido, cerradoCantidad: cerrado }) as CompraResumen;
  const nota = (motivo: string) => ({ motivo }) as NotaCreditoCompra;
  it("con unidades cerradas y todo lo demás recibido, la nota por faltante está disponible", () => {
    expect(estadoNotaFaltante(compra(24, 20, 4), [])).toEqual({ estado: "disponible" });
  });
  it("sin nada cerrado no hay nota por faltante", () => {
    expect(estadoNotaFaltante(compra(24, 24, 0), [])).toEqual({ estado: "sin_cierres" });
  });
  it("si aún quedan unidades sin recibir ni cerrar, dice cuántas", () => {
    expect(estadoNotaFaltante(compra(24, 10, 4), [])).toEqual({ estado: "bloqueada", quedan: 10 });
  });
  it("una nota de otro motivo no cuenta como la del faltante; la del faltante, sí", () => {
    expect(estadoNotaFaltante(compra(24, 20, 4), [nota("devolucion")])).toEqual({ estado: "disponible" });
    expect(estadoNotaFaltante(compra(24, 20, 4), [nota("faltante")])).toEqual({ estado: "ya_registrada" });
  });
});

describe("reparteNota: la nota baja la deuda y lo que sobra queda a favor", () => {
  it("a crédito sin pagar: baja la deuda, nada a favor", () => {
    const r = reparteNota(236, 1180);
    expect(r).toEqual({ baja: 236, aFavor: 0, deudaDespues: 944 });
  });
  it("al contado (ya pagada): todo queda a favor", () => {
    const r = reparteNota(236, 0);
    expect(r).toEqual({ baja: 0, aFavor: 236, deudaDespues: 0 });
  });
  it("debe menos que la nota: baja a 0 y el resto queda a favor", () => {
    const r = reparteNota(236, 116);
    expect(r).toEqual({ baja: 116, aFavor: 120, deudaDespues: 0 });
  });
});

describe("atraso de llegada", () => {
  it("sin fecha estimada, cuenta desde emisión + 7 días", () => {
    expect(fechaEsperada({ fechaEstimadaLlegada: null, fechaEmision: "2026-09-02" })).toBe("2026-09-09");
    expect(diasDeAtraso({ fechaEstimadaLlegada: null, fechaEmision: "2026-09-02" }, AHORA)).toBe(9);
  });
  it("esperada hoy (Lima) no está atrasada aunque el servidor ya esté en mañana", () => {
    expect(diasDeAtraso({ fechaEstimadaLlegada: "2026-09-18", fechaEmision: "2026-09-01" }, AHORA)).toBe(0);
    expect(chipLlegada({ fechaEstimadaLlegada: "2026-09-18", fechaEmision: "2026-09-01" }, AHORA)).toEqual({ texto: "Llega hoy", tono: "neutro" });
  });
  it("chips y textos", () => {
    expect(chipLlegada({ fechaEstimadaLlegada: "2026-09-09", fechaEmision: "2026-09-01" }, AHORA)).toEqual({ texto: "Atrasada 9 d", tono: "ambar" });
    expect(chipLlegada({ fechaEstimadaLlegada: "2026-09-22", fechaEmision: "2026-09-10" }, AHORA)).toEqual({ texto: "En 4 días", tono: "neutro" });
    expect(textoEsperada({ fechaEstimadaLlegada: "2026-09-09", fechaEmision: "2026-09-01" }, AHORA)).toBe("Esperada el 09/09");
    expect(textoEsperada({ fechaEstimadaLlegada: "2026-09-22", fechaEmision: "2026-09-10" }, AHORA)).toBe("Llega el 22/09");
  });
  it("ordena lo atrasado primero, el más atrasado arriba", () => {
    const lista = [
      { id: "a", fechaEstimadaLlegada: "2026-09-22", fechaEmision: "2026-09-10" },
      { id: "b", fechaEstimadaLlegada: "2026-09-10", fechaEmision: "2026-08-20" },
      { id: "c", fechaEstimadaLlegada: "2026-09-09", fechaEmision: "2026-09-02" },
      { id: "d", fechaEstimadaLlegada: "2026-09-20", fechaEmision: "2026-09-12" },
    ];
    expect(ordenarPorUrgencia(lista, AHORA).map((x) => x.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("valorPorLlegar", () => {
  it("es proporcional a lo pendiente y descuenta lo cerrado", () => {
    expect(valorPorLlegar({ total: 3186, facturadoCantidad: 120, recibidoCantidad: 72 })).toBe(1274.4);
    expect(valorPorLlegar({ total: 3186, facturadoCantidad: 120, recibidoCantidad: 72, cerradoCantidad: 48 })).toBe(0);
    expect(valorPorLlegar({ total: 100, facturadoCantidad: 0, recibidoCantidad: 0 })).toBe(0);
    // ADR-0139: una tienda con 18 de las 36 unidades del comprobante NO debe ver el total entero como «por llegar».
    expect(valorPorLlegar({ total: 2124, facturadoCantidad: 18, facturadoTotal: 36, recibidoCantidad: 0 })).toBe(1062);
    expect(valorPorLlegar({ total: 2124, facturadoCantidad: 18, facturadoTotal: 36, recibidoCantidad: 6, cerradoCantidad: 2 })).toBe(590);
  });
});

describe("nota de crédito (D2)", () => {
  it("deduce la tasa de IGV de los montos del comprobante", () => {
    expect(tasaIgv({ subtotal: 2000, igv: 360 })).toBeCloseTo(0.18);
    expect(tasaIgv({ subtotal: 0, igv: 0 })).toBe(0);
  });
});
