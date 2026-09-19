import { describe, expect, it } from "vitest";
import { avanceParcial, celdaCsv, celdaPago, celdaRecepcion, nombreDelMes, rangoDelMes, subEmision, vistaActiva } from "./comprobantes-lista-reglas";
import type { CompraResumen } from "./compras-reglas";

const AHORA = new Date("2026-09-19T00:30:00Z"); // 18/09 19:30 en Lima
const base: CompraResumen = {
  id: "c", proveedorId: "p", proveedorNombre: "Tejidos Rímac SAC", proveedorRuc: null, tipo: "factura", documento: "F001-000482",
  fechaEmision: "2026-09-02", condicion: "credito", fechaVencimiento: "2026-10-02", ubicacionesDestino: ["u"],
  subtotal: 5020, igv: 903.6, total: 5923.6, pagado: 2000, saldo: 3923.6, estado: "vigente", estadoPago: "parcial",
  facturadoCantidad: 240, recibidoCantidad: 0, estadoRecepcion: "sin_recibir", vencida: false,
  fechaEstimadaLlegada: "2026-09-09", recepcionAtrasada: true, notasCredito: 0, cerradoCantidad: 0, nota: null, creadoEn: "",
};

describe("celdaRecepcion", () => {
  it("sin recibir y atrasada: dice cuántos días y cuándo se esperaba", () => {
    expect(celdaRecepcion(base, AHORA)).toEqual({ tono: "ambar", texto: "Atrasada 9 días", sub: "Esperada el 09/09", pct: null });
  });
  it("sin recibir a tiempo: neutro, con la fecha en que llega", () => {
    const c = { ...base, fechaEstimadaLlegada: "2026-09-22", recepcionAtrasada: false };
    expect(celdaRecepcion(c, AHORA)).toEqual({ tono: "neutro", texto: "Sin recibir", sub: "Llega el 22/09", pct: null });
  });
  it("parcial atrasada muestra el avance en unidades", () => {
    const c = { ...base, estadoRecepcion: "parcial" as const, recibidoCantidad: 72, facturadoCantidad: 120, fechaEstimadaLlegada: "2026-09-10" };
    expect(celdaRecepcion(c, AHORA)).toEqual({ tono: "ambar", texto: "Atrasada 8 días", sub: "72 de 120 u. recibidas", pct: 0.6 });
  });
  it("recibida en verde con unidades", () => {
    const c = { ...base, estadoRecepcion: "recibida" as const, recibidoCantidad: 180, recepcionAtrasada: false };
    expect(celdaRecepcion(c, AHORA)).toEqual({ tono: "verde", texto: "Recibida", sub: "180 u. recibidas", pct: null });
  });
  it("esperada hoy (Lima) no es atrasada aunque el servidor esté en mañana", () => {
    const c = { ...base, fechaEstimadaLlegada: "2026-09-18", recepcionAtrasada: false };
    expect(celdaRecepcion(c, AHORA).tono).toBe("neutro");
  });
  it("anulada se apaga", () => {
    expect(celdaRecepcion({ ...base, estado: "anulada" }, AHORA).tono).toBe("apagado");
  });
  it("el avance (pct) solo existe con recepción parcial: recibido / facturado", () => {
    const parcial = { ...base, estadoRecepcion: "parcial" as const, recibidoCantidad: 60, facturadoCantidad: 240, recepcionAtrasada: false, fechaEstimadaLlegada: "2026-09-30" };
    expect(celdaRecepcion(parcial, AHORA)).toMatchObject({ texto: "Parcial", pct: 0.25 });
    expect(celdaRecepcion(base, AHORA).pct).toBeNull(); // nada recibido: no hay avance que mostrar
    expect(celdaRecepcion({ ...parcial, estadoRecepcion: "recibida", recibidoCantidad: 240 }, AHORA).pct).toBeNull(); // todo recibido
    expect(celdaRecepcion({ ...parcial, estado: "anulada" }, AHORA).pct).toBeNull();
  });
});

