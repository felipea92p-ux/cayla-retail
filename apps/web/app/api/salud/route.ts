import { NextResponse } from "next/server";
import { leerRespuestaDeSalud, MS_DE_LA_RESPUESTA_GUARDADA, type ResultadoDeSalud } from "@/lib/salud-reglas";

// GET /api/salud → `{ ok: true }` (200) o `{ ok: false, motivo }` (503): ¿responde la base AHORA?
//
// EL PROBLEMA (2026-10-17). La base se cayó dos veces en una tarde y nos enteramos por las colaboradoras: ninguna pieza la preguntaba.
// El `/auth/v1/health` que usa «Sin conexión» no sirve: lo contesta el servicio de Auth sin tocar Postgres, y siguió diciendo «bien»
// con la base muerta.
//
// PROMETE: correr una consulta de verdad dentro de Postgres (`retail.fn_salud()`, la más barata posible, por la llave pública y sin
//          sesión: rol `anon`). 200 = esa consulta corrió. Nunca devuelve un mensaje de la base ni un dato: solo un sí o un no con una
//          palabra de motivo. Cada instancia guarda su respuesta 10 s: aunque cien pantallas esperen (`/sin-base`) y un monitor
//          pregunte cada minuto, a la base le llega una pregunta cada 10 s por instancia.
// ASUME:   `retail.fn_salud()` pegada en la base (20261017225000). Sin ella dice `falta_fn_salud`, no «sano».
// NO HACE: no mira Auth, ni el almacén de fotos, ni SUNAT: solo si Postgres contesta. Pública (`lib/rutas-publicas.ts`): no toca sesión.
export const dynamic = "force-dynamic";

const MS_TOPE_DE_LA_PREGUNTA = 4_000;
let guardada: { en: number; resultado: ResultadoDeSalud } | null = null;

async function preguntarALaBase(): Promise<ResultadoDeSalud> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !llave) return { ok: false, motivo: "llave_rechazada" };
  try {
    const respuesta = await fetch(`${url}/rest/v1/rpc/fn_salud`, {
      method: "POST",
      headers: { apikey: llave, "Content-Type": "application/json", "Content-Profile": "retail" },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(MS_TOPE_DE_LA_PREGUNTA),
    });
    let codigo: string | null = null;
    if (respuesta.status !== 200) {
      try {
        codigo = ((await respuesta.json()) as { code?: string }).code ?? null;
      } catch {
        codigo = null;
      }
    }
    return leerRespuestaDeSalud(respuesta.status, codigo);
  } catch {
    return leerRespuestaDeSalud(null);
  }
}

export async function GET() {
  const ahora = Date.now();
  if (!guardada || ahora - guardada.en > MS_DE_LA_RESPUESTA_GUARDADA) {
    guardada = { en: ahora, resultado: await preguntarALaBase() };
  }
  const { resultado } = guardada;
  return NextResponse.json(resultado, {
    status: resultado.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0", ...(resultado.ok ? {} : { "Retry-After": "15" }) },
  });
}
