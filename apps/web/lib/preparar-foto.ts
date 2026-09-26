"use client";

import { cajaDeContenido, encuadrar, LADO_MAX_ORIGINAL, LIENZO_FOTO, MARGEN_PRENDA, recorteUtil, reducirA, soloLaPrenda, type Caja } from "@/lib/foto-encuadre";
import { aplicarCurva, curvaDeLuz, enfocar, histogramaDeLuz, type CurvaDeLuz } from "@/lib/foto-luz";

// Prepara una foto de prenda para el catálogo, en el NAVEGADOR (ADR-0228): el original reducido a un tamaño que se
// pueda guardar, y dos versiones encuadradas en 1200×1500 sobre blanco —sin fondo y con su fondo— para que quien la
// sube elija. Nada sale de este archivo hacia el almacén: subir es de `producto-fotos.ts`.
//
// Desde la actualización del ADR-0228 (2026-09-26, tarde) cada versión viene además con la LUZ CORREGIDA
// (`foto-luz.ts`: una sola curva para los tres colores, así el tono no cambia) y todas llevan una nitidez leve. Del
// recorte se borran los pedazos sueltos (`soloLaPrenda`). Nada de esto inventa píxeles: la prenda es la de la foto.

export type FotoPreparada = {
  /** La foto tal cual, reducida a 2400 px como máximo (lo que se guarda para poder reprocesarla). */
  original: Blob;
  /** La foto entera sobre blanco, en el lienzo 4:5. Siempre existe. */
  conFondo: Blob;
  /** La prenda recortada, centrada y del mismo tamaño que todas. `null` si no se pudo o no se encontró la prenda. */
  sinFondo: Blob | null;
  /** Las mismas dos versiones con la luz corregida. `null` si la foto ya tenía buena luz: entonces no se ofrece. */
  conLuz: { conFondo: Blob; sinFondo: Blob | null } | null;
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

/** Pinta `fuente` (o su `recorte`) en un lienzo 4:5 blanco, en la posición que dice `encuadrar`, y le da la nitidez
 *  leve del final (`enfocar`): se aplica sobre el 1200×1500 porque es lo que compensa el achicado. */
function sobreBlanco(fuente: CanvasImageSource, recorte: Caja, margen: number): HTMLCanvasElement {
  const c = lienzo(LIENZO_FOTO.ancho, LIENZO_FOTO.alto);
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff"; // el blanco del papel de la foto, no un color de la pantalla: por eso no es un token
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "high";
  const d = encuadrar(recorte, LIENZO_FOTO, margen);
  g.drawImage(fuente, recorte.x, recorte.y, recorte.ancho, recorte.alto, d.x, d.y, d.ancho, d.alto);
  const pixeles = g.getImageData(0, 0, c.width, c.height);
  pixeles.data.set(enfocar(pixeles.data, c.width, c.height));
  g.putImageData(pixeles, 0, 0);
  return c;
}

/** Un lienzo con estos píxeles (y, si se pasa, la curva de luz aplicada a una COPIA: los originales no se tocan). */
function lienzoCon(rgba: Uint8ClampedArray, ancho: number, alto: number, curva: CurvaDeLuz | null = null): HTMLCanvasElement {
  const datos = new Uint8ClampedArray(rgba);
  if (curva) aplicarCurva(datos, curva);
  const c = lienzo(ancho, alto);
  c.getContext("2d")!.putImageData(new ImageData(datos as Uint8ClampedArray<ArrayBuffer>, ancho, alto), 0, 0);
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

/** Prepara una foto: original, con fondo y —si el modelo encuentra la prenda— sin fondo, cada una también con la luz
 *  corregida si hace falta. Solo lanza si la imagen no se puede leer; si falla el recorte, devuelve igual la versión con
 *  fondo y el motivo. */
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
    const fotoEntera: Caja = { x: 0, y: 0, ancho: tam.ancho, alto: tam.alto };

    let recorte: { rgba: Uint8ClampedArray; ancho: number; alto: number; caja: Caja } | null = null;
    let motivoSinRecorte: string | null = null;
    try {
      const r = await recortar(original);
      // Primero se decide si encontró UNA prenda, con el recorte tal como salió; recién después se limpian los pedazos.
      // Al revés, en una foto de tienda llena de ropa el pedazo más grande quedaría solo y pasaría por prenda.
      if (recorteUtil(cajaDeContenido(r.rgba, r.ancho, r.alto), r.ancho, r.alto)) {
        soloLaPrenda(r.rgba, r.ancho, r.alto);
        const caja = cajaDeContenido(r.rgba, r.ancho, r.alto);
        if (caja) recorte = { ...r, caja };
      } else {
        motivoSinRecorte = "No se reconoció la prenda en esta foto.";
      }
    } catch (err) {
      console.warn("[preparar-foto] no se pudo quitar el fondo", err);
      motivoSinRecorte = navigator.onLine ? "No se pudo quitar el fondo en este equipo." : "Sin conexión: el recortador se descarga la primera vez.";
    }

    // La luz se mide en la PRENDA cuando hay recorte (el fondo de la tienda no decide), y en la foto entera si no.
    const pixelesBase = g.getImageData(0, 0, tam.ancho, tam.alto).data;
    const curva = curvaDeLuz(histogramaDeLuz(recorte ? recorte.rgba : pixelesBase));

    const conFondo = await aBlob(sobreBlanco(base, fotoEntera, 0));
    const sinFondo = recorte ? await aBlob(sobreBlanco(lienzoCon(recorte.rgba, recorte.ancho, recorte.alto), recorte.caja, MARGEN_PRENDA)) : null;
    const conLuz = curva
      ? {
          conFondo: await aBlob(sobreBlanco(lienzoCon(pixelesBase, tam.ancho, tam.alto, curva), fotoEntera, 0)),
          sinFondo: recorte ? await aBlob(sobreBlanco(lienzoCon(recorte.rgba, recorte.ancho, recorte.alto, curva), recorte.caja, MARGEN_PRENDA)) : null,
        }
      : null;
    return { original, conFondo, sinFondo, conLuz, motivoSinRecorte };
  } finally {
    bitmap.close();
  }
}

/** Un Blob con nombre y tipo, listo para `subirFotoProducto` (que valida `File`). */
export function comoArchivo(blob: Blob, nombre: string): File {
  return new File([blob], nombre, { type: blob.type || "image/jpeg" });
}
