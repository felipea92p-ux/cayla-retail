import { describe, expect, it } from "vitest";
import {
  avancePago,
  avanceRecepcion,
  chispasDe,
  complementoDeSaldo,
  datosCabecera,
  fechaDeCabecera,
  fraccion,
  idsNuevos,
  lineaDeTiempo,
  resumenDePago,
  textoFechaHito,
  tonoDeAvance,
  type EntradaLineaTiempo,
} from "./comprobante-linea-tiempo";

const HOY = "2026-09-19";
const soles = (n: number) => `S/ ${n.toFixed(2)}`;

const base: EntradaLineaTiempo = {
  fechaEmision: "2026-09-10",
  estadoPago: "pendiente",
  estadoRecepcion: "sin_recibir",
  recibidoCantidad: 0,
  cerradoCantidad: 0,
  facturadoCantidad: 10,
  total: 1000,
  pagado: 0,
  notasCredito: 0,
  fechaUltimaRecepcion: null,
  fechaUltimoPago: null,
  hoy: HOY,
};

describe("fraccion", () => {
  it("acota a 0–1 y no divide por cero", () => {
    expect(fraccion(5, 10)).toBe(0.5);
    expect(fraccion(15, 10)).toBe(1);
    expect(fraccion(-1, 10)).toBe(0);
    expect(fraccion(3, 0)).toBe(0);
    expect(fraccion(Number.NaN, 10)).toBe(0);
  });
});

describe("avances", () => {
  it("recepción: lo cerrado por faltante cuenta como resuelto", () => {
    expect(avanceRecepcion({ recibidoCantidad: 6, cerradoCantidad: 2, facturadoCantidad: 10 })).toBe(0.8);
  });
  it("pago: las notas de crédito cuentan igual que un pago (es lo que descuenta el saldo)", () => {
    expect(avancePago({ pagado: 400, notasCredito: 100, total: 1000 })).toBe(0.5);
  });
});

describe("textoFechaHito", () => {
  it("hoy, ayer y el resto en dd/mm", () => {
    expect(textoFechaHito("2026-09-19", HOY)).toBe("Hoy");
    expect(textoFechaHito("2026-09-18", HOY)).toBe("Ayer");
    expect(textoFechaHito("2026-09-10", HOY)).toBe("10/09");
    expect(textoFechaHito(null, HOY)).toBe("—");
  });
});

describe("lineaDeTiempo", () => {
  it("comprobante recién registrado: solo el primer nodo está hecho y los conectores vacíos", () => {
    const l = lineaDeTiempo(base);
    expect(l.nodos.map((n) => n.estado)).toEqual(["hecho", "pendiente", "pendiente"]);
    expect(l.nodos[0].detalle).toBe("10/09");
    expect(l.nodos[1].detalle).toBe("Sin recibir");
    expect(l.nodos[2].detalle).toBe("Pendiente");
    expect(l.conectores.map((c) => c.avance)).toEqual([0, 0]);
  });

  it("recepción parcial: nodo ámbar con «x de y u.» y conector con el avance real, nunca menos de la mitad", () => {
    const l = lineaDeTiempo({ ...base, estadoRecepcion: "parcial", recibidoCantidad: 3 });
    expect(l.nodos[1]).toMatchObject({ estado: "parcial", detalle: "3 de 10 u." });
    expect(l.conectores[0]).toEqual({ avance: 0.5, tono: "ambar" });
    const l2 = lineaDeTiempo({ ...base, estadoRecepcion: "parcial", recibidoCantidad: 8 });
    expect(l2.conectores[0].avance).toBe(0.8);
  });

  it("todo recibido: nodo verde con la fecha de la última recepción y conector lleno", () => {
    const l = lineaDeTiempo({ ...base, estadoRecepcion: "recibida", recibidoCantidad: 10, fechaUltimaRecepcion: "2026-09-18" });
    expect(l.nodos[1]).toMatchObject({ estado: "hecho", detalle: "Ayer" });
    expect(l.conectores[0]).toEqual({ avance: 1, tono: "verde" });
  });

  it("todo cerrado por faltante y nada recibido igual es «parcial» mientras la base no lo marque recibido", () => {
    const l = lineaDeTiempo({ ...base, estadoRecepcion: "parcial", cerradoCantidad: 4 });
    expect(l.nodos[1].estado).toBe("parcial");
  });

  it("pago parcial y pago saldado hoy", () => {
    const parcial = lineaDeTiempo({ ...base, estadoPago: "parcial", pagado: 300 });
    expect(parcial.nodos[2]).toMatchObject({ estado: "parcial", detalle: "Parcial" });
    expect(parcial.conectores[1].avance).toBe(0.5);
    const saldado = lineaDeTiempo({ ...base, estadoPago: "pagada", pagado: 1000, fechaUltimoPago: HOY });
    expect(saldado.nodos[2]).toMatchObject({ estado: "hecho", detalle: "Hoy" });
    expect(saldado.conectores[1]).toEqual({ avance: 1, tono: "verde" });
  });

  it("saldado solo con notas de crédito (sin pagos): dice «Saldado»", () => {
    const l = lineaDeTiempo({ ...base, estadoPago: "pagada", notasCredito: 1000 });
    expect(l.nodos[2]).toMatchObject({ estado: "hecho", detalle: "Saldado" });
  });
});

