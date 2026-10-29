import * as z from "zod/v4";
import { createClient } from "@/lib/supabase/server";

// POST /api/asistente/sirvio  { preguntaId, sirvio, comentario? }  →  { ok }
//
// «¿Te sirvió?» de «Pregúntale a CAYLA» (ADR-0536, actividad 5) y, si no, «¿Qué buscabas?». Va por una ruta y no directo a la base
// desde el navegador para no levantar el loader de pantalla completa por un toque de «Sí» (la pantalla lo pide con `x-espera: no`).
// La base decide todo (`responder_pregunta_asistente`): solo la cuenta que preguntó, una vez, dentro de un día.
//
// CONTRATO
//   PROMETE: 200 `{ ok: true }` si quedó; 200 `{ ok: false }` si la base no lo aceptó o no respondió: es una opinión, no una
//            operación, y el cajón no le muestra un error a quien quiso ayudar.
//   ASUME:   sesión válida (la cookie).

const Cuerpo = z.object({
  preguntaId: z.uuid(),
  sirvio: z.boolean(),
  comentario: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
  if (!cuerpo.success) return Response.json({ error: "Respuesta no válida." }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "responder_pregunta_asistente" as never,
    { p_pregunta_id: cuerpo.data.preguntaId, p_sirvio: cuerpo.data.sirvio, p_comentario: cuerpo.data.comentario || null } as never,
  );
  if (error) console.error(`[asistente] no se anotó «¿Te sirvió?»: ${error.code ?? "sin código"}`);
  return Response.json({ ok: !error });
}
