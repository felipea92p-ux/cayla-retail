import { describe, it, expect } from "vitest";
import { MAX_PISTA_DANADA, pistaDeNota } from "./sugerencias-danadas";
import { TIPOS_DANO } from "./danadas-reglas";

describe("el ejemplo del detalle de una dañada sigue al tipo elegido", () => {
  it("hay uno por tipo, ninguno vacío, todos distintos y cortos", () => {
    const pistas = TIPOS_DANO.map((t) => pistaDeNota(t.valor));
    for (const p of pistas) {
      expect(p.trim().length).toBeGreaterThan(0);
      expect(p.length).toBeLessThanOrEqual(MAX_PISTA_DANADA);
    }
    expect(new Set(pistas).size).toBe(TIPOS_DANO.length);
  });

  it("no contradice al tipo: cada ejemplo habla de lo suyo", () => {
    expect(pistaDeNota("mancha").toLowerCase()).toMatch(/grasa|mancha/);
    expect(pistaDeNota("descosido").toLowerCase()).toMatch(/costura/);
    expect(pistaDeNota("boton_cierre").toLowerCase()).toMatch(/botón|cierre/);
    expect(pistaDeNota("rotura").toLowerCase()).toMatch(/rasgón|rotura|roto/);
  });

  it("sin tipo no promete nada, y sigue al control (A → B → A) sin azar", () => {
    expect(pistaDeNota(null)).toBe("Primero elige qué tiene");
    expect(pistaDeNota(undefined)).toBe(pistaDeNota(null));
    const a = pistaDeNota("mancha");
    pistaDeNota("rotura");
    expect(pistaDeNota("mancha")).toBe(a);
  });
});
