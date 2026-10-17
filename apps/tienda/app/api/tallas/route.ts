import { leerTallasParaAgregar } from "@/lib/tarjeta-servidor";

// GET /api/tallas?producto=<id>&sede=<clave> — las tallas del «Agregar» rápido de una tarjeta (lib/tarjeta-servidor.ts). Una ruta y no
// una acción del servidor (2026-10-17): Next ejecuta las acciones de a una, en fila, así que pasar el mouse por cuatro tarjetas eran
// cuatro preguntas una detrás de otra (con 4G lento, la cuarta tardaba cuatro idas y vueltas en mostrar su «Agregar»), y «Agregar a la
// bolsa», que sí es una acción, esperaba detrás de ellas. Ahora salen juntas y el navegador guarda cada respuesta lo que se comparte el
// catálogo (30 s). Como la lista del buscador (`/api/buscador`). Es de quien tiene cuenta: la caché es privada, del aparato.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const respuesta = await leerTallasParaAgregar(q.get("producto"), q.get("sede") || null);
  if (respuesta.estado !== "ok") {
    const estado = respuesta.estado === "sin_sesion" ? 401 : respuesta.estado === "no_esta" ? 404 : 503;
    return Response.json(respuesta, { status: estado, headers: { "cache-control": "no-store" } });
  }
  return Response.json(respuesta, { headers: { "cache-control": "private, max-age=30" } });
}
