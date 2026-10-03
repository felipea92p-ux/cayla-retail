import { describe, expect, it } from "vitest";
import { ALTA_VACIA, altaDesdeBusqueda, clientaDeTicketGuardado, filaDeClienta, type ClientaDelTicket } from "./clienta-ticket-reglas";

// La fila «Clienta» del Punto de venta y el módulo «Clientas» (ADR-0249, actualización 2026-09-28). La base le rechaza la
// búsqueda de la libreta a la cuenta cuyo rol no tiene el módulo (42501 `clientas_sin_modulo`): el ticket no se la ofrece,
// porque un botón que siempre falla le enseña a la cajera que el sistema falla. Se vende igual: el DNI va en el comprobante.

const ANA: ClientaDelTicket = { id: "c1", nombre: "Ana Lozano", documentoTipo: "dni", documentoNumero: "45678912", celular: "987111222" };

describe("filaDeClienta: qué ofrece la fila «Clienta» del ticket según el módulo", () => {
  it("con el módulo y sin clienta, invita a agregarla", () => {
    expect(filaDeClienta(null, true)).toBe("agregar");
  });

  it("sin el módulo y sin clienta, no hay fila: ni el botón ni la invitación a buscar", () => {
    expect(filaDeClienta(null, false)).toBe("nada");
  });

  it("con el módulo, la clienta elegida se puede cambiar (buscar otra) o quitar", () => {
    expect(filaDeClienta(ANA, true)).toBe("elegida");
  });

  it("sin el módulo, una clienta que ya venía en el ticket se ve y se quita, pero no se cambia: cambiarla es buscar", () => {
    expect(filaDeClienta(ANA, false)).toBe("elegida_fija");
  });
});

describe("alta en el ticket y tickets en espera (ADR-0288 tanda 1a)", () => {
  it("lo escrito en el buscador precarga el alta: DNI, celular o nombre; lo demás no se adivina", () => {
    expect(altaDesdeBusqueda(" 7123 4482 ")).toEqual({ ...ALTA_VACIA, documentoNumero: "71234482" });
    // Un celular peruano (9 dígitos que empiezan en 9, con o sin +51 ni espacios) va a su caja, no a la del documento.
    expect(altaDesdeBusqueda("987654321")).toEqual({ ...ALTA_VACIA, celular: "987654321" });
    expect(altaDesdeBusqueda("+51 987 654 321")).toEqual({ ...ALTA_VACIA, celular: "987654321" });
    expect(altaDesdeBusqueda("51987654321")).toEqual({ ...ALTA_VACIA, celular: "987654321" });
    expect(altaDesdeBusqueda("María Quispe")).toEqual({ ...ALTA_VACIA, nombre: "María Quispe" });
    // Un número de 9 dígitos que no empieza en 9 no es un celular: tampoco se adivina. Un carné que SÍ empieza en 9 se confunde
    // con un celular: queda en la caja del celular, a la vista y corregible, nunca en el documento.
    expect(altaDesdeBusqueda("887654321")).toEqual(ALTA_VACIA);
    // Un carné de 9 dígitos que no empieza en 9, o letras con números (pasaporte), no se adivinan.
    expect(altaDesdeBusqueda("001234567")).toEqual(ALTA_VACIA);
    expect(altaDesdeBusqueda("AB123456")).toEqual(ALTA_VACIA);
  });

  it("un ticket en espera guardado con la forma vieja ({ dni }) vuelve con su DNI", () => {
    expect(clientaDeTicketGuardado({ id: "c1", nombre: "Ana", dni: "71234482", celular: null })).toEqual({
      id: "c1",
      nombre: "Ana",
      documentoTipo: "dni",
      documentoNumero: "71234482",
      celular: null,
    });
  });

  it("uno con la forma nueva conserva su tipo; sin id, el ticket vuelve sin clienta", () => {
    expect(clientaDeTicketGuardado({ id: "c2", nombre: null, documentoTipo: "pasaporte", documentoNumero: "AB123456", celular: "987654321" }))
      .toEqual({ id: "c2", nombre: null, documentoTipo: "pasaporte", documentoNumero: "AB123456", celular: "987654321" });
    expect(clientaDeTicketGuardado({ nombre: "Sin id" })).toBeNull();
    expect(clientaDeTicketGuardado(null)).toBeNull();
    expect(clientaDeTicketGuardado("texto")).toBeNull();
  });
});
