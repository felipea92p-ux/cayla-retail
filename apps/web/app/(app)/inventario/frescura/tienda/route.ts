import { NextResponse, type NextRequest } from "next/server";
import { cambiarUbicacionActiva } from "@/app/actions/ubicacion";

// CAYLA Global ▸ Frescura del piso → UNA tienda (ADR-0208, act. 2026-10-10 (c); Felipe en Formidable: «quitar y conectar»). El nombre de
// cada tienda y cada celda de la cuadrícula llegan aquí: se cambia la tienda del selector con la MISMA acción que el selector (una sola
// puerta a la cookie: le pregunta a la base si la cuenta opera esa sede; si no, no escribe nada) y se vuelve a Frescura, con la categoría
// ya elegida. Una página no puede escribir la cookie mientras se dibuja; esta ruta sí (como `/global/entrar`). Se enlaza con un <a> simple,
// nunca con un <Link> que la pida por adelantado: abrirla cambia la tienda.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const tienda = request.nextUrl.searchParams.get("tienda") ?? "";
  const cat = request.nextUrl.searchParams.get("cat");
  const destino = new URL("/inventario/frescura", request.url);
  const entro = UUID.test(tienda) && (await cambiarUbicacionActiva(tienda));
  // La categoría solo si se entró a la tienda: en CAYLA Global, `cat` no filtra nada.
  if (entro && cat && UUID.test(cat)) destino.searchParams.set("cat", cat);
  return NextResponse.redirect(destino);
}
