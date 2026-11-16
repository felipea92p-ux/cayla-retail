"use client";

import { sentryDelNavegador } from "./errores-navegador";
import { medidasParaIA } from "./foto-catalogo-reglas";
import { INTENTOS_DE_COMPRESION } from "./imagen-de-campana-reglas";
import {
  avisoDeFotosMalas,
  formatoPorFirma,
  LADO_MAXIMO_CONVERTIDA,
  MAX_BYTES_A_LEER,
  nombreComoJpg,
  PRODUCTO_FOTOS_MAX_BYTES,
  queDeclara,
  seAvisa,
  textoDeFalla,
  type FallaDeFoto,
  type FormatoDeFoto,
} from "./foto-elegida-reglas";

// La PUERTA de toda foto de prenda que se elige o se suelta (Nuevo producto, Recibir, Editar producto, la hoja de «Catálogo con IA» y el
// laboratorio): la foto se lee y se abre UNA vez, apenas llega, y solo si abre sigue su camino. Las reglas y los textos, en
// `foto-elegida-reglas.ts`.
//
// POR QUÉ SE COPIA. Un `File` es una promesa de leer el disco más tarde, no los bytes. Si la foto venía de un lugar pasajero (la app Fotos,
// WhatsApp de escritorio, la miniatura de una captura, iCloud), minutos después ya no se puede leer: la tarjeta queda rota y la subida falla al
// «Crear producto». Leída aquí, la foto vive en memoria (un `File` nuevo con sus bytes) y todo lo que viene después usa esa copia.
//
// SI FALLA: la foto no entra, la persona ve un aviso en palabras de tienda y a Sentry va qué falló, de qué tipo y cuánto pesaba —nunca el
// nombre del archivo ni la foto (ADR-0424)—. Si Sentry no responde, el aviso se pierde en silencio y la pantalla sigue igual.

const TIPO_DE: Record<"jpeg" | "png" | "webp", string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export type FotoAbierta = { archivo: File } | { falla: FallaDeFoto; texto: string };

function avisarASentry(falla: FallaDeFoto, archivo: File, formato: FormatoDeFoto | null, error?: unknown) {
  if (!seAvisa(falla)) return;
  // Solo el NOMBRE del error del navegador («NotReadableError», «InvalidStateError»): su texto puede traer la ruta del archivo.
  const motivo = error instanceof Error ? error.name : undefined;
  void sentryDelNavegador().then((Sentry) =>
    Sentry?.captureException(new Error(`Foto de prenda que no se pudo usar: ${falla}`), {
      fingerprint: ["foto-elegida", falla],
      tags: { donde: "foto-elegida", falla },
      contexts: { foto: { tipoDeclarado: archivo.type || "(sin tipo)", kb: Math.round(archivo.size / 1024), formato: formato ?? "(desconocido)", motivo } },
    }),
  );
}

function fallar(falla: FallaDeFoto, archivo: File, formato: FormatoDeFoto | null = null, error?: unknown): FotoAbierta {
  avisarASentry(falla, archivo, formato, error);
  return { falla, texto: textoDeFalla(falla, archivo.size) };
}

/**
 * Una foto HEIC o AVIF que el navegador sí abrió (Safari abre las del iPhone), pasada a JPG: el almacén solo guarda JPG, PNG y WebP. Se achica
 * a `LADO_MAXIMO_CONVERTIDA` y, si aún pesa de más, baja la calidad y las medidas por pasos (`INTENTOS_DE_COMPRESION`, los mismos de las
 * fotos de campañas y tiendas). `null` si ni la más liviana cabe.
 */
