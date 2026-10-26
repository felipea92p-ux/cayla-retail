import { describe, expect, it } from "vitest";
import { DIAS_DE_VENTAS, diasDeVentasDelErp, hayUltimos30, periodoDeVentas, ultimosDeVentas } from "./plan-compra-periodo";
import { propuestaDeNormal } from "./plan-compra-reglas";
import { explicarPropuesta, proponer, type LecturaPropuesta, type TiendaPropuesta } from "./plan-compra-propuesta";

const tienda = (id: string, dias90: number): TiendaPropuesta => ({ id, nombre: `Tienda ${id}`, dias90, ventanas: 0, previaDisponible: false, multiplicador: null, multiplicadorHistorial: null });
const lectura = (tiendas: TiendaPropuesta[]): LecturaPropuesta => ({
  planId: "p",
  diasCampana: 30,
  previa: { desde: "2025-12-01", hasta: "2025-12-31" },
  recupero: { pct: null, heredado: false },
  tiendas,
  categorias: new Map([["polos", tiendas.map((t) => ({ tienda: t.id, u90: 366, ventanas: [], previa: 0, agotada: false }))]]),
  tiendasActivas: tiendas.map((t) => ({ id: t.id, nombre: t.nombre })),
  minimos: new Map(),
  historialLeido: false,
});

describe("diasDeVentasDelErp: cuántos días de ventas tiene de verdad el ERP", () => {
  it("es el mayor de las tiendas, con tope de 90", () => {
    expect(diasDeVentasDelErp([{ dias90: 26 }, { dias90: 12 }])).toBe(26);
    expect(diasDeVentasDelErp([{ dias90: 90 }, { dias90: 40 }])).toBe(90);
    expect(diasDeVentasDelErp([{ dias90: 400 }])).toBe(DIAS_DE_VENTAS);
  });
  it("sin tiendas (la base no manda la propuesta) no se sabe: undefined, no 0", () => {
    expect(diasDeVentasDelErp([])).toBeUndefined();
    expect(diasDeVentasDelErp(null)).toBeUndefined();
    expect(diasDeVentasDelErp(undefined)).toBeUndefined();
  });
  it("una tienda que todavía no vendió cuenta 0 días", () => {
    expect(diasDeVentasDelErp([{ dias90: 0 }])).toBe(0);
  });
});

describe("periodoDeVentas: «90 días» solo si de verdad los hay", () => {
  it("con 90 o más, o sin saber, dice 90 días (la ventana de siempre)", () => {
    expect(periodoDeVentas(90)).toBe("90 días");
    expect(periodoDeVentas(undefined)).toBe("90 días");
  });
  it("con menos, dice los días que lleva el ERP", () => {
    expect(periodoDeVentas(26)).toBe("los 26 días que lleva el ERP");
    expect(periodoDeVentas(89)).toBe("los 89 días que lleva el ERP");
    expect(periodoDeVentas(1)).toBe("el único día que lleva el ERP");
    expect(periodoDeVentas(0)).toBe("los días que lleva el ERP");
  });
  it("«en los últimos 90 días» solo con 90; con menos, la misma frase del periodo", () => {
    expect(ultimosDeVentas(90)).toBe("los últimos 90 días");
    expect(ultimosDeVentas(undefined)).toBe("los últimos 90 días");
    expect(ultimosDeVentas(26)).toBe("los 26 días que lleva el ERP");
  });
  it("«y M en los últimos 30» solo si hay 30 días: con menos sería repetir la misma cifra", () => {
    expect(hayUltimos30(26)).toBe(false);
    expect(hayUltimos30(29)).toBe(false);
    expect(hayUltimos30(30)).toBe(true);
    expect(hayUltimos30(undefined)).toBe(true);
  });
  it("las frases se leen completas en la pantalla", () => {
    expect(`Vendiste 366 en ${periodoDeVentas(26)}`).toBe("Vendiste 366 en los 26 días que lleva el ERP");
    expect(`Sin ventas en ${periodoDeVentas(undefined)}`).toBe("Sin ventas en 90 días");
  });
});

describe("propuestaDeNormal con menos de 90 días de ERP (el fallback de una base sin propuesta)", () => {
  it("divide por los días reales: 366 vendidas en 26 días, llevadas a 31 días de campaña, son ≈436 (con 90 daba 126)", () => {
    expect(propuestaDeNormal(366, 31, 26)).toBe(436);
    expect(propuestaDeNormal(366, 31)).toBe(126);
  });
  it("con 90 o más usa 90 (nunca divide por más de lo que mira la ventana)", () => {
    expect(propuestaDeNormal(900, 30, 90)).toBe(300);
    expect(propuestaDeNormal(900, 30, 400)).toBe(300);
  });
  it("sin días de ERP (0 o menos) no hay qué proponer, en vez de dividir por cero", () => {
    expect(propuestaDeNormal(366, 31, 0)).toBeNull();
    expect(propuestaDeNormal(366, 31, -5)).toBeNull();
    expect(propuestaDeNormal(366, 31, Number.NaN)).toBeNull();
  });
});

describe("la propuesta dice con cuántos días se hizo", () => {
  it("proponer deja los días reales y la explicación del normal los nombra", () => {
    const p = proponer(lectura([tienda("tru", 26)]), "polos")!;
    expect(p.diasDeVentas).toBe(26);
    expect(explicarPropuesta(p).normal).toBe(`Normal ${Math.round(p.normal).toLocaleString("es-PE")}: lo que vende a su ritmo de los 26 días que lleva el ERP, en los 30 días de la campaña.`);
  });
  it("con los 90 días de siempre, la explicación no cambia", () => {
    const p = proponer(lectura([tienda("tru", 90)]), "polos")!;
    expect(p.diasDeVentas).toBe(90);
    expect(explicarPropuesta(p).normal).toContain("de los últimos 90 días");
  });
});
