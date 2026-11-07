import { describe, expect, it } from "vitest";
import { pideComprobante, sinComprobanteGrande } from "./gastos-extracto-reglas";
import { camposNoEmite, conNoEmite, leerNoEmiten, payloadNoEmite, problemaNoEmite, textoNoEmite, type BorradorNoEmite } from "./gastos-no-emite-reglas";

const LISTO = { listo: true, motivo: null };

describe("problemaNoEmite y la guía de foco", () => {
  it.each<[BorradorNoEmite, string | null]>([
    [{ motivo: "", nota: "" }, "Elige por qué no tiene comprobante."],
    [{ motivo: "no_emite", nota: "" }, null],
    [{ motivo: "se_perdio", nota: "" }, null],
    [{ motivo: "otro", nota: "  " }, "Cuenta en una línea por qué no tiene comprobante."],
    [{ motivo: "otro", nota: "a".repeat(201) }, "El motivo cabe en 200 letras."],
    [{ motivo: "otro", nota: "El maestro no tiene RUC" }, null],
  ])("%o → %s", (b, problema) => {
    expect(problemaNoEmite(b)).toBe(problema);
    const faltan = camposNoEmite(b, LISTO).filter((c) => c.requerido && !c.hecho);
    expect(faltan.length === 0).toBe(problema === null);
  });
  it("la nota solo aparece con «Otro motivo»", () => {
    expect(camposNoEmite({ motivo: "no_emite", nota: "" }, LISTO).map((c) => c.id)).toEqual(["motivo", "responsable"]);
    expect(camposNoEmite({ motivo: "otro", nota: "" }, LISTO).map((c) => c.id)).toEqual(["motivo", "nota", "responsable"]);
  });
});

describe("payloadNoEmite y textoNoEmite", () => {
  it("la nota solo va con «Otro motivo»", () => {
    expect(payloadNoEmite("g1", { motivo: "no_emite", nota: "quedó escrita" })).toEqual({ p_gasto_id: "g1", p_motivo: "no_emite", p_nota: null });
    expect(payloadNoEmite("g1", { motivo: "otro", nota: " Sin RUC " }).p_nota).toBe("Sin RUC");
  });
  it("se lee con su motivo, o con la nota si es otro", () => {
    expect(textoNoEmite({ motivo: "no_emite", nota: null })).toBe("El proveedor no emite comprobante");
    expect(textoNoEmite({ motivo: "otro", nota: "Sin RUC" })).toBe("Sin RUC");
  });
});

describe("leerNoEmiten y conNoEmite", () => {
  it("lee lo que entiende y deja fuera lo demás", () => {
    const m = leerNoEmiten([{ gasto_id: "a", motivo: "se_perdio", nota: null }, { gasto_id: "b", motivo: "raro" }, { motivo: "no_emite" }]);
    expect([...m.keys()]).toEqual(["a"]);
    expect(leerNoEmiten(null).size).toBe(0);
  });
  it("junta la marca con su gasto; los demás quedan sin marca", () => {
    const g = conNoEmite([{ id: "a" }, { id: "b" }], new Map([["a", { motivo: "no_emite" as const, nota: null }]]));
    expect(g.map((x) => x.noEmite?.motivo ?? null)).toEqual(["no_emite", null]);
  });
});

describe("un gasto marcado «no emite» sale de lo que pide algo (Felipe: «sale de la cuenta»)", () => {
  const grande = { estado: "vigente", comprobanteTipo: "sin_comprobante", montoTotal: 450 };
  it("pideComprobante deja de pedirlo", () => {
    expect(pideComprobante(grande)).toBe(true);
    expect(pideComprobante({ ...grande, noEmite: { motivo: "no_emite", nota: null } })).toBe(false);
  });
  it("y la cuenta del chip, la bandeja y «Te toca» lo deja fuera", () => {
    expect(sinComprobanteGrande([grande, { ...grande, noEmite: { motivo: "se_perdio", nota: null } }]).n).toBe(1);
  });
});
