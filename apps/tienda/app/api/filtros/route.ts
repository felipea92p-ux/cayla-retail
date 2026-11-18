import { compactarFiltros } from "@/lib/filtros-color-talla";
import { leerFiltrosDeLaSede } from "@/lib/filtros-servidor";

// GET /api/filtros?sede=<clave> — qué variantes (color y talla) de cada prenda tienen unidades en la tienda (lib/filtros-servidor.ts): con esto
// el panel de COLOR y TALLA de la lista cuenta, apaga y suma opciones en el navegador, al instante, sin preguntarle al servidor en cada toque
// (ADR-0512, actividad 4). Una ruta y no una acción del servidor, como `/api/tallas` y `/api/buscador`: las acciones corren de a una. Es lo
// mismo para todos (no hay nada de nadie: ni cuenta ni cifras exactas): la caché es pública, los mismos 30 s que el catálogo se comparte en el
// servidor. Si la base no responde, 503 sin guardar: el panel lo dice y la lista sigue como estaba.
export async function GET(request: Request) {
  const sede = new URL(request.url).searchParams.get("sede");
  const datos = await leerFiltrosDeLaSede(sede || null);
  if (!datos) return Response.json({ estado: "sin_respuesta" }, { status: 503, headers: { "cache-control": "no-store" } });
  return Response.json(compactarFiltros(datos), { headers: { "cache-control": "public, max-age=30" } });
}
