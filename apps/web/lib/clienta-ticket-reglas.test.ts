import { describe, expect, it } from "vitest";
import { filaDeClienta, type ClientaDelTicket } from "./clienta-ticket-reglas";

// La fila «Clienta» del Punto de venta y el módulo «Clientas» (ADR-0249, actualización 2026-09-28). La base le rechaza la
// búsqueda de la libreta a la cuenta cuyo rol no tiene el módulo (42501 `clientas_sin_modulo`): el ticket no se la ofrece,
// porque un botón que siempre falla le enseña a la cajera que el sistema falla. Se vende igual: el DNI va en el comprobante.

const ANA: ClientaDelTicket = { id: "c1", nombre: "Ana Lozano", dni: "45678912", celular: "987111222" };

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
