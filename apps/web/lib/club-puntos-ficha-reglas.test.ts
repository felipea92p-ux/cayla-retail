import { describe, expect, it } from "vitest";
import { puntosDeLaFicha, regaloDeLaFicha, venceDelCupon, PUNTOS_SIN_LEER } from "./club-puntos-ficha-reglas";
import type { ResumenPuntos } from "./club-puntos-reglas";

const NBSP = " ";
const HOY = "2026-10-19";

const resumen = (cambios: Partial<ResumenPuntos> = {}, config: Partial<ResumenPuntos["config"]> = {}): ResumenPuntos => ({
  config: { puntosPorSol: 1, solesPor100: 5, canjeMinimo: 100, compraMinimaX: 3, vigenciaDias: 7, regaloCumple: 100, ...config },
  miembro: true,
  saldo: 1240,
  valorSaldo: 62,
  regaloDisponible: false,
  cupones: [],
  ...cambios,
});

describe("puntosDeLaFicha — sin ficha de miembro no se dice nada de puntos", () => {
  it("sin resumen o sin miembro: null", () => {
    expect(puntosDeLaFicha(null, { cumpleMes: 3 }, HOY)).toBeNull();
    expect(puntosDeLaFicha(resumen({ miembro: false }), { cumpleMes: 3 }, HOY)).toBeNull();
  });

  it("si falla la lectura, la frase no se cae ni culpa a nadie", () => {
    expect(PUNTOS_SIN_LEER).toContain("No se pudieron leer sus puntos");
  });
});

describe("puntosDeLaFicha — el saldo y lo que vale", () => {
  it("cuántos tiene y cuánto valen (con el espacio que no se parte)", () => {
    const p = puntosDeLaFicha(resumen(), { cumpleMes: 3 }, HOY)!;
    expect(p.destacado).toBe("1,240 puntos");
    expect(p.resto).toBe(`valen S/${NBSP}62`);
    expect(p.bajada).toContain("canjear en caja");
    expect(p.bajada).toContain(`por cada S/${NBSP}1`);
  });

  it("singular con 1 punto, y sin puntos dice cómo se ganan", () => {
    expect(puntosDeLaFicha(resumen({ saldo: 1, valorSaldo: 0.05 }), { cumpleMes: 3 }, HOY)!.destacado).toBe("1 punto");
    const cero = puntosDeLaFicha(resumen({ saldo: 0, valorSaldo: 0 }), { cumpleMes: 3 }, HOY)!;
    expect(cero.bajada).toBe(`Todavía no tiene puntos. Gana 1 punto por cada S/${NBSP}1 que paga.`);
  });

  it("debajo del mínimo dice cuánto le falta, con el mínimo de la configuración", () => {
    expect(puntosDeLaFicha(resumen({ saldo: 40 }), { cumpleMes: 3 }, HOY)!.bajada).toContain("Le faltan 60 puntos");
    expect(puntosDeLaFicha(resumen({ saldo: 40 }, { canjeMinimo: 300 }), { cumpleMes: 3 }, HOY)!.bajada).toContain("Le faltan 260 puntos");
  });

  it("los números salen de la configuración, no del código", () => {
    const p = puntosDeLaFicha(resumen({}, { puntosPorSol: 2 }), { cumpleMes: 3 }, HOY)!;
    expect(p.bajada).toContain("Gana 2 puntos por cada");
  });
});

describe("regaloDeLaFicha — el regalo de cumpleaños", () => {
  it("le toca (lo dice la base): en verde, con los puntos de la configuración", () => {
    const r = regaloDeLaFicha(resumen({ regaloDisponible: true }, { regaloCumple: 150 }), 10, 10)!;
    expect(r).toEqual({ titulo: "Cumple este mes", texto: "Con su próxima compra de este mes recibe 150 puntos de regalo.", leToca: true });
  });

  it("la base manda aunque el reloj del aparato diga otro mes", () => {
    expect(regaloDeLaFicha(resumen({ regaloDisponible: true }), 10, 11)!.leToca).toBe(true);
  });

  it("su mes, pero ya lo recibió", () => {
    expect(regaloDeLaFicha(resumen(), 10, 10)).toEqual({ titulo: "Cumple este mes", texto: "Ya recibió sus 100 puntos de regalo de este año.", leToca: false });
  });

  it("otro mes: dice cuál", () => {
    expect(regaloDeLaFicha(resumen(), 9, 10)!.texto).toBe("En setiembre, su mes de cumpleaños, recibe 100 puntos de regalo con su primera compra.");
  });

  it("sin cumpleaños en la ficha: cómo agregarlo", () => {
    expect(regaloDeLaFicha(resumen(), null, 10)!.texto).toContain("agrégalo con «Editar»");
  });

  it("si el club no da regalo (0), no se dice nada", () => {
    expect(regaloDeLaFicha(resumen({ regaloDisponible: true }, { regaloCumple: 0 }), 10, 10)).toBeNull();
    expect(puntosDeLaFicha(resumen({}, { regaloCumple: 0 }), { cumpleMes: 10 }, HOY)!.regalo).toBeNull();
  });

  it("puntosDeLaFicha toma el mes de hoy de la fecha de Lima", () => {
    expect(puntosDeLaFicha(resumen(), { cumpleMes: 10 }, HOY)!.regalo!.titulo).toBe("Cumple este mes");
    expect(puntosDeLaFicha(resumen(), { cumpleMes: 10 }, "2026-11-01")!.regalo!.titulo).toBeNull();
  });
});

describe("cupones vivos", () => {
  it("cada uno con su código, su valor, su compra mínima y hasta cuándo vale", () => {
    const p = puntosDeLaFicha(
      resumen({ cupones: [{ codigo: "CAY-AB12-CD34", valor: 5, compraMinima: 15, venceEl: "2026-10-26" }] }),
      { cumpleMes: 3 },
      HOY,
    )!;
    expect(p.cupones).toEqual([
      { codigo: "CAY-AB12-CD34", detalle: `S/${NBSP}5 · en compras desde S/${NBSP}15 · vale hasta el 26 oct`, venceProximo: false },
    ]);
    expect(p.notaCupones).toContain("quien tenga el código");
  });

  it("sin cupones lo dice", () => {
    expect(puntosDeLaFicha(resumen(), { cumpleMes: 3 }, HOY)!.notaCupones).toBe("No tiene cupones por usar.");
  });

  it("hoy y mañana se dicen así (también a fin de mes)", () => {
    expect(venceDelCupon("2026-10-19", HOY)).toEqual({ texto: "vence hoy", proximo: true });
    expect(venceDelCupon("2026-10-20", HOY)).toEqual({ texto: "vence mañana", proximo: true });
    expect(venceDelCupon("2026-11-01", "2026-10-31")).toEqual({ texto: "vence mañana", proximo: true });
    expect(venceDelCupon("2026-12-03", HOY).texto).toBe("vale hasta el 3 dic");
  });
});