describe("celdaPago", () => {
  it("parcial dice cuánto falta", () => {
    expect(celdaPago(base, AHORA)).toEqual({ tono: "ambar", texto: "Parcial", sub: "Faltan S/ 3,923.60", pct: 2000 / 5923.6 });
  });
  it("vencida gana sobre todo", () => {
    expect(celdaPago({ ...base, vencida: true, fechaVencimiento: "2026-09-04" }, AHORA).texto).toBe("Vencida");
  });
  it("vence mañana / en N días / hoy (con día de Lima)", () => {
    expect(celdaPago({ ...base, estadoPago: "pendiente", fechaVencimiento: "2026-09-19" }, AHORA).texto).toBe("Vence mañana");
    expect(celdaPago({ ...base, estadoPago: "pendiente", fechaVencimiento: "2026-09-25" }, AHORA).texto).toBe("Vence en 7 días");
    expect(celdaPago({ ...base, estadoPago: "pendiente", fechaVencimiento: "2026-09-18" }, AHORA).texto).toBe("Vence hoy");
    expect(celdaPago({ ...base, estadoPago: "pendiente", fechaVencimiento: "2026-10-09" }, AHORA).texto).toBe("Pendiente");
  });
  it("pagada al contado", () => {
    expect(celdaPago({ ...base, estadoPago: "pagada", condicion: "contado", saldo: 0 }, AHORA)).toEqual({ tono: "verde", texto: "Pagada", sub: "Al contado", pct: null });
  });
});

describe("celdaPago · avance (pct)", () => {
  it("pagado / total mientras haya pago parcial, sea cual sea el chip (vencida, vence pronto, parcial)", () => {
    expect(celdaPago({ ...base, vencida: true, fechaVencimiento: "2026-09-04" }, AHORA).pct).toBeCloseTo(2000 / 5923.6, 6);
    expect(celdaPago({ ...base, fechaVencimiento: "2026-09-22" }, AHORA).pct).toBeCloseTo(2000 / 5923.6, 6);
  });
  it("sin pagos o ya pagada no hay barra", () => {
    expect(celdaPago({ ...base, estadoPago: "pendiente", pagado: 0, saldo: base.total }, AHORA).pct).toBeNull();
    expect(celdaPago({ ...base, estadoPago: "pagada", pagado: base.total, saldo: 0 }, AHORA).pct).toBeNull();
    expect(celdaPago({ ...base, estado: "anulada" }, AHORA).pct).toBeNull();
  });
});

describe("avanceParcial", () => {
  it("solo devuelve fracciones estrictas entre 0 y 1", () => {
    expect(avanceParcial(1, 4)).toBe(0.25);
    expect(avanceParcial(0, 4)).toBeNull();
    expect(avanceParcial(4, 4)).toBeNull();
    expect(avanceParcial(5, 4)).toBeNull();
    expect(avanceParcial(1, 0)).toBeNull();
  });
});

describe("subEmision", () => {
  it("contado, vence y venció", () => {
    expect(subEmision({ ...base, condicion: "contado", fechaVencimiento: null })).toBe("Contado");
    expect(subEmision(base)).toBe("Vence 02/10");
    expect(subEmision({ ...base, vencida: true, fechaVencimiento: "2026-09-12" })).toBe("Venció 12/09");
  });
});

describe("vistaActiva", () => {
  it("deduce la pestaña de la URL", () => {
    expect(vistaActiva({})).toBe("todos");
    expect(vistaActiva({ saldo: "1" })).toBe("por-pagar");
    expect(vistaActiva({ porrecibir: "1" })).toBe("por-recibir");
    expect(vistaActiva({ vencidas: "1" })).toBe("vencidos");
    expect(vistaActiva({ pago: "pagada" })).toBe("pagados");
  });
});

describe("mes de exportación", () => {
  it("rango y nombre", () => {
    expect(rangoDelMes("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoDelMes("2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(rangoDelMes("2026-12")).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" });
    expect(rangoDelMes("2026-13")).toBeNull();
    expect(nombreDelMes("2026-09-18")).toBe("septiembre");
  });
});

describe("celdaCsv", () => {
  it("escapa comas, comillas y saltos de línea; vacío para nulos", () => {
    expect(celdaCsv("Hilados, del Norte")).toBe('"Hilados, del Norte"');
    expect(celdaCsv('Dijo "hola"')).toBe('"Dijo ""hola"""');
    expect(celdaCsv(null)).toBe("");
    expect(celdaCsv(12.5)).toBe("12.5");
  });
});
