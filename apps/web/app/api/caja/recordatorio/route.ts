import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCifrasRecordatorio, leerRecordatorioCierre } from "@/lib/recordatorio-cierre";

// GET /api/caja/recordatorio[?cifras=1] → la hora de cierre de la sede y su caja abierta, para el recordatorio de cierre (ADR-0305).
//
// PROMETE: `{ datos }` con la caja abierta de LA SEDE de quien pregunta (la sede sale de la sesión, nunca de un parámetro), o
//   `datos: null` si la cuenta no recibe el recordatorio. Con `?cifras=1` suma `{ cifras }`: el efectivo esperado y las ventas
//   del turno, que solo pide la tarjeta al abrirse. Solo lectura.
// POR QUÉ UNA RUTA Y NO SOLO EL LAYOUT: el layout no se vuelve a pintar al navegar, así que si la caja se cierra desde OTRA
//   terminal, la píldora de esta no se enteraría. La píldora pregunta aquí cada minuto mientras está a la vista. Un GET a /api
//   no abre el loader global (`clasificarPeticion`): preguntar no debe tapar la pantalla de nadie.
// SE DEGRADA: si la base no responde, 503 y la píldora conserva lo último que sabía (un tropiezo de la red no es «ya cerraron»).
//   Las cifras caen a `null` cada una por su cuenta.
export async function GET(request: Request) {
  const persona = await requirePersonaActualV2();
  let datos;
  try {
    datos = await leerRecordatorioCierre(persona);
  } catch (e) {
    console.error("No se pudo leer el recordatorio de cierre de caja", e);
    return Response.json({ error: "No pudimos consultar la caja." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const conCifras = new URL(request.url).searchParams.get("cifras") === "1";
  const cifras = conCifras && datos?.caja ? await getCifrasRecordatorio(datos.caja.id) : null;
  return Response.json({ datos, cifras }, { headers: { "cache-control": "no-store" } });
}
