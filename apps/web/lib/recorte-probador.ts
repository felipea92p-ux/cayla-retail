"use client";

import type { createClient } from "@/lib/supabase/client";
import { fraccionDeHuecos } from "@/lib/foto-encuadre";
import { subirRecorteDeFoto } from "@/lib/producto-fotos";
import {
  cajaVisible,
  errorDeRecorte,
  limpiarAlfa,
  motivoDelRecorte,
  recorteDeRespuesta,
  tamanoDelRecorte,
  tieneFondoTransparente,
  type MotivoRecorte,
  type RecorteDeFoto,
} from "@/lib/recorte-probador-reglas";
import { firmaOmitida, type FirmaOmitida } from "@/lib/responsable-omitido";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";

// El recorte de una foto para el probador de la tienda online, en el NAVEGADOR (ADR-0434, actividad 1; cambiado por el ADR-0442). Las
// cuentas están en `recorte-probador-reglas.ts`; aquí se lee la foto en un canvas, se codifica el PNG, se sube y se anota.
//
// De dónde sale: la foto se sube tal cual la entrega la IA del equipo, con su fondo TRANSPARENTE. El recorte es esa misma imagen: su
// color y su transparencia, limpiada (`limpiarAlfa`) y cortada a la caja de la prenda. Nadie le quita el fondo a una foto en el ERP:
// una foto sin transparencia (un JPG) se queda «sin recorte» y no entra al armador de looks.

type Cliente = ReturnType<typeof createClient>;

export type RecortePreparado = { png: Blob; proporcion: number; motivo: MotivoRecorte | null };

/** Lo que se le dice a quien sube una foto sin fondo transparente (también es lo que lee «Preparar recortes» en su lista de fallas). */
const SIN_TRANSPARENCIA = "La foto no trae fondo transparente, así que no entra al armador de looks. Pídele a la IA un PNG sin fondo y cámbiala en Editar producto.";

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

function aPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("El navegador no pudo generar el recorte."))), "image/png"));
}

/**
 * Prepara el recorte de una foto que ya está en la tienda. Lanza si no se puede (la foto no está, no trae fondo transparente, no quedó
 * nada): «Preparar recortes» lo cuenta y sigue con la siguiente.
 */
export async function prepararRecorte(f: { url: string }): Promise<RecortePreparado> {
  return componerRecorte(await bajarImagen(f.url));
}

/** El recorte a partir de la foto misma: su transparencia limpia, cortada a la prenda y achicada a `ALTO_MAX_RECORTE`. Lanza si no se puede. */
async function componerRecorte(blobFoto: Blob): Promise<RecortePreparado> {
  const foto = await createImageBitmap(blobFoto);
  try {
    const { width: ancho, height: alto } = foto;
    const c = lienzo(ancho, alto);
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(foto, 0, 0);
    const pixeles = g.getImageData(0, 0, ancho, alto);
    if (!tieneFondoTransparente(pixeles.data)) throw new Error(SIN_TRANSPARENCIA);

    limpiarAlfa(pixeles.data, ancho, alto);
    const caja = cajaVisible(pixeles.data, ancho, alto);
    if (!caja) throw new Error("No quedó nada de la prenda.");
    const huecos = fraccionDeHuecos(pixeles.data, ancho, caja);
    g.putImageData(pixeles, 0, 0);

    const tam = tamanoDelRecorte(caja);
    const salida = lienzo(tam.ancho, tam.alto);
    const gs = salida.getContext("2d")!;
    gs.imageSmoothingQuality = "high";
    gs.drawImage(c, caja.x, caja.y, caja.ancho, caja.alto, 0, 0, tam.ancho, tam.alto);
    return { png: await aPng(salida), proporcion: tam.ancho / tam.alto, motivo: motivoDelRecorte(huecos) };
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
  firma: Firma | FirmaOmitida | null,
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

/**
 * El recorte de una foto recién subida, por detrás (ADR-0434, actividad 2): lo llama `subirFotoProducto` apenas la foto llega al
 * almacén, en Editar producto, Nuevo producto y la cola sin conexión. Nadie espera ni elige nada: va sin el combo «Responsable»
 * (`recorte_foto`, Felipe 2026-10-16) y con la cuenta de una persona queda a su nombre. Nunca lanza: un JPG, o una imagen sin fondo
 * transparente, queda «sin recorte» sin hacer ruido (ADR-0442); si algo más falla (se cortó la red), la foto queda «sin recorte» y la
 * toma «Preparar recortes» de Vitrina ▸ Probador.
 */
export async function recortarAlSubir(supabase: Cliente, f: { foto: string; url: string }, archivo: Blob): Promise<void> {
  if (archivo.type === "image/jpeg") return; // un JPG no puede traer transparencia
  try {
    const recorte = await componerRecorte(archivo);
    const r = await guardarRecorte(supabase, f, recorte, firmaOmitida("recorte_foto"));
    if ("error" in r) console.warn("[recorte-probador] no se guardó el recorte de la foto nueva", r.error);
  } catch (err) {
    if (err instanceof Error && err.message === SIN_TRANSPARENCIA) return;
    console.warn("[recorte-probador] no se pudo recortar la foto nueva", err);
  }
}
