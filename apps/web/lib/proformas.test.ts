import { describe, it, expect } from "vitest";
import { marcarPorVencer, type ProformaFila } from "./proformas-reglas";
import { HORAS_PROFORMA_POR_VENCER } from "@cayla-retail/shared";

// "Por vencer" decide qué clienta aparece arriba en la pantalla de Facturación:
// la que todavía se puede llamar hoy para cerrar la venta antes de que caduque su
// cotización. Antes esto se calculaba durante el render con `Date.now()`, así que
// no se podía probar y cada navegador decidía por su cuenta. Con el reloj como
// parámetro, se prueba con horas fijas en vez de esperar dos días.

const AHORA = Date.parse("2026-09-05T12:00:00Z");
const enHoras = (h: number) => new Date(AHORA + h * 3600 * 1000).toISOString();

function fila(extra: Partial<ProformaFila>): ProformaFila {
  return {
    id: "p1",
    sede_id: "s1",
    cliente_nombre: "Ana Torres",
    cliente_num_doc: null,
    total: 350,
    estado: "vigente",
    comprobante_id: null,
    created_at: enHoras(-24),
    vence_at: enHoras(10),
    ...extra,
  };
}

const marcada = (extra: Partial<ProformaFila>) => marcarPorVencer([fila(extra)], AHORA)[0].porVencer;

describe("marcarPorVencer", () => {
  it("marca la que vence dentro de la ventana", () => {
    expect(marcada({ vence_at: enHoras(10) })).toBe(true);
  });

  it("no marca la que vence más allá de la ventana", () => {
    expect(marcada({ vence_at: enHoras(HORAS_PROFORMA_POR_VENCER + 1) })).toBe(false);
  });

  it("el borde exacto de la ventana todavía NO cuenta", () => {
    expect(marcada({ vence_at: enHoras(HORAS_PROFORMA_POR_VENCER) })).toBe(false);
  });

  it("una que YA venció no es 'por vencer' — esa venta ya se perdió", () => {
    expect(marcada({ vence_at: enHoras(-1) })).toBe(false);
  });

  it("una proforma ya convertida no se marca por más cerca que esté", () => {
    expect(marcada({ estado: "convertida", vence_at: enHoras(2) })).toBe(false);
  });

  it("una anulada tampoco", () => {
    expect(marcada({ estado: "anulada", vence_at: enHoras(2) })).toBe(false);
  });

  it("sin fecha de vencimiento no se marca", () => {
    expect(marcada({ vence_at: null })).toBe(false);
  });

  it("es determinista: dos llamadas con el mismo reloj dan lo mismo", () => {
    const filas = [fila({ vence_at: enHoras(10) }), fila({ id: "p2", vence_at: enHoras(100) })];
    expect(marcarPorVencer(filas, AHORA)).toEqual(marcarPorVencer(filas, AHORA));
  });
});
