"use client";

import { cajaDeContenido, encuadrar, LADO_MAX_ORIGINAL, LIENZO_FOTO, MARGEN_PRENDA, recorteUtil, reducirA } from "@/lib/foto-encuadre";

// Prepara una foto de prenda para el catálogo, en el NAVEGADOR (ADR-0228): el original reducido a un tamaño que se
// pueda guardar, y dos versiones encuadradas en 1200×1500 sobre blanco —sin fondo y con su fondo— para que quien la
// sube elija. Nada sale de este archivo hacia el almacén: subir es de `producto-fotos.ts`.

export type FotoPreparada = {
  /** La foto tal cual, reducida a 2400 px como máximo (lo que se guarda para poder reprocesarla). */
  original: Blob;
  /** La foto entera sobre blanco, en el lienzo 4:5. Siempre existe. */
  conFondo: Blob;
  /** La prenda recortada, centrada y del mismo tamaño que todas. `null` si no se pudo o no se encontró la prenda. */
  sinFondo: Blob | null;
  /** Por qué no hay versión sin fondo, dicho para la pantalla. */
  motivoSinRecorte: string | null;
};

const CALIDAD_JPEG = 0.9;

/** Lo que responde `public/quitar-fondo.worker.js`. */
type RespuestaWorker =
  | { tipo: "progreso"; porcentaje: number }
  | { tipo: "listo"; id: number; ancho: number; alto: number; rgba: Uint8ClampedArray }
  | { tipo: "error"; id: number; mensaje: string };

function lienzo(ancho: number, alto: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = ancho;
  c.height = alto;
  return c;
}

function aBlob(c: HTMLCanvasElement, calidad = CALIDAD_JPEG): Promise<Blob> {
  // JPEG y no WebP: Safari no sabe codificar WebP desde un canvas (devuelve PNG sin avisar), y sobre fondo blanco no
  // hace falta transparencia. Una foto de 1200×1500 queda en ~150–250 KB.
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("El navegador no pudo generar la imagen."))), "image/jpeg", calidad));
}

/** Pinta `fuente` (o su `recorte`) en un lienzo 4:5 blanco, en la posición que dice `encuadrar`. */
function sobreBlanco(fuente: CanvasImageSource, recorte: { x: number; y: number; ancho: number; alto: number }, margen: number): HTMLCanvasElement {
  const c = lienzo(LIENZO_FOTO.ancho, LIENZO_FOTO.alto);
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff"; // el blanco del papel de la foto, no un color de la pantalla: por eso no es un token
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "high";
  const d = encuadrar(recorte, LIENZO_FOTO, margen);
  g.drawImage(fuente, recorte.x, recorte.y, recorte.ancho, recorte.alto, d.x, d.y, d.ancho, d.alto);
  return c;
}

// ---------------------------------------------------------------------------------------------------------------------
// El worker: uno solo por pestaña, creado recién al primer uso (el modelo pesa 26 MB y la mayoría de las pantallas no
// lo necesita). Los pedidos se atienden en orden.
// ---------------------------------------------------------------------------------------------------------------------

let worker: Worker | null = null;
let siguienteId = 1;
const pendientes = new Map<number, { resolve: (r: { ancho: number; alto: number; rgba: Uint8ClampedArray }) => void; reject: (e: Error) => void }>();
const oyentesProgreso = new Set<(porcentaje: number) => void>();

function obtenerWorker(): Worker {
  if (worker) return worker;
  // Desde `public/` y no con `new URL(…, import.meta.url)`: ver el encabezado del worker.
  worker = new Worker("/quitar-fondo.worker.js", { type: "module" });
  worker.onmessage = (e: MessageEvent<RespuestaWorker>) => {
    const m = e.data;
    if (m.tipo === "progreso") {
      oyentesProgreso.forEach((f) => f(m.porcentaje));
      return;
    }
    const p = pendientes.get(m.id);
    if (!p) return;
    pendientes.delete(m.id);
    if (m.tipo === "listo") p.resolve({ ancho: m.ancho, alto: m.alto, rgba: m.rgba });
    else p.reject(new Error(m.mensaje));
  };
  worker.onerror = (e) => {
    // El worker murió entero (no cargó el script): se falla todo lo que esperaba y el próximo pedido crea otro.
    const error = new Error(e.message || "No se pudo iniciar el recortador.");
    pendientes.forEach((p) => p.reject(error));
    pendientes.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function recortar(imagen: Blob): Promise<{ ancho: number; alto: number; rgba: Uint8ClampedArray }> {
  const id = siguienteId++;
  return new Promise((resolve, reject) => {
    pendientes.set(id, { resolve, reject });
    obtenerWorker().postMessage({ id, imagen });
  });
}

/** Avisa el avance de la descarga del modelo (solo la primera vez en cada equipo; después queda guardado). */
export function escucharDescargaModelo(f: (porcentaje: number) => void): () => void {
  oyentesProgreso.add(f);
  return () => oyentesProgreso.delete(f);
}

/** Prepara una foto: original, con fondo y —si el modelo encuentra la prenda— sin fondo. Solo lanza si la imagen no se
 *  puede leer; si falla el recorte, devuelve igual la versión con fondo y el motivo. */
export async function prepararFotoPrenda(archivo: Blob): Promise<FotoPreparada> {
  // `from-image`: respeta la orientación de la foto del celular (EXIF); sin esto, algunas salen acostadas.
  const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  try {
    const tam = reducirA(bitmap.width, bitmap.height, LADO_MAX_ORIGINAL);
    const base = lienzo(tam.ancho, tam.alto);
    const g = base.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(bitmap, 0, 0, tam.ancho, tam.alto);
    const original = await aBlob(base, 0.92);
    const conFondo = await aBlob(sobreBlanco(base, { x: 0, y: 0, ancho: tam.ancho, alto: tam.alto }, 0));

    let sinFondo: Blob | null = null;
    let motivoSinRecorte: string | null = null;
    try {
      const r = await recortar(original);
      const caja = cajaDeContenido(r.rgba, r.ancho, r.alto);
      if (recorteUtil(caja, r.ancho, r.alto)) {
        const capa = lienzo(r.ancho, r.alto);
        capa.getContext("2d")!.putImageData(new ImageData(r.rgba as Uint8ClampedArray<ArrayBuffer>, r.ancho, r.alto), 0, 0);
        sinFondo = await aBlob(sobreBlanco(capa, caja, MARGEN_PRENDA));
      } else {
        motivoSinRecorte = "No se reconoció la prenda en esta foto.";
      }
    } catch (err) {
      console.warn("[preparar-foto] no se pudo quitar el fondo", err);
      motivoSinRecorte = navigator.onLine ? "No se pudo quitar el fondo en este equipo." : "Sin conexión: el recortador se descarga la primera vez.";
    }
    return { original, conFondo, sinFondo, motivoSinRecorte };
  } finally {
    bitmap.close();
  }
}

/** Un Blob con nombre y tipo, listo para `subirFotoProducto` (que valida `File`). */
export function comoArchivo(blob: Blob, nombre: string): File {
  return new File([blob], nombre, { type: blob.type || "image/jpeg" });
}
