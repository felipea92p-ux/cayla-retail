import { connection } from "next/server";
import { saludDeLaTienda } from "@/lib/salud-servidor";

// GET /api/salud → `{ ok: true }` (200) o `{ ok: false, motivo }` (503): ¿la tienda puede hablar con la base AHORA? (ADR-0450)
// Pública y sin sesión (el proxy la deja pasar: no es una página). Nunca devuelve un dato ni el mensaje de un error.
//
// `connection()` y no `export const dynamic = "force-dynamic"`: la tienda compila con Cache Components, que no admite esa configuración
// de segmento (el build falla) y que, sin una señal de petición, podría armar esta respuesta UNA vez al compilar y repetirla para
// siempre. `connection()` es la forma de decir «esto se calcula en cada petición».
export async function GET() {
  await connection();
  const salud = await saludDeLaTienda();
  return Response.json(salud, {
    status: salud.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0", ...(salud.ok ? {} : { "Retry-After": "15" }) },
  });
}
