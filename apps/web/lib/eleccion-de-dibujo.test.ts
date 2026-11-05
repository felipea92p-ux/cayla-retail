import { describe, expect, it } from "vitest";
import { cambioDeDibujo, eleccionDeLoGuardado, eleccionEfectiva, type EleccionDeDibujo } from "./eleccion-de-dibujo";
import { INTENTOS_DE_COMPRESION_INSIGNIA, avisoDeProporcionInsignia, medidasEnElCuadrado, objecionImagenDeInsignia } from "./imagen-de-insignia-reglas";

const INS = "0e962052-ade9-4dd2-8ef9-6fe6ff5681fb";
const RUTA = `insignias/${INS}/5a5a5a5a-1111-4222-8333-444444444444.webp`;
const IMAGEN_NUEVA = { tipo: "imagen", archivo: {} as File, vista: "blob:x", silueta: false, modo: null, original: {} as File } satisfies EleccionDeDibujo;

describe("lo que se elige como dibujo de una insignia", () => {
  it("lo guardado: la imagen propia manda; si no, el dibujo elegido; si no, el del nombre; si el nombre no dice nada, la etiqueta", () => {
    expect(eleccionDeLoGuardado({ nombre: "Halloween", icono: "gato", imagen: RUTA })).toEqual({ tipo: "guardada", ruta: RUTA, silueta: false });
    expect(eleccionDeLoGuardado({ nombre: "Halloween", imagen: RUTA, silueta: true })).toEqual({ tipo: "guardada", ruta: RUTA, silueta: true });
    expect(eleccionDeLoGuardado({ nombre: "Halloween", icono: "gato" })).toEqual({ tipo: "dibujo", clave: "gato" });
    expect(eleccionDeLoGuardado({ nombre: "Halloween" })).toEqual({ tipo: "dibujo", clave: "halloween" });
    expect(eleccionDeLoGuardado({ nombre: "Estreno", icono: null, imagen: null })).toEqual({ tipo: "dibujo", clave: "generico" });
    // Una ruta rara no cuenta como imagen.
    expect(eleccionDeLoGuardado({ nombre: "Halloween", imagen: "https://x.test/a.webp" })).toEqual({ tipo: "dibujo", clave: "halloween" });
  });

  it("sin haber elegido nada se ve seleccionado el dibujo que sugiere el nombre, y sigue lo que se escribe; lo elegido a mano no se mueve", () => {
    expect(eleccionEfectiva(null, "")).toEqual({ tipo: "dibujo", clave: "generico" });
    expect(eleccionEfectiva(null, "Halloween")).toEqual({ tipo: "dibujo", clave: "halloween" });
    expect(eleccionEfectiva(null, "Aniversario CAYLA")).toEqual({ tipo: "dibujo", clave: "aniversario" });
    const a_mano: EleccionDeDibujo = { tipo: "dibujo", clave: "gato" };
    expect(eleccionEfectiva(a_mano, "Halloween")).toBe(a_mano);
    expect(eleccionEfectiva(IMAGEN_NUEVA, "Halloween")).toBe(IMAGEN_NUEVA);
  });

  it("cambia algo si es otro dibujo, otra imagen o pasar de uno a otro tipo; una imagen nueva siempre cambia", () => {
    const gato: EleccionDeDibujo = { tipo: "dibujo", clave: "gato" };
    const guardada: EleccionDeDibujo = { tipo: "guardada", ruta: RUTA, silueta: false };
    expect(cambioDeDibujo(gato, { tipo: "dibujo", clave: "gato" })).toBe(false);
    expect(cambioDeDibujo(gato, { tipo: "dibujo", clave: "perro" })).toBe(true);
    expect(cambioDeDibujo(gato, guardada)).toBe(true);
    expect(cambioDeDibujo(guardada, { tipo: "guardada", ruta: RUTA, silueta: false })).toBe(false);
    // La misma imagen guardada pasa de color a silueta (o al revés): sí es un cambio.
    expect(cambioDeDibujo(guardada, { tipo: "guardada", ruta: RUTA, silueta: true })).toBe(true);
    expect(cambioDeDibujo(guardada, gato)).toBe(true);
    expect(cambioDeDibujo(guardada, IMAGEN_NUEVA)).toBe(true);
    expect(cambioDeDibujo(gato, IMAGEN_NUEVA)).toBe(true);
  });
});

describe("preparar la imagen propia de una insignia", () => {
  it("solo sirven PNG, JPG y WebP, con algo adentro y de hasta 15 MB (un SVG no)", () => {
    expect(objecionImagenDeInsignia({ type: "image/png", size: 1000 })).toBeNull();
    expect(objecionImagenDeInsignia({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(objecionImagenDeInsignia({ type: "image/webp", size: 1000 })).toBeNull();
    expect(objecionImagenDeInsignia({ type: "image/svg+xml", size: 1000 })).toMatch(/PNG, JPG o WebP/);
    expect(objecionImagenDeInsignia({ type: "application/pdf", size: 1000 })).not.toBeNull();
    expect(objecionImagenDeInsignia({ type: "image/png", size: 0 })).toMatch(/vacío/);
    expect(objecionImagenDeInsignia({ type: "image/png", size: 15 * 1024 * 1024 + 1 })).toMatch(/15 MB/);
  });

  it("cabe entera en el cuadrado, centrada, sin deformar y sin agrandar una imagen chica", () => {
    expect(medidasEnElCuadrado(1000, 1000)).toEqual({ ancho: 256, alto: 256, x: 0, y: 0 });
    expect(medidasEnElCuadrado(2000, 1000)).toEqual({ ancho: 256, alto: 128, x: 0, y: 64 });
    expect(medidasEnElCuadrado(1000, 2000)).toEqual({ ancho: 128, alto: 256, x: 64, y: 0 });
    expect(medidasEnElCuadrado(100, 50)).toEqual({ ancho: 100, alto: 50, x: 78, y: 103 });
    expect(medidasEnElCuadrado(4000, 1, 256).alto).toBe(1);
  });

  it("avisa (sin bloquear) si no es cuadrada, y los intentos de compresión van del mejor al más liviano", () => {
    expect(avisoDeProporcionInsignia(500, 500)).toBeNull();
    expect(avisoDeProporcionInsignia(500, 450)).toBeNull();
    expect(avisoDeProporcionInsignia(1000, 400)).toMatch(/No es cuadrada/);
    const calidades = INTENTOS_DE_COMPRESION_INSIGNIA.filter(([, escala]) => escala === 1).map(([c]) => c);
    expect([...calidades].sort((a, b) => b - a)).toEqual(calidades);
    expect(INTENTOS_DE_COMPRESION_INSIGNIA.at(-1)?.[1]).toBeLessThan(1);
  });
});
