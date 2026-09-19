import { describe, expect, it } from "vitest";
import { chipLlegada, cierresElegidos, diasDeAtraso, efectoCierre, estadoLinea, etiquetaConfirmar, faltanteDeLinea, fechaEsperada, disponibilidadNota, igvDeMonto, montoDeCierres, notaDelBloque, reparteNota, sinDecidir, textoReparteNota, montoNotaSugerido, ordenarPorUrgencia, resumenConteo, tasaIgv, textoEsperada, valorPorLlegar } from "./recepciones-reglas";

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

describe("notaDelBloque: una nota por comprobante, con todo lo cerrado de él", () => {
  const cierres = [{ faltan: 3, costoUnitario: 20 }, { faltan: 4, costoUnitario: 10 }];
  const borrador = { activa: true, serie: "FC01-000018", fecha: "2026-09-18", montoTxt: null };
  it("sugiere la suma de lo cerrado con IGV y no tiene problema si trae serie", () => {
    expect(notaDelBloque({ tasa: 0.18, cierres, esLider: true, borrador })).toEqual({ activa: true, sugerido: 118, monto: 118, tope: 119, problema: null });
  });
  it("sin serie, o con un monto sobre lo cerrado + S/ 1 de margen, marca el problema", () => {
    expect(notaDelBloque({ tasa: 0.18, cierres, esLider: true, borrador: { ...borrador, serie: " " } }).problema).toBe("serie");
    expect(notaDelBloque({ tasa: 0.18, cierres, esLider: true, borrador: { ...borrador, montoTxt: "119.01" } }).problema).toBe("monto");
    expect(notaDelBloque({ tasa: 0.18, cierres, esLider: true, borrador: { ...borrador, montoTxt: "119.00" } }).problema).toBe(null);
    expect(notaDelBloque({ tasa: 0.18, cierres, esLider: true, borrador: { ...borrador, montoTxt: "0" } }).problema).toBe("monto");
  });
  it("respeta el monto que el líder ajustó dentro del margen", () => {
    expect(notaDelBloque({ tasa: 0.18, cierres, esLider: true, borrador: { ...borrador, montoTxt: "115.50" } }).monto).toBe(115.5);
  });
  it("no hay nota si no es líder, si está apagada, o si no se cerró nada", () => {
    expect(notaDelBloque({ tasa: 0.18, cierres, esLider: false, borrador }).activa).toBe(false);
    expect(notaDelBloque({ tasa: 0.18, cierres, esLider: true, borrador: { ...borrador, activa: false } }).activa).toBe(false);
    expect(notaDelBloque({ tasa: 0.18, cierres: [], esLider: true, borrador }).activa).toBe(false);
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

describe("reparteNota: la nota baja la deuda y lo que sobra queda a favor", () => {
  const dinero = (n: number) => `S/ ${n.toFixed(2)}`;
  const p = { documento: "F001-000198", proveedor: "Textiles Andina", dinero };
  it("a crédito sin pagar: baja la deuda, nada a favor", () => {
    const r = reparteNota(236, 1180);
    expect(r).toEqual({ baja: 236, aFavor: 0, deudaDespues: 944 });
    expect(textoReparteNota(r, { ...p, saldo: 1180 })).toBe("La nota baja lo que se debe de F001-000198 de S/ 1180.00 a S/ 944.00.");
  });
  it("al contado (ya pagada): todo queda a favor", () => {
    const r = reparteNota(236, 0);
    expect(r).toEqual({ baja: 0, aFavor: 236, deudaDespues: 0 });
    expect(textoReparteNota(r, { ...p, saldo: 0 })).toContain("ya está pagado: los S/ 236.00 de la nota quedan a tu favor con Textiles Andina");
  });
  it("debe menos que la nota: baja a 0 y el resto queda a favor", () => {
    const r = reparteNota(236, 116);
    expect(r).toEqual({ baja: 116, aFavor: 120, deudaDespues: 0 });
    expect(textoReparteNota(r, { ...p, saldo: 116 })).toContain("los S/ 120.00 restantes quedan a tu favor");
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
  });
});

describe("nota de crédito (D2)", () => {
  it("deduce la tasa de IGV de los montos del comprobante", () => {
    expect(tasaIgv({ subtotal: 2000, igv: 360 })).toBeCloseTo(0.18);
    expect(tasaIgv({ subtotal: 0, igv: 0 })).toBe(0);
  });
  it("sugiere cantidad × costo (sin IGV) + IGV", () => {
    expect(montoNotaSugerido(4, 50, 0.18)).toBe(236);
    expect(montoNotaSugerido(4, 50, 0)).toBe(200);
  });
  it("separa el IGV de un monto que ya lo trae", () => {
    expect(igvDeMonto(236, 0.18)).toBe(36);
    expect(igvDeMonto(100, 0)).toBe(0);
  });
});

describe("efectoCierre", () => {
  const f = (n: number) => `S/ ${n.toFixed(2)}`;
  it("con nota y cubriendo todo lista las cuatro filas", () => {
    const filas = efectoCierre({ documento: "F001-000482", saldo: 3923.6, montoNota: 236, igvNota: 36, igvMes: 1466.18, recepcionAntes: "Parcial", cubreTodo: true, estabaAtrasada: true, atrasadasAntes: 2, formato: f });
    expect(filas.map((x) => [x.etiqueta, x.antes, x.despues])).toEqual([
      ["Lo que se debe de F001-000482", "S/ 3923.60", "S/ 3687.60"],
      ["Crédito fiscal (IGV) del mes", "S/ 1466.18", "S/ 1430.18"],
      ["Recepción del comprobante", "Parcial", "Recibida"],
      ["Entregas atrasadas", "2", "1"],
    ]);
  });
  it("sin nota y sin cubrir todo no hay nada que mostrar", () => {
    expect(efectoCierre({ documento: "X", saldo: 100, montoNota: 0, igvNota: 0, igvMes: null, recepcionAntes: "Parcial", cubreTodo: false, estabaAtrasada: false, atrasadasAntes: null, formato: f })).toEqual([]);
  });
  it("nunca deja el saldo en negativo", () => {
    const [fila] = efectoCierre({ documento: "X", saldo: 100, montoNota: 500, igvNota: 0, igvMes: null, recepcionAntes: "", cubreTodo: false, estabaAtrasada: false, atrasadasAntes: null, formato: f });
    expect(fila.despues).toBe("S/ 0.00");
  });
});

describe("efectoCierre con saldo a favor", () => {
  const dinero = (n: number) => `S/ ${n.toFixed(2)}`;
  const base = { documento: "F001-1", saldo: 0, montoNota: 0, igvNota: 36, igvMes: 500, recepcionAntes: "Parcial", cubreTodo: true, estabaAtrasada: false, atrasadasAntes: null, formato: dinero, proveedor: "Andina" };
  it("factura ya pagada: no toca la deuda, sube el saldo a favor y baja el crédito fiscal", () => {
    const f = efectoCierre({ ...base, aFavor: 236, saldoFavorAntes: 0 });
    expect(f.map((r) => r.etiqueta)).toEqual(["Saldo a favor con Andina", "Crédito fiscal (IGV) del mes", "Recepción del comprobante"]);
    expect(f[0]).toMatchObject({ antes: "S/ 0.00", despues: "S/ 236.00" });
    expect(f[1]).toMatchObject({ antes: "S/ 500.00", despues: "S/ 464.00" });
  });
  it("nota que solo baja deuda: no aparece la fila del saldo a favor", () => {
    const f = efectoCierre({ ...base, saldo: 1180, montoNota: 236, aFavor: 0, saldoFavorAntes: 0 });
    expect(f.map((r) => r.etiqueta)).toEqual(["Lo que se debe de F001-1", "Crédito fiscal (IGV) del mes", "Recepción del comprobante"]);
    expect(f[0]).toMatchObject({ antes: "S/ 1180.00", despues: "S/ 944.00" });
  });
});
