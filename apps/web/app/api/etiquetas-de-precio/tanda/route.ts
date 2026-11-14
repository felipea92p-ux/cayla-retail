import { unstable_rethrow } from "next/navigation";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getEtiquetasDePrecio } from "@/lib/etiquetas-precio";
import { fechaEtiqueta, unidadesDeParam } from "@/lib/etiqueta-precio-reglas";
import { hoyLima } from "@/lib/fechas-lima";

// GET /api/etiquetas-de-precio/tanda?unidades=<id>:<n>,<id>:<n> → las etiquetas de precio de ESAS unidades, listas para imprimir sin salir de la
// pantalla donde se está (tarea 6 de Recibir, Felipe 2026-11-14: la tanda que acaba de entrar al stock se imprime desde su hoja, sin ir a Etiquetas).
//
// PROMETE: solo lectura, y lo MISMO que dibuja la pantalla de Etiquetas para `?unidades=` (`getEtiquetasDePrecio`): el precio de la sede de la sesión,
//   la campaña que la caja cobra hoy y el orden de las pilas. Una sola definición: lo que sale aquí y lo que sale allá no pueden decir dos precios.
// ASUME: una sesión con acceso al ERP. Lo que se puede leer lo decide la base (RLS), como en la pantalla; los ids de la URL pasan por
//   `unidadesDeParam` (solo ids bien formados y cantidades con tope).
// SE DEGRADA: si la base no responde, 500 con un mensaje: la hoja lo dice, ofrece reintentar y deja el enlace a la pantalla de Etiquetas.
//
// Es un GET a /api: no abre el loader global (`clasificarPeticion`). Se pide al abrirse la hoja, para que imprimir sea un solo toque.
export async function GET(request: Request) {
  const persona = await requirePersonaActualV2();
  const unidades = unidadesDeParam(new URL(request.url).searchParams.get("unidades") ?? undefined);
  const hoy = hoyLima();
  if (unidades.size === 0) return Response.json({ etiquetas: [], sinCodigo: [], impreso: fechaEtiqueta(hoy) });
  try {
    const { etiquetas, sinCodigo } = await getEtiquetasDePrecio({ tipo: "variantes", ids: [...unidades.keys()], ubicacionId: persona.ubicacionId, unidades }, hoy);
    return Response.json({ etiquetas, sinCodigo, impreso: fechaEtiqueta(hoy) });
  } catch (e) {
    unstable_rethrow(e);
    console.error("No se pudieron leer las etiquetas de la tanda", e);
    return Response.json({ error: "No pudimos preparar las etiquetas." }, { status: 500 });
  }
}
