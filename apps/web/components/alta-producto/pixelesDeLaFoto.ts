"use client";

import type { PixelesRGBA } from "@/lib/colores-de-la-foto";

// Los píxeles de una foto, achicada a ~220 px de lado, para leer sus colores en el navegador (ADR-0663). Achicarla no cambia los
// colores que importan (una tela ocupa miles de píxeles) y deja la lectura bajo el segundo hasta en un celular.

const LADO = 220;

export async function pixelesDeLaFoto(foto: Blob): Promise<PixelesRGBA> {
  const imagen = await createImageBitmap(foto);
  try {
    const escala = Math.min(1, LADO / Math.max(imagen.width, imagen.height));
    const ancho = Math.max(1, Math.round(imagen.width * escala));
    const alto = Math.max(1, Math.round(imagen.height * escala));
    // Un navegador viejo sin OffscreenCanvas usa un canvas suelto: es lo mismo, fuera de la página.
    const lienzo: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(ancho, alto) : Object.assign(document.createElement("canvas"), { width: ancho, height: alto });
    const ctx = lienzo.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) throw new Error("Este navegador no deja leer la foto.");
    ctx.drawImage(imagen, 0, 0, ancho, alto);
    return { ancho, alto, datos: ctx.getImageData(0, 0, ancho, alto).data };
  } finally {
    imagen.close();
  }
}
