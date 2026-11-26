import { ImageResponse } from "next/og";
import { esIdDePrenda } from "@/lib/ficha";
import { leerFicha } from "@/lib/ficha-servidor";
import { fuentesDeLaMarca } from "@/lib/fuentes-og";
import { fotoComoDato, TAMANO_VISTA, VistaDePrenda } from "@/lib/imagenes-del-look";

// La vista previa del enlace de una prenda (ADR-0696, T3): la imagen que muestra WhatsApp al pegar `/catalogo/<id>` (`og:image`, que Next
// pone solo en la ficha). Lleva la foto y el nombre, NUNCA el precio (Felipe 2026-11-23): es la misma en las tres tiendas, por eso se
// arma sin `?sede=`. Sin base o sin foto, sale con el colibrí; nunca una imagen caída.

export const alt = "Una prenda de la tienda CAYLA";
export const size = TAMANO_VISTA;
export const contentType = "image/png";

export default async function Imagen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leida = esIdDePrenda(id) ? await leerFicha(id, null) : null;
  const ficha = leida && leida !== "no_esta" ? leida : null;
  const url = ficha ? (ficha.fotos[0]?.url ?? ficha.colores.find((c) => c.foto)?.foto ?? null) : null;
  const [fuentes, foto] = await Promise.all([fuentesDeLaMarca(), url ? fotoComoDato(url) : null]);
  return new ImageResponse(<VistaDePrenda nombre={ficha?.nombre ?? "CAYLA"} categoria={ficha?.categoria?.nombre ?? null} foto={foto} />, {
    ...TAMANO_VISTA,
    fonts: fuentes,
    // La misma para todos: la red la guarda un día (una foto nueva se ve al día siguiente). Sin la prenda, solo unos minutos.
    headers: { "Cache-Control": ficha ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=60, s-maxage=300" },
  });
}
