import { describe, expect, it } from "vitest";
import { bolsasDeLaCaja, bolsasEnElTicket, nombreDeBolsa, precioDeBolsa, totalBolsasEnElTicket, type PrendaDeCaja } from "./bolsas-reglas";

const prenda = (varianteId: string, referencia: string, precio: number, extra: Partial<PrendaDeCaja> = {}): PrendaDeCaja => ({
  varianteId,
  referencia,
  talla: null,
  color: null,
  precio,
  ...extra,
});

describe("bolsasDeLaCaja", () => {
  const catalogo = [
    prenda("p1", "Polo Basic", 59.9),
    prenda("b-tnt", "Bolsa TNT ecoamigable", 3.9, { fueraDeMotores: true }),
    prenda("b-gran", "Bolsa de papel CAYLA", 1.2, { fueraDeMotores: true, talla: "Grande" }),
    prenda("b-peq", "Bolsa de papel CAYLA", 0.5, { fueraDeMotores: true, talla: "Pequeña" }),
    prenda("b-obs", "Bolsa de obsequio", 0, { fueraDeMotores: true }),
    prenda("p2", "Cartera Colmena", 59, { fueraDeMotores: false }),
  ];

  it("deja solo lo de una familia fuera de los motores y lo ordena de la más barata a la más cara (el obsequio primero)", () => {
    expect(bolsasDeLaCaja(catalogo).map((b) => b.varianteId)).toEqual(["b-obs", "b-peq", "b-gran", "b-tnt"]);
  });

  it("una prenda sin la marca NO es bolsa: una cartera se vende como cartera", () => {
    expect(bolsasDeLaCaja(catalogo).some((b) => b.varianteId === "p2" || b.varianteId === "p1")).toBe(false);
    expect(bolsasDeLaCaja([prenda("x", "Bolsa", 0.5)])).toEqual([]);
  });

  it("a igual precio, por nombre, y es estable entre llamadas (no depende del orden en que llegan)", () => {
    const a = prenda("a", "Bolsa A", 1, { fueraDeMotores: true });
    const b = prenda("b", "Bolsa B", 1, { fueraDeMotores: true });
    expect(bolsasDeLaCaja([b, a]).map((x) => x.varianteId)).toEqual(["a", "b"]);
    expect(bolsasDeLaCaja([a, b]).map((x) => x.varianteId)).toEqual(["a", "b"]);
  });

  it("no modifica la lista que recibe", () => {
    const original = [...catalogo];
    bolsasDeLaCaja(catalogo);
    expect(catalogo).toEqual(original);
  });
});

describe("precioDeBolsa", () => {
  it("dice el precio en soles con dos decimales y «Obsequio» cuando se regala", () => {
    expect(precioDeBolsa(0.5)).toBe("S/ 0.50");
    expect(precioDeBolsa(1.2)).toBe("S/ 1.20");
    expect(precioDeBolsa(3.9)).toBe("S/ 3.90");
    expect(precioDeBolsa(0)).toBe("Obsequio");
  });
});

describe("nombreDeBolsa", () => {
  it("une modelo, talla y color sin dejar huecos", () => {
    expect(nombreDeBolsa({ referencia: "Bolsa de papel CAYLA", talla: "Grande", color: null })).toBe("Bolsa de papel CAYLA · Grande");
    expect(nombreDeBolsa({ referencia: "Bolsa TNT", talla: null, color: "Natural" })).toBe("Bolsa TNT · Natural");
    expect(nombreDeBolsa({ referencia: "Bolsa de obsequio", talla: null, color: null })).toBe("Bolsa de obsequio");
  });
});

describe("bolsas en el ticket", () => {
  const carrito = [
    { varianteId: "polo", cantidad: 2 },
    { varianteId: "b-peq", cantidad: 1 },
    { varianteId: "b-tnt", cantidad: 3 },
  ];

  it("cuenta las de cada bolsa y 0 si no lleva ninguna", () => {
    expect(bolsasEnElTicket(carrito, "b-peq")).toBe(1);
    expect(bolsasEnElTicket(carrito, "b-tnt")).toBe(3);
    expect(bolsasEnElTicket(carrito, "b-gran")).toBe(0);
  });

  it("suma todas las bolsas del ticket y no cuenta las prendas", () => {
    expect(totalBolsasEnElTicket(carrito, [{ varianteId: "b-peq" }, { varianteId: "b-tnt" }, { varianteId: "b-gran" }])).toBe(4);
    expect(totalBolsasEnElTicket([], [{ varianteId: "b-peq" }])).toBe(0);
  });
});
