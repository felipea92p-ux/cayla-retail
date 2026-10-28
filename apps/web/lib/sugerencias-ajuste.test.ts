import { describe, it, expect } from "vitest";
import { MOTIVOS_AJUSTE, motivoPideNota } from "./ajuste-reglas";
import { sugerirNotaAjuste } from "./sugerencias-ajuste";

// ADR-0290: la prueba recorre TODOS los valores del control (los motivos de Ajustar) y exige totalidad, neutro sin contexto,
// que siga al control (A→B→A), que sea estable y que quepa a 375 px.
describe("la nota de Ajustar sigue el motivo elegido", () => {
  const motivos = MOTIVOS_AJUSTE.map((m) => m.valor);

  it("totalidad: cada motivo tiene su etiqueta y su ejemplo", () => {
    for (const m of motivos) {
      const n = sugerirNotaAjuste(m);
      expect(n.etiqueta.length, m).toBeGreaterThan(0);
      expect(n.placeholder.length, m).toBeGreaterThan(0);
    }
  });

  it("sin motivo, una instrucción neutra que no promete nada", () => {
    expect(sugerirNotaAjuste("")).toEqual({ etiqueta: "Observación (opcional)", placeholder: "Detalle libre del ajuste", obligatoria: false });
  });

  it("«Encontré prendas» pide dónde estaban, y es la única obligatoria (la misma regla que la base y que `motivoPideNota`)", () => {
    expect(sugerirNotaAjuste("reposicion")).toMatchObject({ etiqueta: "¿Dónde las encontraste?", obligatoria: true });
    for (const m of motivos) expect(sugerirNotaAjuste(m).obligatoria, m).toBe(motivoPideNota(m));
  });

  it("sin contradicción: el ejemplo de un motivo no habla de otro", () => {
    expect(sugerirNotaAjuste("merma").placeholder).not.toMatch(/encontr/i);
    expect(sugerirNotaAjuste("reposicion").placeholder).not.toMatch(/manch|rompi|dañ/i);
    expect(sugerirNotaAjuste("conteo_fisico").placeholder).toMatch(/cont/i);
  });

  it("sigue al control (A→B→A) y es estable", () => {
    const a = sugerirNotaAjuste("reposicion");
    const b = sugerirNotaAjuste("merma");
    expect(b).not.toEqual(a);
    expect(sugerirNotaAjuste("reposicion")).toEqual(a);
  });

  it("cabe en la caja a 375 px (40 caracteres o menos)", () => {
    for (const m of ["", ...motivos] as const) expect(sugerirNotaAjuste(m).placeholder.length, m).toBeLessThanOrEqual(40);
  });
});
