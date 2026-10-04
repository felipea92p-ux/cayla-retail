import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getDatosObservatorio } from "@/lib/observatorio";

// GET /api/observatorio → las ventas de toda CAYLA (las mismas que pinta el Inicio del Admin al cargar), para que la pantalla
// se actualice sola cada 30 s sin recargar (ADR-0322).
//
// PROMETE: solo lectura y solo para cuentas Admin (la base lo vuelve a preguntar en `fn_observatorio`).
// SE DEGRADA: si la base no responde, 500 con un mensaje; la pantalla conserva lo último que leyó y vuelve a intentar.
// Un GET a /api no abre el loader global (`clasificarPeticion`): una actualización en vivo no debe tapar la pantalla.
export async function GET() {
  const persona = await requirePersonaActualV2();
  if (!persona.esAdmin) return Response.json({ error: "El Observatorio es de las cuentas Admin." }, { status: 403 });
  const datos = await getDatosObservatorio();
  if (!datos) return Response.json({ error: "No pudimos leer las ventas de las tiendas." }, { status: 500 });
  return Response.json({ datos });
}
