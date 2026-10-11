import { describe, expect, it } from "vitest";
import { asignarGanchos, cifraEs, claseDeTramo, CLASES_DE_TRAMO, cuadriculaDelRiel, escalaDeMancuerna, escalaDelRiel, lineaDeVentas, posicionEnEscala, prendasEs, TOKENS_DE_GRUPO, tokenDeGrupo } from "./mix-piso-visual";

describe("los colores de los grupos salen solo de la guía", () => {
  it("seis tokens distintos, ninguno es el rojo (acento sagrado, máx. 2 por pantalla)", () => {
    expect(new Set(TOKENS_DE_GRUPO).size).toBe(6);
    expect((TOKENS_DE_GRUPO as readonly string[]).includes("rojo")).toBe(false);
    expect(CLASES_DE_TRAMO.some((c) => c.includes("rojo"))).toBe(false);
  });

  it("con más de seis grupos los colores se reutilizan, y un índice negativo no se rompe", () => {
    expect(tokenDeGrupo(6)).toBe(tokenDeGrupo(0));
    expect(tokenDeGrupo(13)).toBe(tokenDeGrupo(1));
    expect(tokenDeGrupo(-1)).toBe(tokenDeGrupo(5));
  });
});

describe("el color de cada grupo en las barras, la leyenda y la Mancuerna (una sola fuente)", () => {
  it("seis clases distintas, una por grupo", () => {
    expect(new Set(CLASES_DE_TRAMO).size).toBe(6);
  });

  it("los cinco primeros son su token liso", () => {
    TOKENS_DE_GRUPO.slice(0, 5).forEach((t, i) => expect(claseDeTramo(i)).toBe(`bg-${t}`));
  });

  it("el sexto (sand) sale como taupe a 45 %: sand liso es el color de la pista de la barra y se vería como un hueco", () => {
    expect(tokenDeGrupo(5)).toBe("sand");
    expect(claseDeTramo(5)).toBe("bg-taupe/45");
    CLASES_DE_TRAMO.forEach((c) => expect(c).not.toBe("bg-sand"));
  });

  it("con más de seis grupos los colores se reutilizan, y un índice negativo no se rompe", () => {
    expect(claseDeTramo(6)).toBe(claseDeTramo(0));
    expect(claseDeTramo(-1)).toBe(claseDeTramo(5));
  });
});

describe("cómo se escribe una cifra del plan del piso", () => {
  it("coma de miles y punto decimal, como en el resto del ERP (nunca «1800» pegado)", () => {
    expect(cifraEs(1800)).toBe("1,800");
    expect(cifraEs(78)).toBe("78");
    expect(cifraEs(1722)).toBe("1,722");
    expect(cifraEs(4.55)).toBe("4.6");
    expect(cifraEs(0)).toBe("0");
  });

  it("la palabra concuerda con la cifra: una prenda, dos prendas, cero prendas", () => {
    expect(prendasEs(1)).toBe("1 prenda");
    expect(prendasEs(30)).toBe("30 prendas");
    expect(prendasEs(0)).toBe("0 prendas");
    expect(prendasEs(1800)).toBe("1,800 prendas");
  });

  it("la línea de ventas dice solo lo que existe y concuerda en singular", () => {
    expect(lineaDeVentas(5, 210)).toBe("5 confirmadas · 210 sin registrar, que aún no cuentan");
    expect(lineaDeVentas(1, 1)).toBe("1 confirmada · 1 sin registrar, que aún no cuenta");
    expect(lineaDeVentas(0, 7)).toBe("0 confirmadas · 7 sin registrar, que aún no cuentan");
    expect(lineaDeVentas(4, 0)).toBe("4 confirmadas");
    expect(lineaDeVentas(1, 0)).toBe("1 confirmada");
    expect(lineaDeVentas(0, 0)).toBe("todavía sin ventas");
  });
});

describe("contra qué se miden las dos barras del riel", () => {
  it("la capacidad, si ninguna suma más que ella", () => {
    expect(escalaDelRiel(600, 450, 600)).toBe(600);
    expect(escalaDelRiel(1800, 78, 1800)).toBe(1800);
  });

  it("si hoy cuelga más de lo que cabe, las DOS barras se miden contra eso (no cada una contra lo suyo)", () => {
    // Capacidad 600, hoy 900 y propuesta 600: «Hoy» llena la pista y «Propuesta» ocupa los 2/3, en lugar de verse las dos llenas.
    expect(escalaDelRiel(600, 900, 600)).toBe(900);
  });

  it("un valor que no es cuenta (NaN, negativo) no cambia la escala", () => {
    expect(escalaDelRiel(600, Number.NaN, -5, 100)).toBe(600);
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
