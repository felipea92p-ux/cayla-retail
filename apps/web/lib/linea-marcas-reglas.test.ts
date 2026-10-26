import { describe, expect, it } from "vitest";
import { anchoDeTexto, radioDeToque, separarMarcas, textosQueCaben } from "./linea-marcas-reglas";

const separados = (p: number[], min: number) => [...p].sort((a, b) => a - b).every((x, i, s) => i === 0 || x - s[i - 1]! >= min - 1e-9);

describe("separarMarcas", () => {
  it("los que ya están separados no se mueven", () => {
    expect(separarMarcas([40, 120, 300], 26, 20, 400)).toEqual([40, 120, 300]);
  });

  it("seis encimados quedan a 26 px uno del otro, en su orden y centrados donde estaban", () => {
    const p = separarMarcas([100, 101, 102, 103, 104, 105], 26, 20, 600);
    expect(separados(p, 26)).toBe(true);
    expect(p).toEqual([...p].sort((a, b) => a - b));
    expect((p[0]! + p[5]!) / 2).toBeCloseTo(102.5, 5);
  });

  it("respeta los bordes: si se saldría por la izquierda, se corre a la derecha", () => {
    const p = separarMarcas([22, 23, 24], 26, 20, 400);
    expect(p[0]).toBe(20);
    expect(separados(p, 26)).toBe(true);
  });

  it("devuelve las posiciones en el orden en que llegaron, aunque no vengan ordenadas", () => {
    const p = separarMarcas([300, 100, 101], 26, 20, 600);
    expect(p[0]).toBe(300);
    expect(p[2]! - p[1]!).toBeCloseTo(26, 5);
    expect(p[1]).toBeLessThan(p[2]!);
  });

  it("si no cabe a 26 px, se reparte parejo dentro del ancho en vez de salirse", () => {
    const p = separarMarcas([50, 50, 50, 50, 50], 26, 20, 100);
    expect(Math.min(...p)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...p)).toBeLessThanOrEqual(100);
    expect(separados(p, 20)).toBe(true);
  });

  it("un número solo, o ninguno", () => {
    expect(separarMarcas([], 26, 0, 10)).toEqual([]);
    expect(separarMarcas([55], 26, 20, 400)).toEqual([55]);
  });

  it("barrido: siempre en orden, separados (si cabe) y dentro de los bordes", () => {
    let semilla = 515;
    const azar = (n: number) => ((semilla = (semilla * 1103515245 + 12345) % 2147483648), semilla % n);
    for (let caso = 0; caso < 400; caso++) {
      const n = 1 + azar(9);
      const xs = Array.from({ length: n }, () => 20 + azar(500));
      const p = separarMarcas(xs, 26, 20, 520);
      const orden = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]!);
      const ps = orden.map((i) => p[i]!);
      expect(ps, JSON.stringify(xs)).toEqual([...ps].sort((a, b) => a - b));
      if ((n - 1) * 26 <= 500) expect(separados(p, 26), JSON.stringify(xs)).toBe(true);
      expect(Math.min(...p)).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(Math.max(...p)).toBeLessThanOrEqual(520 + 1e-9);
    }
  });
});

describe("textosQueCaben", () => {
  it("el texto de un número apretado no se dibuja; el de uno con sitio, sí", () => {
    const t = ["↑ subió S/ 1.61", "↓ bajó S/ 0.04", "igual"];
    expect(textosQueCaben([40, 300, 600], t)).toEqual([true, true, true]);
    expect(textosQueCaben([40, 66, 600], t)).toEqual([false, false, true]);
  });

  it("dos números separados lo justo para que cada texto quepa mantienen sus textos", () => {
    const a = "igual", b = "primera";
    const justo = (anchoDeTexto(a) + anchoDeTexto(b)) / 2;
    expect(textosQueCaben([100, 100 + justo], [a, b])).toEqual([true, true]);
    expect(textosQueCaben([100, 100 + justo - 1], [a, b])).toEqual([false, false]);
  });
});

describe("radioDeToque", () => {
  it("20 px si el vecino está lejos; la mitad de la distancia si está cerca, sin bajar de 12", () => {
    expect(radioDeToque([40, 300], 0)).toBe(20);
    expect(radioDeToque([40, 66], 0)).toBe(13);
    expect(radioDeToque([40, 44], 0)).toBe(12);
    expect(radioDeToque([40], 0)).toBe(20);
  });
});