async function comoJpg(imagen: ImageBitmap): Promise<Blob | null> {
  const base = medidasParaIA(imagen.width, imagen.height, LADO_MAXIMO_CONVERTIDA);
  for (const [calidad, escala] of INTENTOS_DE_COMPRESION) {
    const ancho = Math.max(1, Math.round(base.ancho * escala));
    const alto = Math.max(1, Math.round(base.alto * escala));
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const g = lienzo.getContext("2d");
    if (!g) throw new Error("sin lienzo");
    // El JPG no tiene transparencia: sin pintar el fondo, lo transparente sale NEGRO.
    g.fillStyle = "#ffffff"; // tema-fijo: el fondo de una foto convertida es blanco de papel, no un color del ERP
    g.fillRect(0, 0, ancho, alto);
    g.imageSmoothingQuality = "high";
    g.drawImage(imagen, 0, 0, ancho, alto);
    const jpg = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", calidad));
    if (!jpg) throw new Error("sin JPG");
    if (jpg.size <= PRODUCTO_FOTOS_MAX_BYTES) return jpg;
  }
  return null;
}

/**
 * Lee y abre UNA foto elegida. Devuelve una copia en memoria, con el tipo de lo que ES (no de lo que decía ser), o la falla en palabras de
 * tienda. Nunca lanza.
 */
export async function abrirFotoElegida(archivo: File): Promise<FotoAbierta> {
  const declara = queDeclara(archivo.type, archivo.name);
  if (declara === "otro") return fallar("tipo", archivo);
  if (archivo.size <= 0) return fallar("vacia", archivo);
  // Lo que se guarda tal cual no puede pasar el tope del almacén; lo que se convierte se mide después, ya como JPG.
  if (archivo.size > (declara === "guardable" ? PRODUCTO_FOTOS_MAX_BYTES : MAX_BYTES_A_LEER)) return fallar("pesada", archivo);

  // Primero solo la firma (16 bytes): lo que no es una foto no se lee entero.
  let formato: FormatoDeFoto | null;
  try {
    formato = formatoPorFirma(new Uint8Array(await archivo.slice(0, 16).arrayBuffer()));
  } catch (e) {
    return fallar("no-se-lee", archivo, null, e);
  }
  if (!formato) return fallar("no-es-imagen", archivo);
  const convertir = formato === "heic" || formato === "avif";
  if (!convertir && archivo.size > PRODUCTO_FOTOS_MAX_BYTES) return fallar("pesada", archivo, formato);

  let bytes: ArrayBuffer;
  try {
    bytes = await archivo.arrayBuffer();
  } catch (e) {
    return fallar("no-se-lee", archivo, formato, e);
  }

  // Abrirla de verdad: los bytes pueden decir JPEG y estar cortados a la mitad (una descarga que no terminó).
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(new Blob([bytes]));
  } catch (e) {
    return fallar(convertir ? "otro-formato" : "no-se-abre", archivo, formato, e);
  }
  try {
    if (!convertir) return { archivo: new File([bytes], archivo.name, { type: TIPO_DE[formato as "jpeg" | "png" | "webp"], lastModified: archivo.lastModified }) };
    let jpg: Blob | null;
    try {
      jpg = await comoJpg(imagen);
    } catch (e) {
      return fallar("otro-formato", archivo, formato, e);
    }
    if (!jpg) return fallar("no-cabe", archivo, formato);
    return { archivo: new File([jpg], nombreComoJpg(archivo.name), { type: "image/jpeg", lastModified: archivo.lastModified }) };
  } finally {
    imagen.close();
  }
}

/**
 * Lee y abre varias fotos a la vez y, si alguna no sirve, lo avisa en UN solo aviso. `buenas` conserva el orden; `porPosicion` dice, para
 * cada archivo de entrada, su copia o `null` (la hoja de IA lo usa: la 2.ª es la espalda y la 3.ª el detalle, y no deben correrse).
 */
export async function abrirFotosElegidas(
  archivos: readonly File[],
  avisar: (titulo: string, detalle: string) => void,
): Promise<{ buenas: File[]; porPosicion: (File | null)[] }> {
  const abiertas = await Promise.all(archivos.map(abrirFotoElegida));
  const aviso = avisoDeFotosMalas(abiertas.flatMap((r, i) => ("falla" in r ? [{ nombre: archivos[i].name, texto: r.texto }] : [])));
  if (aviso) avisar(aviso.titulo, aviso.detalle);
  const porPosicion = abiertas.map((r) => ("archivo" in r ? r.archivo : null));
  return { buenas: porPosicion.filter((f): f is File => f !== null), porPosicion };
}
