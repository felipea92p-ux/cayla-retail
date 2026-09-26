import { describe, it, expect } from "vitest";
import { aplicarCurva, curvaDeLuz, enfocar, GANANCIA_MAXIMA, histogramaDeLuz, NEGRO_MAXIMO } from "./foto-luz";
import { soloLaPrenda } from "./foto-encuadre";

/** Una imagen RGBA de `n` píxeles, todos opacos, con los colores dados (se repiten en ciclo). */
function imagen(colores: [number, number, number][], n = colores.length * 100, alfa = 255): Uint8ClampedArray {
  const d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = colores[i % colores.length];
    d.set([r, g, b, alfa], i * 4);
  }
  return d;
}

/** Matiz (0–360) de un color, para comprobar que la luz no cambia QUÉ color es. */
function matiz(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

describe("curvaDeLuz", () => {
  it("una foto apagada (la prenda entre 40 y 170) se aclara, con tope", () => {
    const c = curvaDeLuz(histogramaDeLuz(imagen([[40, 40, 40], [100, 110, 120], [170, 170, 170]])));
    expect(c).not.toBeNull();
    expect(c!.ganancia).toBeLessThanOrEqual(GANANCIA_MAXIMA);
    expect(c!.negro).toBeLessThanOrEqual(NEGRO_MAXIMO);
  });

  it("una foto que ya usa todo el rango no se toca", () => {
    expect(curvaDeLuz(histogramaDeLuz(imagen([[0, 0, 0], [128, 128, 128], [255, 255, 255]])))).toBeNull();
  });

  it("una prenda negra no se vuelve más negra de la cuenta", () => {
    const c = curvaDeLuz(histogramaDeLuz(imagen([[70, 70, 70], [90, 90, 90], [130, 130, 130]])));
    expect(c!.negro).toBe(NEGRO_MAXIMO);
  });

  it("solo mide la prenda: el fondo transparente de un recorte no cuenta", () => {
    const prenda = imagen([[60, 60, 60], [150, 150, 150]], 200);
    const fondo = imagen([[255, 255, 255]], 5000, 0); // blanco pero transparente
    const junto = new Uint8ClampedArray(prenda.length + fondo.length);
    junto.set(prenda);
    junto.set(fondo, prenda.length);
    expect(curvaDeLuz(histogramaDeLuz(junto))).toEqual(curvaDeLuz(histogramaDeLuz(prenda)));
  });

  it("sin prenda que medir, no hay curva", () => {
    expect(curvaDeLuz(histogramaDeLuz(imagen([[10, 10, 10]], 50, 0)))).toBeNull();
  });
});

describe("aplicarCurva", () => {
  it("un celeste sigue siendo celeste: aclara sin mover el matiz", () => {
    const celeste: [number, number, number] = [110, 150, 190];
    const d = imagen([celeste], 1);
    aplicarCurva(d, { negro: 20, ganancia: 1.3 });
    expect(d[0]).toBeGreaterThan(celeste[0] - 20);
    expect(matiz(d[0], d[1], d[2])).toBeCloseTo(matiz(...celeste), 5);
  });

  it("no toca el alfa", () => {
    const d = imagen([[100, 100, 100]], 1, 77);
    aplicarCurva(d, { negro: 10, ganancia: 1.2 });
    expect(d[3]).toBe(77);
  });
});

describe("enfocar", () => {
  it("una zona pareja (el fondo blanco) no cambia", () => {
    const d = imagen([[255, 255, 255]], 25);
    expect(Array.from(enfocar(d, 5, 5))).toEqual(Array.from(d));
  });

  it("un borde se marca un poco, sin exagerar", () => {
    // 3×3: columna izquierda oscura, el resto claro. El píxel del centro está junto al borde.
    const d = new Uint8ClampedArray(9 * 4);
    for (let i = 0; i < 9; i++) {
      const v = i % 3 === 0 ? 50 : 200;
      d.set([v, v, v, 255], i * 4);
    }
    const centro = enfocar(d, 3, 3)[4 * 4];
    expect(centro).toBeGreaterThan(200);
    expect(centro).toBeLessThan(230);
  });
});

describe("soloLaPrenda", () => {
  /** Una imagen transparente de 100×100 con rectángulos opacos. */
  function recorte(rects: { x: number; y: number; ancho: number; alto: number }[]) {
    const d = new Uint8ClampedArray(100 * 100 * 4);
    for (const r of rects)
      for (let y = r.y; y < r.y + r.alto; y++) for (let x = r.x; x < r.x + r.ancho; x++) d[(y * 100 + x) * 4 + 3] = 255;
    return d;
  }
  const opacos = (d: Uint8ClampedArray) => d.filter((_, i) => i % 4 === 3 && d[i] > 0).length;

  it("borra una mancha suelta y deja la prenda intacta (la mancha rosada de la «Blusa V»)", () => {
    const d = recorte([{ x: 30, y: 10, ancho: 40, alto: 70 }, { x: 2, y: 90, ancho: 6, alto: 6 }]);
    expect(soloLaPrenda(d, 100, 100)).toBe(36);
    expect(opacos(d)).toBe(40 * 70);
  });

  it("conserva dos prendas grandes separadas (un conjunto)", () => {
    const d = recorte([{ x: 5, y: 10, ancho: 40, alto: 60 }, { x: 55, y: 10, ancho: 35, alto: 60 }]);
    expect(soloLaPrenda(d, 100, 100)).toBe(0);
  });

  it("una prenda sola no se toca", () => {
    const d = recorte([{ x: 20, y: 20, ancho: 50, alto: 50 }]);
    expect(soloLaPrenda(d, 100, 100)).toBe(0);
    expect(opacos(d)).toBe(2500);
  });

  it("dos piezas que solo se tocan en diagonal son dos piezas (un hilo no pega una mancha a la prenda)", () => {
    const d = recorte([{ x: 10, y: 10, ancho: 40, alto: 40 }, { x: 50, y: 50, ancho: 3, alto: 3 }]);
    expect(soloLaPrenda(d, 100, 100)).toBe(9);
  });
});
