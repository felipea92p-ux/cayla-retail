import { describe, expect, it } from "vitest";
import { leerTicketAbierto, leerTicketCompartido, leerTicketsCompartidos, mensajeDeTicketCompartido, nombreDelTicketDelPiso, ticketDelPisoParaLaEspera } from "./tickets-compartidos-reglas";

const FILA = { id: "t1", nombre: "Cliente 2", prendas: 3, total: "199.80", estado: "esperando", enviado_por: "Ana Pérez", enviado_en: "2026-11-24T17:00:00Z" };

describe("leerTicketCompartido", () => {
  it("lee la fila de la base, con el total que llega como texto (numeric)", () => {
    expect(leerTicketCompartido(FILA)).toEqual({ id: "t1", nombre: "Cliente 2", prendas: 3, total: 199.8, enviadoPor: "Ana Pérez", enviadoEn: "2026-11-24T17:00:00Z" });
  });
  it("una fila rota no se dibuja: sin id, sin nombre, sin cifras o sin fecha", () => {
    for (const roto of [null, "x", { ...FILA, id: "" }, { ...FILA, nombre: null }, { ...FILA, prendas: "tres" }, { ...FILA, total: undefined }, { ...FILA, enviado_en: "" }]) {
      expect(leerTicketCompartido(roto)).toBeNull();
    }
  });
  it("sin el nombre de quien lo mandó, dice «Alguien del equipo» en vez de dejar el hueco", () => {
    expect(leerTicketCompartido({ ...FILA, enviado_por: null })?.enviadoPor).toBe("Alguien del equipo");
  });
});

describe("mensajeDeTicketCompartido", () => {
  it("los errores de la base con su marca se muestran con su propio texto", () => {
    const e = { message: "Ya hay 20 tickets esperando en la caja. Cobra o descarta alguno antes de mandar otro.", hint: "ticket_tope" };
    expect(mensajeDeTicketCompartido(e, "mandar")).toEqual({ titulo: e.message });
  });
  it("sin responsable, pide elegirlo y, al mandar, recuerda que el ticket sigue aquí", () => {
    expect(mensajeDeTicketCompartido({ message: "x", hint: "ticket_sin_responsable" }, "mandar")).toEqual({
      titulo: "Elige quién está atendiendo",
      detalle: "Y vuelve a mandarlo a la caja: el ticket sigue aquí.",
    });
  });
  it("la red o un error sin marca nunca muestran el texto técnico: dicen qué pasó con el ticket", () => {
    const red = { message: "TypeError: Failed to fetch" };
    expect(mensajeDeTicketCompartido(red, "mandar").titulo).toBe("No se pudo mandar a la caja");
    expect(mensajeDeTicketCompartido(red, "mandar").detalle).toContain("sigue aquí");
    expect(mensajeDeTicketCompartido({ message: "boom", hint: "otra_cosa" }, "mandar").titulo).not.toContain("boom");
  });
});

describe("del piso a la caja", () => {
  const abierto = {
    id: "t1",
    nombre: "Cliente 1",
    prendas: 1,
    total: 79.9,
    enviadoPor: "Ana Pérez Rojas",
    enviadoEn: "2026-11-24T17:00:00Z",
    contenido: { carrito: [{ varianteId: "v1", cantidad: 1, precioUnitario: 79.9, descuentoUnitario: 0 }], nota: "talla M", cobro: { comprobante: "boleta" } },
  };
  it("leerTicketAbierto exige el contenido; la lista descarta las filas rotas", () => {
    expect(leerTicketAbierto({ ...FILA })).toBeNull();
    expect(leerTicketAbierto({ ...FILA, contenido: { carrito: [] } })?.id).toBe("t1");
    expect(leerTicketsCompartidos([FILA, { id: "" }, null])).toHaveLength(1);
    expect(leerTicketsCompartidos("no es lista")).toEqual([]);
  });
  it("en la caja se llama con el primer nombre de la asesora, sin pasar de 30 letras", () => {
    expect(nombreDelTicketDelPiso({ enviadoPor: "Ana Pérez Rojas", nombre: "Cliente 1" })).toBe("Ana · Cliente 1");
    expect(nombreDelTicketDelPiso({ enviadoPor: "  ", nombre: "Cliente 1" })).toBe("Cliente 1");
    expect(nombreDelTicketDelPiso({ enviadoPor: "Ana", nombre: "Una clienta con un nombre larguísimo" }).length).toBe(30);
  });
  it("pasa a la espera con su id, su hora de envío, sus prendas, su nota y lo del cobro", () => {
    expect(ticketDelPisoParaLaEspera(abierto)).toEqual({
      id: "t1",
      creadoEn: "2026-11-24T17:00:00Z",
      carrito: abierto.contenido.carrito,
      nota: "talla M",
      nombre: "Ana · Cliente 1",
      clienta: null,
      cobro: { comprobante: "boleta" },
    });
  });
  it("un contenido sin prendas no se abre como ticket", () => {
    expect(ticketDelPisoParaLaEspera({ ...abierto, contenido: { carrito: [] } })).toBeNull();
    expect(ticketDelPisoParaLaEspera({ ...abierto, contenido: { nota: "x" } })).toBeNull();
  });
});
