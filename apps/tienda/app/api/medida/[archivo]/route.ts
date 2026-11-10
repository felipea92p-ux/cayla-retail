import { type NextRequest, NextResponse } from "next/server";
import { medirBytesDelRecorte, TOPE_DE_BYTES_DEL_RECORTE } from "@/lib/medida-del-recorte";
import { esNombreDeRecorte, urlDelRecorte, VERSION_DE_LA_MEDIDA } from "@/lib/union-prendas";

// GET /api/medida/<recorte>?v=1 — cuánto mide una prenda para unir la de arriba con la de abajo en el probador (ADR-0449, act. 2026-11-10). Antes la
// medía cada navegador leyendo los píxeles del recorte en un lienzo, y Safari 26 le mete ruido a esa lectura para que nadie identifique el aparato:
// en Safari la unión salía mal. Ahora se mide aquí, una vez por recorte, con la misma función (`medirRecorte`). Como el nombre de un recorte no se
// repite, Vercel guarda la respuesta un año y nadie vuelve a esperar. Solo acepta nombres de recortes del almacén y los baja del almacén de la tienda
// (nunca de una dirección que llegue en la petición), y `proxy.ts` no pasa por aquí: sin sesión ni cookies, para que se pueda guardar.

/** Sin medida, un minuto: la figura queda con la caja de siempre y se vuelve a intentar pronto. */
const sinMedida = (status: number) => NextResponse.json(null, { status, headers: { "cache-control": "public, max-age=60, s-maxage=60" } });

export async function GET(request: NextRequest, { params }: { params: Promise<{ archivo: string }> }) {
  const { archivo } = await params;
  const origen = process.env.TIENDA_FOTOS_ORIGEN;
  if (!origen || !esNombreDeRecorte(archivo) || request.nextUrl.searchParams.get("v") !== String(VERSION_DE_LA_MEDIDA)) return sinMedida(404);
  try {
    const respuesta = await fetch(urlDelRecorte(origen, archivo), { signal: AbortSignal.timeout(10_000) });
    if (!respuesta.ok) return sinMedida(404);
    const bytes = Buffer.from(await respuesta.arrayBuffer());
    if (bytes.byteLength > TOPE_DE_BYTES_DEL_RECORTE) return sinMedida(404);
    const medida = await medirBytesDelRecorte(bytes);
    return NextResponse.json(medida, { headers: { "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable" } });
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_medida_fallo", archivo, mensaje: error instanceof Error ? error.message : String(error) }));
    return sinMedida(502);
  }
}
