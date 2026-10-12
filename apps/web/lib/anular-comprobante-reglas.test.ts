import { describe, expect, it } from "vitest";
import { motivoParaNoPedirBaja, type DatosParaPedirBaja } from "./anular-comprobante-reglas";

const listo: DatosParaPedirBaja = { esLider: true, estado: "aceptado", anulacion_solicitada_at: null, notasVigentes: 0 };

describe("motivoParaNoPedirBaja — lo que se revisa antes de llamar a Lucode", () => {
  it("un líder con un comprobante aceptado, sin baja pedida ni notas: se puede pedir", () => {
    expect(motivoParaNoPedirBaja(listo)).toBeNull();
  });

  it("quien no es líder recibe 403, aunque todo lo demás esté bien", () => {
    expect(motivoParaNoPedirBaja({ ...listo, esLider: false })?.status).toBe(403);
  });

  it("el permiso se mira primero: quien no es líder no se entera del estado del comprobante", () => {
    expect(motivoParaNoPedirBaja({ ...listo, esLider: false, estado: "rechazado", notasVigentes: 2 })?.status).toBe(403);
  });

  it.each(["pendiente", "pendiente_reintento", "enviado", "rechazado", "anulado", "no_emitido"] as const)(
    "un comprobante %s no se anula (409)",
    (estado) => {
      const r = motivoParaNoPedirBaja({ ...listo, estado });
      expect(r?.status).toBe(409);
      expect(r?.error).toContain(estado);
    },
  );

  it("una baja ya pedida y sin confirmar no se pide otra vez: se consulta", () => {
    const r = motivoParaNoPedirBaja({ ...listo, anulacion_solicitada_at: "2026-10-12T15:00:00Z" });
    expect(r?.status).toBe(409);
    expect(r?.error).toMatch(/en trámite/);
  });

  it("con una nota de crédito o débito vigente no se pide la baja", () => {
    const r = motivoParaNoPedirBaja({ ...listo, notasVigentes: 1 });
    expect(r?.status).toBe(409);
    expect(r?.error).toMatch(/nota/);
  });
});
