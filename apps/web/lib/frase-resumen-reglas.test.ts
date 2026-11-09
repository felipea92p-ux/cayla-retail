import { describe, expect, it } from "vitest";
import { FRASE_DE_SIEMPRE, fraseDelResumen } from "./frase-resumen-reglas";
import type { SaldoBolsillos } from "./bolsillos-reglas";

const texto = (p: { texto: string }[]) => p.map((x) => x.texto).join("").replace(/ /g, " ");
const cayla = (tienes: number, libre: number): SaldoBolsillos => ({ tipo: "cayla", tienes, libre, tienesDetalle: "", hasta: "2026-11-23", bolsillos: [], provisional: false, sinPlanilla: false, dicho: "" });
const ESTIMADO = { tipo: "estimado" as const, estimado: 12_323, rango: [4_162, 20_484] as [number, number], hastaHoy: 1_225, faltaVender: 0, faltaGastar: 0, dias: { van: 9, total: 30 } };

describe("fraseDelResumen — la cabecera responde lo que importa", () => {
  it("el mes en curso: lo que tienes, lo que puedes usar y lo que te deja", () => {
    const p = fraseDelResumen({ saldo: cayla(79_475, 14_607), te: ESTIMADO, nombreMes: "noviembre", enCurso: true });
    expect(texto(p)).toBe("Tienes S/ 79,475 y puedes usar S/ 14,607 sin dejar de pagar nada. Al ritmo de hoy, noviembre te deja unos S/ 12,323.");
    expect(p.find((x) => x.fuerte)?.texto.replace(/ /g, " ")).toBe("S/ 14,607");
  });
  it("si lo que tiene dueño pasa lo que hay, lo dice sin un número negativo", () => {
    expect(texto(fraseDelResumen({ saldo: cayla(619, -41_972), te: ESTIMADO, nombreMes: "noviembre", enCurso: true }))).toContain("pide S/ 41,972 más");
  });
  it("un mes cerrado dice lo que dejó o lo que faltó", () => {
    expect(texto(fraseDelResumen({ saldo: cayla(1, 1), te: { tipo: "cerrado", resultado: -452, porCien: -57 }, nombreMes: "octubre", enCurso: false }))).toBe("Octubre te faltó S/ 452.");
  });
  it("sin números, la frase de siempre", () => {
    expect(texto(fraseDelResumen({ saldo: { tipo: "sin_dato", motivo: "", noSePudoLeer: false }, te: { tipo: "sin_dato", motivo: "" }, nombreMes: "noviembre", enCurso: true }))).toBe(FRASE_DE_SIEMPRE);
  });
});
