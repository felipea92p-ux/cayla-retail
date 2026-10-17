import { describe, it, expect } from "vitest";
import { cajaDeContenido, fraccionDeHuecos, HUECOS_MAXIMOS, recorteAgujereado, rutaDeLaFoto, soloLaPrenda } from "./foto-encuadre";

/** Una imagen RGBA transparente de `ancho × alto` con un rectángulo opaco (o de la opacidad pedida). */
function imagen(ancho: number, alto: number, rect: { x: number; y: number; ancho: number; alto: number } | null, alfa = 255) {
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  if (rect)
    for (let y = rect.y; y < rect.y + rect.alto; y++)
      for (let x = rect.x; x < rect.x + rect.ancho; x++) datos[(y * ancho + x) * 4 + 3] = alfa;
  return datos;
}

describe("cajaDeContenido", () => {
  it("encierra exactamente lo visible", () => {
    const d = imagen(100, 80, { x: 10, y: 20, ancho: 30, alto: 40 });
    expect(cajaDeContenido(d, 100, 80)).toEqual({ x: 10, y: 20, ancho: 30, alto: 40, pixeles: 1200 });
  });

  it("sin nada visible devuelve null", () => {
    expect(cajaDeContenido(imagen(50, 50, null), 50, 50)).toBeNull();
  });

  it("el halo casi transparente del recorte no agranda la caja", () => {
    const d = imagen(100, 100, { x: 0, y: 0, ancho: 100, alto: 100 }, 10); // bruma en toda la imagen
    for (let y = 40; y < 60; y++) for (let x = 30; x < 70; x++) d[(y * 100 + x) * 4 + 3] = 255;
    expect(cajaDeContenido(d, 100, 100)).toEqual({ x: 30, y: 40, ancho: 40, alto: 20, pixeles: 800 });
  });
});

describe("rutaDeLaFoto: la foto se guarda con la extensión de lo que es", () => {
  it("un PNG sin fondo no se llama .jpg", () => {
    expect(rutaDeLaFoto("abc", "image/png")).toBe("fotos/abc.png");
    expect(rutaDeLaFoto("abc", "image/jpeg")).toBe("fotos/abc.jpg");
    expect(rutaDeLaFoto("abc", "image/webp")).toBe("fotos/abc.webp");
  });

  it("un tipo que el almacén no acepta no tiene ruta", () => {
    expect(rutaDeLaFoto("abc", "image/gif")).toBeNull();
    expect(rutaDeLaFoto("abc", "")).toBeNull();
  });
});

describe("fraccionDeHuecos", () => {
  /** 100×100 transparente, con rectángulos de la opacidad dada (255 por defecto). */
  function lienzo(rects: { x: number; y: number; ancho: number; alto: number; alfa?: number }[]) {
    const d = new Uint8ClampedArray(100 * 100 * 4);
    for (const r of rects)
      for (let y = r.y; y < r.y + r.alto; y++) for (let x = r.x; x < r.x + r.ancho; x++) d[(y * 100 + x) * 4 + 3] = r.alfa ?? 255;
    return d;
  }
  const caja = { x: 10, y: 10, ancho: 80, alto: 80 };

  it("una prenda entera no tiene huecos", () => {
    expect(fraccionDeHuecos(lienzo([{ ...caja }]), 100, caja)).toBe(0);
  });

  it("el espacio entre las piernas de un pantalón NO es un hueco: llega al borde", () => {
    const pantalon = lienzo([
      { x: 10, y: 10, ancho: 80, alto: 30 }, // cintura
      { x: 10, y: 40, ancho: 30, alto: 50 }, // pierna izquierda
      { x: 60, y: 40, ancho: 30, alto: 50 }, // pierna derecha
    ]);
    expect(fraccionDeHuecos(pantalon, 100, caja)).toBe(0);
  });

  it("un manchón en medio de la tela sí es un hueco", () => {
    const d = lienzo([{ ...caja }, { x: 40, y: 40, ancho: 10, alto: 10, alfa: 0 }]);
    expect(fraccionDeHuecos(d, 100, caja)).toBeCloseTo(100 / 6400, 5);
  });

  it("la tela medio borrada (lavada) cuenta como hueco", () => {
    const d = lienzo([{ ...caja }, { x: 40, y: 40, ancho: 10, alto: 10, alfa: 60 }]);
    expect(fraccionDeHuecos(d, 100, caja)).toBeGreaterThan(0);
  });
});

describe("recorteAgujereado", () => {
  it("pide revisión solo por encima del umbral medido", () => {
    expect(recorteAgujereado(0.0007)).toBe(false); // «Apple Bottom», limpia
    expect(recorteAgujereado(0.0138)).toBe(true); // jean Levi's agujereado
    expect(recorteAgujereado(HUECOS_MAXIMOS)).toBe(false);
    expect(recorteAgujereado(null)).toBe(false);
  });
});

describe("soloLaPrenda", () => {
  it("borra la mota suelta y deja la prenda", () => {
    const d = imagen(100, 100, { x: 20, y: 20, ancho: 50, alto: 50 });
    d[(5 * 100 + 90) * 4 + 3] = 255; // una mota
    expect(soloLaPrenda(d, 100, 100)).toBe(1);
    expect(d[(5 * 100 + 90) * 4 + 3]).toBe(0);
    expect(d[(30 * 100 + 30) * 4 + 3]).toBe(255);
  });

  it("un conjunto de dos piezas grandes se conserva", () => {
    const d = imagen(100, 100, { x: 5, y: 20, ancho: 40, alto: 50 });
    for (let y = 20; y < 70; y++) for (let x = 55; x < 95; x++) d[(y * 100 + x) * 4 + 3] = 255;
    expect(soloLaPrenda(d, 100, 100)).toBe(0);
  });
});
