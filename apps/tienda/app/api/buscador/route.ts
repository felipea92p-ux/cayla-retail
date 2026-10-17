import { leerIndiceDelBuscador } from "@/lib/buscador-servidor";

// GET /api/buscador?sede=<clave> — la lista del buscador de la cabecera (lib/buscador-servidor.ts). Una ruta y no una acción del servidor
// (2026-10-17): Next ejecuta las acciones de a una, en fila, y al abrir una página ya corren otras (anotar la entrada del día), así que la
// búsqueda esperaba detrás de ellas; además, el navegador guarda esta respuesta 30 s (los mismos que el catálogo se comparte en el
// servidor) y abrir el buscador otra vez no vuelve a pedirla. Es de quien tiene cuenta: la caché es privada, del aparato.
export async function GET(request: Request) {
  const sede = new URL(request.url).searchParams.get("sede");
  const respuesta = await leerIndiceDelBuscador(sede || null);
  if (respuesta.estado !== "ok") {
    return Response.json(respuesta, { status: respuesta.estado === "sin_sesion" ? 401 : 503, headers: { "cache-control": "no-store" } });
  }
  return Response.json(respuesta, { headers: { "cache-control": "private, max-age=30" } });
}
