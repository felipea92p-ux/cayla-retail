import { describe, expect, it } from "vitest";
import { cobroDeTicketGuardado, cobroVacio, type CobroDelTicket } from "./ticket-cobro-reglas";
import { ticketParaEspera } from "./vender-hoy-reglas";

const linea = { cantidad: 1, precioUnitario: 120, descuentoUnitario: 0 };

const cobroCompleto: CobroDelTicket = {
  responsableId: "persona-ana",
  comprobante: "factura",
  docTipo: "dni",
  docNumero: "20601234567",
  clienteNombre: "Textiles Andinos SAC",
  celularBoleta: "987654321",
  pagos: [
    { metodo: "efectivo", monto: 50, fijo: true, recibido: 100 },
    { metodo: "yape", monto: 70, referencia: "OP-889" },
    { metodo: "tarjeta", monto: 20, cuentaId: "cuenta-izipay-1" },
  ],
  cupon: { codigo: "CAY-AB12", valor: 15, compraMinima: 100, venceEl: "2026-11-30", origen: "codigo", de: "Lucía" },
};

describe("el cobro de un ticket en espera", () => {
  it("un ticket de antes de esto (sin cobro) vuelve con el cobro vacío", () => {
    expect(cobroDeTicketGuardado(undefined)).toEqual(cobroVacio());
    expect(cobroDeTicketGuardado(null)).toEqual(cobroVacio());
    expect(cobroDeTicketGuardado("basura")).toEqual(cobroVacio());
  });

  it("sobrevive al viaje por localStorage (JSON) sin perder nada", () => {
    const guardado = JSON.parse(JSON.stringify(cobroCompleto));
    expect(cobroDeTicketGuardado(guardado)).toEqual(cobroCompleto);
  });

  it("dos cobros vacíos no comparten la lista de pagos", () => {
    const a = cobroVacio();
    const b = cobroVacio();
    a.pagos.push({ metodo: "efectivo", monto: 10 });
    expect(b.pagos).toEqual([]);
  });

  it("descarta lo que no tiene la forma esperada, sin romper lo demás", () => {
    const cobro = cobroDeTicketGuardado({
      ...cobroCompleto,
      comprobante: "ticket_raro",
      docTipo: "otro_tipo",
      pagos: [
        { metodo: "efectivo", monto: 30 },
        { metodo: "bitcoin", monto: 10 },
        { metodo: "yape", monto: -5 },
        { metodo: "plin", monto: Number.NaN },
        "no soy un pago",
        null,
      ],
      cupon: { codigo: "CAY-X", valor: "quince" },
    });
    expect(cobro.comprobante).toBeNull();
    expect(cobro.docTipo).toBe("dni");
    expect(cobro.pagos).toEqual([{ metodo: "efectivo", monto: 30 }]);
    expect(cobro.cupon).toBeNull();
    // Lo que sí se entendía se conserva.
    expect(cobro.responsableId).toBe("persona-ana");
    expect(cobro.clienteNombre).toBe("Textiles Andinos SAC");
  });

  it("un responsable en blanco no cuenta como elegido", () => {
    expect(cobroDeTicketGuardado({ responsableId: "   " }).responsableId).toBeNull();
    expect(cobroDeTicketGuardado({ responsableId: 42 }).responsableId).toBeNull();
  });

  it("el ticket en espera lleva el cobro y lo devuelve igual al retomarlo y volver a dejarlo", () => {
    const dejado = ticketParaEspera({ carrito: [linea], nota: "", nombre: "María", clienta: null, cobro: cobroCompleto }, "id-1", "2026-10-25T10:00:00.000Z");
    // Lo que viaja por el navegador:
    const guardado = JSON.parse(JSON.stringify(dejado));
    const retomado = cobroDeTicketGuardado(guardado.cobro);
    expect(retomado).toEqual(cobroCompleto);

    // Y al dejarlo otra vez (el intercambio de `retomar()`), el cobro sigue siendo el mismo.
    const deVuelta = ticketParaEspera({ carrito: guardado.carrito, nota: guardado.nota, nombre: guardado.nombre, clienta: guardado.clienta, cobro: retomado }, "id-2", "2026-10-25T10:05:00.000Z");
    expect(deVuelta.cobro).toEqual(cobroCompleto);
  });

  it("un ticket guardado sin cobro sigue funcionando: no inventa uno", () => {
    const viejo = ticketParaEspera({ carrito: [linea], nota: "", nombre: "", clienta: null }, "id-3", "2026-10-25T10:00:00.000Z");
    expect(viejo.cobro).toBeUndefined();
    expect(JSON.parse(JSON.stringify(viejo))).not.toHaveProperty("cobro");
  });
});
