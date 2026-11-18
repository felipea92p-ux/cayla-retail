import { describe, expect, it } from "vitest";
import { esNombreDeFoto, recortarFondo, urlDeFotoOriginal, urlDeRecorte } from "./recorte";

const FOTO = "8e2492a0-8aca-45f0-af88-7edbf4c27d4e.png";
type Color = readonly [number, number, number];

/** Una foto de `ancho`×`alto` con fondo blanco y lo que pinte `pintar(x, y)`. */
function foto(ancho: number, alto: number, pintar: (x: number, y: number) => Color | null) {
  const puntos = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++)
    for (let x = 0; x < ancho; x++) {
      const c = pintar(x, y) ?? ([255, 255, 255] as const);
      puntos.set([...c, 255], (y * ancho + x) * 4);
    }
  return puntos;
}
const alfa = (p: Uint8Array, ancho: number, x: number, y: number) => p[(y * ancho + x) * 4 + 3];
const VINO: Color = [90, 20, 40];

describe("recortar la prenda de su foto", () => {
  it("vuelve transparente el fondo, conserva la prenda y ajusta la caja a ella", () => {
    const p = foto(200, 200, (x, y) => (x >= 50 && x < 150 && y >= 40 && y < 160 ? VINO : null));
    const caja = recortarFondo(p, 200, 200);
    expect(alfa(p, 200, 5, 5)).toBe(0);
    expect(alfa(p, 200, 100, 100)).toBe(255);
    expect(caja).toEqual({ izquierda: 48, arriba: 38, ancho: 104, alto: 128 });
  });

  it("el gris del fondo queda como sombra negra, no como una mancha gris", () => {
    const p = foto(200, 200, (x, y) => (x >= 50 && x < 150 && y >= 40 && y < 150 ? VINO : y >= 150 && y < 170 && x >= 50 && x < 150 ? [200, 200, 200] : null));
    recortarFondo(p, 200, 200);
    const i = (160 * 200 + 100) * 4;
    expect([p[i], p[i + 1], p[i + 2]]).toEqual([0, 0, 0]);
    expect(p[i + 3]).toBeGreaterThan(0);
    expect(p[i + 3]).toBeLessThanOrEqual(90);
  });

  it("abre un hueco blanco grande encerrado por la prenda, pero no un brillo pequeño", () => {
    const hueco = (x: number, y: number) => x >= 80 && x < 120 && y >= 60 && y < 100;
    const brillo = (x: number, y: number) => x >= 60 && x < 64 && y >= 130 && y < 134;
    const p = foto(200, 200, (x, y) => (x >= 50 && x < 150 && y >= 40 && y < 160 && !hueco(x, y) && !brillo(x, y) ? VINO : null));
    recortarFondo(p, 200, 200);
    expect(alfa(p, 200, 100, 80)).toBe(0);
    expect(alfa(p, 200, 62, 132)).toBe(255);
  });

  it("una mota suelta no agranda la caja", () => {
    const p = foto(200, 200, (x, y) => ((x >= 50 && x < 150 && y >= 40 && y < 160) || (x === 2 && y === 2) ? VINO : null));
    expect(recortarFondo(p, 200, 200)?.izquierda).toBe(48);
  });

  it("sin prenda que encontrar (toda blanca) no recorta: se muestra la foto tal cual", () => {
    expect(recortarFondo(foto(100, 100, () => null), 100, 100)).toBeNull();
  });

  it("también quita un fondo claro que no es blanco, como el crema de algunas fotos", () => {
    const crema: Color = [236, 226, 208];
    const p = foto(200, 200, (x, y) => (x >= 50 && x < 150 && y >= 40 && y < 160 ? VINO : crema));
    expect(recortarFondo(p, 200, 200)).toEqual({ izquierda: 48, arriba: 38, ancho: 104, alto: 128 });
    expect(alfa(p, 200, 5, 5)).toBe(0);
    expect(alfa(p, 200, 100, 100)).toBe(255);
  });

  it("una raya blanca de la tela que llega a la orilla no se vuelve transparente (el short de rayas, 2026-11-10)", () => {
    // 600×600: un short rosa con rayas de blanco tela (235, más oscuro que el blanco de estudio) de 10 px que van de la pretina al bajo.
    const ROSA: Color = [230, 150, 160];
    const TELA: Color = [235, 235, 235];
    const p = foto(600, 600, (x, y) => (x >= 150 && x < 450 && y >= 150 && y < 450 ? ((x - 150) % 30 < 10 ? TELA : ROSA) : null));
    recortarFondo(p, 600, 600);
    expect(alfa(p, 600, 5, 5)).toBe(0);
    // Una raya blanca de adentro sigue siendo prenda en el medio y cerca de sus puntas, que tocan el fondo de arriba y de abajo.
    expect(alfa(p, 600, 275, 300)).toBe(255);
    expect(alfa(p, 600, 305, 300)).toBe(255);
    expect(alfa(p, 600, 275, 180)).toBe(255);
    expect(alfa(p, 600, 275, 420)).toBe(255);
  });

  it("un claro angosto de fondo puro entre dos partes (entre las cadenas de un collar) sí es fondo", () => {
    // Dos piezas separadas por un pasillo blanco de estudio de 8 px que llega al borde de la foto.
    const p = foto(600, 600, (x, y) => (y >= 150 && y < 450 && ((x >= 150 && x < 296) || (x >= 304 && x < 450)) ? VINO : null));
    recortarFondo(p, 600, 600);
    expect(alfa(p, 600, 300, 300)).toBe(0);
    expect(alfa(p, 600, 200, 300)).toBe(255);
  });

  it("un hueco blanco de la tela largo y angosto no es un hueco: se queda", () => {
    // Una franja blanca tela de 10 px encerrada por la prenda: antes, con 350 puntos o más, se abría.
    const p = foto(600, 600, (x, y) => (x >= 150 && x < 450 && y >= 150 && y < 450 ? (x >= 295 && x < 305 && y >= 200 && y < 400 ? [242, 242, 242] : VINO) : null));
    recortarFondo(p, 600, 600);
    expect(alfa(p, 600, 300, 300)).toBe(255);
  });

  it("respeta la transparencia que ya traía la foto", () => {
    const p = foto(100, 100, (x, y) => (x >= 20 && x < 80 && y >= 20 && y < 80 ? VINO : null));
    for (let i = 0; i < 100; i++) p[i * 4 + 3] = 0;
    expect(recortarFondo(p, 100, 100)).not.toBeNull();
    expect(alfa(p, 100, 50, 0)).toBe(0);
  });
});

describe("las direcciones", () => {
  it("solo acepta el nombre de una foto: nada de carpetas ni de otras cosas", () => {
    expect(esNombreDeFoto(FOTO)).toBe(true);
    for (const malo of ["../secreto.png", "a/b.png", "foto.gif", `${FOTO}/x`, "http://otro/foto.png", ""]) expect(esNombreDeFoto(malo)).toBe(false);
  });

  it("arma el recorte de una foto del almacén; otra dirección se queda sin recorte", () => {
    const original = urlDeFotoOriginal("https://x.supabase.co/", FOTO);
    expect(original).toBe(`https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/${FOTO}`);
    expect(urlDeRecorte(original, 640)).toBe(`/api/recorte/${FOTO}?w=640&v=3`);
    expect(urlDeRecorte(`https://otro.pe/${FOTO}`, 640)).toBeNull();
  });
});
