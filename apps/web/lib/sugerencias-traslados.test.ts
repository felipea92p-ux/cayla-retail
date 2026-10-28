import { describe, expect, it } from "vitest";
import { MAX_EJEMPLO_NOTA, ejemploNotaCierre, ejemploNotaSobrante } from "./sugerencias-traslados";

const l = (p: Partial<Parameters<typeof ejemploNotaCierre>[0][number]> & { varianteId: string }) => ({
  referencia: "Falda Ariana",
  talla: "M",
  color: "Rosado",
  cantidadEnviada: 3,
  cantidadRecibida: null,
  ...p,
});

describe("ejemploNotaCierre", () => {
  it("nombra la prenda que faltó y quién la mandó", () => {
    expect(ejemploNotaCierre([l({ varianteId: "a" })], { a: 2 }, "Taller")).toBe("Ej. Falda Ariana M rosado no vino en la caja; Taller la busca");
  });
  it("si sobró, lo dice como sobrante", () => {
    expect(ejemploNotaCierre([l({ varianteId: "a" })], { a: 4 }, "Tienda Lima")).toBe("Ej. Llegó de más Falda Ariana M rosado; se avisó a Tienda Lima");
  });
  it("sigue a lo contado: otra prenda, otro ejemplo (A→B→A)", () => {
    const ls = [l({ varianteId: "a" }), l({ varianteId: "b", referencia: "Blusa Emma", talla: "S", color: "Negro", cantidadEnviada: 4 })];
    const a = ejemploNotaCierre(ls, { a: 2, b: 4 }, "Taller");
    const b = ejemploNotaCierre(ls, { a: 3, b: 3 }, "Taller");
    expect(a).toContain("Falda Ariana");
    expect(b).toContain("Blusa Emma");
    expect(ejemploNotaCierre(ls, { a: 2, b: 4 }, "Taller")).toBe(a);
  });
  it("sin diferencia, un texto neutro", () => {
    expect(ejemploNotaCierre([l({ varianteId: "a" })], { a: 3 }, "Taller")).not.toContain("Falda");
  });
  it("un nombre largo se acorta a la referencia para caber", () => {
    const largo = l({ varianteId: "a", referencia: "Vestido largo de fiesta con encaje bordado", color: "Verde esmeralda oscuro" });
    const t = ejemploNotaCierre([largo], { a: 1 }, "Tienda Trujillo");
    expect(t.length).toBeLessThanOrEqual(MAX_EJEMPLO_NOTA + 20);
    expect(t).not.toContain("esmeralda");
  });
});

describe("ejemploNotaSobrante (ADR-0404)", () => {
  const DECISIONES = ["salio_del_origen", "encontrada", "error_de_conteo"] as const;
  it("cada decisión tiene su ejemplo, distinto de las otras y del neutro", () => {
    const textos = [...DECISIONES.map((d) => ejemploNotaSobrante(d, "Tienda Lima")), ejemploNotaSobrante(null, "Tienda Lima")];
    expect(new Set(textos).size).toBe(4);
    for (const t of textos) expect(t.startsWith("Ej. ")).toBe(true);
  });
  it("«salió del origen» nombra la sede que envió", () => {
    expect(ejemploNotaSobrante("salio_del_origen", "Tienda Lima")).toContain("Tienda Lima");
  });
  it("sigue a lo elegido (A→B→A) y es estable", () => {
    const a = ejemploNotaSobrante("encontrada", "Taller");
    const b = ejemploNotaSobrante("error_de_conteo", "Taller");
    expect(a).not.toBe(b);
    expect(ejemploNotaSobrante("encontrada", "Taller")).toBe(a);
  });
  it("sin elegir, un texto que no promete nada", () => {
    expect(ejemploNotaSobrante(null, "Tienda Lima")).not.toContain("Tienda Lima");
  });
  it("cabe en el celular, también con un nombre de sede largo", () => {
    for (const d of [...DECISIONES, null]) expect(ejemploNotaSobrante(d, "Tienda Arequipa Centro Comercial Real Plaza").length).toBeLessThanOrEqual(MAX_EJEMPLO_NOTA);
  });
});
