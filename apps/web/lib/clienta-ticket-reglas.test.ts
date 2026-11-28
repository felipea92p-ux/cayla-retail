import { describe, expect, it } from "vitest";
import {
  ALTA_VACIA,
  altaDesdeBusqueda,
  clientaDeTicketGuardado,
  dniDelComprobante,
  fichaDeEseDni,
  seSueltaLaFicha,
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

describe("la ficha que se une sola por el DNI del comprobante (ADR-0718)", () => {
  const boleta = { tipoComprobante: "boleta" as const, identidad: "dni" as const, numero: "45678912" };

  it("busca con un DNI completo en boleta o nota de venta", () => {
    expect(dniDelComprobante(boleta)).toBe("45678912");
    expect(dniDelComprobante({ ...boleta, tipoComprobante: "nota_venta" })).toBe("45678912");
  });

  it("no busca a medias, en factura, con carné o sin comprobante elegido", () => {
    expect(dniDelComprobante({ ...boleta, numero: "4567891" })).toBeNull();
    expect(dniDelComprobante({ ...boleta, tipoComprobante: "factura" })).toBeNull();
    expect(dniDelComprobante({ ...boleta, identidad: "carne_extranjeria" })).toBeNull();
    expect(dniDelComprobante({ ...boleta, tipoComprobante: null })).toBeNull();
  });

  it("une solo la ficha con ese DNI exacto, no la que coincide por nombre o celular", () => {
    const otra: ClientaDelTicket = { ...ANA, id: "c2", documentoNumero: "11111111" };
    expect(fichaDeEseDni([otra, ANA], "45678912")?.id).toBe("c1");
    expect(fichaDeEseDni([otra], "45678912")).toBeNull();
    expect(fichaDeEseDni([{ ...ANA, documentoTipo: "carne_extranjeria" }], "45678912")).toBeNull();
  });

  it("al corregir el DNI, pasar a factura o a otro documento, la ficha unida sola se suelta", () => {
    const sola = { ...ANA, porDocumento: true };
    expect(seSueltaLaFicha(sola, boleta)).toBe(false);
    expect(seSueltaLaFicha(sola, { ...boleta, numero: "45678913" })).toBe(true);
    expect(seSueltaLaFicha(sola, { ...boleta, tipoComprobante: "factura" })).toBe(true);
    expect(seSueltaLaFicha(sola, { ...boleta, identidad: "pasaporte" })).toBe(true);
  });

  it("la elegida a mano no se suelta: la boleta puede ir a otro nombre", () => {
    expect(seSueltaLaFicha(ANA, { ...boleta, numero: "11111111" })).toBe(false);
    expect(seSueltaLaFicha(null, boleta)).toBe(false);
  });

  it("un ticket en espera conserva que la ficha se unió sola", () => {
    expect(clientaDeTicketGuardado({ ...ANA, porDocumento: true })?.porDocumento).toBe(true);
    expect(clientaDeTicketGuardado(ANA)).not.toHaveProperty("porDocumento");
  });
});
