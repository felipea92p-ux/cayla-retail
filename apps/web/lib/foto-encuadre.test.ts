import { describe, it, expect } from "vitest";
import {
  cajaDeContenido,
  encuadrar,
  esFotoEncuadrada,
  fraccionDeHuecos,
  HUECOS_MAXIMOS,
  recorteAgujereado,
  LIENZO_FOTO,
  MARGEN_PRENDA,
  recorteUtil,
  reducirA,
  rutasFotoPrenda,
} from "./foto-encuadre";

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

describe("recorteUtil", () => {
  it("una prenda que ocupa buena parte de la foto y llena su caja sirve", () => {
    const d = imagen(100, 100, { x: 20, y: 10, ancho: 50, alto: 70 });
    expect(recorteUtil(cajaDeContenido(d, 100, 100), 100, 100)).toBe(true);
  });

  it("un puntito suelto (el modelo no encontró la prenda) no sirve", () => {
    const d = imagen(100, 100, { x: 0, y: 0, ancho: 5, alto: 5 });
    expect(recorteUtil(cajaDeContenido(d, 100, 100), 100, 100)).toBe(false);
    expect(recorteUtil(null, 100, 100)).toBe(false);
  });

  it("pedazos desparramados por toda la foto no son una prenda, aunque su caja sea grande", () => {
    // Lo que pasó con la foto de una tienda llena de ropa: dos manchas en esquinas opuestas.
    const d = imagen(100, 100, { x: 5, y: 5, ancho: 15, alto: 15 });
    for (let y = 75; y < 95; y++) for (let x = 75; x < 95; x++) d[(y * 100 + x) * 4 + 3] = 255;
    const c = cajaDeContenido(d, 100, 100);
    expect(c && c.ancho * c.alto).toBeGreaterThan(0.5 * 100 * 100);
    expect(recorteUtil(c, 100, 100)).toBe(false);
  });
});

describe("encuadrar", () => {
  it("una prenda alta queda limitada por el alto, con el margen, y centrada a lo ancho", () => {
    const r = encuadrar({ ancho: 400, alto: 1000 });
    expect(r.alto).toBe(Math.round(LIENZO_FOTO.alto * (1 - 2 * MARGEN_PRENDA)));
    expect(r.y).toBe(Math.round((LIENZO_FOTO.alto - r.alto) / 2));
    expect(r.x).toBe(Math.round((LIENZO_FOTO.ancho - r.ancho) / 2));
    expect(r.ancho / r.alto).toBeCloseTo(0.4, 2);
  });

  it("una prenda ancha queda limitada por el ancho", () => {
    const r = encuadrar({ ancho: 1000, alto: 300 });
    expect(r.ancho).toBe(Math.round(LIENZO_FOTO.ancho * (1 - 2 * MARGEN_PRENDA)));
    expect(r.alto).toBeLessThan(LIENZO_FOTO.alto);
  });

  it("dos prendas de tamaños distintos en la foto salen del mismo tamaño en el lienzo", () => {
    // La misma blusa fotografiada de lejos (chica) y de cerca (grande): mismo resultado.
    expect(encuadrar({ ancho: 120, alto: 160 })).toEqual(encuadrar({ ancho: 1200, alto: 1600 }));
  });

  it("sin margen, la foto entera ocupa el lado que la limita (el resto queda en blanco)", () => {
    const r = encuadrar({ ancho: 1920, alto: 1280 }, LIENZO_FOTO, 0);
    expect(r).toEqual({ x: 0, y: 350, ancho: 1200, alto: 800 });
  });
});

describe("reducirA", () => {
  it("achica la foto de celular a 2400 en el lado largo", () => {
    expect(reducirA(4032, 3024)).toEqual({ ancho: 2400, alto: 1800 });
  });

  it("nunca agranda una foto chica", () => {
    expect(reducirA(900, 1200)).toEqual({ ancho: 900, alto: 1200 });
  });
});

describe("rutas de la foto y su original", () => {
  it("comparten el id", () => {
    expect(rutasFotoPrenda("abc")).toEqual({ foto: "fotos/abc.jpg", original: "originales/abc.jpg" });
  });

  it("reconoce las fotos ya encuadradas y no las de antes", () => {
    const base = "https://x.supabase.co/storage/v1/object/public/retail-productos-fotos";
    expect(esFotoEncuadrada(`${base}/fotos/abc.jpg`)).toBe(true);
    expect(esFotoEncuadrada(`${base}/0d9c-blusa.jpg`)).toBe(false);
    expect(esFotoEncuadrada(`${base}/originales/abc.jpg`)).toBe(false);
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
  it("sugiere con fondo solo por encima del umbral medido", () => {
    expect(recorteAgujereado(0.0007)).toBe(false); // «Apple Bottom», limpia
    expect(recorteAgujereado(0.0138)).toBe(true); // jean Levi's agujereado
    expect(recorteAgujereado(HUECOS_MAXIMOS)).toBe(false);
    expect(recorteAgujereado(null)).toBe(false);
  });
});
