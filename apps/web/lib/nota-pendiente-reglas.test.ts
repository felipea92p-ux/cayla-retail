import { describe, expect, it } from "vitest";
import { chipNotaPendiente, idsConFaltanteCerrado, type NotaPendiente } from "./nota-pendiente-reglas";

const resuelta: NotaPendiente = { unidadesCerradas: 4, montoEsperado: 236, resuelto: true };
const abierta: NotaPendiente = { unidadesCerradas: 4, montoEsperado: 236, resuelto: false };

describe("chipNotaPendiente", () => {
  it("el chip dice el monto esperado con dos decimales y es ámbar", () => {
    const c = chipNotaPendiente(resuelta, 1416);
    expect(c.texto).toBe("Esperando nota S/ 236.00");
    expect(c.tono).toBe("ambar");
  });

  it("con miles usa el formato de Perú (S/ 1,416.00)", () => {
    expect(chipNotaPendiente({ ...resuelta, montoEsperado: 1416 }, 1416).texto).toBe("Esperando nota S/ 1,416.00");
  });

  it("resuelto: avisa que ya puede registrarse, en el aviso corto y en la pista", () => {
    const c = chipNotaPendiente(resuelta, 1416);
    expect(c.ayuda).toBe("Ya puedes registrarla");
    expect(c.pista).toContain("ya puedes registrarla");
  });

  it("no resuelto: sin aviso corto, y la pista explica que se espera al 100 %", () => {
    const c = chipNotaPendiente(abierta, 1416);
    expect(c.ayuda).toBeNull();
    expect(c.pista).not.toContain("ya puedes registrarla");
    expect(c.pista).toContain("cuando el comprobante quede al 100 %");
  });

  it("con saldo pendiente la advertencia es no pagar esa parte", () => {
    expect(chipNotaPendiente(resuelta, 1416).pista).toContain("No pagues esa parte.");
  });

  it("ya pagado (sin saldo): la nota quedará a favor, no se dice «no pagues»", () => {
    const c = chipNotaPendiente(resuelta, 0);
    expect(c.pista).toContain("quedará a tu favor");
    expect(c.pista).not.toContain("No pagues");
  });

  it("singular y plural de unidades", () => {
    expect(chipNotaPendiente({ ...resuelta, unidadesCerradas: 1 }, 10).pista).toContain("Cerraste 1 unidad que no llegaron");
    expect(chipNotaPendiente({ ...resuelta, unidadesCerradas: 14 }, 10).pista).toContain("Cerraste 14 unidades que no llegaron");
  });

  it("la pista nombra el monto, para el tooltip y el lector de pantalla", () => {
    expect(chipNotaPendiente(resuelta, 1416).pista).toContain("por S/ 236.00");
  });
});

describe("idsConFaltanteCerrado", () => {
  const c = (id: string, estado: string, cerradoCantidad: number) => ({ id, estado, cerradoCantidad });

  it("solo los vigentes con algo cerrado", () => {
    expect(idsConFaltanteCerrado([c("a", "vigente", 4), c("b", "vigente", 0), c("c", "anulada", 4), c("d", "vigente", 1)])).toEqual(["a", "d"]);
  });

  it("una página sin faltantes cerrados no pregunta por ningún id (la pantalla no llama a la base)", () => {
    expect(idsConFaltanteCerrado([c("a", "vigente", 0), c("b", "vigente", 0)])).toEqual([]);
    expect(idsConFaltanteCerrado([])).toEqual([]);
  });
});
