import { saludDeLaTienda } from "@/lib/salud-servidor";

// GET /api/salud → `{ ok: true }` (200) o `{ ok: false, motivo }` (503): ¿la tienda puede hablar con la base AHORA? (ADR-0450)
// Pública y sin sesión (el proxy la deja pasar: no es una página). Nunca devuelve un dato ni el mensaje de un error.
export const dynamic = "force-dynamic";

export async function GET() {
  const salud = await saludDeLaTienda();
  return Response.json(salud, {
    status: salud.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0", ...(salud.ok ? {} : { "Retry-After": "15" }) },
  });
}
