import { describe, expect, it } from "vitest";
import { aSilueta, textoDeModoDeSilueta, tieneFondoTransparente, type CajaDeImagen } from "./silueta-de-imagen";

// Un cuadro de `n × n` píxeles armado a mano: `pixel(x, y)` devuelve [r, g, b, a].
function cuadro(n: number, pixel: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const [r, g, b, a] = pixel(x, y);
      d.set([r, g, b, a], (y * n + x) * 4);
    }
  }
  return d;
}
const TODO = (n: number): CajaDeImagen => ({ x: 0, y: 0, ancho: n, alto: n });
const alfa = (d: ArrayLike<number>, n: number, x: number, y: number) => d[(y * n + x) * 4 + 3];

describe("¿la imagen trae un fondo transparente?", () => {
  it("un PNG recortado (un círculo sobre transparencia) sí", () => {
    const d = cuadro(10, (x, y) => ((x - 5) ** 2 + (y - 5) ** 2 < 12 ? [224, 123, 0, 255] : [0, 0, 0, 0]));
    expect(tieneFondoTransparente(d, 10, TODO(10))).toBe(true);
  });

  it("un JPG o una foto con todo opaco no", () => {
    const d = cuadro(10, () => [250, 250, 250, 255]);
    expect(tieneFondoTransparente(d, 10, TODO(10))).toBe(false);
  });

  it("una sola esquina redondeada no basta (menos del 1 % del área)", () => {
    const d = cuadro(20, (x, y) => (x === 0 && y === 0 ? [0, 0, 0, 0] : [10, 10, 10, 255]));
    expect(tieneFondoTransparente(d, 20, TODO(20))).toBe(false);
  });

  it("solo mira la caja: el margen transparente de una imagen apaisada no cuenta", () => {
    // 10 × 10 con la imagen opaca en las filas 3 a 6 y transparencia arriba y abajo (el margen del cuadrado).
    const d = cuadro(10, (_x, y) => (y >= 3 && y <= 6 ? [20, 20, 20, 255] : [0, 0, 0, 0]));
    expect(tieneFondoTransparente(d, 10, { x: 0, y: 3, ancho: 10, alto: 4 })).toBe(false);
    expect(tieneFondoTransparente(d, 10, TODO(10))).toBe(true);
  });
});

describe("la silueta de una imagen con fondo transparente", () => {
  const n = 10;
  const d = cuadro(n, (x, y) => ((x - 5) ** 2 + (y - 5) ** 2 < 12 ? [224, 123, 0, 255] : [0, 0, 0, 0]));
  const r = aSilueta(d, n, n, TODO(n));

  it("dice que la forma salió de la transparencia", () => {
    expect(r.modo).toBe("transparencia");
  });

  it("todos los píxeles quedan blancos y la forma es el alfa original", () => {
    for (let i = 0; i < n * n; i++) expect([r.datos[i * 4], r.datos[i * 4 + 1], r.datos[i * 4 + 2]]).toEqual([255, 255, 255]);
    expect(alfa(r.datos, n, 5, 5)).toBe(255);
    expect(alfa(r.datos, n, 0, 0)).toBe(0);
  });

  it("conserva los bordes suaves (un alfa a medias sigue a medias)", () => {
    const suave = cuadro(4, (x) => (x < 2 ? [0, 0, 0, 255] : [0, 0, 0, x === 2 ? 100 : 0]));
    expect(alfa(aSilueta(suave, 4, 4, TODO(4)).datos, 4, 2, 1)).toBe(100);
  });
});

describe("la silueta de una imagen opaca (un logo oscuro sobre fondo blanco)", () => {
  const n = 10;
  // Fondo blanco, y un trazo negro en la columna 4 y gris medio en la 6.
  const d = cuadro(n, (x) => (x === 4 ? [0, 0, 0, 255] : x === 6 ? [128, 128, 128, 255] : [255, 255, 255, 255]));
  const r = aSilueta(d, n, n, TODO(n));

  it("dice que la forma salió de lo oscuro", () => {
    expect(r.modo).toBe("oscuro");
  });

  it("el fondo blanco se vuelve transparente y lo oscuro opaco", () => {
    expect(alfa(r.datos, n, 0, 0)).toBe(0);
    expect(alfa(r.datos, n, 4, 3)).toBe(255);
  });

  it("un gris medio queda opaco o casi (más oscuro que la mitad)", () => {
    expect(alfa(r.datos, n, 6, 3)).toBeGreaterThan(200);
  });

  it("el ruido de un JPG sobre el fondo (un casi blanco) no deja mancha", () => {
    const ruido = cuadro(6, (x) => (x % 2 ? [248, 248, 250, 255] : [252, 251, 253, 255]));
    const s = aSilueta(ruido, 6, 6, TODO(6)).datos;
    for (let i = 0; i < 36; i++) expect(s[i * 4 + 3]).toBe(0);
  });
});

describe("la caja y las garantías", () => {
  it("fuera de la caja siempre transparente, aunque ahí haya algo oscuro", () => {
    const n = 8;
    const d = cuadro(n, () => [0, 0, 0, 255]);
    const r = aSilueta(d, n, n, { x: 2, y: 2, ancho: 4, alto: 4 });
    expect(alfa(r.datos, n, 0, 0)).toBe(0);
    expect(alfa(r.datos, n, 3, 3)).toBe(255);
    expect(alfa(r.datos, n, 7, 7)).toBe(0);
  });

  it("no modifica el arreglo que recibe", () => {
    const d = cuadro(4, () => [10, 20, 30, 255]);
    const copia = Uint8ClampedArray.from(d);
    aSilueta(d, 4, 4, TODO(4));
    expect(Array.from(d)).toEqual(Array.from(copia));
  });

  it("dice de dónde salió la forma con una frase de tienda", () => {
    expect(textoDeModoDeSilueta("transparencia")).toMatch(/fondo transparente/);
    expect(textoDeModoDeSilueta("oscuro")).toMatch(/oscuro/);
  });
});
