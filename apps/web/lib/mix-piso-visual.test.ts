import { describe, expect, it } from "vitest";
import { asignarGanchos, cuadriculaDelRiel, escalaDeMancuerna, fondoDeGrupo, posicionEnEscala, TOKENS_DE_GRUPO, tokenDeGrupo, FONDOS_DE_GRUPO } from "./mix-piso-visual";

describe("los colores de los grupos salen solo de la guía", () => {
  it("seis tokens distintos, ninguno es el rojo (acento sagrado, máx. 2 por pantalla)", () => {
    expect(new Set(TOKENS_DE_GRUPO).size).toBe(6);
    expect((TOKENS_DE_GRUPO as readonly string[]).includes("rojo")).toBe(false);
    expect(FONDOS_DE_GRUPO.some((c) => c.includes("rojo"))).toBe(false);
  });

  it("cada token tiene su fondo, y el texto de encima contrasta (crema sobre oscuro, tinta sobre el color claro)", () => {
    TOKENS_DE_GRUPO.forEach((t, i) => expect(fondoDeGrupo(i)).toContain(`bg-${t}`));
    expect(fondoDeGrupo(5)).toContain("text-tinta");
    expect(fondoDeGrupo(0)).toContain("text-crema");
  });

  it("con más de seis grupos los colores se reutilizan, y un índice negativo no se rompe", () => {
    expect(tokenDeGrupo(6)).toBe(tokenDeGrupo(0));
    expect(tokenDeGrupo(13)).toBe(tokenDeGrupo(1));
    expect(tokenDeGrupo(-1)).toBe(tokenDeGrupo(5));
  });
});

describe("repartir los ganchos de un riel", () => {
  it("un grupo junto a otro, en el orden de la lista; lo que sobra de la capacidad queda libre (-1)", () => {
    const r = asignarGanchos([3, 2, 0, 1], 10);
    expect(r.ganchos).toEqual([0, 0, 0, 1, 1, 3, -1, -1, -1, -1]);
    expect(r.ocupados).toBe(6);
    expect(r.deMas).toBe(0);
  });

  it("nunca dibuja más ganchos que la capacidad: lo que no cabe se cuenta aparte", () => {
    const r = asignarGanchos([8, 5], 10);
    expect(r.ganchos).toHaveLength(10);
    expect(r.ganchos.filter((g) => g === -1)).toHaveLength(0);
    expect(r.ganchos.filter((g) => g === 1)).toHaveLength(2);
    expect(r.deMas).toBe(3);
    expect(r.ocupados).toBe(10);
  });

  it("con el riel de TRU a medias (61 de 600) quedan 539 libres", () => {
    const r = asignarGanchos([24, 0, 20, 12, 0, 5], 600);
    expect(r.ocupados).toBe(61);
    expect(r.ganchos.filter((g) => g === -1)).toHaveLength(539);
  });

  it("una propuesta que suma la capacidad llena el riel entero, sin ningún libre", () => {
    const r = asignarGanchos([288, 54, 120, 72, 36, 30], 600);
    expect(r.ganchos.every((g) => g >= 0)).toBe(true);
    expect(r.deMas).toBe(0);
  });

  it("cantidades raras (negativas, con decimales, capacidad 0) no rompen: se descartan o se redondean hacia abajo", () => {
    expect(asignarGanchos([-5, 2.9], 4).ganchos).toEqual([1, 1, -1, -1]);
    expect(asignarGanchos([5], 0).ganchos).toEqual([]);
    expect(asignarGanchos([5], 0).deMas).toBe(5);
    expect(asignarGanchos([], 3).ganchos).toEqual([-1, -1, -1]);
  });
});

describe("cómo se acomodan los ganchos en el ancho disponible", () => {
  it("cada riel entra completo: columnas × filas alcanza para todos los ganchos, y las filas no pasan de 24", () => {
    for (const n of [180, 600, 1800, 7]) {
      for (const ancho of [320, 640, 1088]) {
        const c = cuadriculaDelRiel(n, ancho);
        expect(c.columnas * c.filas, `n=${n} ancho=${ancho}`).toBeGreaterThanOrEqual(n);
        expect(c.filas).toBeLessThanOrEqual(Math.max(24, Math.ceil(n / 12)));
      }
    }
  });

  it("AQP (1.800) en un ancho de escritorio usa más columnas, no más de 24 filas", () => {
    const c = cuadriculaDelRiel(1800, 1088);
    expect(c.filas).toBeLessThanOrEqual(24);
    expect(c.columnas).toBeGreaterThanOrEqual(75);
  });

  it("un ancho absurdo (0, negativo) se corrige a uno mínimo en vez de dar columnas negativas", () => {
    const c = cuadriculaDelRiel(100, -50);
    expect(c.columnas).toBeGreaterThanOrEqual(12);
    expect(c.alto).toBeGreaterThan(0);
  });
});

describe("la escala de la mancuerna", () => {
  it("es el mayor valor redondeado hacia arriba a un múltiplo de 10, entre 20 y 100", () => {
    expect(escalaDeMancuerna([48, 9, 20, 12, 6, 5])).toBe(50);
    expect(escalaDeMancuerna([61.2, 3])).toBe(70);
    expect(escalaDeMancuerna([3, 5])).toBe(20);
    expect(escalaDeMancuerna([150])).toBe(100);
  });

  it("ignora lo que no es un número (sin ventas, sin propuesta): sin valores, 20", () => {
    expect(escalaDeMancuerna([null, undefined, Number.NaN])).toBe(20);
    expect(escalaDeMancuerna([])).toBe(20);
    expect(escalaDeMancuerna([null, 34])).toBe(40);
  });

  it("la posición de un valor va de 0 a 100 y no se sale del borde", () => {
    expect(posicionEnEscala(25, 50)).toBe(50);
    expect(posicionEnEscala(0, 50)).toBe(0);
    expect(posicionEnEscala(80, 50)).toBe(100);
    expect(posicionEnEscala(-3, 50)).toBe(0);
    expect(posicionEnEscala(10, 0)).toBe(0);
    expect(posicionEnEscala(Number.NaN, 50)).toBe(0);
  });
});
