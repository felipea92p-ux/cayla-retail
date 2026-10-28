import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getDatosTienda } from "@/lib/observatorio";

// GET /api/observatorio/tienda?u=<id> → el panel de una tienda del Observatorio (ADR-0322): categorías, prendas, equipo,
// horas pico, lo que se va a agotar, lo que no se mueve y sus traslados. Se pide al acercarse a la tienda, no al cargar.
//
// PROMETE: solo lectura, solo cuentas Admin y solo una tienda que existe (un id inventado no llega a la base).
// SE DEGRADA: 500 con un mensaje; el panel muestra la cabecera de la tienda (que ya tenía) y dice qué no pudo leer.
export async function GET(request: Request) {
  const persona = await requirePersonaActualV2();
  if (!persona.esAdmin) return Response.json({ error: "El Observatorio es de las cuentas Admin." }, { status: 403 });
  const u = new URL(request.url).searchParams.get("u");
  const tiendas = (await getUbicaciones()).filter((x) => x.tipo === "tienda");
  if (!u || !tiendas.some((t) => t.id === u)) return Response.json({ error: "Esa tienda no existe." }, { status: 400 });
  const datos = await getDatosTienda(u);
  if (!datos) return Response.json({ error: "No pudimos leer el panel de la tienda." }, { status: 500 });
  return Response.json({ datos });
}
