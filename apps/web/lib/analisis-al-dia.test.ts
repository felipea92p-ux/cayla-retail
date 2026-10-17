import { describe, expect, it } from "vitest";
import { avisoCalidadDeDestino, avisoFranjaCarga, lecturaVieja, MINUTOS_PARA_ACTUALIZAR, pausaDelPiso, pisoCuadradoDe, TEXTO_PAUSA_PISO, textoDatosDe } from "./analisis-al-dia";
import type { PreparacionAnalisis } from "./analisis-tipos";

describe("la hora de la lectura (B4)", () => {
  it("dice la hora de Lima: 14:20 UTC son las 09:20 en Lima", () => {
    expect(textoDatosDe("2026-10-17T14:20:00.000Z")).toBe("Datos de las 09:20");
  });
  it("sin una hora que se entienda no inventa una", () => {
    expect(textoDatosDe(null)).toBeNull();
    expect(textoDatosDe("ayer")).toBeNull();
    expect(textoDatosDe("2026-10-17")).toBeNull();
  });
  it("ofrece «Actualizar» solo pasados los 30 minutos", () => {
    const t = Date.parse("2026-10-17T14:20:00.000Z");
    expect(lecturaVieja("2026-10-17T14:20:00.000Z", t + MINUTOS_PARA_ACTUALIZAR * 60_000)).toBe(false);
    expect(lecturaVieja("2026-10-17T14:20:00.000Z", t + MINUTOS_PARA_ACTUALIZAR * 60_000 + 1)).toBe(true);
    expect(lecturaVieja("basura", t + 10 * 3_600_000)).toBe(false);
  });
});

describe("la franja de carga inicial (B4)", () => {
  const sede = (hasta: string | null) => ({ sede: "Arequipa", hasta, hoy: "2026-10-17" });
  it("abierta con fecha: dice hasta cuándo y que no pida por esta lista", () => {
    expect(avisoFranjaCarga(sede("2026-10-21"))).toBe("Tu stock sigue en carga hasta el 21-oct: lo que ves en «Nunca salió al piso» todavía no es de ventas.");
  });
  it("el último día abierto todavía cuenta; el día siguiente ya no", () => {
    expect(avisoFranjaCarga(sede("2026-10-17"))).not.toBeNull();
    expect(avisoFranjaCarga(sede("2026-10-16"))).toBeNull();
  });
  it("sin fecha sigue abierta; sin dato no se avisa", () => {
    expect(avisoFranjaCarga(sede(null))).toContain("sin fecha de cierre");
    expect(avisoFranjaCarga(null)).toBeNull();
  });
});

describe("cuándo «Nunca salió al piso» espera (B4)", () => {
  const carga = { sede: "Lima", hasta: "2026-10-31", hoy: "2026-10-17" };
  it("la carga abierta pausa, cuadrado o no", () => {
    expect(pausaDelPiso(carga, true)).toBe("carga");
    expect(pausaDelPiso(carga, false)).toBe("carga");
  });
  it("sin carga, el piso sin cuadrar pausa; cuadrado o sin saber, no", () => {
    expect(pausaDelPiso(null, false)).toBe("sin_cuadre");
    expect(pausaDelPiso(null, true)).toBeNull();
    expect(pausaDelPiso(null, null)).toBeNull();
    expect(pausaDelPiso({ ...carga, hasta: "2026-10-01" }, true)).toBeNull();
  });
  it("toma la condición «Piso cuadrado» del motor", () => {
    const c = (cumple: boolean) => ({ condiciones: [{ clave: "piso_cuadrado" as const, titulo: "", cumple, detalle: "", falta: null }] });
    expect(pisoCuadradoDe(c(true))).toBe(true);
    expect(pisoCuadradoDe(c(false))).toBe(false);
    expect(pisoCuadradoDe({ condiciones: [] })).toBeNull();
    expect(pisoCuadradoDe(undefined)).toBeNull();
  });
  it("cada pausa dice por qué en palabras de tienda", () => {
    expect(TEXTO_PAUSA_PISO.sin_cuadre.linea).toContain("aún no se cuadró");
    expect(TEXTO_PAUSA_PISO.carga.linea).toContain("sigue en carga");
  });
});

describe("la calidad de registro de otra tienda, solo donde una acción la usa (B4)", () => {
  const prep = (identificada14: number | null): PreparacionAnalisis =>
    ({ identificada14, dias: [], hoy: "2026-10-17", primeraVenta: null, condiciones: [], racha: { dias: 0, ultimoDiaBajo: null } }) as unknown as PreparacionAnalisis;
  it("avisa si registra menos de 90 de cada 100 con su prenda", () => {
    expect(avisoCalidadDeDestino(prep(0.6), "Arequipa")).toBe("Arequipa registra pocas ventas con su prenda (60 de cada 100): cuenta con eso.");
  });
  it("calla si registra bien o no se sabe", () => {
    expect(avisoCalidadDeDestino(prep(0.95), "Arequipa")).toBeNull();
    expect(avisoCalidadDeDestino(prep(null), "Arequipa")).toBeNull();
    expect(avisoCalidadDeDestino(undefined, "Arequipa")).toBeNull();
  });
});
