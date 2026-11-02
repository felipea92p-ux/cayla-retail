import { describe, expect, it } from "vitest";
import type { EtapaDinero } from "./dinero-estados-reglas";
import { colorDeEtapa, repartoPorCuenta, trazoDeArco } from "./dinero-reparto-reglas";

const fila = (id: string, etapa: EtapaDinero, saldo: number | null) => ({ id, nombre: id, sede: "Tienda Lima", sinSede: etapa === "camino", etapa, saldo });

describe("repartoPorCuenta", () => {
  it("va del banco a la caja, como las celdas de al lado, y dentro de cada etapa de la que más tiene a la que menos", () => {
    const r = repartoPorCuenta([fila("caja", "caja", 280), fila("bcp-chico", "banco", 100), fila("izipay", "camino", 11_701), fila("bcp", "banco", 9_000), fila("fuerte", "deposito", 400)]);
    expect(r.porciones.map((p) => p.id)).toEqual(["bcp", "bcp-chico", "izipay", "fuerte", "caja"]);
  });

  it("cada porción dice su sede, salvo lo que viene en camino, que todavía no tiene", () => {
    const r = repartoPorCuenta([fila("caja", "caja", 280), fila("izipay", "camino", 150)]);
    expect(r.porciones.map((p) => [p.id, p.lugar])).toEqual([
      ["izipay", null],
      ["caja", "Tienda Lima"],
    ]);
  });

  it("los porcentajes suman 100 y las porciones cierran la vuelta sin huecos ni cruces", () => {
    const r = repartoPorCuenta([fila("a", "banco", 1), fila("b", "banco", 1), fila("c", "camino", 1)]);
    expect(r.porciones.reduce((a, p) => a + p.pctEntero, 0)).toBe(100);
    expect(r.porciones[0]!.desde).toBe(0);
    expect(r.porciones.at(-1)!.hasta).toBe(360);
    r.porciones.slice(1).forEach((p, i) => expect(p.desde).toBeCloseTo(r.porciones[i]!.hasta));
  });

  it("lo que pesa menos de 1 % dice cero sin quitarle un punto a otra porción", () => {
    const r = repartoPorCuenta([fila("grande", "banco", 99_950), fila("migaja", "caja", 50)]);
    expect(r.porciones.map((p) => p.pctEntero)).toEqual([100, 0]);
  });

  it("lo negativo no entra al círculo y se suma aparte; el cero y el saldo oculto no se dibujan", () => {
    const r = repartoPorCuenta([fila("bcp", "banco", 500), fila("tarjeta", "banco", -120.5), fila("cero", "caja", 0), fila("abierta", "caja", null)]);
    expect(r.porciones.map((p) => p.id)).toEqual(["bcp"]);
    expect(r.negativo).toBe(-120.5);
  });

  it("sin plata no hay porciones (el círculo queda en su pista)", () => {
    expect(repartoPorCuenta([fila("cero", "banco", 0)]).porciones).toEqual([]);
  });

  it("el color sale de la etapa: el firme es el de la celda, y una cuenta no cambia de tono porque hoy tenga más plata", () => {
    const ayer = repartoPorCuenta([fila("bcp", "banco", 100), fila("interbank", "banco", 900)]);
    const hoy = repartoPorCuenta([fila("bcp", "banco", 900), fila("interbank", "banco", 100)]);
    const tono = (r: ReturnType<typeof repartoPorCuenta>, id: string) => r.porciones.find((p) => p.id === id)!.color;
    expect(tono(ayer, "bcp")).toBe(tono(hoy, "bcp"));
    expect(tono(hoy, "bcp")).toBe(colorDeEtapa("banco"));
    for (const e of ["banco", "camino", "deposito", "caja"] as const) expect(colorDeEtapa(e)).toMatch(/^var\(--color-[a-z-]+\)$/);
  });
});

describe("trazoDeArco", () => {
  it("una sola porción es la vuelta entera, en dos medias vueltas", () => {
    expect(trazoDeArco(0, 360, 70)).toBe("M100 30A70 70 0 1 1 100 170A70 70 0 1 1 100 30");
  });
  it("una porción de más de media vuelta usa el arco largo; una fina no se voltea", () => {
    expect(trazoDeArco(0, 270, 70)).toContain(" 0 1 1 ");
    expect(trazoDeArco(10, 11, 70)).toContain(" 0 0 1 ");
  });
});
