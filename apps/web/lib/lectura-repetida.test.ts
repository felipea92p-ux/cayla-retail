import { describe, expect, it } from "vitest";
import {
  ESTADO_REPETIDA_VACIO,
  acotarVarias,
  declararPila,
  decidirLectura,
  rangoDeVarias,
  soltarPila,
  textoIgnoradas,
  type EstadoRepetida,
} from "./lectura-repetida";

describe("decidirLectura (ADR-0562)", () => {
  it("la primera lectura de una prenda se lee como siempre", () => {
    expect(decidirLectura("emma", 0, true, ESTADO_REPETIDA_VACIO)).toEqual({ tipo: "sigue", cierraPregunta: false });
  });

  it("la misma prenda otra vez no suma: pregunta", () => {
    expect(decidirLectura("emma", 1, true, ESTADO_REPETIDA_VACIO)).toEqual({
      tipo: "pregunta",
      cierraPregunta: false,
      pregunta: { varianteId: "emma", ignoradas: 0 },
    });
  });

  it("mientras pregunta, la misma etiqueta se ignora y se cuenta, aunque el escáner no la sumaría", () => {
    const estado: EstadoRepetida = { pregunta: { varianteId: "emma", ignoradas: 2 }, pilas: [] };
    expect(decidirLectura("emma", 1, true, estado)).toEqual({ tipo: "ignora", pregunta: { varianteId: "emma", ignoradas: 3 } });
    expect(decidirLectura("emma", 12, false, estado)).toEqual({ tipo: "ignora", pregunta: { varianteId: "emma", ignoradas: 3 } });
  });

  it("una etiqueta quieta que se lee 6 veces suma 1 y pregunta una sola vez", () => {
    let lleva = 0;
    let estado: EstadoRepetida = ESTADO_REPETIDA_VACIO;
    let preguntas = 0;
    for (let i = 0; i < 6; i++) {
      const d = decidirLectura("emma", lleva, true, estado);
      if (d.tipo === "sigue") lleva += 1;
      if (d.tipo === "pregunta") preguntas += 1;
      if (d.tipo !== "sigue") estado = { ...estado, pregunta: d.pregunta };
    }
    expect(lleva).toBe(1);
    expect(preguntas).toBe(1);
    expect(estado.pregunta).toEqual({ varianteId: "emma", ignoradas: 4 });
  });

  it("otra prenda mientras pregunta cierra la pregunta («No») y se lee como siempre", () => {
    const estado: EstadoRepetida = { pregunta: { varianteId: "emma", ignoradas: 0 }, pilas: [] };
    expect(decidirLectura("luna", 0, true, estado)).toEqual({ tipo: "sigue", cierraPregunta: true });
    expect(decidirLectura("luna", 2, true, estado)).toEqual({
      tipo: "pregunta",
      cierraPregunta: true,
      pregunta: { varianteId: "luna", ignoradas: 0 },
    });
  });

  it("lo que el escáner no sumaría (tope, archivada) se lee como siempre: su propio aviso dice por qué", () => {
    expect(decidirLectura("emma", 12, false, ESTADO_REPETIDA_VACIO)).toEqual({ tipo: "sigue", cierraPregunta: false });
  });

  it("una pila declarada («Son varias iguales») no pregunta; al soltarla, vuelve a preguntar", () => {
    const pilas = declararPila([], "emma");
    expect(decidirLectura("emma", 5, true, { pregunta: null, pilas })).toEqual({ tipo: "sigue", cierraPregunta: false });
    expect(decidirLectura("emma", 5, true, { pregunta: null, pilas: soltarPila(pilas, "emma") }).tipo).toBe("pregunta");
  });
});

describe("pilas", () => {
  it("declarar dos veces no duplica; soltar una que no está no rompe", () => {
    expect(declararPila(declararPila([], "a"), "a")).toEqual(["a"]);
    expect(soltarPila(["a", "b"], "c")).toEqual(["a", "b"]);
  });
});

describe("«¿Cuántas tienes en total?»", () => {
  it("va de una más de las que lleva hasta el tope", () => {
    expect(rangoDeVarias(1, 12)).toEqual({ min: 2, max: 12 });
    expect(rangoDeVarias(0, null)).toEqual({ min: 1, max: 99999 });
  });

  it("sin lugar para una más no se ofrece", () => {
    expect(rangoDeVarias(4, 4)).toBeNull();
  });

  it("acota lo escrito", () => {
    const r = { min: 2, max: 12 };
    expect(acotarVarias(40, r)).toBe(12);
    expect(acotarVarias(1, r)).toBe(2);
    expect(acotarVarias(5.7, r)).toBe(5);
    expect(acotarVarias(Number.NaN, r)).toBe(2);
  });
});

describe("textoIgnoradas", () => {
  it("singular y plural", () => {
    expect(textoIgnoradas(1)).toBe("1 lectura repetida ignorada");
    expect(textoIgnoradas(6)).toBe("6 lecturas repetidas ignoradas");
  });
});
