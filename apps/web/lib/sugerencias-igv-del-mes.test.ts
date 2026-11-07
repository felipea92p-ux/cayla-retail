import { describe, expect, it } from "vitest";
import { sugerirNotaIgv } from "./sugerencias-igv-del-mes";

const MAX = 42;

describe("sugerirNotaIgv", () => {
  const estados = [
    { aPagar: 100, saldoAFavor: 0 },
    { aPagar: 0, saldoAFavor: 100 },
    { aPagar: 0, saldoAFavor: 0 },
  ];
  it("sigue lo que dice Impuestos del mes y vuelve al mirar otro", () => {
    const a = sugerirNotaIgv(estados[0]!);
    const b = sugerirNotaIgv(estados[1]!);
    expect(a).toContain("contador");
    expect(b).toContain("saldo a favor");
    expect(sugerirNotaIgv(estados[0]!)).toBe(a);
  });
  it("con un mes sin nada no promete nada", () => {
    expect(sugerirNotaIgv(estados[2]!)).toBe("Por qué este monto");
  });
  it("cabe a 375 px, dentro de la hoja", () => {
    for (const e of estados) expect(sugerirNotaIgv(e).length).toBeLessThanOrEqual(MAX);
  });
});
