import { describe, expect, it } from "vitest";
import type { PulsoImpuestos } from "./impuestos-pulso-reglas";
import type { SedeTelar } from "./finanzas-telar-reglas";
import { respuestaImpuestos, sedeDeLaCabecera } from "./impuestos-telar-reglas";

const pulso = (p: Partial<Extract<PulsoImpuestos, { estado: "a_pagar" | "a_favor" }>>): PulsoImpuestos => ({
  estado: "a_pagar", mes: "2026-09", total: 9290, igv: 8400, aFavor: 0, renta: 890, verbo: "le pagas", frase: "", deCada: "", cuenta: [], ...p,
});

describe("respuestaImpuestos", () => {
  it("el mes que se declara: IGV + renta, cuándo se paga y cuánto falta", () => {
    expect(respuestaImpuestos(pulso({}), { enCurso: false, pendientes: 3 })).toEqual({
      pregunta: "¿Cuánto le pagas a SUNAT por septiembre?",
      valor: 9290,
      chips: [{ texto: "Se paga en octubre", tono: "pizarra" }, { texto: "3 antes de declarar", tono: "ambar" }],
    });
  });

  it("el mes en curso: la pregunta va en futuro y un chip dice que todavía cambia", () => {
    const r = respuestaImpuestos(pulso({ mes: "2026-10" }), { enCurso: true, pendientes: 2 });
    expect(r.pregunta).toBe("¿Cuánto le pagarás a SUNAT por octubre?");
    expect(r.chips).toEqual([{ texto: "Va a la fecha: todavía cambia", tono: "pizarra" }, { texto: "2 antes de declarar", tono: "ambar" }]);
  });

  it("nunca más de dos chips, para que la respuesta quepa a la derecha", () => {
    const r = respuestaImpuestos(pulso({ estado: "a_favor", total: 1, igv: 0, aFavor: 8043, renta: 1 }), { enCurso: true, pendientes: 4 });
    expect(r.chips).toHaveLength(2);
  });

  it("a favor: lo que sale es solo la renta, y el IGV a favor se dice", () => {
    const r = respuestaImpuestos(pulso({ estado: "a_favor", total: 1, igv: 0, aFavor: 8043, renta: 1 }), { enCurso: false, pendientes: 0 });
    expect(r.valor).toBe(1);
    expect(r.chips).toContainEqual({ texto: "IGV a favor: S/ 8,043", tono: "verde" });
  });

  it("a favor sin renta conocida: cero, no un hueco", () => {
    expect(respuestaImpuestos(pulso({ estado: "a_favor", total: 0, igv: 0, aFavor: 500, renta: null }), { enCurso: false, pendientes: 0 }).valor).toBe(0);
  });

  it("un mes sin movimiento lo dice con su frase", () => {
    expect(respuestaImpuestos({ estado: "sin_mes", mes: "2025-08", frase: "En agosto no hubo ventas…" }, { enCurso: false, pendientes: 0 })).toMatchObject({ valor: 0, motivo: "En agosto no hubo ventas…" });
  });

  it("si no se pudo leer, valor null: la cabecera lo dice, nunca un cero", () => {
    expect(respuestaImpuestos(null, { enCurso: false, pendientes: 0 }).valor).toBeNull();
  });
});

describe("sedeDeLaCabecera", () => {
  const sedes: SedeTelar[] = [
    { clave: "u-lim", nombre: "Lima", color: "lim" },
    { clave: "empresa", nombre: "Empresa", color: "emp" },
  ];
  it("todas, una sede, la empresa y una sede que ya no existe", () => {
    expect(sedeDeLaCabecera("todas", sedes)).toBe("Todas las sedes");
    expect(sedeDeLaCabecera("u-lim", sedes)).toBe("Lima");
    expect(sedeDeLaCabecera("empresa", sedes)).toBe("Empresa");
    expect(sedeDeLaCabecera("u-vieja", sedes)).toBe("Todas las sedes");
  });
});
