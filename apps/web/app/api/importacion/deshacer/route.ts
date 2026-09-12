import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";

// POST /api/importacion/deshacer
//   { importacionId } → { descontinuados }
//
// CONTRATO
//   PROMETE: no borrar nada. `deshacer_importacion` (0056/0057) marca los
//            productos de esa importación como descontinuados; el vocabulario
//            que creó se conserva. Si alguna prenda ya tiene movimientos o está
//            en un conteo abierto, el RPC se niega y lo dice.
//   ASUME:   sesión válida y rol de Líder.
//
// La pantalla prometía "se puede deshacer" desde el primer día y no había
// ningún botón que lo hiciera — la revisión del 2026-09-11 lo señaló. Este es
// el botón.

export async function POST(request: Request) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede deshacer una importación." }, { status: 403 });
  }

  const cuerpo = (await request.json().catch(() => null)) as { importacionId?: string } | null;
  const id = cuerpo?.importacionId?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Falta la importación que hay que deshacer." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deshacer_importacion", { p_importacion_id: id });
  if (error) {
    return Response.json({ error: traducirError(error, "deshacer la importación") }, { status: 422 });
  }
  return Response.json(data as Record<string, unknown>);
}
