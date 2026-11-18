import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { esId } from "@/lib/bolsa";
import { COOKIE_VISITANTE, DIAS_VISITANTE, esRobot, leerPasos, regionDe, TOPE_DEL_ENVIO } from "@/lib/visita";
import { anotarPasos } from "@/lib/visita-servidor";

// POST /api/visita — los pasos de una persona en la tienda (ADR-0495; «entró» lo manda `components/Visita.tsx`). Los anota en la base por
// `retail.tienda_anotar_pasos` y responde 204 aunque la base no conteste: nadie espera esta respuesta. La persona es el número al azar de
// la cookie `tienda-visitante` (si no lo trae, se le da uno); el departamento sale de las cabeceras de ubicación de Vercel y solo se
// guarda al entrar; la IP nunca se lee. Con «no me rastrees» (`Sec-GPC: 1`) o si quien pide no es una persona, no se anota nada ni se deja
// cookie. `proxy.ts` no pasa por aquí: un envío no toca la sesión de nadie.
export async function POST(request: NextRequest) {
  const sinCuerpo = (status: number) => new NextResponse(null, { status, headers: { "cache-control": "no-store" } });
  if (request.headers.get("sec-gpc") === "1" || esRobot(request.headers.get("user-agent"))) return sinCuerpo(204);
  if (Number(request.headers.get("content-length") ?? 0) > TOPE_DEL_ENVIO) return sinCuerpo(413);
  let cuerpo: unknown;
  try {
    const texto = await request.text();
    if (texto.length > TOPE_DEL_ENVIO) return sinCuerpo(413);
    cuerpo = JSON.parse(texto);
  } catch {
    return sinCuerpo(400);
  }
  const pasos = leerPasos(cuerpo);
  if (!pasos) return sinCuerpo(400);
  if (!pasos.length) return sinCuerpo(204);

  const actual = request.cookies.get(COOKIE_VISITANTE)?.value;
  const visitante = esId(actual) ? actual : randomUUID();
  const entra = pasos.some((p) => p.paso === 0);
  const region = entra ? regionDe(request.headers.get("x-vercel-ip-country"), request.headers.get("x-vercel-ip-country-region")) : null;
  await anotarPasos(visitante, pasos, region);

  const respuesta = sinCuerpo(204);
  // Se renueva con cada visita: dura 90 días desde la última.
  if (entra || visitante !== actual) {
    respuesta.cookies.set(COOKIE_VISITANTE, visitante, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DIAS_VISITANTE * 24 * 60 * 60,
    });
  }
  return respuesta;
}
