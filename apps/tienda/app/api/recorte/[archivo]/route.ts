import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { ANCHOS_DE_RECORTE, esNombreDeFoto, recortarFondo, urlDeFotoOriginal } from "@/lib/recorte";

// GET /api/recorte/<foto>?w=640 — la prenda sin su fondo blanco, liviana, para ponerla sobre color (ADR-0613). Se calcula una vez por foto y
// ancho: como el nombre de una foto no se repite, Vercel la guarda un año y nadie vuelve a esperar. Solo acepta nombres de fotos del almacén
// de prendas, y `proxy.ts` no pasa por aquí: sin sesión ni cookies, para que se pueda guardar.

const TOPE_DE_BYTES = 15 * 1024 * 1024;
const LADO_MAXIMO = 1500;
/** Sin respuesta, un minuto: la portada usa la foto original y se vuelve a intentar pronto. */
const sinRecorte = (status: number) => new NextResponse(null, { status, headers: { "cache-control": "public, max-age=60, s-maxage=60" } });

export async function GET(request: NextRequest, { params }: { params: Promise<{ archivo: string }> }) {
  const { archivo } = await params;
  const ancho = Number(request.nextUrl.searchParams.get("w"));
  const origen = process.env.TIENDA_FOTOS_ORIGEN;
  if (!origen || !esNombreDeFoto(archivo) || !(ANCHOS_DE_RECORTE as readonly number[]).includes(ancho)) return sinRecorte(404);
  try {
    const respuesta = await fetch(urlDeFotoOriginal(origen, archivo), { signal: AbortSignal.timeout(10_000) });
    if (!respuesta.ok) return sinRecorte(404);
    const bytes = Buffer.from(await respuesta.arrayBuffer());
    if (bytes.byteLength > TOPE_DE_BYTES) return sinRecorte(404);
    const { data, info } = await sharp(bytes)
      .rotate()
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const caja = recortarFondo(data, info.width, info.height);
    if (!caja) return sinRecorte(404);
    const webp = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: caja.izquierda, top: caja.arriba, width: caja.ancho, height: caja.alto })
      .resize({ width: ancho, withoutEnlargement: true })
      .webp({ quality: 80, alphaQuality: 90, effort: 5 })
      .toBuffer();
    return new NextResponse(new Uint8Array(webp), {
      headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable" },
    });
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_recorte_fallo", archivo, mensaje: error instanceof Error ? error.message : String(error) }));
    return sinRecorte(502);
  }
}
