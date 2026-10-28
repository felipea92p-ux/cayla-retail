import { describe, expect, it } from "vitest";
import {
  ALTA_VACIA,
  altaDesdeBusqueda,
  clientaDeTicketGuardado,
  filaDeClienta,
  nombreDeFichaParaComprobante,
  type ClientaDelTicket,
} from "./clienta-ticket-reglas";

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
  it("lo escrito en el buscador precarga el alta: DNI o nombre; un celular ya no (el alta no lo pide) y lo demás no se adivina", () => {
    expect(altaDesdeBusqueda(" 7123 4482 ")).toEqual({ ...ALTA_VACIA, documentoNumero: "71234482" });
    expect(altaDesdeBusqueda("987654321")).toEqual(ALTA_VACIA);
    expect(altaDesdeBusqueda("María Quispe")).toEqual({ ...ALTA_VACIA, nombre: "María Quispe" });
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

describe("nombreDeFichaParaComprobante: la boleta no vuelve a consultar el padrón por el cliente del ticket (Felipe 2026-10-15)", () => {
  it("con el documento del cliente en el comprobante, el nombre sale de su ficha: no se consulta otra vez", () => {
    expect(nombreDeFichaParaComprobante(ANA, "dni", "45678912")).toBe("Ana Lozano");
  });

  it("un dígito corregido ya es otra persona: se consulta", () => {
    expect(nombreDeFichaParaComprobante(ANA, "dni", "45678913")).toBeNull();
    expect(nombreDeFichaParaComprobante(ANA, "dni", "")).toBeNull();
  });

  it("otro tipo de documento con los mismos caracteres tampoco es ella", () => {
    expect(nombreDeFichaParaComprobante(ANA, "carne_extranjeria", "45678912")).toBeNull();
  });

  it("sin cliente en el ticket, o con su ficha sin nombre o sin documento, se consulta como siempre", () => {
    expect(nombreDeFichaParaComprobante(null, "dni", "45678912")).toBeNull();
    expect(nombreDeFichaParaComprobante({ ...ANA, nombre: "  " }, "dni", "45678912")).toBeNull();
    expect(nombreDeFichaParaComprobante({ ...ANA, documentoNumero: null }, "dni", "45678912")).toBeNull();
  });

  it("el nombre va sin espacios sobrantes y el número se compara sin espacios ni mayúsculas", () => {
    expect(nombreDeFichaParaComprobante({ ...ANA, nombre: " Ana Lozano " }, "dni", "4567 8912")).toBe("Ana Lozano");
    const conCarne: ClientaDelTicket = { ...ANA, documentoTipo: "carne_extranjeria", documentoNumero: "ab12345" };
    expect(nombreDeFichaParaComprobante(conCarne, "carne_extranjeria", "AB12345")).toBe("Ana Lozano");
  });
});
