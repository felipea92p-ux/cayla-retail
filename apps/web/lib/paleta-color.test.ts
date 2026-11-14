import { describe, expect, it } from "vitest";
import {
  hexAHsv,
  hsvAHex,
  matizEnLaBarra,
  matizPuro,
  moverMatiz,
  moverPunto,
  nombreDelMatiz,
  recortar,
  textoDelPunto,
  tonoEnElCuadro,
  type Hsv,
} from "./paleta-color";

// La paleta con todos los colores (ADR-0663): lo que se guarda es el #hex, así que lo que importa es que la ida y vuelta no lo
// cambie y que los colores sin matiz (gris, blanco, negro) no hagan saltar la barra.

const hsv = (hex: string, previo?: Hsv) => {
  const r = hexAHsv(hex, previo);
  if (!r) throw new Error(`${hex} no es un #hex`);
  return r;
};

describe("hex ↔ hsv", () => {
  it("los bordes: negro, blanco, gris y los primarios", () => {
    expect(hsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
    expect(hsv("#ffffff")).toEqual({ h: 0, s: 0, v: 1 });
    expect(hsv("#808080")).toEqual({ h: 0, s: 0, v: 128 / 255 });
    expect(hsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsv("#00ff00")).toEqual({ h: 120, s: 1, v: 1 });
    expect(hsv("#0000ff")).toEqual({ h: 240, s: 1, v: 1 });
    expect(hsv("#ff00ff").h).toBe(300);
  });

  it("acepta sin # y en mayúsculas; rechaza lo que no es un #hex de 6 cifras", () => {
    expect(hsv("C9B79C")).toEqual(hsv("#c9b79c"));
    for (const malo of ["", "#fff", "#12345", "#1234567", "#ggg000", "rgb(1,2,3)"]) expect(hexAHsv(malo), malo).toBeNull();
  });

  it("la ida y vuelta hex → hsv → hex no cambia ningún color (una rejilla de 4 096 tonos)", () => {
    const pasos = Array.from({ length: 16 }, (_, i) => i * 17);
    for (const r of pasos)
      for (const g of pasos)
        for (const b of pasos) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
          expect(hsvAHex(hsv(hex))).toBe(hex);
        }
  });

  it("siempre devuelve #rrggbb en minúsculas, como lo guarda la base", () => {
    expect(hsvAHex({ h: 30, s: 0.4, v: 0.8 })).toMatch(/^#[0-9a-f]{6}$/);
    expect(hsvAHex(hsv("#C9B79C"))).toBe("#c9b79c");
  });

  it("un tono fuera de rango no da un color imposible: se recorta o gira", () => {
    expect(hsvAHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvAHex({ h: -120, s: 1, v: 1 })).toBe(hsvAHex({ h: 240, s: 1, v: 1 }));
    expect(hsvAHex({ h: 0, s: 2, v: -1 })).toBe("#000000");
    expect(hsvAHex({ h: Number.NaN, s: Number.NaN, v: 1 })).toBe("#ffffff");
  });

  it("un gris, el blanco o el negro conservan el matiz de antes: la barra no salta al rojo", () => {
    const azul: Hsv = { h: 220, s: 0.6, v: 0.7 };
    expect(hsv("#808080", azul).h).toBe(220);
    expect(hsv("#ffffff", azul).h).toBe(220);
    // El negro no dice ni matiz ni intensidad: el punto se queda en su columna al bajar hasta abajo.
    expect(hsv("#000000", azul)).toEqual({ h: 220, s: 0.6, v: 0 });
    // Un color con matiz propio no hereda nada.
    expect(hsv("#ff0000", azul)).toEqual({ h: 0, s: 1, v: 1 });
  });
});

describe("recortar", () => {
  it("lleva a [0, 1] y un NaN al mínimo", () => {
    expect(recortar(-0.1)).toBe(0);
    expect(recortar(1.4)).toBe(1);
    expect(recortar(0.3)).toBe(0.3);
    expect(recortar(Number.NaN)).toBe(0);
    expect(recortar(500, 0, 360)).toBe(360);
  });
});

describe("las flechas", () => {
  const base: Hsv = { h: 100, s: 0.5, v: 0.5 };

  it("el punto: ← → intensidad, ↑ aclara, ↓ oscurece; Shift da pasos de cinco", () => {
    expect(moverPunto(base, "ArrowRight")?.s).toBeCloseTo(0.52);
    expect(moverPunto(base, "ArrowLeft")?.s).toBeCloseTo(0.48);
    expect(moverPunto(base, "ArrowUp")?.v).toBeCloseTo(0.52);
    expect(moverPunto(base, "ArrowDown")?.v).toBeCloseTo(0.48);
    expect(moverPunto(base, "ArrowRight", true)?.s).toBeCloseTo(0.6);
    expect(moverPunto(base, "ArrowRight")?.h).toBe(100);
  });

  it("el punto no sale del cuadro", () => {
    expect(moverPunto({ h: 0, s: 1, v: 1 }, "ArrowRight", true)?.s).toBe(1);
    expect(moverPunto({ h: 0, s: 1, v: 1 }, "ArrowUp", true)?.v).toBe(1);
    expect(moverPunto({ h: 0, s: 0, v: 0 }, "ArrowLeft", true)?.s).toBe(0);
    expect(moverPunto({ h: 0, s: 0, v: 0 }, "ArrowDown", true)?.v).toBe(0);
  });

  it("la perilla: → ↑ avanzan, ← ↓ retroceden, y la barra da la vuelta", () => {
    expect(moverMatiz(base, "ArrowRight")?.h).toBe(102);
    expect(moverMatiz(base, "ArrowUp")?.h).toBe(102);
    expect(moverMatiz(base, "ArrowLeft", true)?.h).toBe(90);
    expect(moverMatiz({ ...base, h: 359 }, "ArrowRight")?.h).toBe(1);
    expect(moverMatiz({ ...base, h: 1 }, "ArrowLeft", true)?.h).toBe(351);
    expect(moverMatiz(base, "ArrowRight")?.s).toBe(0.5);
  });

  it("otra tecla no mueve nada: la pieza la deja pasar (Tab, Escape)", () => {
    for (const t of ["Tab", "Escape", "Enter", " ", "a"]) {
      expect(moverPunto(base, t)).toBeNull();
      expect(moverMatiz(base, t)).toBeNull();
    }
  });
});

describe("el mouse o el dedo", () => {
  const base: Hsv = { h: 200, s: 0.3, v: 0.3 };

  it("en el cuadro: izquierda a derecha es intensidad, arriba abajo es claridad; el matiz no cambia", () => {
    expect(tonoEnElCuadro(base, 0, 0)).toEqual({ h: 200, s: 0, v: 1 });
    expect(tonoEnElCuadro(base, 1, 1)).toEqual({ h: 200, s: 1, v: 0 });
    expect(tonoEnElCuadro(base, -3, 5)).toEqual({ h: 200, s: 0, v: 0 });
  });

  it("en la barra: el borde derecho se queda antes de volver al rojo", () => {
    expect(matizEnLaBarra(base, 0).h).toBe(0);
    expect(matizEnLaBarra(base, 0.5).h).toBe(180);
    expect(matizEnLaBarra(base, 1).h).toBeLessThan(360);
    expect(matizEnLaBarra(base, 2).h).toBeLessThan(360);
    expect(matizEnLaBarra(base, 0.5).s).toBe(0.3);
  });
});

describe("lo que se dice", () => {
  it("el color puro de cada matiz", () => {
    expect(matizPuro(0)).toBe("#ff0000");
    expect(matizPuro(120)).toBe("#00ff00");
    expect(matizPuro(240)).toBe("#0000ff");
  });

  it("todo matiz tiene su nombre de tienda, y la vuelta entera los recorre todos", () => {
    const nombres = new Set<string>();
    for (let h = -360; h <= 720; h += 1) nombres.add(nombreDelMatiz(h));
    expect([...nombres].sort()).toEqual(["amarillo", "azul", "celeste", "morado", "naranja", "rojo", "rosado", "verde"]);
    expect(nombreDelMatiz(0)).toBe("rojo");
    expect(nombreDelMatiz(359)).toBe("rojo");
    expect(nombreDelMatiz(220)).toBe("azul");
  });

  it("el punto dice su #hex, su intensidad y su claridad", () => {
    expect(textoDelPunto({ h: 0, s: 1, v: 1 })).toBe("#FF0000, intensidad 100 %, claridad 100 %");
    expect(textoDelPunto(hsv("#000000"))).toBe("#000000, intensidad 0 %, claridad 0 %");
  });
});
