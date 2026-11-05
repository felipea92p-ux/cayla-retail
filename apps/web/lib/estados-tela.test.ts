import { describe, expect, it } from "vitest";
import { CAPAS_DE_HILOS, corrimientoDeCapa, esElHiloRojo, estadoDeLaRuta, mouseEnLaTela, puntosDelHilo, tamanoDelLienzo } from "./estados-tela";

describe("los hilos", () => {
  it("son los mismos cada vez: sin azar", () => {
    const haz = CAPAS_DE_HILOS[0]![0]!;
    expect(puntosDelHilo(haz, 3, 1600, 900)).toEqual(puntosDelHilo(haz, 3, 1600, 900));
  });

  it("cruzan el lienzo de lado a lado", () => {
    const puntos = puntosDelHilo(CAPAS_DE_HILOS[0]![0]!, 0, 1600, 900);
    expect(puntos[0]![0]).toBe(0);
    expect(puntos.at(-1)![0]).toBe(1600);
    for (const [x, y] of puntos) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
  });

  it("cada haz tiene un solo hilo rojo", () => {
    for (const capa of CAPAS_DE_HILOS) for (const haz of capa) expect(Array.from({ length: haz.n }, (_, i) => esElHiloRojo(haz, i)).filter(Boolean)).toHaveLength(1);
  });
});

describe("el lienzo", () => {
  it("es más grande que la ventana, para que lo que se corre no deje ver el borde", () => {
    expect(tamanoDelLienzo(1000, 800)).toEqual({ ancho: 1160, alto: 928 });
  });

  it("tiene tope de ancho en una pantalla enorme", () => {
    expect(tamanoDelLienzo(3000, 1000).ancho).toBe(2200);
  });
});

describe("el corrimiento", () => {
  it("cada estado tiene su lugar y el primero es el de partida", () => {
    expect(corrimientoDeCapa(0, 0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(corrimientoDeCapa(1, 0, 0, 0)).not.toEqual(corrimientoDeCapa(2, 0, 0, 0));
  });

  it("el mouse mueve muy poco: nunca deja ver el borde del lienzo", () => {
    for (const estado of [0, 1, 2, 3]) {
      for (const capa of [0, 1]) {
        const { x, y } = corrimientoDeCapa(estado, capa, 5, 5);
        expect(Math.abs(x)).toBeLessThan(45);
        expect(Math.abs(y)).toBeLessThan(45);
      }
    }
    expect(mouseEnLaTela(0, 1000)).toBe(5);
    expect(mouseEnLaTela(1000, 1000)).toBe(-5);
  });

  it("un estado que no existe no rompe nada", () => {
    expect(corrimientoDeCapa(9, 0, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("la pestaña por la ruta", () => {
  it("los cuatro estados, cada uno con su número", () => {
    expect(["/finanzas/reportes", "/finanzas/reportes/flujo", "/finanzas/reportes/balance", "/finanzas/reportes/patrimonio"].map(estadoDeLaRuta)).toEqual([0, 1, 2, 3]);
  });

  it("lo demás se queda con la tela del primero", () => {
    expect(estadoDeLaRuta("/finanzas/reportes/campanas")).toBe(0);
  });
});
