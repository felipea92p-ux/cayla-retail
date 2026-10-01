import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getStockPorUbicacion } from "@/lib/inventario-v2";
import { prendaDelLugarDesdeStock } from "@/lib/conteo-por-prenda";

// GET /api/conteo/prendas → las prendas con stock en LA SEDE de quien pregunta, para el buscador «Por prenda» de «Abrir un conteo».
//
// PROMETE: una fila por variante, con nombre, color, talla, códigos, foto y DÓNDE hay stock (piso / almacén / ubicación) — sin
//   ninguna cantidad: el inicio de Conteo no dice cuántas unidades espera CAYLA. Solo lectura.
// ASUME: que quien llama ve el módulo Conteo; la sede sale de su sesión, nunca de un parámetro (no hay forma de pedir otra).
// SE DEGRADA: si la base no responde, devuelve 500 con un mensaje y el buscador lo muestra con «Reintentar»; «Todo» y «Una
//   categoría» siguen abriendo conteos igual porque no dependen de esta lectura.
//
// Se lee al tocar «Por prenda» y no al abrir el inicio: el inicio se adelgazó a propósito (ADR-0282) y esta lectura recorre las
// ~2.300 filas de stock de una sede grande, para algo que la mayoría de las veces no se usa. Un GET a /api no abre el loader global
// (`clasificarPeticion`): buscar no debe tapar la pantalla.
export async function GET() {
  const persona = await requirePersonaActualV2();
  if (!veModulo(persona, "conteos")) {
    return Response.json({ error: "Tu rol no ve Conteo." }, { status: 403 });
  }
  try {
    const filas = await getStockPorUbicacion(persona.ubicacionId);
    return Response.json({ prendas: filas.map(prendaDelLugarDesdeStock) });
  } catch (e) {
    console.error("No se pudieron leer las prendas para el conteo por prenda", e);
    return Response.json({ error: "No pudimos cargar las prendas de la sede." }, { status: 500 });
  }
}
