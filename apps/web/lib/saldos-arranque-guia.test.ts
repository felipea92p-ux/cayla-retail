import { describe, expect, it } from "vitest";
import { camposDeArranque } from "./saldos-arranque-guia";
import { fraseDeLoQueFalta, sePuedeConfirmar } from "./guia-campos";

const listo = { corrige: true, montosIlegibles: [] as string[], cuadra: true, motivo: "factura registrada tarde", responsableListo: true, responsableMotivo: null };
const de = (o: Partial<typeof listo> | Record<string, unknown>) => camposDeArranque({ ...listo, ...o } as typeof listo);
const campo = (cs: ReturnType<typeof de>, id: string) => cs.find((c) => c.id === id)!;

// Tarea 171: cada motivo por el que antes el botón se apagaba en silencio ahora se dice bajo su campo.
describe("lo que falta para guardar los saldos de arranque", () => {
  it("con todo bien se puede confirmar", () => expect(sePuedeConfirmar(de({}))).toBe(true));
  it("el motivo corto dice el mínimo", () => {
    const cs = de({ motivo: "abc" });
    expect(sePuedeConfirmar(cs)).toBe(false);
    expect(campo(cs, "motivo").pendiente).toContain("5 letras");
  });
  it("el motivo no cuenta los espacios", () => expect(campo(de({ motivo: "  ab   " }), "motivo").hecho).toBe(false));
  it("la primera vez no se pide motivo", () => expect(de({ corrige: false, motivo: "" }).some((c) => c.id === "motivo")).toBe(false));
  it("un monto ilegible nombra la cuenta", () => {
    const cs = de({ montosIlegibles: ["Capital", "Aportes del dueño"] });
    expect(sePuedeConfirmar(cs)).toBe(false);
    expect(campo(cs, "montos").pendiente).toContain("Capital, Aportes del dueño");
  });
  it("lo que no cuadra se dice", () => {
    const cs = de({ cuadra: false });
    expect(sePuedeConfirmar(cs)).toBe(false);
    expect(fraseDeLoQueFalta(cs)).toContain("cuadre");
  });
  it("el responsable dice su motivo", () => {
    expect(campo(de({ responsableListo: false, responsableMotivo: "Marca tu entrada" }), "responsable").pendiente).toBe("Marca tu entrada");
    expect(campo(de({ responsableListo: false, responsableMotivo: null }), "responsable").pendiente).toContain("quién");
  });
});
