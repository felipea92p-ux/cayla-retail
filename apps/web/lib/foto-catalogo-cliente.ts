"use client";

import { medidasParaIA, LADO_MAXIMO_IA } from "@/lib/foto-catalogo-reglas";

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
    const { ancho, alto } = medidasParaIA(img.width, img.height, LADO_MAXIMO_IA);
    const c = document.createElement("canvas");
    c.width = ancho;
    c.height = alto;
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, ancho, alto);
    return await new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("El navegador no pudo preparar la foto."))), tipo, 0.9));
  } finally {
    img.close();
  }
}

/**
 * Manda las fotos de un color al servidor y devuelve el PNG transparente de la foto de catálogo, o el motivo en palabras de tienda. Nunca lanza.
 * Las fotos reales van en JPEG; el molde, en WebP para conservar su transparencia.
 */
export async function pedirFotoDeCatalogo(fotos: FotosDeCatalogo): Promise<ResultadoCatalogo> {
  try {
    const cuerpo = new FormData();
    cuerpo.set("frente", await achicar(fotos.frente, "image/jpeg"), "frente.jpg");
    if (fotos.espalda) cuerpo.set("espalda", await achicar(fotos.espalda, "image/jpeg"), "espalda.jpg");
    if (fotos.detalle) cuerpo.set("detalle", await achicar(fotos.detalle, "image/jpeg"), "detalle.jpg");
    if (fotos.molde) cuerpo.set("molde", await achicar(fotos.molde, "image/webp"), "molde.webp");
    // `x-espera: no`: la foto se prepara en su cuadro mientras la persona sigue; el loader de pantalla completa (ADR-0149) la bloquearía.
    const r = await fetch("/api/fotos/catalogo", { method: "POST", body: cuerpo, headers: { "x-espera": "no" } });
    if (!r.ok) {
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      return { error: j?.error ?? "La IA no responde ahora. Prueba en un rato." };
    }
    return { png: await r.blob() };
  } catch {
    return { error: "No se pudo conectar. Revisa el internet y prueba de nuevo." };
  }
}
