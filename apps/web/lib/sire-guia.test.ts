import { describe, expect, it } from "vitest";
import { camposDeLaPropuesta, camposDeResolver } from "./sire-guia";
import { sePuedeConfirmar } from "./guia-campos";
import type { LecturaSire } from "./sire-propuesta-reglas";

const listo = { listo: true, motivo: null };
const leida: LecturaSire = { ok: true, propuesta: { registro: "compras", mes: "2026-10", rucPropio: "20605964550", lineas: [] } };

describe("camposDeLaPropuesta", () => {
  it("sin archivo, lo que falta es elegirlo", () => {
    const c = camposDeLaPropuesta(null, listo);
    expect(sePuedeConfirmar(c)).toBe(false);
    expect(c[0]!.pendiente).toContain("Elige el archivo");
  });
  it("un archivo que el lector rechazó dice por qué, con las palabras del lector", () => {
    const c = camposDeLaPropuesta({ ok: false, error: "Este archivo es la propuesta de ventas. Aquí va la de compras." }, listo);
    expect(c[0]).toMatchObject({ hecho: false, pendiente: "Este archivo es la propuesta de ventas. Aquí va la de compras." });
  });
  it("se guarda solo con el archivo leído y el responsable listo: la misma regla que el botón", () => {
    expect(sePuedeConfirmar(camposDeLaPropuesta(leida, listo))).toBe(true);
    expect(sePuedeConfirmar(camposDeLaPropuesta(leida, { listo: false, motivo: "Marca tu asistencia." }))).toBe(false);
  });
});

describe("camposDeResolver", () => {
  it("solo falta quién lo decide", () => {
    expect(sePuedeConfirmar(camposDeResolver(listo))).toBe(true);
    expect(camposDeResolver({ listo: false, motivo: null })[0]!.pendiente).toBe("Elige quién toma la decisión.");
  });
});
