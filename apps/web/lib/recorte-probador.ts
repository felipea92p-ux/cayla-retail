"use client";

import type { createClient } from "@/lib/supabase/client";
import { fraccionDeHuecos, LIENZO_FOTO, type Caja } from "@/lib/foto-encuadre";
import { mascaraDePrenda, type MascaraDePrenda } from "@/lib/preparar-foto";
import { subirRecorteDeFoto } from "@/lib/producto-fotos";
import {
  aplicarAlfa,
  cajaVisible,
  destinoDeLaMascara,
  errorDeRecorte,
  esFondoBlanco,
  motivoDelRecorte,
  recorteDeRespuesta,
  tamanoDelRecorte,
  type MotivoRecorte,
  type RecorteDeFoto,
} from "@/lib/recorte-probador-reglas";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";

// El recorte de una foto para el probador de la tienda online, en el NAVEGADOR (ADR-0434, actividad 1). Las cuentas están en
// `recorte-probador-reglas.ts`; aquí se dibujan en un canvas, se codifica el PNG, se sube y se anota.
//
// De dónde sale cada cosa: los COLORES, de la foto que ya muestra la tienda (así el recorte es la misma prenda que la ficha, con su luz
// y su nitidez); la TRANSPARENCIA, del recortador de siempre (MODNet, `mascaraDePrenda`) pasado otra vez por el original guardado al
// subirla, que es la misma imagen que se recortó entonces. Sin original (fotos de antes del ADR-0228), se recorta la foto misma y queda
// por revisar.

type Cliente = ReturnType<typeof createClient>;

export type RecortePreparado = { png: Blob; proporcion: number; motivo: MotivoRecorte | null };

function lienzo(ancho: number, alto: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  return c;
}

/** Baja una imagen pública del almacén. Es un GET: el loader no la cuenta (ADR-0149) y el almacén deja leerla desde el navegador. */
async function bajarImagen(url: string): Promise<Blob> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 404 ? "La foto ya no está en el almacén." : `No se pudo leer la foto (${r.status}).`);
  return r.blob();
}

/** El alfa (un byte por píxel) de la máscara dibujada en `destino`, dentro de un lienzo del tamaño de la foto. */
function alfaEnLaFoto(mascara: MascaraDePrenda, destino: Caja, ancho: number, alto: number): Uint8ClampedArray {
  const m = lienzo(mascara.ancho, mascara.alto);
  m.getContext("2d")!.putImageData(new ImageData(mascara.rgba as Uint8ClampedArray<ArrayBuffer>, mascara.ancho, mascara.alto), 0, 0);
  const c = lienzo(ancho, alto);
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(m, destino.x, destino.y, destino.ancho, destino.alto);
  const datos = g.getImageData(0, 0, ancho, alto).data;
  const alfa = new Uint8ClampedArray(ancho * alto);
  for (let i = 0; i < alfa.length; i++) alfa[i] = datos[i * 4 + 3];
  return alfa;
}

function aPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("El navegador no pudo generar el recorte."))), "image/png"));
}

/**
 * Prepara el recorte de una foto que ya está en la tienda. Lanza si no se puede (la foto no está, el recortador no encontró la
 * prenda): «Preparar recortes» lo cuenta y sigue con la siguiente.
 */
export async function prepararRecorte(f: { url: string; original: string | null }): Promise<RecortePreparado> {
  const blobFoto = await bajarImagen(f.url);
  const foto = await createImageBitmap(blobFoto);
  try {
    const { width: ancho, height: alto } = foto;
    // Solo una foto encuadrada por el ADR-0228 (1200×1500) se puede cruzar con su original: las de antes no tienen la misma cuenta.
    const conOriginal = f.original !== null && ancho === LIENZO_FOTO.ancho && alto === LIENZO_FOTO.alto;
    const { mascara, motivo } = await mascaraDePrenda(conOriginal ? await bajarImagen(f.original!) : blobFoto);
    if (!mascara) throw new Error(motivo ?? "No se reconoció la prenda en esta foto.");

    const c = lienzo(ancho, alto);
    const g = c.getContext("2d")!;
    g.drawImage(foto, 0, 0);
    const pixeles = g.getImageData(0, 0, ancho, alto);

    let alfa: Uint8ClampedArray;
    let fondoBlanco: boolean;
    if (conOriginal) {
      // Se prueba primero como «Sin fondo» (lo de siempre): si lo que la máscara deja afuera es blanco puro, era esa. Si no, la foto se
      // subió «Con fondo» y la máscara va donde quedó el original entero; ese fondo puede ser blanco igual (una foto de proveedor) o no.
      alfa = alfaEnLaFoto(mascara, destinoDeLaMascara(mascara, mascara.caja, true), ancho, alto);
      fondoBlanco = esFondoBlanco(pixeles.data, alfa);
      if (!fondoBlanco) {
        alfa = alfaEnLaFoto(mascara, destinoDeLaMascara(mascara, mascara.caja, false), ancho, alto);
        fondoBlanco = esFondoBlanco(pixeles.data, alfa);
      }
    } else {
      alfa = alfaEnLaFoto(mascara, { x: 0, y: 0, ancho, alto }, ancho, alto);
      fondoBlanco = esFondoBlanco(pixeles.data, alfa);
    }

    aplicarAlfa(pixeles.data, alfa, fondoBlanco);
    const caja = cajaVisible(pixeles.data, ancho, alto);
    if (!caja) throw new Error("No quedó nada de la prenda.");
    const huecos = fraccionDeHuecos(pixeles.data, ancho, caja);
    g.putImageData(pixeles, 0, 0);

    const tam = tamanoDelRecorte(caja);
    const salida = lienzo(tam.ancho, tam.alto);
    const gs = salida.getContext("2d")!;
    gs.imageSmoothingQuality = "high";
    gs.drawImage(c, caja.x, caja.y, caja.ancho, caja.alto, 0, 0, tam.ancho, tam.alto);
    return { png: await aPng(salida), proporcion: tam.ancho / tam.alto, motivo: motivoDelRecorte({ huecos, fondoBlanco, conOriginal }) };
  } finally {
    foto.close();
  }
}

/**
 * Sube el recorte y lo anota (`registrar_recorte`), firmado por el responsable. Las dos van con `x-espera: no`: se llaman cientos de
 * veces seguidas y la pantalla muestra su propio avance. Nunca lanza.
 */
export async function guardarRecorte(
  supabase: Cliente,
  f: { foto: string; url: string },
  recorte: RecortePreparado,
  firma: Firma | null,
): Promise<{ recorte: RecorteDeFoto } | { error: string; deResponsable?: { code?: string | null; hint?: string | null; message?: string | null } }> {
  const subida = await subirRecorteDeFoto(supabase, f.foto, recorte.png);
  if ("error" in subida) return { error: subida.error };
  const { data, error } = await firmar(
    supabase.rpc("registrar_recorte", {
      p_foto: f.foto,
      p_recorte: subida.ruta,
      p_proporcion: recorte.proporcion,
      p_motivo: recorte.motivo,
    }),
    firma,
  ).setHeader("x-espera", "no");
  if (error) return { error: errorDeRecorte(`${error.message ?? ""} ${error.hint ?? ""}`) ?? traducirError(error, "guardar el recorte"), deResponsable: error };
  const hecho = recorteDeRespuesta(data, f.url);
  return hecho ? { recorte: hecho } : { error: "La base no devolvió el recorte. Recarga la pantalla." };
}
