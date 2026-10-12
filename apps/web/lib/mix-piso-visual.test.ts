import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cifraEs, colorDeGrupo, escalaDeMancuerna, pctEs, posicionEnEscala, prendasEs } from "./mix-piso-visual";

describe("el color de cada grupo del plan del piso (una sola fuente: --grupo-N de plan-piso.css)", () => {
  it("sale de la posición del grupo en el riel", () => {
    for (let i = 0; i < 6; i++) expect(colorDeGrupo(i)).toBe(`var(--grupo-${i})`);
  });

  it("con más de seis grupos los colores se reutilizan, y un índice negativo no se rompe", () => {
    expect(colorDeGrupo(6)).toBe(colorDeGrupo(0));
    expect(colorDeGrupo(13)).toBe(colorDeGrupo(1));
    expect(colorDeGrupo(-1)).toBe(colorDeGrupo(5));
  });

  it("los seis colores existen en la hoja de estilos, definidos solo con tokens (nada de hex ni rgb) y con su versión oscura para el cuarto", () => {
    const css = readFileSync(new URL("../app/estilos/plan-piso.css", import.meta.url), "utf8");
    for (let i = 0; i < 6; i++) expect(css, `--grupo-${i}`).toMatch(new RegExp(`--grupo-${i}:\\s*[^;]*var\\(--color-`));
    const definiciones = css.match(/--grupo-[0-9a-z]+:[^;]+;/g) ?? [];
    expect(definiciones.length).toBeGreaterThanOrEqual(7);
    for (const d of definiciones) expect(d, d).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(css).toMatch(/:root\[data-tema="oscuro"\]\s*\{[^}]*--grupo-4/);
    expect(css).not.toMatch(/--grupo-[0-9]:[^;]*--color-rojo/);
  });
});

describe("cómo se escribe una cifra del plan del piso", () => {
  it("un porcentaje lleva espacio duro: «4 %» no se parte en dos renglones", () => {
    expect(pctEs(4)).toBe("4\u00a0%");
    expect(pctEs(43.8)).toBe("43.8\u00a0%");
    expect(pctEs(1000)).toBe("1,000\u00a0%");
  });

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