describe("tonoDeAvance", () => {
  it("verde completo, ámbar a medias, neutro sin nada, rojo si hay alerta", () => {
    expect(tonoDeAvance(1)).toBe("verde");
    expect(tonoDeAvance(0.4)).toBe("ambar");
    expect(tonoDeAvance(0)).toBe("neutro");
    expect(tonoDeAvance(0.4, { alerta: true })).toBe("rojo");
  });
});

describe("idsNuevos", () => {
  it("devuelve solo lo que no se había visto", () => {
    expect(idsNuevos(new Set(["a", "b"]), ["a", "b", "c"])).toEqual(["c"]);
    expect(idsNuevos(new Set(), ["a"])).toEqual(["a"]);
  });
});

describe("resumenDePago", () => {
  const f = { formato: soles, lineas: 1 };
  it("cubre justo: verde; el texto cambia según sea exacto o no", () => {
    expect(resumenDePago({ ...f, objetivo: 500, suma: 500, exacto: false })).toEqual({ tono: "verde", texto: "Salda el comprobante." });
    expect(resumenDePago({ ...f, objetivo: 500, suma: 500, exacto: true })).toEqual({ tono: "verde", texto: "Cubre el total." });
  });
  it("queda saldo: neutro (pago posterior) o ámbar (al contado, falta)", () => {
    expect(resumenDePago({ ...f, objetivo: 500, suma: 200, exacto: false })).toEqual({ tono: "neutro", texto: "Quedarán S/ 300.00 por pagar." });
    expect(resumenDePago({ ...f, objetivo: 500, suma: 200, exacto: true })).toEqual({ tono: "ambar", texto: "Falta S/ 300.00 para el total." });
  });
  it("se pasa: rojo, y con varias líneas antepone la suma", () => {
    expect(resumenDePago({ ...f, lineas: 2, objetivo: 500, suma: 520, exacto: false })).toEqual({ tono: "rojo", texto: "Suman S/ 520.00 · Se pasa por S/ 20.00." });
  });
  it("usar más saldo a favor del que hay: rojo", () => {
    const r = resumenDePago({ ...f, objetivo: 500, suma: 500, exacto: false, saldoFavorUsado: 80, saldoFavorDisponible: 50 });
    expect(r.tono).toBe("rojo");
    expect(r.texto).toContain("solo tienes S/ 50.00");
  });
  it("evita el ruido de coma flotante (0.1 + 0.2)", () => {
    expect(resumenDePago({ ...f, objetivo: 0.3, suma: 0.1 + 0.2, exacto: false }).tono).toBe("verde");
  });
});

describe("chispasDe", () => {
  it("siempre entre 8 y 12 partículas, repartidas en círculo y de ~700 ms", () => {
    expect(chispasDe(3)).toHaveLength(8);
    expect(chispasDe(50)).toHaveLength(12);
    const c = chispasDe(10, () => 0);
    expect(c).toHaveLength(10);
    expect(c[0].angulo).toBe(0);
    expect(c[5].angulo).toBeCloseTo(Math.PI);
    expect(c.every((p) => p.duracion >= 700 && p.duracion <= 850)).toBe(true);
  });
});

describe("fechaDeCabecera", () => {
  it("omite el año si es de este año y lo pone si es de otro", () => {
    expect(fechaDeCabecera("2026-09-02", HOY)).toBe("02/09");
    expect(fechaDeCabecera("2025-12-30", HOY)).toBe("30/12/2025");
    expect(fechaDeCabecera(null, HOY)).toBe("—");
  });
});

describe("datosCabecera", () => {
  const credito = { ruc: "20512345676", fechaEmision: "2026-09-02", condicion: "credito" as const, fechaVencimiento: "2026-10-02", vencida: false, destino: "Taller · Lima", hoy: HOY };

  it("RUC, emisión, vencimiento y destino, en ese orden", () => {
    expect(datosCabecera(credito).map((d) => d.texto)).toEqual(["RUC 20512345676", "Emitido 02/09", "Vence 02/10", "Destino Taller · Lima"]);
  });
  it("vencida y sin pagar: «Venció» en alerta", () => {
    const d = datosCabecera({ ...credito, vencida: true, fechaVencimiento: "2026-09-12" });
    expect(d[2]).toEqual({ texto: "Venció 12/09", alerta: true });
  });
  it("al contado dice «Contado»; sin RUC ni destino no los inventa", () => {
    const d = datosCabecera({ ...credito, condicion: "contado", fechaVencimiento: null, ruc: null, destino: "—" });
    expect(d.map((x) => x.texto)).toEqual(["Emitido 02/09", "Contado"]);
  });
  it("crédito sin fecha de vencimiento: «Al crédito»", () => {
    expect(datosCabecera({ ...credito, fechaVencimiento: null })[2].texto).toBe("Al crédito");
  });
});

describe("complementoDeSaldo", () => {
  it("vence / venció / nada", () => {
    expect(complementoDeSaldo({ condicion: "credito", fechaVencimiento: "2026-10-02", vencida: false, hoy: HOY })).toEqual({ texto: "vence 02/10", alerta: false });
    expect(complementoDeSaldo({ condicion: "credito", fechaVencimiento: "2026-09-12", vencida: true, hoy: HOY })).toEqual({ texto: "venció 12/09", alerta: true });
    expect(complementoDeSaldo({ condicion: "contado", fechaVencimiento: null, vencida: false, hoy: HOY })).toBeNull();
    expect(complementoDeSaldo({ condicion: "credito", fechaVencimiento: null, vencida: false, hoy: HOY })).toBeNull();
  });
});
