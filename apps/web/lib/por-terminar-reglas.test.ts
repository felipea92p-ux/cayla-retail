import { describe, expect, it } from "vitest";
import { esViejoPorTerminar, ordenarPorTerminar, prendasPorTerminar, textoHaceDias, vistaInicialRecibido, type EnvioPorTerminar } from "./por-terminar-reglas";

const e = (numero: string | null, cerradoEn: string | null, porSeparar = 0, porDetallar = 0, porCrear = 0): EnvioPorTerminar => ({ despachoId: `id-${numero}`, numero, cerradoEn, porSeparar, porDetallar, porCrear });

describe("por terminar", () => {
  it("suma lo que falta de un envío", () => {
    expect(prendasPorTerminar(e("ENV-1", null, 3, 4, 5))).toBe(12);
    expect(prendasPorTerminar(e("ENV-1", null))).toBe(0);
  });

  it("ordena del más antiguo al más nuevo, sin fecha al final y por número a igual fecha, sin tocar la lista original", () => {
    const lista = [
      e("ENV-000253", "2026-10-26T15:00:00+00:00"),
      e("ENV-000999", null),
      e("ENV-000251", "2026-10-24T15:00:00+00:00"),
      e("ENV-000254", "2026-10-24T15:00:00+00:00"),
      e("ENV-000100", "2026-10-24T15:00:00+00:00"),
    ];
    const antes = lista.map((x) => x.numero);
    expect(ordenarPorTerminar(lista).map((x) => x.numero)).toEqual(["ENV-000100", "ENV-000251", "ENV-000254", "ENV-000253", "ENV-000999"]);
    expect(lista.map((x) => x.numero)).toEqual(antes);
  });

  it("una fecha que no se lee cuenta como «sin fecha»", () => {
    expect(ordenarPorTerminar([e("B", "no es fecha"), e("A", "2026-10-24T15:00:00+00:00")]).map((x) => x.numero)).toEqual(["A", "B"]);
  });

  it("abre en «Por terminar» si hay algo y en «Terminados» si no hay nada", () => {
    expect(vistaInicialRecibido([e("ENV-1", null, 1)])).toBe("por-terminar");
    expect(vistaInicialRecibido([])).toBe("terminados");
    expect(vistaInicialRecibido(null)).toBe("terminados");
  });

  it("dice cuánto lleva esperando y marca lo que pasa de una semana", () => {
    expect(textoHaceDias(0)).toBe("hoy");
    expect(textoHaceDias(1)).toBe("hace 1 día");
    expect(textoHaceDias(5)).toBe("hace 5 días");
    expect(textoHaceDias(null)).toBeNull();
    expect(esViejoPorTerminar(7)).toBe(false);
    expect(esViejoPorTerminar(8)).toBe(true);
    expect(esViejoPorTerminar(null)).toBe(false);
  });
});
