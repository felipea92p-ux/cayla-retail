import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { medirBytesDelRecorte } from "./medida-del-recorte";
import { ANCHO_PARA_MEDIR, medirRecorte } from "./union-prendas";

/** Un PNG de verdad, `ancho × alto`, con la prenda donde `prenda(x, y)` dice (opaca) y el resto transparente: como sale un recorte del ERP. */
async function png(ancho: number, alto: number, prenda: (x: number, y: number) => boolean): Promise<{ bytes: Buffer; puntos: Uint8Array }> {
  const puntos = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      puntos.set(prenda(x, y) ? [40, 60, 120, 255] : [0, 0, 0, 0], i);
    }
  }
  const bytes = await sharp(Buffer.from(puntos), { raw: { width: ancho, height: alto, channels: 4 } }).png().toBuffer();
  return { bytes, puntos };
}

/** Un polo de 200×200: torso de x 60 a 140 hasta la fila 160 y dos mangas sueltas a los lados hasta la fila 199. */
const polo = (x: number, y: number) => (x >= 60 && x < 140 && y < 160) || (x < 30 && y < 200) || (x >= 170 && y < 200);
/** Un short de 200×120: pretina de x 50 a 150 arriba, y se abre en las piernas. */
const short = (x: number, y: number) => x >= 50 - (y / 120) * 40 && x < 150 + (y / 120) * 40;

describe("medirBytesDelRecorte: la tienda mide el recorte (sin lienzo, sin el ruido de Safari 26)", () => {
  it("da lo mismo que la medida de siempre sobre los mismos píxeles", async () => {
    const { bytes, puntos } = await png(200, 200, polo);
    const enServidor = await medirBytesDelRecorte(bytes);
    // `sharp` baja la imagen a ANCHO_PARA_MEDIR: se compara contra la misma imagen bajada igual.
    const { data, info } = await sharp(bytes).resize({ width: ANCHO_PARA_MEDIR, withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(enServidor).toEqual(medirRecorte(data, info.width, info.height));
    // Y es la del polo: el torso termina en la fila 160 de 200 y mide 80 de 200 de ancho, sin las mangas.
    expect(enServidor.filaDelBorde).toBeCloseTo(0.8, 2);
    expect(enServidor.borde).toBeCloseTo(0.4, 2);
    expect(medirRecorte(puntos, 200, 200).borde).toBeCloseTo(0.4, 2);
  });

  it("mide la pretina de un short que se abre en las piernas", async () => {
    const { bytes } = await png(200, 120, short);
    const m = await medirBytesDelRecorte(bytes);
    expect(m.pretina).toBeGreaterThan(0.5);
    expect(m.pretina).toBeLessThan(0.6);
  });

  it("una imagen grande se mide bajada, y la medida es la misma fracción", async () => {
    const chica = await medirBytesDelRecorte((await png(200, 200, polo)).bytes);
    const grande = await medirBytesDelRecorte((await png(800, 800, (x, y) => polo(Math.floor(x / 4), Math.floor(y / 4)))).bytes);
    expect(grande.filaDelBorde).toBeCloseTo(chica.filaDelBorde!, 1);
    expect(grande.borde).toBeCloseTo(chica.borde!, 1);
  });

  it("lo que no es una imagen no se mide: lanza, y la ruta responde «sin medida»", async () => {
    await expect(medirBytesDelRecorte(Buffer.from("no soy un png"))).rejects.toThrow();
  });
});
