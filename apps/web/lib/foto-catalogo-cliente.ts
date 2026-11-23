"use client";

import { ESPERA_DEL_NAVEGADOR_MS, MAX_BYTES_POR_FOTO_IA, ladosParaAchicar, medidasParaIA } from "@/lib/foto-catalogo-reglas";
import type { DatosDePrenda } from "@/lib/ficha-foto-ia";

// Pedir la foto de catálogo de UN color desde el navegador (Editar y Nuevo producto, «Catálogo con IA»). El servidor (`/api/fotos/catalogo`) es el
// que habla con OpenAI; aquí solo se achican las fotos y se manda el pedido.
//
// POR QUÉ SE ACHICAN AQUÍ: Vercel no acepta un pedido de más de 4,5 MB, y una foto de celular pesa hasta 5 MB (y pueden ir tres más el molde).
// La IA no necesita más de 1.600 px por lado: la foto de catálogo sale de 1024×1280. Lo que se achica es SOLO la copia que va a la IA; la foto
// original se sube tal cual (ADR-0442) y queda guardada.

/** Las fotos de UN color que se mandan a la IA. El frente es obligatorio; el molde es la foto de catálogo de otro color de la misma prenda. */
export type FotosDeCatalogo = { frente: Blob; espalda?: Blob | null; detalle?: Blob | null; molde?: Blob | null };

export type ResultadoCatalogo = { png: Blob } | { error: string };

async function achicar(fuente: Blob, tipo: "image/jpeg" | "image/webp"): Promise<Blob> {
  const img = await createImageBitmap(fuente);
  try {
    let ultimo: Blob | null = null;
    const ladoMayor = Math.max(img.width, img.height);
    // Del lado más grande al más chico, hasta que entre bajo el tope del servidor (`ladosParaAchicar`): casi siempre alcanza con el primero.
    for (const lado of ladosParaAchicar()) {
      // Un lado que no achica la foto (nunca se agranda) daría el mismo archivo que el intento anterior: se salta.
      if (ultimo && lado >= ladoMayor) continue;
      const { ancho, alto } = medidasParaIA(img.width, img.height, lado);
      const c = document.createElement("canvas");
      c.width = ancho;
      c.height = alto;
      const g = c.getContext("2d")!;
      // El JPEG no tiene transparencia: sin pintar el fondo, lo transparente de un PNG sale NEGRO y una prenda oscura pierde su contorno.
      if (tipo === "image/jpeg") {
        g.fillStyle = "#ffffff"; // tema-fijo: el fondo de la foto que va a la IA es blanco de papel, no un color del ERP
        g.fillRect(0, 0, ancho, alto);
      }
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, ancho, alto);
      ultimo = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("El navegador no pudo preparar la foto."))), tipo, 0.9));
      if (ultimo.size <= MAX_BYTES_POR_FOTO_IA) return ultimo;
    }
    return ultimo!;
  } finally {
    img.close();
  }
}

/**
 * Manda las fotos de un color al servidor y devuelve el PNG transparente de la foto de catálogo, o el motivo en palabras de tienda. Nunca lanza.
 * Las fotos reales van en JPEG; el molde, en WebP para conservar su transparencia.
 */
export async function pedirFotoDeCatalogo(fotos: FotosDeCatalogo, prenda?: DatosDePrenda | null): Promise<ResultadoCatalogo> {
  const cuerpo = new FormData();
  try {
    // Lo ya elegido de la prenda (categoría, tejido, patrón): el servidor arma con eso la ficha del pedido (`lib/ficha-foto-ia.ts`).
    if (prenda) for (const campo of ["prefijo", "tipo", "tejido", "patron"] as const) if (prenda[campo]) cuerpo.set(campo, prenda[campo]);
    cuerpo.set("frente", await achicar(fotos.frente, "image/jpeg"), "frente.jpg");
    if (fotos.espalda) cuerpo.set("espalda", await achicar(fotos.espalda, "image/jpeg"), "espalda.jpg");
    if (fotos.detalle) cuerpo.set("detalle", await achicar(fotos.detalle, "image/jpeg"), "detalle.jpg");
    if (fotos.molde) cuerpo.set("molde", await achicar(fotos.molde, "image/webp"), "molde.webp");
  } catch {
    // La foto no se pudo leer ni achicar (un archivo dañado, un formato que el navegador no abre): no es el internet, y reintentar da lo mismo.
    return { error: "No se pudo preparar esa foto. Prueba con otra." };
  }
  try {
    // `x-espera: no`: la foto se prepara en su cuadro mientras la persona sigue; el loader de pantalla completa (ADR-0149) la bloquearía.
    const r = await fetch("/api/fotos/catalogo", {
      method: "POST",
      body: cuerpo,
      headers: { "x-espera": "no" },
      // Sin tope, una red muda dejaba la tarjeta esperando para siempre (`ESPERA_DEL_NAVEGADOR_MS`). Un navegador viejo sin `AbortSignal.timeout` sigue como antes.
      signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ESPERA_DEL_NAVEGADOR_MS) : undefined,
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      return { error: j?.error ?? "La IA no responde ahora. Prueba en un rato." };
    }
    return { png: await r.blob() };
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") return { error: "La IA no responde ahora. Prueba en un rato." };
    return { error: "No se pudo conectar. Revisa el internet y prueba de nuevo." };
  }
}

/** Lo que la cuenta puede hacer con las fotos de una prenda nueva: guardarlas y pedir la de catálogo con IA. */
export type PermisoDeFotos = { fotos: boolean; ia: boolean };

/**
 * Pregunta al servidor (`GET /api/fotos/catalogo`) si esta cuenta puede guardar fotos de una prenda y pedir la de IA. Lo usan las pantallas
 * que crean una prenda fuera de Productos («Crear la prenda que llegó», Recibir), que no reciben ese permiso de su página. Sin respuesta: nada,
 * y la prenda se crea sin fotos como antes (principio 9).
 */
export async function leerPermisoDeFotos(): Promise<PermisoDeFotos> {
  try {
    const r = await fetch("/api/fotos/catalogo", { headers: { "x-espera": "no" }, cache: "no-store" });
    if (!r.ok) return { fotos: false, ia: false };
    const j = (await r.json()) as Partial<PermisoDeFotos>;
    return { fotos: j.fotos === true, ia: j.fotos === true && j.ia === true };
  } catch {
    // relleno-a-proposito: sin respuesta, sin fotos: la prenda se crea como antes (principio 9).
    return { fotos: false, ia: false };
  }
}
