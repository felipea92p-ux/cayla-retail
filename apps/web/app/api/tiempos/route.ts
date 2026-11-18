import { NextResponse } from "next/server";
import { leerLote, lineaDeRegistro } from "@/lib/tiempos-de-pantalla-reglas";

// POST /api/tiempos
//
// CONTRATO (ADR-0654, el cronómetro del clic)
//   PROMETE: escribir en los registros del servidor UNA línea `tiempo_de_pantalla` por cada medición bien formada del lote
//            (`{ruta como patrón, ms, sede, sin_esqueleto, version}`), y responder 204 siempre: lo que no tiene la forma exacta se
//            ignora sin error (`leerLote`). Se lee con `vercel logs --query tiempo_de_pantalla` (cómo sacar el p75: el ADR).
//   ASUME:   sesión válida (el proxy responde 401 sin ella; quien manda no mira la respuesta). El cuerpo es texto con JSON
//            (`sendBeacon` lo manda como `text/plain`).
//   NO HACE: no toca la base ni pregunta quién es la persona (sería pagar las RPC de identidad para medir lo lento); no guarda nada
//            (el paso 2 de la propuesta, la tabla por hora y la lente en el Observatorio, espera el OK de Felipe); no escribe nombres,
//            la sesión, una búsqueda ni la dirección con su `?…` (ADR-0424).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let texto = "";
  try {
    texto = await request.text();
  } catch {
    // Un cuerpo que no se pudo leer (la pestaña se cerró a medio envío): no hay nada que anotar.
  }
  for (const tiempo of leerLote(texto)) console.info(lineaDeRegistro(tiempo));
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
