import { describe, expect, it } from "vitest";
import { faltanDe, sePuedeConfirmar } from "./guia-campos";
import {
  camposPagarDeuda,
  deudasPorPersona,
  frasePagarDeuda,
  leerDeudasFondo,
  problemaDeMontoDeuda,
  repartoDelPago,
  type DeudaFondo,
} from "./deuda-fondo-reglas";
import type { CuentaOpcion } from "./fondos-reglas";

// La deuda de un faltante (ADR-0362, fase 6 · actividad 7). Lo que falta en la hoja es lo MISMO que rechaza `pagar_deuda_fondo`
// (20261014145000, `scripts/pruebas/deuda_fondo.mjs`): estos casos son los suyos, del lado de la pantalla.

const PERSONA = { esPersona: true, listo: true, motivo: null };
const CUENTAS: CuentaOpcion[] = [{ id: "bcp", nombre: "BCP", tipo: "banco", sede: null }];
const deuda = (d: Partial<DeudaFondo>): DeudaFondo => ({
  rendicionId: "r1",
  cuentaId: "f1",
  personaId: "ana",
  persona: "Ana Prueba",
  desde: "2026-10-13",
  faltante: 20,
  pagado: 0,
  debe: 20,
  esMio: false,
  ...d,
});

describe("leer lo que manda la base", () => {
  it("las filas de fn_deudas_fondo; sin rendición, persona o cifras se descartan", () => {
    const ds = leerDeudasFondo([
      { rendicion_id: "r1", cuenta_id: "f1", persona_id: "ana", persona_nombre: "Ana", desde: "2026-10-13", faltante: "20.00", pagado: "15", debe: "5", es_mio: false },
      { rendicion_id: "r2", persona_id: "ana", faltante: 10 },
      { persona_id: "ana", faltante: 1, pagado: 0, debe: 1 },
    ]);
    expect(ds).toEqual([deuda({ persona: "Ana", pagado: 15, debe: 5 })]);
    expect(leerDeudasFondo(null)).toEqual([]);
  });
});

describe("lo que debe cada persona", () => {
  it("suma sus rendiciones; solo las que deben algo quedan por pagar, la más vieja primero", () => {
    const m = deudasPorPersona([
      deuda({ rendicionId: "r0", faltante: 30, pagado: 30, debe: 0 }),
      deuda({ rendicionId: "r1" }),
      deuda({ rendicionId: "r2", desde: "2026-10-14", faltante: 10, debe: 10 }),
      deuda({ rendicionId: "x", personaId: "beto", persona: "Beto", faltante: 5, debe: 5 }),
    ]);
    expect(m.get("ana")).toMatchObject({ debe: 30, faltante: 60, pagado: 30 });
    expect(m.get("ana")?.deudas.map((d) => d.rendicionId)).toEqual(["r1", "r2"]);
    expect(m.get("beto")?.debe).toBe(5);
  });
  it("el pago va primero a la deuda más vieja (lo mismo que la base)", () => {
    const deudas = [deuda({ rendicionId: "r1" }), deuda({ rendicionId: "r2", desde: "2026-10-14", faltante: 10, debe: 10 })];
    expect(repartoDelPago(25, deudas)).toEqual([
      { rendicionId: "r1", desde: "2026-10-13", paga: 20 },
      { rendicionId: "r2", desde: "2026-10-14", paga: 5 },
    ]);
    expect(repartoDelPago(15, deudas)).toEqual([{ rendicionId: "r1", desde: "2026-10-13", paga: 15 }]);
  });
});

describe("lo que falta en «Registrar su pago»", () => {
  it("sin monto, sin cuenta: falta; la nota no", () => {
    expect(faltanDe(camposPagarDeuda({ cuentaId: "", monto: "", nota: "" }, 20, CUENTAS, PERSONA)).map((c) => c.id)).toEqual(["monto", "cuenta"]);
    expect(sePuedeConfirmar(camposPagarDeuda({ cuentaId: "bcp", monto: "15", nota: "" }, 20, CUENTAS, PERSONA))).toBe(true);
  });
  it("no más de lo que debe y mayor que cero (la base lo frena igual)", () => {
    expect(problemaDeMontoDeuda("21", 20)).toBe("Debe S/ 20.00: no puede pagar más.");
    expect(problemaDeMontoDeuda("0", 20)).toBe("El monto tiene que ser mayor que cero.");
    expect(problemaDeMontoDeuda("0.29", 20)).toBeNull();
    expect(problemaDeMontoDeuda("20", 20)).toBeNull();
  });
  it("desde una terminal, además, quién recibe la plata", () => {
    expect(faltanDe(camposPagarDeuda({ cuentaId: "bcp", monto: "5", nota: "" }, 20, CUENTAS, { esPersona: false, listo: false, motivo: null })).map((c) => c.id)).toEqual([
      "responsable",
    ]);
  });
  it("el botón dice cuánto se registra", () => {
    expect(frasePagarDeuda(15)).toBe("Registrar pago de S/ 15.00");
    expect(frasePagarDeuda(null)).toBe("Registrar el pago");
  });
});
