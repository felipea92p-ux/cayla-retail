import { describe, expect, it } from "vitest";
import { estadoDelDial, MAX_CORTES } from "./recepcion-dial-reglas";

describe("estadoDelDial", () => {
  it("sin contar todavía, dice lo que dijeron y el aro está vacío", () => {
    expect(estadoDelDial(0, 4, false)).toMatchObject({ lleno: 0, exceso: 0, tono: "neutro", texto: "dijeron 4", cortes: 4, angulo: 0 });
  });

  it("faltar no es un error: el aro se llena a medias y queda en tinta", () => {
    expect(estadoDelDial(2, 4, true)).toMatchObject({ lleno: 50, tono: "neutro", texto: "faltan 2 de 4", angulo: 180 });
  });

  it("cuadra cuando lo contado es lo que dijeron", () => {
    expect(estadoDelDial(4, 4, true)).toMatchObject({ lleno: 100, exceso: 0, tono: "cuadra", texto: "cuadra · 4", angulo: 360 });
  });

  it("pasarse llena el aro y suma el arco de fuera, que no pasa del doble", () => {
    expect(estadoDelDial(5, 4, true)).toMatchObject({ lleno: 100, exceso: 25, tono: "sobra", texto: "sobran 1" });
    expect(estadoDelDial(20, 4, true).exceso).toBe(100);
  });

  it("un 0 escrito a propósito no es «por contar»", () => {
    expect(estadoDelDial(0, 4, true)).toMatchObject({ lleno: 0, texto: "faltan 4 de 4" });
    expect(estadoDelDial(0, null, true)).toMatchObject({ lleno: 0, texto: "contadas" });
  });

  it("sin aviso no hay con qué comparar: el aro se llena con la primera prenda y nunca dice cuadra ni sobra", () => {
    expect(estadoDelDial(0, null, false)).toMatchObject({ lleno: 0, tono: "neutro", texto: "por contar", cortes: 0 });
    expect(estadoDelDial(1, null, true)).toMatchObject({ lleno: 100, tono: "neutro", texto: "contada", angulo: 360 });
    expect(estadoDelDial(7, 0, true)).toMatchObject({ tono: "neutro", texto: "contadas", cortes: 0 });
  });

  it("con muchas prendas esperadas el aro va liso", () => {
    expect(estadoDelDial(0, MAX_CORTES, false).cortes).toBe(MAX_CORTES);
    expect(estadoDelDial(0, MAX_CORTES + 1, false).cortes).toBe(0);
  });
});
