import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { piezasDeLaImagen } from "@/lib/compartir-look";
import { prendasParaCompartir } from "@/lib/compartir-servidor";
import { fuentesDeLaMarca } from "@/lib/fuentes-og";
import { cargarFotos, cargarIsotipo, TAMANO_VISTA, VistaDelLook } from "@/lib/imagenes-del-look";
import { codificarLook, indizar, lookDeLaUrl, PARAMETRO_DEL_LOOK } from "@/lib/probador";

// GET /tu-look/vista?p=… — la vista previa del enlace de un look compartido (ADR-0434, actividad 9): la imagen que muestra WhatsApp
// (1200×630, `og:image` de `/tu-look`). Es pública como la página: lleva las fotos y los nombres de las prendas, nunca un precio ni un
// texto que venga en la dirección. Una dirección escrita de otra forma (minúsculas, prendas de más) va a la del mismo look escrita como
// la arma el probador: así cada look tiene una sola imagen guardada en la red. Sin base o sin prendas, la invitación sola.
export async function GET(request: NextRequest) {
  const pedido = request.nextUrl.searchParams.get(PARAMETRO_DEL_LOOK) ?? "";
  const prendas = await prendasParaCompartir();
  const look = prendas ? lookDeLaUrl(pedido, prendas) : null;
  const indice = indizar(prendas ?? []);
  if (look) {
    const canonico = codificarLook(look, indice);
    // Relativa: se queda en el dominio por el que llegó la pregunta (detrás de Vercel, `nextUrl` puede decir otro).
    if (canonico !== pedido) {
      return new Response(null, { status: 308, headers: { Location: `${request.nextUrl.pathname}?${PARAMETRO_DEL_LOOK}=${encodeURIComponent(canonico)}` } });
    }
  }
  const [fuentes, piezas, isotipo] = await Promise.all([
    fuentesDeLaMarca(),
    cargarFotos(look ? piezasDeLaImagen(look, indice) : []),
    cargarIsotipo(request.nextUrl.origin),
  ]);
  return new ImageResponse(<VistaDelLook piezas={piezas} isotipo={isotipo} />, {
    ...TAMANO_VISTA,
    fonts: fuentes,
    // La misma para todos: la red la guarda un día (una foto nueva se ve al día siguiente). Sin la base, solo unos minutos.
    headers: { "Cache-Control": prendas ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=60, s-maxage=300" },
  });
}
